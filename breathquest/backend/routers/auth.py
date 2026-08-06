"""
routers/auth.py — Authentication for therapists (JWT) and kids (PIN).
"""

from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models.models import Therapist, Patient, Parent
from schemas.schemas import (
    TherapistRegister, TherapistLogin, TokenResponse,
    KidLoginRequest, KidTokenResponse, KidRegisterRequest,
    ParentRegisterRequest, ParentLoginRequest, ParentTokenResponse,
    AssessmentPinSetupRequest,
)
from core import assessment_client
from core.security import (
    hash_password, verify_password,
    create_access_token,
    hash_pin, verify_pin, create_kid_token,
    create_parent_token,
    generate_unique_player_code,
)

router = APIRouter(prefix="/auth", tags=["auth"])


# ------------------------------------------------------------------ #
#  Therapist auth                                                      #
# ------------------------------------------------------------------ #

@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register_therapist(data: TherapistRegister, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(Therapist).where(Therapist.email == data.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    therapist = Therapist(
        email=data.email,
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
        clinic_name=data.clinic_name,
    )
    db.add(therapist)
    await db.flush()

    token = create_access_token(therapist.id)
    return TokenResponse(
        access_token=token,
        therapist_id=therapist.id,
        full_name=therapist.full_name,
    )


@router.post("/login", response_model=TokenResponse)
async def login_therapist(data: TherapistLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Therapist).where(Therapist.email == data.email))
    therapist = result.scalar_one_or_none()

    if not therapist or not verify_password(data.password, therapist.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not therapist.is_active:
        raise HTTPException(status_code=403, detail="Account deactivated")

    therapist.last_login = datetime.now(timezone.utc)

    token = create_access_token(therapist.id)
    return TokenResponse(
        access_token=token,
        therapist_id=therapist.id,
        full_name=therapist.full_name,
    )


# ------------------------------------------------------------------ #
#  Kid self-registration                                               #
# ------------------------------------------------------------------ #

@router.post("/kid-register", response_model=KidTokenResponse, status_code=201)
async def kid_register(data: KidRegisterRequest, db: AsyncSession = Depends(get_db)):
    # Generate short unique player code e.g. CHICK42
    code = await generate_unique_player_code(db, data.avatar)

    patient = Patient(
        therapist_id=None,
        first_name=data.first_name,
        avatar=data.avatar,
        pin_hash=hash_pin(data.pin),
        player_code=code,
    )
    db.add(patient)
    await db.flush()

    token = create_kid_token(patient.id)
    return KidTokenResponse(
        access_token=token,
        patient_id=patient.id,
        first_name=patient.first_name,
        avatar=patient.avatar,
        player_code=code,
    )


# ------------------------------------------------------------------ #
#  Kid PIN login (using player_code + PIN)                            #
# ------------------------------------------------------------------ #

@router.post("/kid-login", response_model=KidTokenResponse)
async def kid_login(data: KidLoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Patient).where(Patient.player_code == data.player_code.upper())
    )
    patient = result.scalar_one_or_none()

    if not patient:
        raise HTTPException(status_code=404, detail="Player code not found")

    if not patient.is_active:
        raise HTTPException(status_code=403, detail="Account deactivated")

    if not verify_pin(data.pin, patient.pin_hash):
        raise HTTPException(status_code=401, detail="Incorrect PIN")

    token = create_kid_token(patient.id)
    return KidTokenResponse(
        access_token=token,
        patient_id=patient.id,
        first_name=patient.first_name,
        avatar=patient.avatar,
        player_code=patient.player_code,
    )


# ------------------------------------------------------------------ #
#  Assessment-linked kid setup                                         #
#  Candidate lists + PIN setup for kids created in Assessment, reached #
#  over HTTP via core/assessment_client.py (see diagnostic_client.py   #
#  for the same cross-service pattern used elsewhere in this codebase) #
# ------------------------------------------------------------------ #

@router.get("/therapist-candidates")
async def therapist_candidates():
    """Distinct therapist names recorded during Assessment intake, for a
    therapist self-select dropdown. Empty list if Assessment is unreachable."""
    return {"therapists": assessment_client.get_therapist_candidates()}


@router.get("/kid-candidates")
async def kid_candidates():
    """Active patients from Assessment, for the kid-selection list at
    BreathQuest PIN setup. Empty list if Assessment is unreachable."""
    return {"patients": assessment_client.get_kid_candidates()}


@router.post("/kid-pin-setup", response_model=KidTokenResponse)
async def kid_pin_setup(data: AssessmentPinSetupRequest, db: AsyncSession = Depends(get_db)):
    assessment_patient = assessment_client.get_assessment_patient(data.patient_id)
    if not assessment_patient:
        raise HTTPException(status_code=404, detail="Patient not found in Assessment, or Assessment is unreachable")
    if not assessment_patient.get("is_active", True):
        raise HTTPException(status_code=403, detail="Patient is not active in Assessment")

    # Find-or-create on assessment_patient_id, not a derived code — makes
    # re-running PIN setup for the same kid idempotent instead of creating
    # a second duplicate BreathQuest patient (see models.py comment).
    result = await db.execute(
        select(Patient).where(Patient.assessment_patient_id == data.patient_id)
    )
    patient = result.scalar_one_or_none()

    if patient:
        patient.pin_hash = hash_pin(data.pin)
        patient.avatar = data.avatar
        patient.first_name = assessment_patient.get("name", patient.first_name)
    else:
        code = await generate_unique_player_code(db, data.avatar)
        patient = Patient(
            therapist_id=None,
            first_name=assessment_patient.get("name", "Player"),
            avatar=data.avatar,
            pin_hash=hash_pin(data.pin),
            player_code=code,
            assessment_patient_id=data.patient_id,
        )
        db.add(patient)

    await db.flush()

    token = create_kid_token(patient.id)
    return KidTokenResponse(
        access_token=token,
        patient_id=patient.id,
        first_name=patient.first_name,
        avatar=patient.avatar,
        player_code=patient.player_code,
    )


# ------------------------------------------------------------------ #
#  Parent auth                                                         #
# ------------------------------------------------------------------ #

@router.post("/parent-register", response_model=ParentTokenResponse, status_code=201)
async def parent_register(data: ParentRegisterRequest, db: AsyncSession = Depends(get_db)):
    if not data.player_code and not data.invite_code:
        raise HTTPException(status_code=400, detail="Provide either your child's player code or a therapist-issued invite code")
    if data.player_code and data.invite_code:
        raise HTTPException(status_code=400, detail="Provide only one of player_code or invite_code, not both")

    if data.player_code:
        result = await db.execute(select(Patient).where(Patient.player_code == data.player_code.upper()))
    else:
        result = await db.execute(select(Patient).where(Patient.parent_invite_code == data.invite_code.upper()))
    patient = result.scalar_one_or_none()

    if not patient:
        raise HTTPException(status_code=404, detail="Code not found — check with your child or their therapist")

    existing_parent = await db.execute(select(Parent).where(Parent.patient_id == patient.id))
    if existing_parent.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="A parent account is already linked to this child")

    existing_email = await db.execute(select(Parent).where(Parent.email == data.email))
    if existing_email.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    parent = Parent(
        patient_id=patient.id,
        email=data.email,
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
    )
    db.add(parent)

    # Invite codes are single-use — clear it once redeemed so it can't be
    # reused by someone else who happens to see it later.
    if data.invite_code:
        patient.parent_invite_code = None

    await db.flush()

    token = create_parent_token(parent.id)
    return ParentTokenResponse(
        access_token=token,
        parent_id=parent.id,
        patient_id=patient.id,
        child_first_name=patient.first_name,
    )


@router.post("/parent-login", response_model=ParentTokenResponse)
async def parent_login(data: ParentLoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Parent).where(Parent.email == data.email))
    parent = result.scalar_one_or_none()

    if not parent or not verify_password(data.password, parent.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not parent.is_active:
        raise HTTPException(status_code=403, detail="Account deactivated")

    patient_result = await db.execute(select(Patient).where(Patient.id == parent.patient_id))
    patient = patient_result.scalar_one_or_none()
    if not patient:
        raise HTTPException(status_code=404, detail="Linked child account no longer exists")

    parent.last_login = datetime.now(timezone.utc)

    token = create_parent_token(parent.id)
    return ParentTokenResponse(
        access_token=token,
        parent_id=parent.id,
        patient_id=patient.id,
        child_first_name=patient.first_name,
    )
