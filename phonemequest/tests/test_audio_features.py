"""
Sanity tests using synthetic audio — not a substitute for testing against
real child voice samples, but proves the pipeline runs end-to-end and the
extractors behave directionally correctly (loud > quiet, fricative-shaped
noise > silence, etc.) before you invest in real audio calibration.
"""

import numpy as np
import pytest

from audio_features import vowel_loudness, vowel_quality, syllable_rhythm, frication, aspiration_burst
from agent.env import DifficultyEnv
from agent.baselines import RuleBasedAgent, EpsilonGreedyBanditAgent, TabularQAgent

SR = 16000


def sine_wave(freq: float, duration_s: float, amplitude: float = 0.2, sr: int = SR) -> np.ndarray:
    t = np.linspace(0, duration_s, int(sr * duration_s), endpoint=False)
    return (amplitude * np.sin(2 * np.pi * freq * t)).astype(np.float32)


def white_noise(duration_s: float, amplitude: float = 0.2, sr: int = SR) -> np.ndarray:
    return (amplitude * np.random.uniform(-1, 1, int(sr * duration_s))).astype(np.float32)


def silence(duration_s: float, sr: int = SR) -> np.ndarray:
    return np.zeros(int(sr * duration_s), dtype=np.float32)


class TestVowelLoudness:
    def test_silence_is_invalid(self):
        result = vowel_loudness.extract(silence(0.5))
        assert result.is_valid_attempt is False
        assert result.score == 0.0

    def test_loud_scores_higher_than_quiet(self):
        quiet = vowel_loudness.extract(sine_wave(150, 0.5, amplitude=0.05))
        loud = vowel_loudness.extract(sine_wave(150, 0.5, amplitude=0.25))
        assert loud.score > quiet.score


class TestVowelQuality:
    def test_short_chunk_is_invalid(self):
        result = vowel_quality.extract(sine_wave(150, 0.05))
        assert result.is_valid_attempt is False

    def test_sustained_tone_runs_without_error(self):
        # Not asserting exact formant values here — a pure sine wave isn't a
        # real vowel — just confirming the pipeline runs on sustained audio.
        result = vowel_quality.extract(sine_wave(150, 0.5, amplitude=0.2), sample_rate=SR)
        assert 0.0 <= result.score <= 1.0


class TestSyllableRhythm:
    def test_short_chunk_is_invalid(self):
        result = syllable_rhythm.extract(silence(0.5))
        assert result.is_valid_attempt is False

    def test_runs_on_longer_chunk(self):
        result = syllable_rhythm.extract(white_noise(2.0, amplitude=0.15))
        assert 0.0 <= result.score <= 1.0


class TestFrication:
    def test_silence_is_invalid(self):
        result = frication.extract(silence(0.5))
        assert result.is_valid_attempt is False

    def test_noise_scores_higher_than_low_tone(self):
        # White noise has broadband high-frequency energy, closer to a
        # fricative signature than a low sine tone.
        low_tone = frication.extract(sine_wave(150, 0.5, amplitude=0.15))
        noisy = frication.extract(white_noise(0.5, amplitude=0.15))
        assert noisy.score > low_tone.score


class TestAspirationBurst:
    def test_quiet_is_invalid(self):
        result = aspiration_burst.extract(silence(0.3))
        assert result.is_valid_attempt is False

    def test_loud_burst_scores_higher_than_quiet_burst(self):
        quiet = aspiration_burst.extract(white_noise(0.2, amplitude=0.06))
        loud = aspiration_burst.extract(white_noise(0.2, amplitude=0.3))
        assert loud.score > quiet.score


class TestBaselineAgents:
    def test_rule_based_runs_full_episode(self):
        env = DifficultyEnv(episode_length=20)
        agent = RuleBasedAgent()
        obs, _ = env.reset()
        for _ in range(20):
            action = agent.act(obs)
            obs, reward, terminated, truncated, _ = env.step(action)
            if terminated or truncated:
                break
        assert True  # reaching here without exception is the point

    def test_bandit_updates_without_error(self):
        env = DifficultyEnv(episode_length=20)
        agent = EpsilonGreedyBanditAgent()
        obs, _ = env.reset()
        for _ in range(20):
            action = agent.act(obs)
            obs, reward, terminated, truncated, _ = env.step(action)
            agent.update(obs, action, reward)
            if terminated or truncated:
                break
        assert len(agent.q_table) > 0

    def test_tabular_q_updates_with_bellman_target(self):
        env = DifficultyEnv(episode_length=20)
        agent = TabularQAgent()
        obs, _ = env.reset()
        for _ in range(20):
            action = agent.act(obs)
            next_obs, reward, terminated, truncated, _ = env.step(action)
            done = terminated or truncated
            agent.update(obs, action, reward, next_obs, done)
            obs = next_obs
            if done:
                break
        assert len(agent.q_table) > 0


if __name__ == "__main__":
    import sys
    sys.exit(pytest.main([__file__, "-v"]))
