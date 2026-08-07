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
from agent.child_q_store import save_prior_from_agent, PRIOR_PATH


def run_episode_tabular(env, agent, is_q_learning=False, greedy=False):
    obs, _ = env.reset()
    total_reward = 0.0
    components = {"alp_component": 0.0, "frustration_penalty": 0.0, "targeted_bonus": 0.0, "quit_penalty": 0.0}
    old_epsilon = getattr(agent, "epsilon", None)
    if greedy and old_epsilon is not None:
        agent.epsilon = 0.0
    done = False
    while not done:
        action = agent.act(obs)
        next_obs, reward, terminated, truncated, info = env.step(action)
        done = terminated or truncated
        if hasattr(agent, "update"):
            if is_q_learning:
                agent.update(obs, action, reward, next_obs, done)
            elif not greedy:
                agent.update(obs, action, reward)
        obs = next_obs
        total_reward += reward
        for k in components:
            components[k] += info.get(k, 0.0)
    if greedy and old_epsilon is not None:
        agent.epsilon = old_epsilon
    return total_reward, components


def run_episode_rule_based(env, agent):
    obs, _ = env.reset()
    total_reward = 0.0
    components = {"alp_component": 0.0, "frustration_penalty": 0.0, "targeted_bonus": 0.0, "quit_penalty": 0.0}
    done = False
    while not done:
        action = agent.act(obs)
        obs, reward, terminated, truncated, info = env.step(action)
        done = terminated or truncated
        total_reward += reward
        for k in components:
            components[k] += info.get(k, 0.0)
    return total_reward, components


def run_episode_sb3(env, model, recurrent=False):
    obs, _ = env.reset()
    total_reward = 0.0
    components = {"alp_component": 0.0, "frustration_penalty": 0.0, "targeted_bonus": 0.0, "quit_penalty": 0.0}
    done = False
    lstm_states = None
    episode_start = np.array([True])
    while not done:
        if recurrent:
            action, lstm_states = model.predict(obs, state=lstm_states, episode_start=episode_start, deterministic=True)
            episode_start = np.array([False])
        else:
            action, _ = model.predict(obs, deterministic=True)
        obs, reward, terminated, truncated, info = env.step(int(action))
        done = terminated or truncated
        total_reward += reward
        for k in components:
            components[k] += info.get(k, 0.0)
    return total_reward, components


def summarize(name, rewards, component_dicts=None):
    print(f"{name:28s}  mean={np.mean(rewards):7.2f}  std={np.std(rewards):6.2f}  n={len(rewards)}")
    if component_dicts:
        keys = component_dicts[0].keys()
        means = {k: np.mean([c[k] for c in component_dicts]) for k in keys}
        print(f"{'':28s}    alp={means['alp_component']:6.3f}  "
              f"frustration={means['frustration_penalty']:6.3f}  "
              f"targeted_bonus={means['targeted_bonus']:6.3f}  "
              f"quit={means['quit_penalty']:6.3f}")


def run_ladder_once(env, args, batch_idx):
    out = {}

    rule_agent = RuleBasedAgent()
    rule_rewards = [run_episode_rule_based(env, rule_agent)[0] for _ in range(args.eval_episodes)]
    out["1. Rule-based"] = float(np.mean(rule_rewards))

    bandit = EpsilonGreedyBanditAgent()
    for _ in range(args.train_episodes):
        run_episode_tabular(env, bandit, is_q_learning=False)
    bandit_rewards = [run_episode_tabular(env, bandit, is_q_learning=False, greedy=True)[0] for _ in range(args.eval_episodes)]
    out["2. Contextual bandit"] = float(np.mean(bandit_rewards))

    q_agent = TabularQAgent()
    for _ in range(args.train_episodes):
        run_episode_tabular(env, q_agent, is_q_learning=True)
    q_rewards = [run_episode_tabular(env, q_agent, is_q_learning=True, greedy=True)[0] for _ in range(args.eval_episodes)]
    out["3. Tabular Q-learning"] = float(np.mean(q_rewards))

    if batch_idx == args.batches - 1:
        save_prior_from_agent(q_agent)
        print("Saved trained tabular-Q agent as the shared cold-start prior -> " + str(PRIOR_PATH))

    try:
        from stable_baselines3 import PPO
        ppo_model = PPO.load(args.ppo_path)
        ppo_rewards = [run_episode_sb3(env, ppo_model)[0] for _ in range(args.eval_episodes)]
        out["4a. PPO"] = float(np.mean(ppo_rewards))
    except FileNotFoundError:
        if batch_idx == 0:
            print("4a. PPO skipped, no model at " + args.ppo_path)
    except ModuleNotFoundError:
        if batch_idx == 0:
            print("4a. PPO skipped, stable-baselines3 not installed")

    try:
        from sb3_contrib import RecurrentPPO
        rppo_model = RecurrentPPO.load(args.recurrent_ppo_path)
        rppo_rewards = [run_episode_sb3(env, rppo_model, recurrent=True)[0] for _ in range(args.eval_episodes)]
        out["4b. Recurrent PPO"] = float(np.mean(rppo_rewards))
    except FileNotFoundError:
        if batch_idx == 0:
            print("4b. Recurrent PPO skipped, no model at " + args.recurrent_ppo_path)
    except ModuleNotFoundError:
        if batch_idx == 0:
            print("4b. Recurrent PPO skipped, sb3-contrib not installed")

    return out


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--train-episodes", type=int, default=300)
    parser.add_argument("--eval-episodes", type=int, default=100)
    parser.add_argument("--batches", type=int, default=1)
    parser.add_argument("--ppo-path", type=str, default="agent/models/ppo_difficulty.zip")
    parser.add_argument("--recurrent-ppo-path", type=str, default="agent/models/recurrent_ppo_difficulty.zip")
    args = parser.parse_args()

    env = DifficultyEnv()

    print("=== Baseline ladder comparison (" + str(args.batches) + " batch(es) x " + str(args.eval_episodes) + " eval episodes) ===")

    per_rung_batch_means = {}
    for batch_idx in range(args.batches):
        batch_result = run_ladder_once(env, args, batch_idx)
        for rung, mean_reward in batch_result.items():
            per_rung_batch_means.setdefault(rung, []).append(mean_reward)
        if args.batches > 1:
            line = "  batch " + str(batch_idx + 1) + "/" + str(args.batches) + " done: "
            line += ", ".join(k + "=" + format(v, ".2f") for k, v in batch_result.items())
            print(line)

    print()
    if args.batches == 1:
        for rung, means in per_rung_batch_means.items():
            print(format(rung, "28s") + "  mean=" + format(means[0], "7.2f"))
    else:
        print("=== Across " + str(args.batches) + " batches (mean +/- std of each batch mean) ===")
        for rung, means in per_rung_batch_means.items():
            arr = np.array(means)
            per_batch_str = ", ".join(format(m, ".1f") for m in means)
            print(format(rung, "28s") + "  mean=" + format(arr.mean(), "7.2f") + "  std=" + format(arr.std(), "6.2f") + "  (" + per_batch_str + ")")

    print()
