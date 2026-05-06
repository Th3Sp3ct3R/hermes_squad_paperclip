---
name: pi-autoresearch
description: Autonomous experiment loop for pi — run, measure, keep or discard
---

pi-autoresearch is a skill for pi that enables autonomous optimization loops. It allows users to define an optimization target, run experiments, and automatically keep or discard changes based on the results.

### Overview

pi-autoresearch is designed to work with pi, an AI coding agent that runs in your terminal. It provides a domain-agnostic infrastructure for running autonomous optimization loops, allowing users to define their own optimization targets and experiments.

### Key Commands and APIs

* `/autoresearch <text>`: Enter autoresearch mode. If `autoresearch.md` exists, resumes the loop with `<text>` as context. Otherwise, sets up a new session.
* `/autoresearch off`: Leave autoresearch mode. Stops auto-resume and clears runtime state but keeps `autoresearch.jsonl` intact.
* `/autoresearch clear`: Delete `autoresearch.jsonl`, reset all state, and turn autoresearch mode off. Use this for a clean start.
* `/autoresearch export`: Open a live dashboard in your browser. Auto-updates as experiments run.

### Constraints

* Requires pi and a compatible coding agent
* Needs a defined optimization target and experiment setup

### Pointers to Important Paths

* `autoresearch.md`: Session document — objective, metrics, files in scope, what's been tried
* `autoresearch.sh`: Benchmark script — pre-checks, runs the workload, outputs `METRIC name=number` lines
* `autoresearch.jsonl`: Append-only log of every run (metric, status, commit, description)
