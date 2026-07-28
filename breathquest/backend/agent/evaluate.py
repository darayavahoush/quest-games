"""
Runs the full baseline ladder (project doc Section 3.5) against the same
DifficultyEnv and reports mean/std episode reward for each — this is the
actual comparison table for your report's evaluation section, not just a
description of what the ladder would show.

Usage:
    python -m agent.evaluate
    python -m agent.evaluate --train-episodes 500 --eval-episodes 100
"""

import argparse
import numpy as np

from agent.env import DifficultyEnv
from agent.baselines import RuleBasedAgent, EpsilonGreedyBanditAgent, TabularQAgent


def run_episode_tabular(env, agent, is_q_learning=False, greedy=False):
    obs, _ = env.reset()
    total_reward = 0.0
    old_epsilon = getattr(agent, "epsilon", None)
    if greedy and old_epsilon is not None:
        agent.epsilon = 0.0
    done = False
    while not done:
        action = agent.act(obs)
        next_obs, reward, terminated, truncated, _ = env.step(action)
        done = terminated or truncated
        if hasattr(agent, "update"):
            if is_q_learning:
                agent.update(obs, action, reward, next_obs, done)
            elif not greedy:
                agent.update(obs, action, reward)
        obs = next_obs
        total_reward += reward
    if greedy and old_epsilon is not None:
        agent.epsilon = old_epsilon
    return total_reward


def run_episode_rule_based(env, agent):
    obs, _ = env.reset()
    total_reward = 0.0
    done = False
    while not done:
        action = agent.act(obs)
        obs, reward, terminated, truncated, _ = env.step(action)
        done = terminated or truncated
        total_reward += reward
    return total_reward


def run_episode_sb3(env, model, recurrent=False):
    obs, _ = env.reset()
    total_reward = 0.0
    done = False
    lstm_states = None
    episode_start = np.array([True])
    while not done:
        if recurrent:
            action, lstm_states = model.predict(obs, state=lstm_states, episode_start=episode_start, deterministic=True)
            episode_start = np.array([False])
        else:
            action, _ = model.predict(obs, deterministic=True)
        obs, reward, terminated, truncated, _ = env.step(int(action))
        done = terminated or truncated
        total_reward += reward
    return total_reward


def summarize(name, rewards):
    print(f"{name:28s}  mean={np.mean(rewards):7.2f}  std={np.std(rewards):6.2f}  n={len(rewards)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--train-episodes", type=int, default=300)
    parser.add_argument("--eval-episodes", type=int, default=100)
    parser.add_argument("--ppo-path", type=str, default="agent/models/ppo_difficulty.zip")
    parser.add_argument("--recurrent-ppo-path", type=str, default="agent/models/recurrent_ppo_difficulty.zip")
    args = parser.parse_args()

    env = DifficultyEnv()

    print(f"\n=== Baseline ladder comparison ({args.eval_episodes} eval episodes each) ===\n")

    # Rung 1: rule-based, no training needed
    rule_agent = RuleBasedAgent()
    rule_rewards = [run_episode_rule_based(env, rule_agent) for _ in range(args.eval_episodes)]
    summarize("1. Rule-based", rule_rewards)

    # Rung 2: contextual bandit, train then eval greedy
    bandit = EpsilonGreedyBanditAgent()
    for _ in range(args.train_episodes):
        run_episode_tabular(env, bandit, is_q_learning=False)
    bandit_rewards = [run_episode_tabular(env, bandit, is_q_learning=False, greedy=True) for _ in range(args.eval_episodes)]
    summarize("2. Contextual bandit", bandit_rewards)

    # Rung 3: tabular Q-learning, train then eval greedy
    q_agent = TabularQAgent()
    for _ in range(args.train_episodes):
        run_episode_tabular(env, q_agent, is_q_learning=True)
    q_rewards = [run_episode_tabular(env, q_agent, is_q_learning=True, greedy=True) for _ in range(args.eval_episodes)]
    summarize("3. Tabular Q-learning", q_rewards)

    # Rung 4: PPO (if a trained model exists)
    try:
        from stable_baselines3 import PPO
        ppo_model = PPO.load(args.ppo_path)
        ppo_rewards = [run_episode_sb3(env, ppo_model) for _ in range(args.eval_episodes)]
        summarize("4a. PPO", ppo_rewards)
    except FileNotFoundError:
        print(f"4a. PPO                       skipped, no model at {args.ppo_path} — run train_ppo.py first")

    # Rung 4b: Recurrent PPO (if a trained model exists)
    try:
        from sb3_contrib import RecurrentPPO
        rppo_model = RecurrentPPO.load(args.recurrent_ppo_path)
        rppo_rewards = [run_episode_sb3(env, rppo_model, recurrent=True) for _ in range(args.eval_episodes)]
        summarize("4b. Recurrent PPO", rppo_rewards)
    except FileNotFoundError:
        print(f"4b. Recurrent PPO             skipped, no model at {args.recurrent_ppo_path} — run train_ppo.py --recurrent first")

    print()
