"""
core/billing_provider.py — payment-provider abstraction.

The goal: wiring a real provider (Razorpay/Stripe) later means writing
ONE class that implements BillingProvider and registering it in
_PROVIDERS below -- routers/billing.py never changes.

BillingProvider defines exactly the two operations billing.py needs:
  - create_checkout_session: start a checkout, return a redirect URL
  - verify_and_parse_webhook: verify the signature on an incoming
    webhook and return a normalized event dict, or raise if invalid

Deliberately NOT part of the interface: anything provider-specific
(customer objects, price IDs, plan-to-price mapping). Those live
inside each concrete provider's __init__/methods, not leaked into
routers/billing.py or core/entitlements.py.
"""

from abc import ABC, abstractmethod
from typing import Any

from fastapi import HTTPException, status

from core.config import get_settings

settings = get_settings()


class BillingProvider(ABC):
    @abstractmethod
    async def create_checkout_session(
        self,
        customer_email: str,
        plan_type: str,
        owner_id: str,
        owner_kind: str,  # "parent" | "therapist"
    ) -> str:
        """Returns a checkout URL to redirect the user to."""
        raise NotImplementedError

    @abstractmethod
    async def verify_and_parse_webhook(
        self, payload: bytes, headers: dict[str, str]
    ) -> dict[str, Any]:
        """
        Verifies the webhook signature (raise HTTPException 400 on
        failure) and returns a normalized event, e.g.:
        {"type": "subscription.activated" | "subscription.canceled" | ...,
         "owner_id": str, "owner_kind": "parent"|"therapist",
         "current_period_end": datetime | None}
        """
        raise NotImplementedError


class StubProvider(BillingProvider):
    """Today's behavior, as a real class instead of hardcoded 501s."""

    async def create_checkout_session(self, customer_email, plan_type, owner_id, owner_kind) -> str:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="No payment provider configured yet",
        )

    async def verify_and_parse_webhook(self, payload, headers) -> dict[str, Any]:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="No payment provider configured yet",
        )


# Register real implementations here as they're written, e.g.:
#   from core.billing_razorpay import RazorpayProvider
#   _PROVIDERS = {"stub": StubProvider, "razorpay": RazorpayProvider}
_PROVIDERS: dict[str, type[BillingProvider]] = {
    "stub": StubProvider,
}


def get_billing_provider() -> BillingProvider:
    provider_cls = _PROVIDERS.get(settings.BILLING_PROVIDER, StubProvider)
    return provider_cls()
