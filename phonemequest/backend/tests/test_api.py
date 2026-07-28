"""
Backend API tests. Uses a temp DB path per test (via monkeypatching
backend.main.DB_PATH) so nothing here touches the real chime_sessions.db.
"""

import pytest
from fastapi.testclient import TestClient

from backend import main as backend_main
from backend.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    monkeypatch.setattr(backend_main, "DB_PATH", tmp_path / "test_chime.db")
    yield


def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_log_and_retrieve_event():
    resp = client.post("/events", json={
        "child_id": "child_1",
        "level_id": "aa_rocket",
        "attempt_number": 1,
        "score": 0.75,
        "is_valid_attempt": True,
    })
    assert resp.status_code == 200
    body = resp.json()
    assert body["child_id"] == "child_1"
    assert body["score"] == 0.75

    resp2 = client.get("/events/child_1")
    assert resp2.status_code == 200
    events = resp2.json()
    assert len(events) == 1
    assert events[0]["level_id"] == "aa_rocket"


def test_events_filtered_by_level():
    client.post("/events", json={"child_id": "c2", "level_id": "aa_rocket", "attempt_number": 1, "score": 0.5, "is_valid_attempt": True})
    client.post("/events", json={"child_id": "c2", "level_id": "oo_submarine", "attempt_number": 1, "score": 0.5, "is_valid_attempt": True})
    resp = client.get("/events/c2?level_id=aa_rocket")
    events = resp.json()
    assert len(events) == 1
    assert events[0]["level_id"] == "aa_rocket"


def test_difficulty_not_enough_data():
    client.post("/events", json={"child_id": "c3", "level_id": "aa_rocket", "attempt_number": 1, "score": 0.9, "is_valid_attempt": True})
    resp = client.get("/difficulty/c3/aa_rocket")
    assert resp.status_code == 200
    assert resp.json()["action"] == "hold"
    assert resp.json()["n_events_considered"] < 3


def test_difficulty_raises_when_doing_well():
    for i in range(6):
        client.post("/events", json={"child_id": "c4", "level_id": "aa_rocket", "attempt_number": i, "score": 0.9, "is_valid_attempt": True})
    resp = client.get("/difficulty/c4/aa_rocket")
    assert resp.json()["action"] == "raise"


def test_difficulty_lowers_when_struggling():
    for i in range(6):
        client.post("/events", json={"child_id": "c5", "level_id": "aa_rocket", "attempt_number": i, "score": 0.1, "is_valid_attempt": True})
    resp = client.get("/difficulty/c5/aa_rocket")
    assert resp.json()["action"] == "lower"


def test_difficulty_lowers_on_high_quit_rate():
    for i in range(6):
        client.post("/events", json={
            "child_id": "c6", "level_id": "aa_rocket", "attempt_number": i,
            "score": 0.9, "is_valid_attempt": True, "quit_flag": (i % 2 == 0),
        })
    resp = client.get("/difficulty/c6/aa_rocket")
    assert resp.json()["action"] == "lower"


def test_score_word_good_match():
    resp = client.post("/village-builder/score-word", json={
        "transcript": "banana", "target_word": "banana", "asr_confidence": 0.9,
    })
    assert resp.status_code == 200
    body = resp.json()
    assert body["match_score"] > 0.9
    assert body["is_valid_attempt"] is True


def test_score_word_poor_match():
    resp = client.post("/village-builder/score-word", json={
        "transcript": "xyz", "target_word": "banana", "asr_confidence": 0.8,
    })
    body = resp.json()
    assert body["match_score"] < 0.5


def test_score_word_empty_transcript():
    resp = client.post("/village-builder/score-word", json={
        "transcript": "", "target_word": "banana", "asr_confidence": 0.0,
    })
    body = resp.json()
    assert body["is_valid_attempt"] is False


def test_agent_decide_not_enough_events_holds():
    resp = client.get("/agent/decide/agent_c1/aa_rocket?policy=rule_based")
    assert resp.status_code == 200
    body = resp.json()
    assert body["action"] == "hold"
    assert body["n_events_considered"] < 3


def test_agent_decide_rule_based_with_history():
    for i in range(5):
        client.post("/events", json={
            "child_id": "agent_c2", "level_id": "aa_rocket", "attempt_number": i,
            "score": 0.9, "is_valid_attempt": True, "threshold_at_time": 0.5,
        })
    resp = client.get("/agent/decide/agent_c2/aa_rocket?policy=rule_based")
    assert resp.status_code == 200
    body = resp.json()
    assert body["policy"] == "rule_based"
    assert body["action"] in ("raise", "lower", "hold")
    assert body["n_events_considered"] == 5


def test_agent_decide_tabular_q_with_history():
    for i in range(5):
        client.post("/events", json={
            "child_id": "agent_c3", "level_id": "aa_rocket", "attempt_number": i,
            "score": 0.3, "is_valid_attempt": True, "threshold_at_time": 0.5,
        })
    resp = client.get("/agent/decide/agent_c3/aa_rocket?policy=tabular_q")
    assert resp.status_code == 200
    body = resp.json()
    assert body["policy"] == "tabular_q"
    assert body["action"] in ("raise", "lower", "hold")


def test_agent_decide_unknown_policy_rejected():
    resp = client.get("/agent/decide/agent_c4/aa_rocket?policy=not_a_real_policy")
    assert resp.status_code == 422  # FastAPI's own enum validation on the Literal


def test_tabular_q_online_update_after_decide_then_event(tmp_path, monkeypatch):
    """decide() alone must NOT write anything — only a *following* event
    should trigger the online Bellman update."""
    import agent.child_q_store as child_q_store
    monkeypatch.setattr(child_q_store, "Q_TABLES_DIR", tmp_path)

    child_id = "agent_online_c1"
    level_id = "aa_rocket"

    for i in range(3):
        client.post("/events", json={
            "child_id": child_id, "level_id": level_id, "attempt_number": i,
            "score": 0.9, "is_valid_attempt": True, "threshold_at_time": 0.5,
        })

    decide_resp = client.get(f"/agent/decide/{child_id}/{level_id}?policy=tabular_q")
    assert decide_resp.status_code == 200

    q_table_path = tmp_path / f"{child_id}.json"
    assert not q_table_path.exists()  # decide() only reads — no update yet

    event_resp = client.post("/events", json={
        "child_id": child_id, "level_id": level_id, "attempt_number": 99,
        "score": 0.9, "is_valid_attempt": True, "threshold_at_time": 0.5,
    })
    assert event_resp.status_code == 200

    assert q_table_path.exists()  # this event completed the transition and wrote it


def test_event_without_prior_decide_does_not_crash(tmp_path, monkeypatch):
    """Events logged with no preceding decide() call (e.g. Village Builder
    today) must be a clean no-op for the online-update path, not an error."""
    import agent.child_q_store as child_q_store
    monkeypatch.setattr(child_q_store, "Q_TABLES_DIR", tmp_path)

    resp = client.post("/events", json={
        "child_id": "agent_online_c2", "level_id": "word_village", "attempt_number": 1,
        "score": 0.8, "is_valid_attempt": True,
    })
    assert resp.status_code == 200
    assert not (tmp_path / "agent_online_c2.json").exists()
