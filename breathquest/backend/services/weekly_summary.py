"""
services/weekly_summary.py — Rule-based weekly progress summary generator.

Deliberately NOT an LLM call: no external API, no network dependency, no
per-call cost or latency, and fully deterministic given the same underlying
data. "Rule-based" doesn't mean "templated and repetitive" though — each
fact category has a bank of differently-worded sentence templates, and which
variant gets picked (and in what order the categories appear) is chosen by
a random.Random seeded from (patient_id, week_start). Same patient + same
week -> same summary every time you call it (so it's cacheable / reproducible
for the record), but two different weeks, or two different kids with
identical stats, read differently instead of feeling copy-pasted.

Density: each sentence tries to pack more than one number into itself
(count + average + trend, not three separate sentences) so a therapist
scanning a dashboard gets the whole week in 4-7 sentences instead of a
bulleted stat dump. Covers all four games now (BreathQuest, Chime,
VaakMirror, VoiceHurdleRace), not just BreathQuest+Chime, and closes with
a forward-looking "focus next week" line naming whichever tracked signal
(a game's success rate, or home-practice consistency) is currently
weakest — not just a retrospective of what already happened.
"""

import hashlib
import random
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.models import (
    Patient, GameSession, SessionStatus,
    Assignment, AssignmentStatus,
    Goal, HomePracticeLog,
)
from vaakmirror.models import GameSession as VMSession, Attempt as VMAttempt, AttemptOutcome as VMOutcome
from models.voicehurdlerace_models import VoiceHurdleRaceSession
from retraining import data_store as chime_data_store

_VM_SUCCESS_OUTCOMES = (VMOutcome.passed, VMOutcome.caught)


# ------------------------------------------------------------------ #
#  Deterministic-but-varied phrasing                                   #
# ------------------------------------------------------------------ #

def _seeded_rng(patient_id: str, week_start: datetime) -> random.Random:
    """Stable per (patient, week) seed — not Python's hash() (randomized
    per-process for strings), so this reproduces identically across
    restarts and workers."""
    seed_str = f"{patient_id}:{week_start.date().isoformat()}"
    digest = hashlib.md5(seed_str.encode()).hexdigest()
    return random.Random(int(digest[:16], 16))


def _plural(n: int, word: str, plural_word: str | None = None) -> str:
    if n == 1:
        return word
    return plural_word or (word + "s")


def _pct(part: float, whole: float) -> int:
    return round(100 * part / whole) if whole else 0


def _fmt_pct(value: float | None) -> str | None:
    if value is None:
        return None
    return f"{round(value * 100)}%"


def _as_aware(dt: datetime | None) -> datetime | None:
    """SQLite drops tzinfo on round-trip, so datetimes read back from the
    ORM come back naive even though everything is written/intended as UTC.
    week_start/week_end are timezone-aware, so any ORM-sourced datetime
    needs this before it can be compared against them in Python (SQL-level
    .where() filters don't need this — those are fine as-is)."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


# ------------------------------------------------------------------ #
#  Sentence template banks. Each bank's templates share the same
#  `.format(**ctx)` keys so any one of them can be picked interchangeably.
# ------------------------------------------------------------------ #

OPENERS = [
    "{name} logged {n_sessions} BreathQuest {session_word} this week, {completed_of} of which reached completion",
    "This week brought {n_sessions} BreathQuest {session_word} from {name}, with {completed_of} finished start-to-finish",
    "{name} sat down for BreathQuest {n_sessions} {times_word} over the past seven days, completing {completed_of}",
    "Across the last seven days {name} played {n_sessions} BreathQuest {session_word}, {completed_of} completed",
]

QUIET_BQ_WEEK = [
    "{name} didn't open BreathQuest this week — worth a check-in if that's unexpected",
    "No BreathQuest activity was logged for {name} this week",
    "This was a quiet week for {name} on BreathQuest, with zero sessions recorded",
]

STARS_TEMPLATES = [
    "averaging {avg_stars} star{avg_stars_s} per session, {star_trend}",
    "with an average of {avg_stars} star{avg_stars_s} a session — {star_trend}",
    "earning {avg_stars} star{avg_stars_s} on average this week, {star_trend}",
]

STAR_TREND_UP = [
    "up from {prev_avg_stars} the week before",
    "an improvement on last week's {prev_avg_stars}",
    "climbing from {prev_avg_stars} last week",
]
STAR_TREND_DOWN = [
    "down from {prev_avg_stars} the week before",
    "a dip from last week's {prev_avg_stars}",
    "softer than last week's {prev_avg_stars}",
]
STAR_TREND_FLAT = [
    "holding steady with last week's {prev_avg_stars}",
    "in line with last week's {prev_avg_stars}",
]
STAR_TREND_NONE = [
    "with no prior week on record to compare against",
    "the first week with data to measure against",
]

BREATH_TEMPLATES = [
    "Breath control measured {avg_breath} average strength and {consistency} consistency across those sessions",
    "Breath metrics for the week came in at {avg_breath} average strength with {consistency} consistency",
    "On the physiological side, average breath strength sat at {avg_breath} with {consistency} consistency",
    "Breath strength averaged {avg_breath} this week, with a consistency score of {consistency}",
]

CHIME_TEMPLATES = [
    "In Chime, {name} made {chime_n} phoneme {attempt_word} at a {chime_valid_rate} valid-attempt rate and {chime_avg_score} average score",
    "Chime logged {chime_n} phoneme {attempt_word} this week, {chime_valid_rate} of them valid, averaging {chime_avg_score}",
    "On the articulation side, Chime recorded {chime_n} {attempt_word} with {chime_avg_score} average accuracy ({chime_valid_rate} valid)",
]

QUIET_CHIME_WEEK = [
    "no Chime attempts were logged this week",
    "Chime activity was flat this week — zero attempts recorded",
]

VAAKMIRROR_TEMPLATES = [
    "In VaakMirror, {name} made {vm_n} sound {attempt_word3} across {vm_games} {game_word}, passing {vm_pass_rate} of them",
    "VaakMirror logged {vm_n} sound {attempt_word3} this week across {vm_games} {game_word}, a {vm_pass_rate} pass rate",
    "On the mirror-practice side, {vm_n} {attempt_word3} came in across {vm_games} {game_word}, with {vm_pass_rate} landing successfully",
]

QUIET_VM_WEEK = [
    "no VaakMirror attempts were logged this week",
    "VaakMirror activity was flat this week — zero attempts recorded",
]

VHR_TEMPLATES = [
    "In VoiceHurdleRace, {name} ran {vhr_n} {race_word}, averaging {vhr_stars} stars and {vhr_pitch}% pitch accuracy",
    "VoiceHurdleRace saw {vhr_n} {race_word} this week, averaging {vhr_stars} stars per run",
    "On the race track, {vhr_n} {race_word} came in with {vhr_pitch}% average pitch accuracy",
]

QUIET_VHR_WEEK = [
    "no VoiceHurdleRace runs were logged this week",
    "VoiceHurdleRace was quiet this week — no races recorded",
]

# Forward-looking, not just retrospective: picks the single weakest signal
# across BreathQuest/Chime/VaakMirror/VoiceHurdleRace/home-practice (min
# success rate, only when there's enough data to trust it — see
# signal_rates below) and names it directly, rather than leaving "what
# should we do next week" unanswered.
FOCUS_TEMPLATES = [
    "Looking ahead, {focus_area} looks like the best place to spend extra time next week",
    "For next week, leaning into {focus_area} would likely have the biggest impact",
    "The clearest opportunity for next week is {focus_area}",
    "If picking one thing to prioritize next week, make it {focus_area}",
]

ASSIGNMENT_TEMPLATES = [
    "{completed_assign} assignment{completed_assign_s} {completed_assign_be} completed this week, and {overdue_assign} {overdue_assign_be} now overdue",
    "Homework-wise, {completed_assign} assignment{completed_assign_s} {completed_assign_be} finished, with {overdue_assign} sitting overdue",
    "Of the assigned work, {completed_assign} assignment{completed_assign_s} {completed_assign_be} completed and {overdue_assign} {overdue_assign_be} overdue as of today",
]

NO_ASSIGNMENTS = [
    "no assignments are currently on the books for {name}",
    "there's no active homework assigned to track this week",
]

GOAL_ACHIEVED_TEMPLATES = [
    "{n_achieved} goal{n_achieved_s} {n_achieved_be} hit this week: {goal_list}",
    "Notably, {n_achieved} goal{n_achieved_s} crossed the finish line — {goal_list}",
    "{name} reached target on {n_achieved} goal{n_achieved_s} this week ({goal_list})",
]

GOAL_PROGRESS_TEMPLATES = [
    "{n_open} goal{n_open_s} remain{n_open_verb} in progress, currently averaging {goal_progress_pct} of target",
    "The {n_open} open goal{n_open_s} {n_open_be} tracking at {goal_progress_pct} of target on average",
    "Progress continues on {n_open} active goal{n_open_s}, sitting at roughly {goal_progress_pct} toward target",
]

NO_GOALS = [
    "no goals are currently set for {name}",
    "there are no active goals on file to measure against yet",
]

PRACTICE_TEMPLATES = [
    "Home practice was logged on {practice_days} of the last 7 days, totaling {practice_minutes} minutes",
    "{name}'s family logged home practice {practice_days} {day_word} this week, {practice_minutes} minutes in total",
    "Outside the app, {practice_days} home-practice {log_word} came in, adding up to {practice_minutes} minutes",
]

NO_PRACTICE = [
    "no home practice was logged this week",
    "home practice logs were empty this week — a gentle nudge to the family may help",
]

CLOSERS = [
    "Overall, {article} {overall_word} week for {name}.",
    "Taken together, this reads as {article} {overall_word} week.",
    "Net-net, {name}'s week comes across as {overall_word}.",
    "In sum: {article} {overall_word} week.",
]


def _article(word: str) -> str:
    first_word = word.split()[0]
    return "an" if first_word[0].lower() in "aeiou" else "a"


def _overall_word(rng: random.Random, score: int) -> str:
    if score >= 3:
        bank = ["strong", "solid", "productive", "encouraging"]
    elif score >= 1:
        bank = ["steady", "up-and-down but improving", "workmanlike", "on-track"]
    elif score == 0:
        bank = ["quiet", "light", "slow"]
    else:
        bank = ["concerning", "uncertain", "flaggable"]
    return rng.choice(bank)


# ------------------------------------------------------------------ #
#  Data gathering                                                      #
# ------------------------------------------------------------------ #

async def _week_bq_sessions(db: AsyncSession, patient_id: str, start: datetime, end: datetime):
    result = await db.execute(
        select(GameSession).where(
            GameSession.patient_id == patient_id,
            GameSession.started_at >= start,
            GameSession.started_at < end,
        )
    )
    return result.scalars().all()


async def _week_assignments(db: AsyncSession, patient_id: str, start: datetime, end: datetime):
    result = await db.execute(
        select(Assignment).where(
            Assignment.patient_id == patient_id,
        )
    )
    all_assignments = result.scalars().all()
    completed_this_week = [
        a for a in all_assignments
        if a.completed_at is not None and start <= _as_aware(a.completed_at) < end
    ]
    overdue_now = [a for a in all_assignments if a.status == AssignmentStatus.overdue]
    return completed_this_week, overdue_now


async def _goals(db: AsyncSession, patient_id: str):
    result = await db.execute(select(Goal).where(Goal.patient_id == patient_id))
    return result.scalars().all()


async def _goal_current_value(db: AsyncSession, goal: Goal) -> float | None:
    fields = {
        "breath_consistency": GameSession.breath_consistency,
        "avg_breath_strength": GameSession.avg_breath_strength,
    }
    field = fields.get(goal.target_metric)
    if field is None:
        return None
    result = await db.execute(
        select(func.avg(field))
        .where(GameSession.patient_id == goal.patient_id, field.is_not(None))
        .order_by(GameSession.started_at.desc())
        .limit(5)
    )
    avg = result.scalar()
    return round(avg, 3) if avg is not None else None


async def _week_practice_logs(db: AsyncSession, patient_id: str, start: datetime, end: datetime):
    result = await db.execute(
        select(HomePracticeLog).where(
            HomePracticeLog.patient_id == patient_id,
            HomePracticeLog.practiced_on >= start,
            HomePracticeLog.practiced_on < end,
        )
    )
    return result.scalars().all()


def _week_chime_events(patient_id: str, start: datetime, end: datetime, db_path):
    events = chime_data_store.get_events(child_id=patient_id, db_path=db_path)
    out = []
    for e in events:
        try:
            ts = datetime.fromisoformat(e["timestamp"])
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
        except (KeyError, ValueError):
            continue
        if start <= ts < end:
            out.append(e)
    return out


async def _week_vaakmirror_attempts(db: AsyncSession, patient_id: str, start: datetime, end: datetime):
    """Returns (Attempt, GameName) row tuples — selecting the game alongside
    the attempt avoids a lazy-load on the `.session` relationship, which
    doesn't work cleanly against an AsyncSession without extra eager-load
    wiring."""
    result = await db.execute(
        select(VMAttempt, VMSession.game)
        .join(VMSession, VMAttempt.session_id == VMSession.id)
        .where(
            VMSession.patient_id == patient_id,
            VMAttempt.created_at >= start,
            VMAttempt.created_at < end,
        )
    )
    return result.all()


async def _week_voicehurdlerace_sessions(db: AsyncSession, patient_id: str, start: datetime, end: datetime):
    """VoiceHurdleRace logs one row per completed race, not a start/end
    pair — no separate abandonment case to account for here."""
    result = await db.execute(
        select(VoiceHurdleRaceSession).where(
            VoiceHurdleRaceSession.patient_id == patient_id,
            VoiceHurdleRaceSession.created_at >= start,
            VoiceHurdleRaceSession.created_at < end,
        )
    )
    return result.scalars().all()


# ------------------------------------------------------------------ #
#  Main entry point                                                    #
# ------------------------------------------------------------------ #

async def generate_weekly_summary(
    db: AsyncSession,
    patient: Patient,
    week_start: datetime,
    chime_db_path=None,
) -> dict[str, Any]:
    """Builds the narrative + highlights + raw stats for one patient/week.
    week_start should be timezone-aware, midnight UTC of the week's first day;
    the window covers [week_start, week_start + 7 days)."""

    if week_start.tzinfo is None:
        week_start = week_start.replace(tzinfo=timezone.utc)
    week_end = week_start + timedelta(days=7)
    prev_week_start = week_start - timedelta(days=7)

    rng = _seeded_rng(patient.id, week_start)
    name = patient.first_name

    sessions = await _week_bq_sessions(db, patient.id, week_start, week_end)
    prev_sessions = await _week_bq_sessions(db, patient.id, prev_week_start, week_start)
    completed_assignments, overdue_assignments = await _week_assignments(db, patient.id, week_start, week_end)
    goals = await _goals(db, patient.id)
    practice_logs = await _week_practice_logs(db, patient.id, week_start, week_end)
    chime_events = _week_chime_events(
        patient.id, week_start, week_end,
        chime_db_path or chime_data_store.DEFAULT_DB_PATH,
    )
    vm_rows = await _week_vaakmirror_attempts(db, patient.id, week_start, week_end)
    vhr_sessions = await _week_voicehurdlerace_sessions(db, patient.id, week_start, week_end)

    sentences: list[str] = []
    highlights: list[str] = []
    mood_score = 0  # nudged up/down by each category, drives the closing tone word
    signal_rates: dict[str, float] = {}  # human label -> success rate, feeds the focus suggestion

    # ---- BreathQuest sessions -------------------------------------
    if sessions:
        n = len(sessions)
        completed = [s for s in sessions if s.completed]
        stars = [s.stars_earned for s in sessions if s.stars_earned is not None]
        avg_stars = round(sum(stars) / len(stars), 1) if stars else 0

        ctx = {
            "name": name,
            "n_sessions": n,
            "session_word": _plural(n, "session"),
            "times_word": _plural(n, "time"),
            "completed_of": f"{len(completed)} of {n}",
        }
        sentences.append(rng.choice(OPENERS).format(**ctx))
        highlights.append(f"🎮 {n} BreathQuest {ctx['session_word']} ({len(completed)} completed)")

        if stars:
            prev_stars = [s.stars_earned for s in prev_sessions if s.stars_earned is not None]
            prev_avg = round(sum(prev_stars) / len(prev_stars), 1) if prev_stars else None
            if prev_avg is None:
                trend_bank = STAR_TREND_NONE
            elif avg_stars > prev_avg:
                trend_bank = STAR_TREND_UP
                mood_score += 1
            elif avg_stars < prev_avg:
                trend_bank = STAR_TREND_DOWN
                mood_score -= 1
            else:
                trend_bank = STAR_TREND_FLAT

            star_ctx = {
                "avg_stars": avg_stars,
                "avg_stars_s": "" if avg_stars == 1 else "s",
                "prev_avg_stars": prev_avg,
            }
            star_trend = rng.choice(trend_bank).format(**star_ctx)
            sentences.append(rng.choice(STARS_TEMPLATES).format(star_trend=star_trend, **star_ctx).capitalize())

        breath_vals = [s.avg_breath_strength for s in sessions if s.avg_breath_strength is not None]
        consistency_vals = [s.breath_consistency for s in sessions if s.breath_consistency is not None]
        if breath_vals or consistency_vals:
            breath_ctx = {
                "avg_breath": _fmt_pct(sum(breath_vals) / len(breath_vals)) if breath_vals else "n/a",
                "consistency": _fmt_pct(sum(consistency_vals) / len(consistency_vals)) if consistency_vals else "n/a",
                "name": name,
            }
            sentences.append(rng.choice(BREATH_TEMPLATES).format(**breath_ctx))

        mood_score += 1 if len(completed) >= n / 2 else 0
        if n >= 2:
            signal_rates["breathing exercises in BreathQuest"] = len(completed) / n
    else:
        sentences.append(rng.choice(QUIET_BQ_WEEK).format(name=name))
        mood_score -= 1

    # ---- Chime -------------------------------------------------------
    if chime_events:
        n = len(chime_events)
        valid = [e for e in chime_events if e.get("is_valid_attempt")]
        scores = [e["score"] for e in chime_events if e.get("score") is not None]
        chime_ctx = {
            "name": name,
            "chime_n": n,
            "attempt_word": _plural(n, "attempt"),
            "chime_valid_rate": f"{_pct(len(valid), n)}%",
            "chime_avg_score": f"{round(100 * sum(scores) / len(scores))}%" if scores else "n/a",
        }
        sentences.append(rng.choice(CHIME_TEMPLATES).format(**chime_ctx))
        highlights.append(f"🔔 {n} Chime {chime_ctx['attempt_word']} ({chime_ctx['chime_valid_rate']} valid)")
        mood_score += 1 if len(valid) >= n / 2 else 0
        if n >= 2:
            signal_rates["phoneme practice in Chime"] = len(valid) / n
    else:
        sentences.append(rng.choice(QUIET_CHIME_WEEK))

    # ---- VaakMirror ------------------------------------------------
    if vm_rows:
        n = len(vm_rows)
        vm_passed = [a for a, g in vm_rows if a.outcome in _VM_SUCCESS_OUTCOMES]
        games_played = sorted({g.value.replace("_", " ") for a, g in vm_rows})
        vm_ctx = {
            "name": name,
            "vm_n": n,
            "attempt_word3": _plural(n, "attempt"),
            "vm_games": len(games_played),
            "game_word": _plural(len(games_played), "game"),
            "vm_pass_rate": f"{_pct(len(vm_passed), n)}%",
        }
        sentences.append(rng.choice(VAAKMIRROR_TEMPLATES).format(**vm_ctx))
        highlights.append(f"🪞 {n} VaakMirror {vm_ctx['attempt_word3']} ({vm_ctx['vm_pass_rate']} passed)")
        mood_score += 1 if len(vm_passed) >= n / 2 else 0
        if n >= 2:
            signal_rates["sound drills in VaakMirror"] = len(vm_passed) / n
    else:
        sentences.append(rng.choice(QUIET_VM_WEEK))

    # ---- VoiceHurdleRace --------------------------------------------
    if vhr_sessions:
        n = len(vhr_sessions)
        strong = [s for s in vhr_sessions if s.stars >= 2]
        avg_stars = sum(s.stars for s in vhr_sessions) / n
        avg_pitch = sum(s.pitch_accuracy for s in vhr_sessions) / n
        vhr_ctx = {
            "name": name,
            "vhr_n": n,
            "race_word": _plural(n, "race"),
            "vhr_stars": f"{avg_stars:.1f}",
            "vhr_pitch": f"{avg_pitch:.0f}",
        }
        sentences.append(rng.choice(VHR_TEMPLATES).format(**vhr_ctx))
        highlights.append(f"🏁 {n} VoiceHurdleRace {vhr_ctx['race_word']} (avg {vhr_ctx['vhr_stars']}⭐)")
        mood_score += 1 if len(strong) >= n / 2 else 0
        if n >= 2:
            signal_rates["VoiceHurdleRace pitch/loudness control"] = len(strong) / n
    else:
        sentences.append(rng.choice(QUIET_VHR_WEEK))

    # ---- Assignments ---------------------------------------------
    if completed_assignments or overdue_assignments:
        c, o = len(completed_assignments), len(overdue_assignments)
        assign_ctx = {
            "completed_assign": c,
            "completed_assign_s": "" if c == 1 else "s",
            "completed_assign_be": "was" if c == 1 else "were",
            "overdue_assign": o,
            "overdue_assign_be": "is" if o == 1 else "are",
        }
        sentences.append(rng.choice(ASSIGNMENT_TEMPLATES).format(**assign_ctx).capitalize())
        if c:
            highlights.append(f"✅ {c} assignment{assign_ctx['completed_assign_s']} completed")
        if o:
            highlights.append(f"⚠️ {o} assignment{'s' if o != 1 else ''} overdue")
            mood_score -= 1
        mood_score += 1 if c else 0
    else:
        sentences.append(rng.choice(NO_ASSIGNMENTS).format(name=name).capitalize())

    # ---- Goals -------------------------------------------------------
    if goals:
        achieved_this_week = [
            g for g in goals if g.achieved and g.achieved_at and week_start <= _as_aware(g.achieved_at) < week_end
        ]
        open_goals = [g for g in goals if not g.achieved]

        if achieved_this_week:
            goal_names = [f"target on {g.target_metric.replace('_', ' ')}" for g in achieved_this_week]
            n = len(achieved_this_week)
            goal_ctx = {
                "n_achieved": n,
                "n_achieved_s": "" if n == 1 else "s",
                "n_achieved_be": "was" if n == 1 else "were",
                "goal_list": ", ".join(goal_names),
                "name": name,
            }
            sentences.append(rng.choice(GOAL_ACHIEVED_TEMPLATES).format(**goal_ctx).capitalize())
            highlights.append(f"🎯 {n} goal{goal_ctx['n_achieved_s']} achieved")
            mood_score += 2

        if open_goals:
            progresses = []
            for g in open_goals:
                current = await _goal_current_value(db, g)
                if current is not None and g.target_value:
                    progresses.append(min(current / g.target_value, 1.0))
            n_open = len(open_goals)
            open_ctx = {
                "n_open": n_open,
                "n_open_s": "" if n_open == 1 else "s",
                "n_open_verb": "s" if n_open == 1 else "",
                "n_open_be": "is" if n_open == 1 else "are",
                "goal_progress_pct": f"{round(100 * sum(progresses) / len(progresses))}%" if progresses else "an unmeasured amount",
            }
            sentences.append(rng.choice(GOAL_PROGRESS_TEMPLATES).format(**open_ctx).capitalize())
    else:
        sentences.append(rng.choice(NO_GOALS).format(name=name).capitalize())

    # ---- Home practice -------------------------------------------
    if practice_logs:
        days = len({log.practiced_on.date() for log in practice_logs})
        minutes = sum(log.duration_minutes or 0 for log in practice_logs)
        practice_ctx = {
            "name": name,
            "practice_days": days,
            "day_word": _plural(days, "day"),
            "log_word": _plural(len(practice_logs), "log"),
            "practice_minutes": minutes,
        }
        sentences.append(rng.choice(PRACTICE_TEMPLATES).format(**practice_ctx))
        highlights.append(f"🏠 {days}/7 days practiced at home ({minutes} min)")
        mood_score += 1 if days >= 4 else 0
        signal_rates["more consistent home practice"] = days / 7
    else:
        sentences.append(rng.choice(NO_PRACTICE))
        mood_score -= 1
        signal_rates["more consistent home practice"] = 0.0

    # ---- Focus suggestion ------------------------------------------
    # The weakest signal this week, named directly — only when there's
    # enough data to trust it (see the n>=2 guards above) and only when it's
    # actually weak (<60%), so a good week never gets a manufactured nitpick.
    if signal_rates:
        focus_area, focus_rate = min(signal_rates.items(), key=lambda kv: kv[1])
        if focus_rate < 0.6:
            sentences.append(rng.choice(FOCUS_TEMPLATES).format(focus_area=focus_area))
            highlights.append(f"🧭 Suggested focus: {focus_area}")

    # ---- Closer --------------------------------------------------
    overall = _overall_word(rng, mood_score)
    sentences.append(rng.choice(CLOSERS).format(name=name, overall_word=overall, article=_article(overall)))

    narrative = " ".join(s if s.endswith((".", "!", "?")) else s + "." for s in sentences)

    return {
        "patient_id": patient.id,
        "week_start": week_start,
        "week_end": week_end,
        "narrative": narrative,
        "highlights": highlights,
        "stats": {
            "bq_sessions": len(sessions),
            "bq_completed": len([s for s in sessions if s.completed]),
            "chime_attempts": len(chime_events),
            "vm_attempts": len(vm_rows),
            "vm_passed": len([a for a, g in vm_rows if a.outcome in _VM_SUCCESS_OUTCOMES]),
            "vhr_sessions": len(vhr_sessions),
            "vhr_avg_stars": round(sum(s.stars for s in vhr_sessions) / len(vhr_sessions), 1) if vhr_sessions else None,
            "assignments_completed": len(completed_assignments),
            "assignments_overdue": len(overdue_assignments),
            "goals_open": len([g for g in goals if not g.achieved]),
            "goals_achieved_total": len([g for g in goals if g.achieved]),
            "home_practice_days": len({log.practiced_on.date() for log in practice_logs}),
            "home_practice_minutes": sum(log.duration_minutes or 0 for log in practice_logs),
            "mood_score": mood_score,
            "suggested_focus": min(signal_rates, key=signal_rates.get) if signal_rates and min(signal_rates.values()) < 0.6 else None,
        },
    }
