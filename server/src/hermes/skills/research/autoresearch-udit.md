---
name: Autoresearch
description: Turn Claude Code, OpenCode, or OpenAI Codex into a relentless improvement engine.
---

Autoresearch is a skill that helps you improve your codebase by autonomously running experiments, testing, and iterating on your code. It is based on Karpathy's autoresearch principles and can be used with Claude Code, OpenCode, or OpenAI Codex.

Key commands:

* `/autoresearch`: Run the autonomous iteration loop
* `/autoresearch:plan`: Interactive wizard for setting up autoresearch
* `/autoresearch:debug`: Autonomous bug-hunting loop
* `/autoresearch:fix`: Autonomous fix loop
* `/autoresearch:security`: Autonomous STRIDE + OWASP + red-team security audit
* `/autoresearch:ship`: Universal shipping workflow

Constraints:

* Must be used with Claude Code, OpenCode, or OpenAI Codex
* Requires a Git repository
* Requires a mechanical metric for verification

Pointers to important paths:

* `claude-plugin/commands/`: Slash command registrations
* `claude-plugin/skills/autoresearch/`: Skill definition and protocols
* `plugins/autoresearch/`: Codex plugin and wrapper CLI
* `guide/`: User-facing documentation and tutorials
