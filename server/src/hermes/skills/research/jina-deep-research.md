---
name: DeepResearch
description: Deeply investigate a query by searching, reading webpages, and reasoning until an answer is found or the token budget is exceeded.
---
# Overview
DeepResearch is a skill that enables agents to deeply investigate a query by iteratively searching, reading webpages, and reasoning until an answer is found or the token budget is exceeded. This skill is useful for finding concise answers from deep search.

# Key Commands or APIs
* `npm run dev $QUERY` to start the DeepResearch process
* `https://deepsearch.jina.ai/v1/chat/completions` for the official DeepSearch API

# Constraints
* Token budget limits the number of iterations
* Requires a Jina API key with 1M free tokens for new API key

# Pointers to Important Paths
* `README.md` for installation, usage, and API documentation
* `src/agent.ts` for the main agent code
* `src/server.ts` for the server code
