---
name: GEPA Optimization
description: Optimize any text parameter using LLM-based reflection and Pareto-efficient evolutionary search.
---
# Overview
GEPA (Genetic-Pareto) is a framework for optimizing any system with textual parameters against any evaluation metric. It uses LLMs to read full execution traces and diagnose failures, then proposes targeted fixes through iterative reflection, mutation, and Pareto-aware selection.

# Key Commands or APIs
* `gepa.optimize()`: Optimizes a system prompt for a given task.
* `gepa.optimize_anything()`: Optimizes any text artifact, not just prompts.
* `dspy.GEPA()`: Optimizes a DSPy program.

# Constraints
* Requires a Python environment with the necessary dependencies installed.
* Needs access to a LLM API for reflection and optimization.

# Pointers to Important Paths
* `src/gepa/core/adapter.py`: The GEPA adapter interface for connecting to different systems.
* `src/gepa/adapters/default_adapter/`: The default adapter for system prompt optimization.
* `docs/README.md`: The main documentation for GEPA.
* `examples/adrs/cloudcast/README.md`: An example of using GEPA for cloud scheduling strategy optimization.
