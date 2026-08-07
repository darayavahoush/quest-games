"""
core/rate_limit.py — lightweight in-process rate limiting and account
lockout for the auth endpoints.

This app runs as a single uvicorn process (no --workers flag), so a plain
in-memory store is safe: there's no multi-process state-splitting to worry
about, unlike a limiter that needs to work across replicas (which would
need Redis or similar instead).

Two independent mechanisms, because they defend against different threats:

1. IP-based rate limiting (`check_ip_rate_limit`) — a broad guard against a
   single source hammering any auth endpoint, regardless of which account
   they're targeting.

2. Per-account failed-attempt lockout (`check_account_lockout` /
   `record_failed_attempt` / `clear_failed_attempts`) — the actual defense
   against PIN/password brute-forcing, since that doesn't require a single
   source IP (an attacker can rotate IPs, but still only gets as many
   guesses against *one account* as this allows).

IMPORTANT: every check-then-mutate sequence here must NOT have an `await`
between the check and the mutation — this relies on the GIL + the fact
that asyncio only context-switches at an `await` to make these plain dict
mutations atomic w.r.t. concurrent requests. Don't add an `await` inside
these functions without re-threading this into a proper async lock.
"""

import time
from collections import defaultdict
from threading import Lock

from fastapi import HTTPException, Request

# ------------------------------------------------------------------ #
#  IP-based rate limiting
# ------------------------------------------------------------------ #

IP_WINDOW_SECONDS = 60
IP_MAX_REQUESTS = 20  # per window, per IP, across all auth endpoints combined

_ip_hits: dict[str, list[float]] = defaultdict(list)
_ip_lock = Lock()


def _client_ip(request: Request) -> str:
    # Trust X-Forwarded-For's first hop only because Render (this app's
    # host) sits in front as a trusted proxy and sets it — falls back to
    # the direct connecting IP otherwise so this doesn't become trivially
    # spoofable in a local/dev setup that isn't behind such a proxy.
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def check_ip_rate_limit(request: Request) -> None:
    """Raises 429 if this IP has hit the auth endpoints too many times in
    the current window. Call at the top of every login endpoint."""
    ip = _client_ip(request)
    now = time.monotonic()
    cutoff = now - IP_WINDOW_SECONDS

    with _ip_lock:
        hits = _ip_hits[ip]
        while hits and hits[0] < cutoff:
            hits.pop(0)

        if len(hits) >= IP_MAX_REQUESTS:
            raise HTTPException(
                status_code=429,
                detail="Too many attempts from this connection — please wait a minute and try again.",
            )

        hits.append(now)


# ------------------------------------------------------------------ #
#  Per-account failed-attempt lockout
# ------------------------------------------------------------------ #

MAX_FAILED_ATTEMPTS = 5
LOCKOUT_SECONDS = 300  # 5 minutes

_failed_attempts: dict[str, list[float]] = defaultdict(list)
_lockout_until: dict[str, float] = {}
_account_lock = Lock()


def _account_key(scope: str, identifier: str) -> str:
    # scope keeps e.g. a therapist email and a parent email that happen to
    # match from sharing a lockout bucket.
    return f"{scope}:{identifier.lower()}"


def check_account_lockout(scope: str, identifier: str) -> None:
    """Raises 423 if this account is currently locked out from too many
    recent failed attempts. Call before verifying credentials."""
    key = _account_key(scope, identifier)
    now = time.monotonic()

    with _account_lock:
        locked_until = _lockout_until.get(key)
        if locked_until is not None:
            if now < locked_until:
                remaining = int(locked_until - now)
                raise HTTPException(
                    status_code=423,
                    detail=f"Too many failed attempts — try again in {remaining // 60 + 1} minute(s).",
                )
            # Lockout expired — clear it so we don't keep checking a dead entry.
            del _lockout_until[key]
            _failed_attempts.pop(key, None)


def record_failed_attempt(scope: str, identifier: str) -> None:
    """Call after a credential check fails. Locks the account out once
    MAX_FAILED_ATTEMPTS happen within LOCKOUT_SECONDS of each other."""
    key = _account_key(scope, identifier)
    now = time.monotonic()
    cutoff = now - LOCKOUT_SECONDS

    with _account_lock:
        hits = _failed_attempts[key]
        while hits and hits[0] < cutoff:
            hits.pop(0)
        hits.append(now)

        if len(hits) >= MAX_FAILED_ATTEMPTS:
            _lockout_until[key] = now + LOCKOUT_SECONDS


def clear_failed_attempts(scope: str, identifier: str) -> None:
    """Call after a successful login — resets the counter so a legitimate
    user who mistyped a few times isn't left one mistake away from a
    lockout on their next real session."""
    key = _account_key(scope, identifier)
    with _account_lock:
        _failed_attempts.pop(key, None)
        _lockout_until.pop(key, None)
