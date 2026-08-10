"""
core/assessment_client.py — client for Assessment-side patient/therapist
data (agenti_ai's backend/app/routes/assessment.py), used by routers/auth.py
for therapist-candidate/kid-candidate dropdowns and Assessment-linked PIN
setup. Same service-to-service pattern as agent/diagnostic_client.py:
HTTP + shared API key, cached, degrades gracefully rather than raising if
Assessment is unreachable.
"""

import json
import logging
import os
import threading
import time
import urllib.error
import urllib.request

logger = logging.getLogger(__name__)

ASSESSMENT_SERVICE_URL = os.getenv("ASSESSMENT_SERVICE_URL", "http://localhost:8000")
ASSESSMENT_SERVICE_API_KEY = os.getenv("ASSESSMENT_SERVICE_API_KEY")
CACHE_TTL_SECONDS = 60 * 5
REQUEST_TIMEOUT_SECONDS = 3.0

_cache_lock = threading.Lock()
_cache = {}


def _get(url: str):
    if not ASSESSMENT_SERVICE_API_KEY:
        logger.warning("ASSESSMENT_SERVICE_API_KEY not configured — skipping Assessment fetch")
        return None

    req = urllib.request.Request(url, headers={"X-API-Key": ASSESSMENT_SERVICE_API_KEY})
    try:
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_SECONDS) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            logger.info("Assessment service 404 for %s", url)
        else:
            logger.warning("Assessment service returned HTTP %s for %s", exc.code, url)
        return None
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        logger.warning("Assessment service unreachable for %s: %s", url, exc)
        return None
    except (ValueError, json.JSONDecodeError) as exc:
        logger.warning("Malformed response from Assessment service for %s: %s", url, exc)
        return None


def _post(url: str, payload: dict):
    """Counterpart to _get for writes -- deliberately NOT run through
    _cached (see get_therapist_candidates/get_kid_candidates below), since
    caching a create call would silently swallow subsequent creates.
    Returns (result_dict_or_None, error_detail_or_None) -- unlike _get,
    callers of this need to distinguish "unreachable/failed" from "worked",
    not just degrade to an empty default, since a failed patient-creation
    call must surface as a real error to the therapist, not silently no-op."""
    if not ASSESSMENT_SERVICE_API_KEY:
        return None, "ASSESSMENT_SERVICE_API_KEY not configured"

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url, data=data, method="POST",
        headers={"X-API-Key": ASSESSMENT_SERVICE_API_KEY, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_SECONDS) as resp:
            return json.loads(resp.read().decode("utf-8")), None
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        logger.warning("Assessment service returned HTTP %s for POST %s: %s", exc.code, url, body)
        return None, f"Assessment service error ({exc.code}): {body}"
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        logger.warning("Assessment service unreachable for POST %s: %s", url, exc)
        return None, "Assessment service unreachable"
    except (ValueError, json.JSONDecodeError) as exc:
        logger.warning("Malformed response from Assessment service for POST %s: %s", url, exc)
        return None, "Malformed response from Assessment service"


def _cached(key: str, fetch_fn):
    now = time.monotonic()
    with _cache_lock:
        cached = _cache.get(key)
        if cached is not None and (now - cached[0]) < CACHE_TTL_SECONDS:
            return cached[1]

    result = fetch_fn()
    with _cache_lock:
        _cache[key] = (now, result)
    return result


def get_therapist_candidates() -> list[str]:
    url = f"{ASSESSMENT_SERVICE_URL.rstrip('/')}/assessment/therapists"
    result = _cached("therapists", lambda: _get(url))
    return result if isinstance(result, list) else []


def get_kid_candidates() -> list[dict]:
    url = f"{ASSESSMENT_SERVICE_URL.rstrip('/')}/assessment/patients"
    result = _cached("patients", lambda: _get(url))
    return result if isinstance(result, list) else []


def get_assessment_patient(patient_id: str):
    url = f"{ASSESSMENT_SERVICE_URL.rstrip('/')}/assessment/patients/{patient_id}"
    return _get(url)


def create_assessment_patient(therapist_email: str, name: str, age: int | None = None,
                               diagnosis: str | None = None,
                               max_attempts: int = 3) -> tuple[str | None, str | None]:
    """Creates the real, Assessment-origin patient record -- called by
    routers/patients.py's create_patient so a BreathQuest 'Add Patient'
    action originates the patient_id in Assessment rather than creating a
    second, disconnected BreathQuest-only patient (see the 2026-08-10
    branch note). Returns (assessment_patient_id, error_message) -- exactly
    one will be None.

    Retries on transient "unreachable" failures only (max_attempts, short
    backoff) -- this runs inside asyncio.to_thread from routers/patients.py,
    so a blocking sleep here doesn't stall the event loop. Does NOT retry on
    a real HTTP error response from Assessment -- that means Assessment is
    up and rejecting the request, so retrying just delays an inevitable
    failure instead of recovering from one."""
    import time

    url = f"{ASSESSMENT_SERVICE_URL.rstrip('/')}/assessment/patients"
    payload = {
        "name": name, "therapist_email": therapist_email,
        "age": age, "diagnosis": diagnosis,
    }
    last_error = None
    for attempt in range(1, max_attempts + 1):
        result, error = _post(url, payload)
        if result is not None:
            return result.get("id"), None
        last_error = error
        if error != "Assessment service unreachable":
            return None, error
        if attempt < max_attempts:
            logger.warning(
                "Assessment service unreachable creating patient (attempt %s/%s), retrying...",
                attempt, max_attempts,
            )
            time.sleep(0.5 * attempt)
    return None, last_error


def invalidate_cache():
    with _cache_lock:
        _cache.clear()
