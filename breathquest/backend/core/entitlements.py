"""
core/entitlements.py — subscription-status gating for paid routes.

Two dependencies, mirroring the two payer types in core/deps.py:
require_active_parent(...) and require_active_therapist(...). Each
wraps the existing get_current_parent/get_current_therapist auth
dependency, then additionally checks that owner has a Subscription
row that's either still trialing (before trial_ends_at) or active
(before current_period_end). Everything else -- expired trial,
past_due, canceled, or no Subscription row at all -- gets a 402.

Deliberately does NOT talk to any payment provider here. Provider
webhooks (routers/billing.py) are the only thing that ever writes to
Subscription.status/current_period_end; this file only reads.
"""

from datetime import datetime, timezone

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.models import Subscription, Parent, Therapist
from core.deps import get_current_parent, get_current_therapist


def _is_entitled(sub: Subscription | None) -> bool:
    if sub is None:
        return False
    now = datetime.now(timezone.utc)
    if sub.status == "trialing":
        return sub.trial_ends_at > now
    if sub.status == "active":
        # current_period_end should always be set once a provider is
        # wired in, but don't hard-crash on a null -- treat as entitled
        # rather than 500, since "active" with no period_end is a data
        # gap to fix, not a reason to lock out someone who's paying.
        return sub.current_period_end is None or sub.current_period_end > now
    return False  # past_due, canceled, or any other status


async def require_active_parent(
    parent: Parent = Depends(get_current_parent),
    db: AsyncSession = Depends(get_db),
) -> Parent:
    result = await db.execute(select(Subscription).where(Subscription.owner_parent_id == parent.id))
    sub = result.scalar_one_or_none()
    if not _is_entitled(sub):
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Trial expired or subscription inactive -- please subscribe to continue",
        )
    return parent


async def require_active_therapist(
    therapist: Therapist = Depends(get_current_therapist),
    db: AsyncSession = Depends(get_db),
) -> Therapist:
    result = await db.execute(select(Subscription).where(Subscription.owner_therapist_id == therapist.id))
    sub = result.scalar_one_or_none()
    if not _is_entitled(sub):
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Trial expired or subscription inactive -- please subscribe to continue",
        )
    return therapist
