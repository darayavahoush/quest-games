"""
routers/dashboard.py — Therapist dashboard: analytics, progress, notes.
"""

from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_

from database import get_db
from models.models import Therapist, Patient, GameSession, TherapistNote
from models.voicehurdlerace_models import VoiceHurdleRaceSession
from vaakmirror.models import GameSession as VaakMirrorSession
from retraining import data_store as chime_data_store
from schemas.schemas import (
    PatientProgress, LevelProgress, DashboardSummary,
    PatientDetailOut, PatientOut, SessionOut,
    NoteCreate, NoteUpdate, NoteOut,
)
from core.deps import get_current_therapist

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
