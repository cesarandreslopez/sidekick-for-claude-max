# Sidekick for Max

## What This Is

A VS Code extension that provides Copilot-style inline code completions and transforms using your Claude Max subscription. Instead of paying for GitHub Copilot, use the tokens you're already paying for. Install the extension, start coding — no server to run, no extra accounts.

## Core Value

Use your existing Claude Max tokens for fast inline completions without paying for another subscription.

## Current State

**Version:** v1.0 (shipped 2026-01-21)
**Architecture:** Pure TypeScript extension using Anthropic SDK directly
**LOC:** 2,044 TypeScript
**Distribution:** VS Code Marketplace + VSIX for forks

## Requirements

### Validated

- ✓ Extension runs without Python server dependency — v1.0
- ✓ Dual authentication (Max subscription + API key) — v1.0
- ✓ Inline code completions with ghost text — v1.0
- ✓ Tab to accept, Ctrl+Right for word-by-word — v1.0
- ✓ Debouncing and caching for efficiency — v1.0
- ✓ Code transforms via selection + command — v1.0
- ✓ Model selection (Haiku/Sonnet/Opus) — v1.0
- ✓ Status bar with connection state and loading — v1.0
- ✓ Cursor IDE compatibility — v1.0

### Active

(None — define in next milestone)

### Out of Scope

- Built-in chat panel — Duplicates Claude Code CLI
- Agent/autonomous mode — Scope creep, not aligned with "quick completions" value prop
- Codebase indexing — Infrastructure burden, not needed for completions
- Telemetry/analytics — Privacy-focused users, adds complexity
- JetBrains/Vim support — Focus on VS Code ecosystem (includes Cursor)
- Direct OAuth to Claude Max — Anthropic doesn't allow third-party OAuth

## Context

Shipped v1.0 with complete SDK migration. Python server eliminated. Extension uses @anthropic-ai/claude-agent-sdk for Max subscription auth and @anthropic-ai/sdk for API key auth.

**Tech stack:** TypeScript, esbuild, VS Code Extension API, Anthropic SDKs

**Potential v2 features:**
- Streaming completions for longer responses
- Token usage statistics display
- Per-workspace model configuration
- OpenVSX marketplace listing

## Constraints

- **Tech stack**: TypeScript only
- **Authentication**: Claude Code CLI auth (Max subscription) or API key
- **Distribution**: VS Code Marketplace, VSIX for forks
- **Compatibility**: VS Code ^1.85.0, Node.js 20+

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use TypeScript SDK instead of Python | Eliminates server, simplifies setup | ✓ Good |
| Delete Python server after migration | Clean codebase, no maintenance burden | ✓ Good |
| Support Cursor IDE | VS Code-based, low effort | ✓ Good |
| Dual auth modes (Max + API key) | Flexibility for users without Max | ✓ Good |
| esbuild for bundling | Fast builds, tree-shaking | ✓ Good |
| Native Map for LRU cache | Insertion order preserved, O(1) ops | ✓ Good |
| Max subscription as default | Leverages existing Claude Max subscription | ✓ Good |
| StatusBar starts connected | Extension enabled by default | ✓ Good |

---
*Last updated: 2026-01-21 after v1.0 milestone*
