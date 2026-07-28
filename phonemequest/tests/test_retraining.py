"""
Tests for the real-data retraining pipeline (retraining/, agent/child_q_store.py).
Uses temp paths throughout — never touches the real chime_sessions.db or
saved Q-tables in agent/models/.
"""

import numpy as np
import pytest

from retraining import data_store
from retraining.scheduler import maybe_retrain_shared_policy
from simulator.simulator_calibration import calibrate_from_events, DEFAULT_RANGES, MIN_EVENTS_FOR_CALIBRATION
import agent.child_q_store as child_q_store
from agent.baselines import TabularQAgent


# ============================================================
# data_store
# ============================================================
class TestDataStore:
    def test_add_and_count_events(self, tmp_path):
        db_path = tmp_path / "test.db"
        data_store.add_event("child_1", "aa_rocket", 1, 0.8, True, db_path=db_path)
        data_store.add_event("child_1", "aa_rocket", 2, 0.6, True, db_path=db_path)
        data_store.add_event("child_2", "aa_rocket", 1, 0.4, True, db_path=db_path)

        assert data_store.count_events(db_path=db_path) == 3
        assert data_store.count_events(child_id="child_1", db_path=db_path) == 2
        assert data_store.count_events(child_id="child_2", db_path=db_path) == 1

    def test_get_events_since_id(self, tmp_path):
        db_path = tmp_path / "test.db"
        for i in range(5):
            data_store.add_event("child_1", "aa_rocket", i, 0.5, True, db_path=db_path)
        all_events = data_store.get_events(db_path=db_path)
        assert len(all_events) == 5
        since_first = data_store.get_events(since_id=all_events[0]["id"], db_path=db_path)
        assert len(since_first) == 4

    def test_checkpoint_roundtrip(self, tmp_path):
        db_path = tmp_path / "test.db"
        assert data_store.get_checkpoint("global", db_path=db_path) is None
        data_store.set_checkpoint("global", 42, db_path=db_path)
        checkpoint = data_store.get_checkpoint("global", db_path=db_path)
        assert checkpoint["event_count_at_checkpoint"] == 42
        # update should overwrite, not duplicate
        data_store.set_checkpoint("global", 100, db_path=db_path)
        checkpoint = data_store.get_checkpoint("global", db_path=db_path)
        assert checkpoint["event_count_at_checkpoint"] == 100


# ============================================================
# simulator_calibration
# ============================================================
class TestCalibration:
    def test_below_threshold_returns_defaults(self):
        events = [
            {"child_id": "c1", "attempt_number": i, "score": 0.5, "is_valid_attempt": True, "quit_flag": False}
            for i in range(MIN_EVENTS_FOR_CALIBRATION - 5)
        ]
        result = calibrate_from_events(events)
        assert result is DEFAULT_RANGES

    def test_high_performing_children_shift_skill_range_up(self):
        events = []
        for child_num in range(6):
            for i in range(10):
                events.append({
                    "child_id": f"c{child_num}", "attempt_number": i,
                    "score": 0.85, "is_valid_attempt": True, "quit_flag": False,
                })
        result = calibrate_from_events(events)
        assert result.n_events_used == len(events)
        # high real scores should pull the calibrated skill range up from the
        # original 0.2-0.6 default
        assert result.skill_level_min > 0.4

    def test_struggling_children_raise_frustration_range(self):
        events = []
        for child_num in range(6):
            for i in range(10):
                events.append({
                    "child_id": f"c{child_num}", "attempt_number": i,
                    "score": 0.2, "is_valid_attempt": True,
                    "quit_flag": (i % 2 == 0),  # frequent quitting
                })
        result = calibrate_from_events(events)
        assert result.frustration_sensitivity_max > 0.5


# ============================================================
# scheduler
# ============================================================
class TestScheduler:
    def test_below_threshold_does_not_retrain(self, tmp_path):
        db_path = tmp_path / "test.db"
        data_store.add_event("c1", "aa_rocket", 1, 0.5, True, db_path=db_path)
        result = maybe_retrain_shared_policy(db_path=db_path, force=False)
        assert result["retrained"] is False

    def test_force_retrain_runs_end_to_end(self, tmp_path):
        db_path = tmp_path / "test.db"
        for i in range(40):
            data_store.add_event("c1", "aa_rocket", i, 0.6, True, quit_flag=False, db_path=db_path)
        # tiny timestep count — this is a wiring smoke test, not a real training run.
        # models_dir points at tmp_path so this never touches real trained models.
        result = maybe_retrain_shared_policy(
            db_path=db_path, timesteps=200, force=True, models_dir=str(tmp_path / "models")
        )
        assert result["retrained"] is True
        assert result["n_events_used"] == 40
        checkpoint = data_store.get_checkpoint("global", db_path=db_path)
        assert checkpoint["event_count_at_checkpoint"] == 40


# ============================================================
# child_q_store
# ============================================================
class TestChildQStore:
    def test_save_and_load_roundtrip(self, tmp_path, monkeypatch):
        monkeypatch.setattr(child_q_store, "Q_TABLES_DIR", tmp_path / "q_tables")
        monkeypatch.setattr(child_q_store, "PRIOR_PATH", tmp_path / "q_prior.json")

        agent = TabularQAgent()
        agent.q_table[(1, 2, 3)] = [0.1, 0.5, 0.9]
        child_q_store.save_child_agent("child_42", agent)

        loaded = child_q_store.load_child_agent("child_42")
        assert loaded.q_table[(1, 2, 3)] == [0.1, 0.5, 0.9]

    def test_new_child_seeds_from_prior(self, tmp_path, monkeypatch):
        monkeypatch.setattr(child_q_store, "Q_TABLES_DIR", tmp_path / "q_tables")
        monkeypatch.setattr(child_q_store, "PRIOR_PATH", tmp_path / "q_prior.json")

        prior_agent = TabularQAgent()
        prior_agent.q_table[(2, 2, 2)] = [0.3, 0.3, 0.9]
        child_q_store.save_prior_from_agent(prior_agent)

        # a brand new child, never seen before, should start from the prior
        fresh_agent = child_q_store.load_child_agent("brand_new_child")
        assert fresh_agent.q_table[(2, 2, 2)] == [0.3, 0.3, 0.9]

    def test_new_child_with_no_prior_starts_empty(self, tmp_path, monkeypatch):
        monkeypatch.setattr(child_q_store, "Q_TABLES_DIR", tmp_path / "q_tables")
        monkeypatch.setattr(child_q_store, "PRIOR_PATH", tmp_path / "nonexistent_prior.json")

        fresh_agent = child_q_store.load_child_agent("some_child")
        assert fresh_agent.q_table == {}

    def test_online_update_persists(self, tmp_path, monkeypatch):
        monkeypatch.setattr(child_q_store, "Q_TABLES_DIR", tmp_path / "q_tables")
        monkeypatch.setattr(child_q_store, "PRIOR_PATH", tmp_path / "q_prior.json")

        obs = np.array([0.5, 0.5, 0.2], dtype=np.float32)
        next_obs = np.array([0.6, 0.5, 0.1], dtype=np.float32)
        child_q_store.update_child_agent_from_transition("child_7", obs, 1, 0.8, next_obs, False)

        reloaded = child_q_store.load_child_agent("child_7")
        assert len(reloaded.q_table) > 0
