"""
Rung 4 of the baseline ladder: deep policy via PPO.

Two variants:
  --recurrent off (default): standard PPO, MlpPolicy — sees only the current
      observation each step, no memory of history.
  --recurrent on: RecurrentPPO (sb3-contrib), MlpLstmPolicy — an LSTM encoder
      builds a belief state across the episode's history, which is the actual
      point of framing this as a POMDP (see project doc Section 3.5). This is
      the version worth reporting as "the deep policy" in the write-up.

Default timestep counts here are smoke-test sized (fast enough to run and
confirm nothing's broken), not enough to reach good performance — see the
--timesteps flag to scale up for a real training run.

Usage:
    python -m agent.train_ppo                      # standard PPO, smoke test
    python -m agent.train_ppo --recurrent           # recurrent PPO, smoke test
    python -m agent.train_ppo --timesteps 300000    # a real run
"""

import argparse
import os

from agent.env import DifficultyEnv


def train_standard_ppo(timesteps: int, save_path: str, calibrated_ranges=None):
    from stable_baselines3 import PPO
    from stable_baselines3.common.env_util import make_vec_env

    vec_env = make_vec_env(lambda: DifficultyEnv(calibrated_ranges=calibrated_ranges), n_envs=4)
    model = PPO("MlpPolicy", vec_env, verbose=1, n_steps=256, batch_size=64)
    model.learn(total_timesteps=timesteps)
    model.save(save_path)
    print(f"Saved standard PPO model to {save_path}")
    return model


def train_recurrent_ppo(timesteps: int, save_path: str, calibrated_ranges=None):
    from sb3_contrib import RecurrentPPO
    from stable_baselines3.common.env_util import make_vec_env

    vec_env = make_vec_env(lambda: DifficultyEnv(calibrated_ranges=calibrated_ranges), n_envs=4)
    model = RecurrentPPO("MlpLstmPolicy", vec_env, verbose=1, n_steps=256, batch_size=64)
    model.learn(total_timesteps=timesteps)
    model.save(save_path)
    print(f"Saved recurrent PPO model to {save_path}")
    return model


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--recurrent", action="store_true", help="Train RecurrentPPO (LSTM) instead of standard PPO")
    parser.add_argument("--timesteps", type=int, default=8000, help="Total training timesteps (smoke-test default)")
    parser.add_argument("--out", type=str, default=None, help="Output path for the saved model")
    args = parser.parse_args()

    os.makedirs("agent/models", exist_ok=True)
    if args.recurrent:
        out = args.out or "agent/models/recurrent_ppo_difficulty"
        train_recurrent_ppo(args.timesteps, out)
    else:
        out = args.out or "agent/models/ppo_difficulty"
        train_standard_ppo(args.timesteps, out)
