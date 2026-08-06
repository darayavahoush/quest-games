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


def invalidate_cache():
    with _cache_lock:
        _cache.clear()
