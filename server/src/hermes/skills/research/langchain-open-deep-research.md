---
name: Open Deep Research
description: A configurable, fully open-source deep research agent for automated research across multiple model providers, search tools, and MCP servers.
---

Open Deep Research is a simple, yet powerful tool for conducting deep research. It works by utilizing a combination of natural language processing (NLP) and machine learning algorithms to analyze and summarize large amounts of data.

### Overview
The Open Deep Research agent is designed to be highly customizable, allowing users to select from a variety of model providers, search tools, and MCP servers. This flexibility enables researchers to tailor the agent to their specific needs and preferences.

### Key Commands or APIs
The agent uses several key commands and APIs to function, including:

* `init_chat_model()`: Initializes the chat model for research
* `get_all_tools()`: Retrieves a list of available tools for research
* `researcher()`: Conducts focused research on a specific topic
* `supervisor()`: Manages the research workflow and coordinates tool execution

### Constraints
The agent has several constraints that must be considered when using it, including:

* Token limits: The agent has limits on the number of tokens that can be processed, which can impact performance
* Model selection: The choice of model provider and search tool can significantly impact the quality of research results
* MCP compatibility: The agent requires compatible MCP servers to function properly

### Pointers to Important Paths
The following paths are important for using the Open Deep Research agent:

* `src/open_deep_research/deep_researcher.py`: The main implementation of the agent
* `src/open_deep_research/configuration.py`: Configuration management and settings
* `tests/run_evaluate.py`: Evaluation script for testing the agent's performance
