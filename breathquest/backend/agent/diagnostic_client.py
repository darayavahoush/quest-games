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
CACHE_TTL_SECONDS = 60 * 60
NEUTRAL_SEVERITY = 0.0
REQUEST_TIMEOUT_SECONDS = 3.0

_cache_lock = threading.Lock()
_cache = {}

# Order matters: this is substring matching, so compound labels must be
# checked BEFORE the single-word labels they contain, or the compound tier
# is unreachable (e.g. "moderate to severe" contains "severe" and would
# always hit the profound/severe tier first if checked out of order; same
# for "mild to moderate" vs "moderate"). Do not reorder without re-checking
# every compound label against every earlier tier's keywords.
_SEVERITY_KEYWORDS = [
    (("profound",), 1.0),
    (("moderate to severe", "moderate-to-severe"), 0.85),
    (("severe",), 1.0),
    (("mild to moderate", "mild-to-moderate"), 0.45),
    (("moderate",), 0.6),
    (("mild",), 0.3),
    (("normal", "typical", "within normal limits", "no concern"), 0.0),
]


def severity_to_numeric(severity_classification) -> float:
    if not severity_classification:
        return NEUTRAL_SEVERITY
    label = str(severity_classification).lower()
    for keywords, value in _SEVERITY_KEYWORDS:
        if any(kw in label for kw in keywords):
            return value
    logger.warning("Unrecognized severity_classification label %r — using neutral default", severity_classification)
    return NEUTRAL_SEVERITY


def _fetch_from_assessment_service(patient_id: str):
    if not ASSESSMENT_SERVICE_API_KEY:
        logger.warning("ASSESSMENT_SERVICE_API_KEY not configured — skipping diagnostic context fetch")
        return None

    url = f"{ASSESSMENT_SERVICE_URL.rstrip('/')}/assessment/patients/{patient_id}/latest"
    req = urllib.request.Request(url, headers={"X-API-Key": ASSESSMENT_SERVICE_API_KEY})
    try:
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_SECONDS) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            logger.info("No assessment on file for patient %s", patient_id)
        else:
            logger.warning("Assessment service returned HTTP %s for patient %s", exc.code, patient_id)
        return None
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        logger.warning("Assessment service unreachable for patient %s: %s", patient_id, exc)
        return None
    except (ValueError, json.JSONDecodeError) as exc:
        logger.warning("Malformed response from Assessment service for patient %s: %s", patient_id, exc)
        return None

    severity_numeric = severity_to_numeric(payload.get("severity_classification"))
    targeted_quests = frozenset(payload.get("targeted_quests") or [])
    return severity_numeric, targeted_quests


def get_diagnostic_context(patient_id: str):
    now = time.monotonic()
    with _cache_lock:
        cached = _cache.get(patient_id)
        if cached is not None and (now - cached[0]) < CACHE_TTL_SECONDS:
            return cached[1], cached[2]

    result = _fetch_from_assessment_service(patient_id)
    severity_numeric, targeted_quests = result if result is not None else (NEUTRAL_SEVERITY, frozenset())

    with _cache_lock:
        _cache[patient_id] = (now, severity_numeric, targeted_quests)

    return severity_numeric, targeted_quests


def invalidate_cache(patient_id: str = None):
    with _cache_lock:
        if patient_id is None:
            _cache.clear()
        else:
            _cache.pop(patient_id, None)
