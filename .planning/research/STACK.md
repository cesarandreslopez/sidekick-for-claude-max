# Stack Research: Sidekick for Max TypeScript SDK Migration

**Project:** Sidekick for Max - VS Code extension for Claude-powered inline completions
**Researched:** 2026-01-20
**Target:** Replace Python FastAPI server with TypeScript SDK running directly in VS Code extension

## Executive Summary

The migration from Python server to TypeScript-only has **two viable approaches**, each with different tradeoffs:

1. **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`) - Uses Claude Code CLI as runtime, can leverage Max subscription
2. **Anthropic Client SDK** (`@anthropic-ai/sdk`) - Direct API access, requires API key and separate billing

**Recommendation:** Use Claude Agent SDK for Max subscription users (the project's core value proposition), with fallback to Client SDK for API key users.

---

## Recommended Stack

### Core Framework

| Technology | Version | Purpose | Confidence |
|------------|---------|---------|------------|
| TypeScript | ^5.4.0 | Type-safe extension development | HIGH |
| VS Code Extension API | ^1.85.0 (min) | Extension host runtime | HIGH |
| Node.js | 18+ | Extension runtime (via VS Code) | HIGH |

### Claude SDK Options

| Technology | Version | Purpose | Confidence |
|------------|---------|---------|------------|
| @anthropic-ai/claude-agent-sdk | latest | Max subscription access via Claude Code CLI | HIGH |
| @anthropic-ai/sdk | ^0.61+ | Direct API access for API key users | HIGH |

### Build & Development

| Technology | Version | Purpose | Confidence |
|------------|---------|---------|------------|
| esbuild | ^0.20.0 | Fast bundling (official VS Code recommendation) | HIGH |
| vitest | ^2.0.0 | Unit testing (already in project) | HIGH |
| typescript-eslint | ^8.0.0 | Linting (already in project) | HIGH |

### Dependencies Summary

```json
{
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^1.0.0",
    "@anthropic-ai/sdk": "^0.61.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/vscode": "^1.85.0",
    "esbuild": "^0.20.0",
    "eslint": "^9.0.0",
    "typescript-eslint": "^8.0.0",
    "typescript": "^5.4.0",
    "vitest": "^2.0.0"
  }
}
```

---

## Rationale

### Why Claude Agent SDK for Max Subscription

The project's core value proposition is using Claude Max subscription tokens for inline completions without extra subscription costs. The Claude Agent SDK is the **only programmatic way** to access Max subscription credits.

**How it works:**
- Claude Agent SDK uses Claude Code CLI as its runtime
- Claude Code CLI authenticates via `claude login` with Max subscription credentials
- SDK spawns Claude Code processes to handle requests
- Usage counts against Max subscription limits (not billed separately)

**Source:** [Claude Code authentication documentation](https://support.claude.com/en/articles/11145838-using-claude-code-with-your-pro-or-max-plan)

**Critical constraint:** Per Anthropic documentation: "Unless previously approved, we do not allow third party developers to offer Claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK. Please use the API key authentication methods described in this document instead."

This means:
- Users must install Claude Code CLI themselves and authenticate
- Extension cannot directly implement OAuth to Claude Max
- Extension wraps the user's already-authenticated Claude Code CLI

**Source:** [Claude Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview)

### Why Also Include Anthropic Client SDK

For users who:
1. Don't have Claude Max subscription
2. Prefer direct API billing
3. Have ANTHROPIC_API_KEY environment variable set

The Client SDK provides:
- Direct API access without CLI dependency
- Streaming support via Server-Sent Events
- Full control over request/response handling
- No external process spawning required

**Source:** [Anthropic TypeScript SDK on GitHub](https://github.com/anthropics/anthropic-sdk-typescript)

### Why esbuild (Not tsc or webpack)

**Performance:** 10-100x faster than webpack/rollup
**Simplicity:** Minimal configuration required
**Official support:** VS Code documentation uses esbuild in examples

**Key configuration:**
- `platform: 'node'` for VS Code extension
- `format: 'cjs'` (CommonJS)
- External: `vscode` module (provided by runtime)
- Separate TypeScript type-checking with `tsc --noEmit`

**Source:** [VS Code Extension Bundling Guide](https://code.visualstudio.com/api/working-with-extensions/bundling-extension)

### Why Keep vitest (Not @vscode/test-electron)

Current project uses vitest for unit tests. This is appropriate because:
- Unit tests don't need VS Code APIs mocked
- vitest is faster and has better DX than Mocha
- For integration tests requiring VS Code APIs, use `@vscode/test-electron` separately

**Confidence:** HIGH - vitest is well-supported for TypeScript and already working in project

---

## SDK Architecture Comparison

### Option A: Claude Agent SDK Approach

```
User triggers completion
    |
    v
Extension calls query() from @anthropic-ai/claude-agent-sdk
    |
    v
SDK spawns `claude` CLI subprocess
    |
    v
Claude Code CLI uses Max subscription auth
    |
    v
Response streamed back to extension
```

**Pros:**
- Uses Max subscription tokens (project's core value)
- Built-in tools if needed for future features
- Same capabilities as Claude Code

**Cons:**
- Requires Claude Code CLI installed globally
- External process spawning complexity
- User must run `claude login` first

### Option B: Anthropic Client SDK Approach

```
User triggers completion
    |
    v
Extension calls client.messages.create()
    |
    v
Direct HTTPS to api.anthropic.com
    |
    v
Response streamed back to extension
```

**Pros:**
- No external dependencies
- Simpler architecture
- Works in more environments

**Cons:**
- Requires API key (separate billing)
- Cannot use Max subscription tokens

### Recommended: Hybrid Approach

Support both with user configuration:

```typescript
interface SidekickConfig {
  authMode: 'max-subscription' | 'api-key';
  apiKey?: string;  // Only if authMode === 'api-key'
}
```

Detection logic:
1. Check for `ANTHROPIC_API_KEY` env var -> use Client SDK
2. Check for Claude Code CLI installed -> use Agent SDK
3. Neither -> prompt user to set up one or the other

---

## Alternatives Considered

### Alternative 1: Keep Python Server

**What:** Keep current FastAPI server, connect from extension
**Why rejected:**
- Requires users to run separate process
- Adds complexity to installation/setup
- Project goal is TypeScript-only

### Alternative 2: Wrap Claude Code CLI Directly (Like Cline)

**What:** Use `child_process.spawn('claude', [...])` directly without SDK
**Why considered:** Cline does this successfully
**Why not primary:** Agent SDK provides cleaner abstraction, proper TypeScript types, message streaming

**Might revisit if:** Agent SDK has issues or limitations discovered during implementation

**Source:** [How Cline Uses Claude Max Subscription](https://cline.bot/blog/how-to-use-your-claude-max-subscription-in-cline)

### Alternative 3: OpenAI-Compatible Proxy

**What:** Use tools that expose Claude Max as OpenAI-compatible API
**Why rejected:**
- Additional moving parts
- Security concerns with third-party proxies
- Not officially supported by Anthropic

### Alternative 4: Bedrock/Vertex SDK

**What:** `@anthropic-ai/bedrock-sdk` or `@anthropic-ai/vertex-sdk`
**Why rejected:**
- Requires AWS/GCP accounts
- Not the project's target audience
- Extra infrastructure complexity

---

## Model Recommendations

Based on current extension configuration and Claude model lineup:

| Use Case | Recommended Model | Rationale |
|----------|-------------------|-----------|
| Inline completions (fast) | claude-3-5-haiku-20241022 | Fast, cheap, good for short completions |
| Inline completions (quality) | claude-sonnet-4-5-20250929 | Better quality, still reasonable latency |
| Code transforms | claude-sonnet-4-5-20250929 | Best balance of quality and speed |
| Complex transforms | claude-opus-4-5-20251101 | Highest quality for complex refactoring |

**Note:** Model availability depends on Max subscription tier:
- Max $100/month: Sonnet 4.5 with 5x Pro limits, generous Opus 4.5 access
- Max $200/month: Full Opus 4.5 access, 20x Pro limits

**Source:** [Claude AI Pricing](https://screenapp.io/blog/claude-ai-pricing)

---

## Installation Commands

### For Development

```bash
cd sidekick-vscode

# Install production dependencies
npm install @anthropic-ai/claude-agent-sdk @anthropic-ai/sdk

# Install dev dependencies (already present, verify versions)
npm install -D esbuild @types/node @types/vscode typescript vitest
```

### User Prerequisites

For Max subscription users:
```bash
# Install Claude Code CLI
curl -fsSL https://claude.ai/install.sh | bash

# Authenticate with Max subscription
claude login
```

For API key users:
```bash
# Set environment variable
export ANTHROPIC_API_KEY=sk-ant-...
```

---

## Confidence Levels

| Component | Confidence | Notes |
|-----------|------------|-------|
| TypeScript + esbuild | HIGH | Official VS Code recommendation, well-documented |
| @anthropic-ai/sdk | HIGH | Official SDK, actively maintained, verified on GitHub |
| @anthropic-ai/claude-agent-sdk | MEDIUM | New SDK (renamed from claude-code), less production usage data |
| Max subscription via Agent SDK | MEDIUM | Works for Cline, but SDK wrapper is newer approach |
| Hybrid auth approach | MEDIUM | Adds complexity, but maximizes user compatibility |

---

## Open Questions for Implementation

1. **Agent SDK in VS Code context:** Does spawning Claude Code CLI work reliably from VS Code extension host? Need to verify process management.

2. **Streaming performance:** How does Agent SDK streaming compare to direct Client SDK streaming for latency-sensitive inline completions?

3. **Error handling:** How to gracefully handle "Claude Code not installed" vs "Not logged in" vs "Rate limited" states?

4. **Token counting:** Can we surface usage statistics to users for Max subscription awareness?

---

## Sources

- [Anthropic TypeScript SDK - GitHub](https://github.com/anthropics/anthropic-sdk-typescript)
- [Claude Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview)
- [Claude Code with Pro/Max Plans](https://support.claude.com/en/articles/11145838-using-claude-code-with-your-pro-or-max-plan)
- [VS Code Extension Bundling](https://code.visualstudio.com/api/working-with-extensions/bundling-extension)
- [VS Code Inline Completion API](https://code.visualstudio.com/api/references/vscode-api)
- [How Cline Uses Claude Max](https://cline.bot/blog/how-to-use-your-claude-max-subscription-in-cline)
- [Building VS Code Extensions in 2026](https://abdulkadersafi.com/blog/building-vs-code-extensions-in-2026-the-complete-modern-guide)
