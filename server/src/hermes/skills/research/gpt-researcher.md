---
name: GPT Researcher
description: A deep research agent designed for both web and local research on any given task.
---

The GPT Researcher is a powerful tool for conducting in-depth research on a wide range of topics. It utilizes a combination of natural language processing and machine learning algorithms to generate detailed, factual, and unbiased research reports with citations.

### Overview

The GPT Researcher is designed to provide accurate and reliable information on any given topic. It uses a combination of web and local documents to gather information and generate reports that exceed 2,000 words. The researcher also includes features such as smart image scraping and filtering, AI-generated inline images, and the ability to export reports to various formats including PDF, Word, and Markdown.

### Key Commands or APIs

* `GPTResearcher(query="research topic")`: Initializes the researcher with a specific research topic.
* `conduct_research()`: Conducts research on the given topic and generates a report.
* `write_report()`: Writes the research report to a file.

### Constraints

* Requires an active internet connection for web-based research.
* Requires a valid OpenAI API key for access to the OpenAI GPT model.
* Requires a valid Tavily API key for access to the Tavily search engine.

### Pointers to Important Paths

* `requirements.txt`: Lists the dependencies required to run the GPT Researcher.
* `config.py`: Contains configuration options for the researcher, including API keys and search engine settings.
* `docs/`: Contains documentation and guides for using the GPT Researcher.
