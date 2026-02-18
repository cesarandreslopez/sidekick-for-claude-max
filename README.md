<p align="center">
  <img src="images/icon-256.png" alt="Sidekick Agent Hub" width="128" height="128">
</p>

<h1 align="center">Sidekick Agent Hub</h1>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=CesarAndresLopez.sidekick-for-max"><img src="https://img.shields.io/visual-studio-marketplace/v/CesarAndresLopez.sidekick-for-max?label=VS%20Code%20Marketplace" alt="VS Code Marketplace"></a>
  <a href="https://open-vsx.org/extension/cesarandreslopez/sidekick-for-max"><img src="https://img.shields.io/open-vsx/v/cesarandreslopez/sidekick-for-max?label=Open%20VSX" alt="Open VSX"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://github.com/cesarandreslopez/sidekick-agent-hub/actions/workflows/ci.yml"><img src="https://github.com/cesarandreslopez/sidekick-agent-hub/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
</p>

<p align="center">
  AI coding assistant with real-time agent monitoring for VS Code.
</p>

<p align="center">
  <img src="assets/all_features.gif?v=4" alt="Sidekick Agent Hub demo" width="800">
</p>

AI coding agents are powerful but opaque — tokens burn silently, context fills up without warning, and everything is lost when a session ends. Sidekick gives you visibility into what your agent is doing, AI features that eliminate mechanical coding work, and session intelligence that preserves context across sessions. Works with your existing **Claude Max** subscription, **Claude API**, **OpenCode**, or **Codex CLI**.

## Provider Support

| Provider | Inference | Session Monitoring | Cost |
|----------|-----------|-------------------|------|
| **Claude Max** | Yes | Yes | Included in subscription |
| **Claude API** | Yes | — | Per-token billing |
| **OpenCode** | Yes | Yes | Depends on provider |
| **Codex CLI** | Yes | Yes | OpenAI API billing |

## Why Am I Building This?

AI coding agents are the most transformative tools I've used in my career. They can scaffold entire features, debug problems across files, and handle the mechanical parts of software engineering that used to eat hours of every day.

But they're also opaque. Tokens burn in the background with no visibility. Context fills up silently until your agent starts forgetting things. And when a session ends, everything it learned — your architecture, your conventions, the decisions you made together — is just gone. The next session starts from zero.

That bothers me. I want to see what my agent is doing. I want to review every tool call, understand where my tokens went, and carry context forward instead of losing it. Sidekick exists because I think the people using these agents deserve visibility into how they work — not just the output, but the process.

## Features

- **Inline Completions** — context-aware code suggestions that understand your project
- **Code Transforms** — select code, describe changes in natural language (`Ctrl+Shift+M`)
- **AI Commit Messages** — meaningful messages generated from your actual diff
- **Session Monitor** — see exactly where your tokens are going before you hit quota limits
- **Mind Map** — trace how your agent navigated the codebase during a session
- **Kanban Board** — track tasks and subagents at a glance during complex operations
- **Quick Ask** — inline chat for questions and code changes without switching context (`Ctrl+I`)
- **Code Review** — catch bugs and security concerns before they reach your team
- **PR Descriptions** — structured summaries from branch diff, ready to paste
- **Explain Code** — AI explanations calibrated to your experience level (`Ctrl+Shift+E`)
- **Error Analysis** — understand what went wrong, why, and how to fix it
- **Generate Docs** — JSDoc/docstrings based on implementation, not just signatures (`Ctrl+Shift+D`)
- **Session Handoff** — pick up where you left off instead of re-discovering everything
- **CLAUDE.md Suggestions** — learn from session patterns to improve agent effectiveness

## Quick Install

Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=CesarAndresLopez.sidekick-for-max) or [Open VSX](https://open-vsx.org/extension/cesarandreslopez/sidekick-for-max).

For manual installation, download the `.vsix` from [Releases](https://github.com/cesarandreslopez/sidekick-agent-hub/releases).

## Documentation

Full documentation is available at the [docs site](https://cesarandreslopez.github.io/sidekick-agent-hub/), including:

- [Getting Started](https://cesarandreslopez.github.io/sidekick-agent-hub/getting-started/installation/)
- [Provider Setup](https://cesarandreslopez.github.io/sidekick-agent-hub/getting-started/provider-setup/)
- [Feature Guide](https://cesarandreslopez.github.io/sidekick-agent-hub/features/inline-completions/)
- [Configuration Reference](https://cesarandreslopez.github.io/sidekick-agent-hub/configuration/settings/)
- [Architecture](https://cesarandreslopez.github.io/sidekick-agent-hub/architecture/overview/)

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions and guidelines.

## Community

If Sidekick is useful to you, a [star on GitHub](https://github.com/cesarandreslopez/sidekick-agent-hub) helps others find it.

Found a bug or have a feature idea? [Open an issue](https://github.com/cesarandreslopez/sidekick-agent-hub/issues) — all feedback is welcome.

## License

MIT
