---
name: AI Scientist-v2
description: Autonomous scientific research system for generating hypotheses, running experiments, analyzing data, and writing scientific manuscripts.
---

## Overview
The AI Scientist-v2 is a generalized end-to-end agentic system that utilizes Large Language Models (LLMs) to perform various tasks in the scientific research pipeline. This system is designed to work with different Machine Learning (ML) domains and employs a progressive agentic tree search guided by an experiment manager agent.

## Key Commands or APIs
- `perform_ideation_temp_free.py`: Script for generating potential research ideas based on a high-level topic description.
- `launch_scientist_bfts.py`: Script for running the main AI Scientist-v2 pipeline, including experiments via agentic tree search, analyzing results, and generating a paper draft.
- `OPENAI_API_KEY`, `GEMINI_API_KEY`, `S2_API_KEY`: Environment variables for setting API keys for different models and services.

## Constraints
- Requires a controlled sandbox environment (e.g., a Docker container) due to the execution of LLM-written code.
- Needs specific GPU and CUDA support for running PyTorch models.
- Limited by the capabilities and biases of the underlying LLMs and ML models.

## Pointers to Important Paths
- `ai_scientist/ideas/`: Directory for storing topic description Markdown files and generated idea JSON files.
- `ai_scientist/treesearch/`: Directory containing key components of the agentic tree search, including the agent manager and parallel agent scripts.
- `bfts_config.yaml`: Configuration file for the best-first tree search (BFTS) parameters.
