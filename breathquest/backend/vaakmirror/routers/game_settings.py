"""
routers/game_settings.py — Per-patient, per-game clinical parameters.

Therapists set these (e.g. Mirror Mirror's round_size); the kid-facing game
reads its own settings the same way it reads everything else — via its own
token, self-scoped, same pattern as createGameSession.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from vaakmirror import agent_bridge
from vaakmirror.auth import assert_therapist_owns_patient, get_current_identity, get_current_therapist_id
from vaakmirror.models import GameName, GameSettings
from vaakmirror.schemas import GameSettingsOut, GameSettingsSuggestion, GameSettingsUpdate

router = APIRouter(tags=["vaakmirror-game-settings"])


@router.get("/patients/{patient_id}/game-settings/{game}", response_model=GameSettingsOut)
async def get_game_settings(
    patient_id: str,
    game: GameName,
    identity: tuple[str, str] = Depends(get_current_identity),
    db: AsyncSession = Depends(get_db),
):
    kind, sub = identity
    if kind == "patient" and sub != patient_id:
        raise HTTPException(status_code=403, detail="Not your settings")
    if kind == "therapist":
        await assert_therapist_owns_patient(db, sub, patient_id)

    result = await db.execute(
        select(GameSettings).where(GameSettings.patient_id == patient_id, GameSettings.game == game)
    )
    settings = result.scalar_one_or_none()
    if not settings:
        # No therapist-set override yet — the game itself falls back to its
        # own built-in default when round_size comes back null.
        return GameSettingsOut(game=game.value, round_size=None)
    return settings


@router.get("/patients/{patient_id}/game-settings/{game}/suggestion", response_model=GameSettingsSuggestion)
async def get_game_settings_suggestion(
    patient_id: str,
    game: GameName,
    therapist_id: str = Depends(get_current_therapist_id),
    db: AsyncSession = Depends(get_db),
):
    """What the shared adaptive-difficulty agent (agent_bridge.py) currently
    recommends for this patient+game — purely informational. Nothing is
    written until the therapist accepts it via PATCH below."""
    await assert_therapist_owns_patient(db, therapist_id, patient_id)

    result = await db.execute(
        select(GameSettings).where(GameSettings.patient_id == patient_id, GameSettings.game == game)
    )
    settings = result.scalar_one_or_none()
    current = settings.round_size if settings and settings.round_size is not None else agent_bridge.ROUND_SIZE_DEFAULT

    decision = agent_bridge.agent_service.decide(patient_id, game.value, policy="tabular_q")
    suggested = agent_bridge.apply_action_to_round_size(current, decision["action"])

    return GameSettingsSuggestion(
        game=game.value,
        action=decision["action"],
        message=decision["message"],
        n_events_considered=decision["n_events_considered"],
        current_round_size=current,
        suggested_round_size=suggested,
        policy_used=decision.get("policy"),
        requested_policy=decision.get("requested_policy"),
        downgrade_reason=decision.get("downgrade_reason"),
    )


@router.patch("/patients/{patient_id}/game-settings/{game}", response_model=GameSettingsOut)
async def update_game_settings(
    patient_id: str,
    game: GameName,
    payload: GameSettingsUpdate,
    therapist_id: str = Depends(get_current_therapist_id),
    db: AsyncSession = Depends(get_db),
):
    await assert_therapist_owns_patient(db, therapist_id, patient_id)

    result = await db.execute(
        select(GameSettings).where(GameSettings.patient_id == patient_id, GameSettings.game == game)
    )
    settings = result.scalar_one_or_none()
    if not settings:
        settings = GameSettings(patient_id=patient_id, game=game)
        db.add(settings)

    settings.round_size = payload.round_size
    settings.updated_by = therapist_id
    await db.commit()
    await db.refresh(settings)
    return settings
