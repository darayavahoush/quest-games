"""
routers/billing.py — subscription status + payment-provider stubs.

GET endpoints use plain get_current_therapist/get_current_parent (not
core.entitlements' require_active_*) deliberately: viewing your own
billing status must work even when the trial's expired or the sub is
past_due -- that's precisely when someone needs to see it. Entitlement
gating belongs on the paid feature routes, not on billing itself.

POST endpoints are explicit 501s until a provider (Razorpay/Stripe) is
picked -- no fake success responses, no silent no-ops.
"""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.models import Subscription, Therapist, Parent
from schemas.schemas import SubscriptionOut
from core.deps import get_current_therapist, get_current_parent
from core.billing_provider import get_billing_provider, BillingProvider

router = APIRouter(prefix="/billing", tags=["billing"])


@router.get("/subscription", response_model=SubscriptionOut)
async def get_therapist_subscription(
    therapist: Therapist = Depends(get_current_therapist),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Subscription).where(Subscription.owner_therapist_id == therapist.id)
    )
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="No subscription found for this account")
    return SubscriptionOut(
        plan_type=sub.plan_type,
        status=sub.status,
        trial_ends_at=sub.trial_ends_at,
        current_period_end=sub.current_period_end,
    )


@router.get("/parent-subscription", response_model=SubscriptionOut)
async def get_parent_subscription(
    parent: Parent = Depends(get_current_parent),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Subscription).where(Subscription.owner_parent_id == parent.id)
    )
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="No subscription found for this account")
    return SubscriptionOut(
        plan_type=sub.plan_type,
        status=sub.status,
        trial_ends_at=sub.trial_ends_at,
        current_period_end=sub.current_period_end,
    )


@router.post("/checkout")
async def start_therapist_checkout(
    therapist: Therapist = Depends(get_current_therapist),
    provider: BillingProvider = Depends(get_billing_provider),
):
    url = await provider.create_checkout_session(
        customer_email=therapist.email,
        plan_type="therapist_monthly",
        owner_id=therapist.id,
        owner_kind="therapist",
    )
    return {"checkout_url": url}


@router.post("/parent-checkout")
async def start_parent_checkout(
    parent: Parent = Depends(get_current_parent),
    provider: BillingProvider = Depends(get_billing_provider),
):
    url = await provider.create_checkout_session(
        customer_email=parent.email,
        plan_type="parent_monthly",
        owner_id=parent.id,
        owner_kind="parent",
    )
    return {"checkout_url": url}


@router.post("/webhook")
async def billing_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
    provider: BillingProvider = Depends(get_billing_provider),
):
    payload = await request.body()
    event = await provider.verify_and_parse_webhook(payload, dict(request.headers))

    owner_col = (
        Subscription.owner_therapist_id if event["owner_kind"] == "therapist"
        else Subscription.owner_parent_id
    )
    result = await db.execute(select(Subscription).where(owner_col == event["owner_id"]))
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="No subscription found for webhook owner_id")

    event_type = event["type"]
    if event_type == "subscription.activated":
        sub.status = "active"
        sub.current_period_end = event.get("current_period_end")
    elif event_type == "subscription.past_due":
        sub.status = "past_due"
    elif event_type == "subscription.canceled":
        sub.status = "canceled"
    else:
        raise HTTPException(status_code=400, detail=f"Unhandled event type: {event_type}")

    await db.flush()
    return {"received": True}
