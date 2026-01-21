# Research Summary

**Project:** Sidekick for Max - TypeScript SDK Migration
**Domain:** VS Code AI Code Completion Extension
**Researched:** 2026-01-20
**Confidence:** HIGH

## Executive Summary

Sidekick for Max is migrating from a Python FastAPI server architecture to a pure TypeScript VS Code extension with embedded Claude SDK. The research confirms this is the right direction: eliminating the server removes deployment friction (users currently must run two processes) and reduces latency (no HTTP roundtrip). The VS Code extension ecosystem is mature, with well-documented patterns for inline completions, and the Anthropic TypeScript SDK is production-ready.

The recommended approach is to use `@anthropic-ai/sdk` (the standard Messages API) rather than the Agent SDK. While the Agent SDK enables Max subscription usage via CLI, it adds subprocess complexity and timeout risks. For the MVP, direct API key authentication is simpler and more reliable. Max subscription support via Agent SDK can be added as a configuration option later.

Key risks center on VS Code extension host constraints: blocking the main thread causes "extension host unresponsive" dialogs, and improper event listener management causes memory leaks. These are well-documented pitfalls with established solutions. The architecture research provides clear component boundaries and data flow that avoid these issues.

## Stack

**Core recommendation:** TypeScript 5.4+ with esbuild bundling and @anthropic-ai/sdk for Claude integration.

| Technology | Purpose | Rationale |
|------------|---------|-----------|
| TypeScript 5.4+ | Extension development | Type safety, matches existing codebase |
| @anthropic-ai/sdk | Claude API access | Official SDK, direct control, no subprocess overhead |
| esbuild | Bundling | 10-100x faster than webpack, official VS Code recommendation |
| vitest | Testing | Already in project, faster than Mocha |

**SDK choice decision:** Use `@anthropic-ai/sdk` (not Agent SDK) for initial implementation. The Agent SDK requires Claude Code CLI installed, adds subprocess management complexity, and has known 1000ms timeout issues. The standard SDK provides direct API access with full control over error handling.

**Deferred:** @anthropic-ai/claude-agent-sdk for Max subscription support can be added as an alternative auth mode once the core architecture is stable.

## Features

### Table Stakes (must have)
- Inline ghost text completions (implemented)
- Tab to accept (implemented)
- Multi-line completions (implemented)
- Debouncing (implemented)
- Request cancellation (implemented)
- **Partial accept (word-by-word)** - NOT implemented, HIGH priority
- **Status bar with connection/loading state** - Partial, needs enhancement

### Differentiators (should have)
- Code transforms with instructions (implemented - unique feature)
- Zero additional cost via Max subscription (core value prop)
- No external server required (this migration delivers this)
- Privacy/local-first architecture

### Anti-Features (do not build)
- Built-in chat panel (duplicates Claude Code CLI)
- Agent/autonomous mode (scope creep)
- Codebase indexing (infrastructure burden)
- Telemetry/analytics (privacy-focused users)

**Positioning:** "Use your Claude Max tokens for fast inline completions. No extra subscription. No chat (use Claude Code CLI for that)."

## Architecture

**Target structure:** Single VS Code extension with embedded services.

```
sidekick-vscode/
  src/
    extension.ts              # Entry point, lifecycle
    providers/
      InlineCompletionProvider.ts   # VS Code completion interface
    services/
      ClaudeService.ts        # SDK wrapper, API calls
      CompletionService.ts    # Completion orchestration
      TransformService.ts     # Transform orchestration
      CacheService.ts         # LRU cache
      RateLimiterService.ts   # Rate limiting
    utils/
      prompts.ts, cleaners.ts, config.ts, logger.ts
```

**Component responsibilities:**
1. **ClaudeService** - Singleton Anthropic client, error handling, model mapping
2. **CompletionService** - Prompt building, cache checking, response cleaning
3. **InlineCompletionProvider** - VS Code API integration, debouncing, cancellation

**Data flow:** User types -> VS Code triggers provider -> Debounce -> Check cache -> Build prompt -> Call ClaudeService -> Clean response -> Return InlineCompletionItem

## Pitfalls

### Critical (causes rewrites/crashes)

1. **Blocking extension host** - All Claude API calls MUST be async. Check cancellation token after every await. Single-threaded extension host freezes all extensions if blocked.

2. **CLI timeout errors (if using Agent SDK)** - 1000ms internal timeout causes frequent crashes. Mitigation: use standard SDK, or implement retry logic with exponential backoff.

3. **Memory leaks from event listeners** - Use VS Code's Disposable pattern. Push all subscriptions to `context.subscriptions`. Use DisposableStore for class-based handlers.

4. **Cancellation token misuse** - Check `token.isCancellationRequested` AFTER every await, not just at start. JavaScript single-threading means token only updates during await.

### Moderate (delays/degraded UX)

5. **Native module bundling** - Test packaged .vsix before publishing. Mark native modules as external in esbuild if needed.

6. **Ghost text flickering** - Implement position-aware caching. Don't re-trigger if cache valid for current position.

7. **Deactivation timeout** - VS Code only waits ~4 seconds for shutdown. Keep cleanup fast, use SIGTERM for subprocesses.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| SDK | @anthropic-ai/sdk (not Agent SDK) | Simpler, no subprocess, direct control |
| Auth | API key first, Max subscription later | Reduce MVP complexity |
| Bundler | esbuild | Official recommendation, fast |
| Streaming | No (batch responses) | Cleaner UX for short completions |
| Chat | None | Use Claude Code CLI |

## Open Questions

1. **Partial accept verification** - Need to verify VS Code's built-in `Ctrl+Right` partial accept works with our InlineCompletionItems. Should "just work" but needs testing.

2. **Cursor IDE compatibility** - Once TypeScript-only, test in Cursor. May need OpenVSX publishing.

3. **Max subscription via Agent SDK** - Deferred, but viable path exists. Test Agent SDK reliability before committing.

4. **Token counting** - Can we surface usage statistics? Useful for Max subscription awareness but not critical for MVP.

## Implications for Roadmap

### Phase 1: Core Infrastructure
**Rationale:** Foundation must be solid before building features on top.
**Delivers:** Types, utilities, cache, rate limiter - all pure TypeScript with no external deps.
**Addresses:** Request/response interfaces, configuration reading, logging.
**Avoids:** Memory leaks (establish Disposable patterns early).

### Phase 2: Claude Integration
**Rationale:** API connectivity is prerequisite for all features.
**Delivers:** ClaudeService with working API calls, error handling, model mapping.
**Uses:** @anthropic-ai/sdk.
**Avoids:** Timeout errors (implement proper error handling from start).

### Phase 3: Completion Provider
**Rationale:** Core feature - inline completions using new service layer.
**Delivers:** Working inline completions without Python server.
**Implements:** InlineCompletionProvider + CompletionService integration.
**Avoids:** Extension host blocking (async patterns), cancellation token issues.

### Phase 4: Transform Feature
**Rationale:** Secondary feature, can use same ClaudeService.
**Delivers:** Code transform functionality migrated to TypeScript.
**Addresses:** Transform differentiator feature.

### Phase 5: Polish and Distribution
**Rationale:** Only after core features work.
**Delivers:** Status bar enhancement, Cursor compatibility, packaging.
**Avoids:** Bundling issues (test packaged .vsix), activation over-triggering.

### Research Flags

**Needs deeper research during planning:**
- Phase 5 (Cursor compatibility) - may have subtle API differences

**Standard patterns (skip research):**
- Phase 1-4 - well-documented VS Code APIs and Anthropic SDK

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Official SDKs, verified documentation |
| Features | HIGH | Competitive analysis against Copilot, Codeium, Cursor |
| Architecture | HIGH | Based on existing codebase analysis + VS Code best practices |
| Pitfalls | HIGH | Verified with GitHub issues and official docs |

**Overall confidence:** HIGH

### Gaps to Address

- **Max subscription support:** Deferred to post-MVP. Path exists via Agent SDK but adds complexity.
- **Cursor compatibility:** Needs real-world testing once TypeScript-only.
- **Partial accept:** Assumed to work via VS Code native, needs verification.

## Sources

### Primary (HIGH confidence)
- [Anthropic TypeScript SDK](https://github.com/anthropics/anthropic-sdk-typescript)
- [VS Code Extension API](https://code.visualstudio.com/api/references/vscode-api)
- [VS Code Bundling Guide](https://code.visualstudio.com/api/working-with-extensions/bundling-extension)
- [Claude Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview)

### Secondary (MEDIUM confidence)
- [GitHub Copilot Documentation](https://code.visualstudio.com/docs/copilot/overview)
- [Cursor Codebase Indexing](https://docs.cursor.com/context/codebase-indexing)
- GitHub Issues: claude-code #2489 (timeouts), vscode #208152 (ghost text flickering)

---
*Research completed: 2026-01-20*
*Ready for roadmap: yes*
