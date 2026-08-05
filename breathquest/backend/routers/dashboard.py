"""
routers/dashboard.py — Therapist dashboard: analytics, progress, notes.
"""

from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_

from database import get_db
from models.models import (
    Therapist, Patient, GameSession, TherapistNote,
    Assignment, AssignmentStatus, Goal, Message, SenderRole, HomePracticeLog,
)
from models.voicehurdlerace_models import VoiceHurdleRaceSession
from vaakmirror.models import GameSession as VaakMirrorSession, Attempt
from retraining import data_store as chime_data_store
from schemas.schemas import (
    PatientProgress, LevelProgress, DashboardSummary,
    PatientDetailOut, PatientOut, SessionOut,
    NoteCreate, NoteUpdate, NoteOut,
    AssignmentCreate, AssignmentUpdate, AssignmentOut,
    GoalCreate, GoalUpdate, GoalOut,
    MessageCreate, MessageOut,
    HomePracticeLogCreate, HomePracticeLogOut,
    PatientAlert, WeeklySummaryOut, SoundProgressOut, SoundWeekPoint,
    HomePracticeIdeaOut,
)
from core.deps import get_current_therapist
from services.weekly_summary import generate_weekly_summary
try:
    from services.report_pdf import build_patient_report_pdf
    _PDF_EXPORT_IMPORT_ERROR = None
except ImportError as e:
    build_patient_report_pdf = None
    _PDF_EXPORT_IMPORT_ERROR = str(e)
from fastapi.responses import FileResponse
import tempfile, os

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

CHIME_DB_PATH = chime_data_store.DEFAULT_DB_PATH

LEVEL_NAMES = {
    "pinwheel":    "Pinwheel Spin",
    "float_rider": "Float Rider",
    "candle":      "Candle Gauntlet",
    "balloon":     "Balloon Pop",
    "dandelion":   "Dandelion Storm",
    "dragon":      "Dragon Fire",
}


# ------------------------------------------------------------------ #
#  Summary                                                             #
# ------------------------------------------------------------------ #

@router.get("/summary", response_model=DashboardSummary)
async def get_dashboard_summary(
    therapist: Therapist = Depends(get_current_therapist),
    db: AsyncSession = Depends(get_db),
):
    # All patients
    patients_result = await db.execute(
        select(Patient).where(Patient.therapist_id == therapist.id)
    )
    patients = patients_result.scalars().all()
    patient_ids = [p.id for p in patients]

    active_count = sum(1 for p in patients if p.is_active)

    # Sessions this week — BreathQuest + VoiceHurdleRace share a real 0-3
    # star scale, so their stars can be honestly averaged together.
    # VaakMirror (pass/fail attempts) and Chime (0.0-1.0 phoneme score) use
    # different scales entirely; folding them into "avg stars" would imply
    # a comparison that doesn't actually hold, so they count toward
    # sessions_this_week but are left out of avg_stars_this_week.
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)

    bq_week = await db.execute(
        select(
            func.count(GameSession.id).label("count"),
            func.sum(GameSession.stars_earned).label("stars_sum"),
        ).where(
            and_(
                GameSession.patient_id.in_(patient_ids),
                GameSession.started_at >= week_ago,
                GameSession.completed == True,
            )
        )
    )
    bq_row = bq_week.one()

    vhr_week = await db.execute(
        select(
            func.count(VoiceHurdleRaceSession.id).label("count"),
            func.sum(VoiceHurdleRaceSession.stars).label("stars_sum"),
        ).where(
            and_(
                VoiceHurdleRaceSession.patient_id.in_(patient_ids),
                VoiceHurdleRaceSession.created_at >= week_ago,
            )
        )
    )
    vhr_row = vhr_week.one()

    vm_week = await db.execute(
        select(func.count(VaakMirrorSession.id)).where(
            and_(
                VaakMirrorSession.patient_id.in_(patient_ids),
                VaakMirrorSession.started_at >= week_ago,
            )
        )
    )
    vm_week_count = vm_week.scalar() or 0

    chime_week_count = chime_data_store.count_events_since(
        patient_ids, week_ago.isoformat(), db_path=CHIME_DB_PATH
    )

    sessions_this_week = (bq_row.count or 0) + (vhr_row.count or 0) + vm_week_count + chime_week_count

    star_session_count = (bq_row.count or 0) + (vhr_row.count or 0)
    star_sum = float(bq_row.stars_sum or 0) + float(vhr_row.stars_sum or 0)
    avg_stars_this_week = round(star_sum / star_session_count, 2) if star_session_count else None

    # Build patient detail list
    patient_details = []
    for p in patients:
        stats = await db.execute(
            select(
                func.count(GameSession.id).label("total"),
                func.sum(GameSession.stars_earned).label("stars"),
                func.max(GameSession.started_at).label("last"),
            ).where(GameSession.patient_id == p.id)
        )
        row = stats.one()

        vhr_stats = await db.execute(
            select(
                func.count(VoiceHurdleRaceSession.id).label("total"),
                func.sum(VoiceHurdleRaceSession.stars).label("stars"),
                func.max(VoiceHurdleRaceSession.created_at).label("last"),
            ).where(VoiceHurdleRaceSession.patient_id == p.id)
        )
        vhr_row_p = vhr_stats.one()

        vm_count_result = await db.execute(
            select(func.count(VaakMirrorSession.id), func.max(VaakMirrorSession.started_at))
            .where(VaakMirrorSession.patient_id == p.id)
        )
        vm_total, vm_last = vm_count_result.one()

        chime_total = chime_data_store.count_events(child_id=p.id, db_path=CHIME_DB_PATH)

        combined_total = (row.total or 0) + (vhr_row_p.total or 0) + (vm_total or 0) + chime_total
        combined_stars = int(row.stars or 0) + int(vhr_row_p.stars or 0)
        last_candidates = [d for d in (row.last, vhr_row_p.last, vm_last) if d is not None]
        combined_last = max(last_candidates) if last_candidates else None

        patient_details.append(PatientDetailOut(
            **PatientOut.model_validate(p).model_dump(),
            diagnosis_notes=p.diagnosis_notes,
            total_sessions=combined_total,
            total_stars=combined_stars,
            last_session_at=combined_last,
        ))

    return DashboardSummary(
        total_patients=len(patients),
        active_patients=active_count,
        sessions_this_week=sessions_this_week,
        avg_stars_this_week=avg_stars_this_week,
        most_improved_patient=None,   # TODO: implement trend analysis
        patients=patient_details,
    )


# ------------------------------------------------------------------ #
#  Patient progress                                                    #
# ------------------------------------------------------------------ #

@router.get("/patients/{patient_id}/progress", response_model=PatientProgress)
async def get_patient_progress(
    patient_id: str,
    therapist: Therapist = Depends(get_current_therapist),
    db: AsyncSession = Depends(get_db),
):
    # Verify ownership
    patient_result = await db.execute(
        select(Patient).where(Patient.id == patient_id,
                              Patient.therapist_id == therapist.id)
    )
    patient = patient_result.scalar_one_or_none()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    # All completed sessions
    sessions_result = await db.execute(
        select(GameSession)
        .where(GameSession.patient_id == patient_id)
        .order_by(GameSession.started_at.desc())
    )
    sessions = sessions_result.scalars().all()
    completed = [s for s in sessions if s.completed]

    total_stars = sum(s.stars_earned or 0 for s in completed)
    max_possible = len(LEVEL_NAMES) * 3

    # Per-level breakdown
    level_progress = []
    for level_id, level_name in LEVEL_NAMES.items():
        level_sessions = [s for s in completed if s.level_id == level_id]
        if level_sessions:
            best_stars = max(s.stars_earned or 0 for s in level_sessions)
            avg_stars = sum(s.stars_earned or 0 for s in level_sessions) / len(level_sessions)
            breath_vals = [s.avg_breath_strength for s in level_sessions if s.avg_breath_strength]
            avg_breath = sum(breath_vals) / len(breath_vals) if breath_vals else None
            last_played = max(s.started_at for s in level_sessions)
        else:
            best_stars = 0
            avg_stars = 0.0
            avg_breath = None
            last_played = None

        level_progress.append(LevelProgress(
            level_id=level_id,
            level_name=level_name,
            attempts=len([s for s in sessions if s.level_id == level_id]),
            best_stars=best_stars,
            avg_stars=round(avg_stars, 2),
            avg_breath_strength=round(avg_breath, 3) if avg_breath else None,
            last_played=last_played,
        ))

    # Improvement trend (compare last 5 vs previous 5 sessions)
    trend = None
    if len(completed) >= 6:
        recent = [s.stars_earned or 0 for s in completed[:5]]
        older  = [s.stars_earned or 0 for s in completed[5:10]]
        trend = round((sum(recent) / len(recent)) - (sum(older) / len(older)), 2)

    breath_vals = [s.avg_breath_strength for s in completed if s.avg_breath_strength]
    avg_breath_overall = round(sum(breath_vals) / len(breath_vals), 3) if breath_vals else None

    return PatientProgress(
        patient_id=patient.id,
        first_name=patient.first_name,
        avatar=patient.avatar,
        total_sessions=len(sessions),
        total_stars=total_stars,
        max_possible_stars=max_possible,
        completion_rate=round(len(completed) / len(sessions), 2) if sessions else 0.0,
        avg_breath_strength=avg_breath_overall,
        improvement_trend=trend,
        level_progress=level_progress,
        recent_sessions=[SessionOut.model_validate(s) for s in sessions[:10]],
    )


# ------------------------------------------------------------------ #
#  Notes                                                               #
# ------------------------------------------------------------------ #

@router.post("/patients/{patient_id}/notes", response_model=NoteOut, status_code=201)
async def create_note(
    patient_id: str,
    data: NoteCreate,
    therapist: Therapist = Depends(get_current_therapist),
    db: AsyncSession = Depends(get_db),
):
    # Verify ownership
    patient_result = await db.execute(
        select(Patient).where(Patient.id == patient_id,
                              Patient.therapist_id == therapist.id)
    )
    if not patient_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Patient not found")

    note = TherapistNote(
        patient_id=patient_id,
        therapist_id=therapist.id,
        session_id=data.session_id,
        content=data.content,
        tags=data.tags,
    )
    db.add(note)
    await db.flush()
    return note


@router.get("/patients/{patient_id}/notes", response_model=list[NoteOut])
async def list_notes(
    patient_id: str,
    therapist: Therapist = Depends(get_current_therapist),
    db: AsyncSession = Depends(get_db),
):
    patient_result = await db.execute(
        select(Patient).where(Patient.id == patient_id,
                              Patient.therapist_id == therapist.id)
    )
    if not patient_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Patient not found")

    result = await db.execute(
        select(TherapistNote)
        .where(TherapistNote.patient_id == patient_id)
        .order_by(TherapistNote.created_at.desc())
    )
    return result.scalars().all()


@router.patch("/notes/{note_id}", response_model=NoteOut)
async def update_note(
    note_id: str,
    data: NoteUpdate,
    therapist: Therapist = Depends(get_current_therapist),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TherapistNote).where(TherapistNote.id == note_id,
                                    TherapistNote.therapist_id == therapist.id)
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(note, field, value)

    note.updated_at = datetime.now(timezone.utc)
    return note


@router.delete("/notes/{note_id}", status_code=204)
async def delete_note(
    note_id: str,
    therapist: Therapist = Depends(get_current_therapist),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TherapistNote).where(TherapistNote.id == note_id,
                                    TherapistNote.therapist_id == therapist.id)
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    await db.delete(note)


# ------------------------------------------------------------------ #
#  Shared helper                                                       #
# ------------------------------------------------------------------ #

async def _get_owned_patient(patient_id: str, therapist: Therapist, db: AsyncSession) -> Patient:
    """Same ownership check used throughout this router — 404 (not 403) on
    a patient that exists but isn't this therapist's, so we don't leak
    which patient_ids are real."""
    result = await db.execute(
        select(Patient).where(Patient.id == patient_id,
                              Patient.therapist_id == therapist.id)
    )
    patient = result.scalar_one_or_none()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    return patient


# ------------------------------------------------------------------ #
#  Assignments ("homework")                                            #
# ------------------------------------------------------------------ #

@router.post("/patients/{patient_id}/assignments", response_model=AssignmentOut, status_code=201)
async def create_assignment(
    patient_id: str,
    data: AssignmentCreate,
    therapist: Therapist = Depends(get_current_therapist),
    db: AsyncSession = Depends(get_db),
):
    await _get_owned_patient(patient_id, therapist, db)
    assignment = Assignment(
        patient_id=patient_id,
        assigned_by=therapist.id,
        game=data.game,
        level_id=data.level_id,
        title=data.title,
        instructions=data.instructions,
        due_at=data.due_at,
    )
    db.add(assignment)
    await db.flush()
    return assignment


@router.get("/patients/{patient_id}/assignments", response_model=list[AssignmentOut])
async def list_assignments(
    patient_id: str,
    therapist: Therapist = Depends(get_current_therapist),
    db: AsyncSession = Depends(get_db),
):
    await _get_owned_patient(patient_id, therapist, db)
    # Flip any assignment past its due date to "overdue" before returning —
    # cheap enough to do on every read rather than needing a scheduled job.
    now = datetime.now(timezone.utc)
    await db.execute(
        Assignment.__table__.update()
        .where(
            Assignment.patient_id == patient_id,
            Assignment.status.in_([AssignmentStatus.assigned, AssignmentStatus.in_progress]),
            Assignment.due_at.is_not(None),
            Assignment.due_at < now,
        )
        .values(status=AssignmentStatus.overdue)
    )
    result = await db.execute(
        select(Assignment)
        .where(Assignment.patient_id == patient_id)
        .order_by(Assignment.created_at.desc())
    )
    return result.scalars().all()


@router.patch("/assignments/{assignment_id}", response_model=AssignmentOut)
async def update_assignment(
    assignment_id: str,
    data: AssignmentUpdate,
    therapist: Therapist = Depends(get_current_therapist),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Assignment).join(Patient).where(
            Assignment.id == assignment_id,
            Patient.therapist_id == therapist.id,
        )
    )
    assignment = result.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    updates = data.model_dump(exclude_none=True)
    if updates.get("status") == AssignmentStatus.completed and assignment.completed_at is None:
        assignment.completed_at = datetime.now(timezone.utc)
    for field, value in updates.items():
        setattr(assignment, field, value)
    return assignment


@router.delete("/assignments/{assignment_id}", status_code=204)
async def delete_assignment(
    assignment_id: str,
    therapist: Therapist = Depends(get_current_therapist),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Assignment).join(Patient).where(
            Assignment.id == assignment_id,
            Patient.therapist_id == therapist.id,
        )
    )
    assignment = result.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    await db.delete(assignment)


# ------------------------------------------------------------------ #
#  Goals                                                               #
# ------------------------------------------------------------------ #

# Metrics we know how to compute a "current value" for from GameSession
# aggregates. Anything else (e.g. a Chime phoneme accuracy target) is still
# stored and tracked for target_date/achieved, just without an auto-computed
# current_value until that game's own aggregate source is wired in here too.
_GOAL_METRIC_FIELDS = {
    "breath_consistency": GameSession.breath_consistency,
    "avg_breath_strength": GameSession.avg_breath_strength,
}


async def _compute_goal_current_value(goal: Goal, db: AsyncSession) -> float | None:
    field = _GOAL_METRIC_FIELDS.get(goal.target_metric)
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


@router.post("/patients/{patient_id}/goals", response_model=GoalOut, status_code=201)
async def create_goal(
    patient_id: str,
    data: GoalCreate,
    therapist: Therapist = Depends(get_current_therapist),
    db: AsyncSession = Depends(get_db),
):
    await _get_owned_patient(patient_id, therapist, db)
    goal = Goal(
        patient_id=patient_id,
        created_by=therapist.id,
        target_metric=data.target_metric,
        target_value=data.target_value,
        baseline_value=data.baseline_value,
        target_date=data.target_date,
    )
    db.add(goal)
    await db.flush()
    out = GoalOut.model_validate(goal)
    out.current_value = await _compute_goal_current_value(goal, db)
    return out


@router.get("/patients/{patient_id}/goals", response_model=list[GoalOut])
async def list_goals(
    patient_id: str,
    therapist: Therapist = Depends(get_current_therapist),
    db: AsyncSession = Depends(get_db),
):
    await _get_owned_patient(patient_id, therapist, db)
    result = await db.execute(
        select(Goal).where(Goal.patient_id == patient_id).order_by(Goal.created_at.desc())
    )
    goals = result.scalars().all()
    out = []
    for g in goals:
        current = await _compute_goal_current_value(g, db)
        # Auto-mark achieved the first time current_value clears the target,
        # rather than requiring the therapist to flip it by hand.
        if not g.achieved and current is not None and current >= g.target_value:
            g.achieved = True
            g.achieved_at = datetime.now(timezone.utc)
        item = GoalOut.model_validate(g)
        item.current_value = current
        out.append(item)
    return out


@router.patch("/goals/{goal_id}", response_model=GoalOut)
async def update_goal(
    goal_id: str,
    data: GoalUpdate,
    therapist: Therapist = Depends(get_current_therapist),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Goal).join(Patient).where(Goal.id == goal_id, Patient.therapist_id == therapist.id)
    )
    goal = result.scalar_one_or_none()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    updates = data.model_dump(exclude_none=True)
    if updates.get("achieved") and goal.achieved_at is None:
        goal.achieved_at = datetime.now(timezone.utc)
    for field, value in updates.items():
        setattr(goal, field, value)

    out = GoalOut.model_validate(goal)
    out.current_value = await _compute_goal_current_value(goal, db)
    return out


@router.delete("/goals/{goal_id}", status_code=204)
async def delete_goal(
    goal_id: str,
    therapist: Therapist = Depends(get_current_therapist),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Goal).join(Patient).where(Goal.id == goal_id, Patient.therapist_id == therapist.id)
    )
    goal = result.scalar_one_or_none()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    await db.delete(goal)


# ------------------------------------------------------------------ #
#  Messages (therapist <-> parent communication log)                   #
# ------------------------------------------------------------------ #

@router.post("/patients/{patient_id}/messages", response_model=MessageOut, status_code=201)
async def create_message(
    patient_id: str,
    data: MessageCreate,
    therapist: Therapist = Depends(get_current_therapist),
    db: AsyncSession = Depends(get_db),
):
    await _get_owned_patient(patient_id, therapist, db)
    if data.sender_role not in (SenderRole.therapist, SenderRole.parent):
        raise HTTPException(status_code=422, detail="sender_role must be 'therapist' or 'parent'")
    message = Message(
        patient_id=patient_id,
        sender_role=data.sender_role,
        sender_id=therapist.id if data.sender_role == SenderRole.therapist else None,
        body=data.body,
    )
    db.add(message)
    await db.flush()
    return message


@router.get("/patients/{patient_id}/messages", response_model=list[MessageOut])
async def list_messages(
    patient_id: str,
    therapist: Therapist = Depends(get_current_therapist),
    db: AsyncSession = Depends(get_db),
):
    await _get_owned_patient(patient_id, therapist, db)
    result = await db.execute(
        select(Message).where(Message.patient_id == patient_id).order_by(Message.created_at.asc())
    )
    return result.scalars().all()


@router.post("/messages/{message_id}/read", response_model=MessageOut)
async def mark_message_read(
    message_id: str,
    therapist: Therapist = Depends(get_current_therapist),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Message).join(Patient).where(Message.id == message_id, Patient.therapist_id == therapist.id)
    )
    message = result.scalar_one_or_none()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    if message.read_at is None:
        message.read_at = datetime.now(timezone.utc)
    return message


# ------------------------------------------------------------------ #
#  Home practice log (manual, parent-reported)                         #
# ------------------------------------------------------------------ #

@router.post("/patients/{patient_id}/home-practice", response_model=HomePracticeLogOut, status_code=201)
async def create_home_practice_log(
    patient_id: str,
    data: HomePracticeLogCreate,
    therapist: Therapist = Depends(get_current_therapist),
    db: AsyncSession = Depends(get_db),
):
    await _get_owned_patient(patient_id, therapist, db)
    log = HomePracticeLog(
        patient_id=patient_id,
        practiced_on=data.practiced_on,
        duration_minutes=data.duration_minutes,
        notes=data.notes,
    )
    db.add(log)
    await db.flush()
    return log


@router.get("/patients/{patient_id}/home-practice", response_model=list[HomePracticeLogOut])
async def list_home_practice_logs(
    patient_id: str,
    therapist: Therapist = Depends(get_current_therapist),
    db: AsyncSession = Depends(get_db),
):
    await _get_owned_patient(patient_id, therapist, db)
    result = await db.execute(
        select(HomePracticeLog)
        .where(HomePracticeLog.patient_id == patient_id)
        .order_by(HomePracticeLog.practiced_on.desc())
    )
    return result.scalars().all()


# ------------------------------------------------------------------ #
#  Multi-child alert view                                              #
# ------------------------------------------------------------------ #

@router.get("/alerts", response_model=list[PatientAlert])
async def list_patient_alerts(
    inactive_days: int = 3,
    therapist: Therapist = Depends(get_current_therapist),
    db: AsyncSession = Depends(get_db),
):
    """Read-side aggregation, no new storage: flags patients who haven't
    played in `inactive_days`+ (across BreathQuest/VoiceHurdleRace/VaakMirror/
    Chime) or who have an overdue assignment."""
    patients_result = await db.execute(
        select(Patient).where(Patient.therapist_id == therapist.id, Patient.is_active == True)
    )
    patients = patients_result.scalars().all()
    now = datetime.now(timezone.utc)

    alerts = []
    for p in patients:
        bq_last = (await db.execute(
            select(func.max(GameSession.started_at)).where(GameSession.patient_id == p.id)
        )).scalar()
        vhr_last = (await db.execute(
            select(func.max(VoiceHurdleRaceSession.created_at)).where(VoiceHurdleRaceSession.patient_id == p.id)
        )).scalar()
        vm_last = (await db.execute(
            select(func.max(VaakMirrorSession.started_at)).where(VaakMirrorSession.patient_id == p.id)
        )).scalar()
        chime_last = chime_data_store.last_event_time(child_id=p.id, db_path=CHIME_DB_PATH)

        last_candidates = [d for d in (bq_last, vhr_last, vm_last, chime_last) if d is not None]
        last_played = max(last_candidates) if last_candidates else None
        days_since = (now - last_played).days if last_played else None

        overdue_count = (await db.execute(
            select(func.count(Assignment.id)).where(
                Assignment.patient_id == p.id,
                Assignment.status == AssignmentStatus.overdue,
            )
        )).scalar() or 0

        if days_since is None or days_since >= inactive_days:
            flag = "inactive"
        elif overdue_count > 0:
            flag = "overdue_assignment"
        else:
            flag = "ok"

        alerts.append(PatientAlert(
            patient_id=p.id,
            first_name=p.first_name,
            days_since_last_session=days_since,
            overdue_assignments=overdue_count,
            flag=flag,
        ))

    return alerts


# ------------------------------------------------------------------ #
#  Weekly summary (rule-based, no LLM/API calls)                       #
# ------------------------------------------------------------------ #

@router.get("/patients/{patient_id}/weekly-summary", response_model=WeeklySummaryOut)
async def get_weekly_summary(
    patient_id: str,
    week_offset: int = 0,   # 0 = current week (Mon-based), 1 = last week, etc.
    therapist: Therapist = Depends(get_current_therapist),
    db: AsyncSession = Depends(get_db),
):
    """Entirely rule-based — no external API call, deterministic per
    patient/week. See services/weekly_summary.py for the generator."""
    patient = await _get_owned_patient(patient_id, therapist, db)

    now = datetime.now(timezone.utc)
    this_monday = (now - timedelta(days=now.weekday())).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    week_start = this_monday - timedelta(weeks=week_offset)

    result = await generate_weekly_summary(db, patient, week_start, chime_data_store.DEFAULT_DB_PATH)
    return WeeklySummaryOut(**result)


def _iso_week_bucket(dt: datetime) -> tuple[str, datetime]:
    """Returns ("2026-W28", monday_of_that_week) for a given datetime."""
    iso_year, iso_week, _ = dt.isocalendar()
    monday = dt - timedelta(days=dt.weekday())
    monday = monday.replace(hour=0, minute=0, second=0, microsecond=0)
    return (f"{iso_year}-W{iso_week:02d}", monday)


@router.get("/patients/{patient_id}/sound-progress", response_model=SoundProgressOut)
async def get_sound_progress(
    patient_id: str,
    weeks: int = 8,
    therapist: Therapist = Depends(get_current_therapist),
    db: AsyncSession = Depends(get_db),
):
    """Real accuracy-over-time per sound, from VaakMirror Attempts + Chime
    session_events — the only two places this app actually records a
    sound-level correct/incorrect outcome with a timestamp. There is no
    vocabulary-size or fluency-rate tracking anywhere in the codebase, so
    unlike the ICF report's other sections, this one doesn't try to
    approximate those — it reports what's real and nothing else."""
    await _get_owned_patient(patient_id, therapist, db)
    since = datetime.now(timezone.utc) - timedelta(weeks=weeks)

    # sound_id -> week_label -> [correct_count, total_count, week_start]
    buckets: dict[str, dict[str, list]] = {}

    vm_result = await db.execute(
        select(Attempt.sound_id, Attempt.outcome, Attempt.created_at)
        .join(VaakMirrorSession, Attempt.session_id == VaakMirrorSession.id)
        .where(
            VaakMirrorSession.patient_id == patient_id,
            Attempt.created_at >= since,
            Attempt.sound_id.isnot(None),
        )
    )
    for sound_id, outcome, created_at in vm_result.all():
        week_label, week_start_dt = _iso_week_bucket(created_at)
        wk = buckets.setdefault(sound_id, {}).setdefault(week_label, [0, 0, week_start_dt])
        wk[1] += 1
        if outcome in ("passed", "caught"):
            wk[0] += 1

    chime_events = chime_data_store.get_events(child_id=patient_id, db_path=CHIME_DB_PATH)
    for ev in chime_events:
        try:
            ts = datetime.fromisoformat(ev["timestamp"])
        except (KeyError, ValueError, TypeError):
            continue
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        if ts < since or not ev.get("level_id"):
            continue
        week_label, week_start_dt = _iso_week_bucket(ts)
        wk = buckets.setdefault(ev["level_id"], {}).setdefault(week_label, [0, 0, week_start_dt])
        wk[1] += 1
        if ev.get("is_valid_attempt"):
            wk[0] += 1

    sounds_out: dict[str, list[SoundWeekPoint]] = {}
    for sound_id, week_map in buckets.items():
        points = [
            SoundWeekPoint(
                week=week_label, week_start=data[2],
                accuracy=(data[0] / data[1]) if data[1] else 0.0,
                attempts=data[1],
            )
            for week_label, data in week_map.items()
        ]
        points.sort(key=lambda p: p.week_start)
        sounds_out[sound_id] = points

    return SoundProgressOut(
        patient_id=patient_id,
        sounds=sounds_out,
        practiced_sound_count=len(sounds_out),
    )


@router.get("/home-practice-ideas", response_model=list[HomePracticeIdeaOut])
async def list_home_practice_ideas(
    condition: str | None = None,
    goal: str | None = None,
    therapist: Therapist = Depends(get_current_therapist),
):
    """Static library (services/home_practice_ideas.py) — not per-patient
    data, just filterable by condition/goal tag as the spec asks for."""
    from services.home_practice_ideas import filter_ideas
    return filter_ideas(condition=condition, goal=goal)


# ------------------------------------------------------------------ #
#  ICF-style PDF report export                                         #
# ------------------------------------------------------------------ #

@router.get("/patients/{patient_id}/report")
async def get_patient_report(
    patient_id: str,
    therapist: Therapist = Depends(get_current_therapist),
    db: AsyncSession = Depends(get_db),
):
    """Generates an ICF-style PDF pulling from the same aggregates the
    dashboard already computes — progress, weekly summary, goals, assignments."""
    patient = await _get_owned_patient(patient_id, therapist, db)

    progress = await get_patient_progress(patient_id, therapist, db)

    now = datetime.now(timezone.utc)
    this_monday = (now - timedelta(days=now.weekday())).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    weekly_data = await generate_weekly_summary(db, patient, this_monday, chime_data_store.DEFAULT_DB_PATH)
    weekly_summary = WeeklySummaryOut(**weekly_data)

    goals = await list_goals(patient_id, therapist, db)
    assignments = await list_assignments(patient_id, therapist, db)

    if build_patient_report_pdf is None:
        raise HTTPException(
            status_code=503,
            detail=f"PDF export is temporarily unavailable: {_PDF_EXPORT_IMPORT_ERROR}",
        )

    fd, tmp_path = tempfile.mkstemp(suffix=".pdf")
    os.close(fd)
    try:
        build_patient_report_pdf(
            patient=patient, progress=progress, weekly_summary=weekly_summary,
            goals=goals, assignments=assignments, therapist=therapist,
            output_path=tmp_path,
        )
    except Exception as e:
        os.remove(tmp_path)
        raise HTTPException(status_code=503, detail=f"PDF export failed: {e}")

    safe_name = patient.first_name.replace(" ", "_")
    return FileResponse(
        tmp_path, media_type="application/pdf",
        filename=f"{safe_name}_progress_report.pdf",
    )
