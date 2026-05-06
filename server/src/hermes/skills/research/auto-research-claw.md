---
name: AutoResearchClaw
description: Autonomous research pipeline for generating academic papers
body: |
  AutoResearchClaw is a 23-stage research pipeline that turns a single research idea into a conference-ready paper.
  It supports hardware-aware sandbox experiments, statistical analysis, multi-agent peer review, and conference-ready LaTeX.
  The pipeline can be run fully autonomous or with human-in-the-loop collaboration.
  It includes features such as:
  * Real literature from OpenAlex, Semantic Scholar, and arXiv
  * Hardware-aware sandbox experiments (GPU/MPS/CPU auto-detected)
  * Statistical analysis and multi-agent peer review
  * Conference-ready LaTeX targeting NeurIPS/ICML/ICLR
  * No hallucinated references
  * Self-healing experiments and pivoting hypotheses
  * Human-in-the-loop collaboration for steering the research
constraints:
  * Requires Python 3.11+
  * Requires Docker and LaTeX for experiment execution and paper generation
paths:
  * `config.arc.yaml`: configuration file for the pipeline
  * `researchclaw/`: pipeline implementation directory
