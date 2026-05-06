---
name: Autoresearch
description: Autonomous pretraining research swarm
---

## Overview
Autoresearch is a project that enables autonomous pretraining research using a swarm of AI agents. The project utilizes a simplified single-GPU implementation of the nanochat repository and allows AI agents to experiment and modify the training code to achieve better results.

## Key Commands or APIs
The primary commands used in this project are:
- `uv run prepare.py`: Downloads data and trains a BPE tokenizer.
- `uv run train.py`: Runs a single training experiment.

## Constraints
The project has the following constraints:
- The training script runs for a fixed time budget of 5 minutes.
- The evaluation metric is val_bpb (validation bits per byte), which is a vocab-size-independent metric.
- The project uses a single NVIDIA GPU.

## Pointers to Important Paths
- `prepare.py`: Contains fixed constants, data preparation, and runtime utilities.
- `train.py`: The file that the AI agent modifies to experiment with different architectures and hyperparameters.
- `program.md`: Baseline instructions for the AI agent.
- `pyproject.toml`: Dependencies for the project.
