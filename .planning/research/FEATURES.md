# Features Research: VS Code AI Completion Extensions

**Domain:** VS Code AI code completion extensions
**Researched:** 2026-01-20
**Overall Confidence:** HIGH (verified against multiple authoritative sources)

## Executive Summary

The VS Code AI completion extension landscape has matured significantly. GitHub Copilot sets the standard with inline ghost text, partial acceptance, and Next Edit Suggestions (NES). Free alternatives like Codeium/Windsurf and Continue compete on price and flexibility. Cursor represents the premium "AI-native" approach with deep codebase understanding.

For Sidekick for Max, the opportunity is clear: provide table stakes completion UX while leveraging the unique value of using existing Claude Max tokens. Avoid feature creep into chat/agent territory that duplicates Claude Code CLI functionality.

---

## Table Stakes

Features users expect from any AI completion extension. Missing these means the product feels broken or incomplete.

| Feature | Why Expected | Complexity | Current Status | Notes |
|---------|--------------|------------|----------------|-------|
| **Inline ghost text completions** | Core UX pattern established by Copilot | Low | Implemented | Industry standard since 2021 |
| **Tab to accept** | Universal keybinding for completions | Low | Implemented | VS Code standard |
| **Multi-line completions** | Complete functions, not just lines | Low | Implemented (optional) | Toggle in settings |
| **Language detection** | Context-appropriate suggestions | Low | Implemented | Via `languageId` |
| **Enable/disable toggle** | Users need control | Low | Implemented | Via command + status bar |
| **Debouncing** | Avoid overwhelming with requests | Low | Implemented | 300ms default |
| **Status bar indicator** | Know when AI is active/available | Low | Partial | Shows enabled state, not connection/loading |
| **Configurable models** | Users want speed/quality tradeoff control | Medium | Implemented | Haiku/Sonnet for inline |
| **Partial accept (word-by-word)** | Copilot standard since 2023 | Medium | NOT implemented | `Ctrl+Right` to accept next word |
| **Escape to dismiss** | Standard UX for rejecting suggestions | Low | Implemented (VS Code native) | Built into inline completion API |
| **Request cancellation** | Stop stale requests on new input | Low | Implemented | Via cancellation token + request ID |
| **Error handling** | Graceful degradation when service unavailable | Medium | Implemented | Shows warnings, falls back silently |

### Priority Missing Table Stakes

1. **Partial accept (word-by-word)** - Copilot users expect `Ctrl+Right` / `Cmd+Right` to accept the next word. This is in VS Code core since 2023. HIGH priority to match.

2. **Status bar connection indicator** - Current status bar shows enabled/disabled but not:
   - Connection status (server reachable?)
   - Loading state (request in flight?)
   - Error state (authentication failed?)

3. **Snooze functionality** - Copilot allows "snooze for 5 minutes" without fully disabling. Nice-to-have but not critical.

---

## Differentiators

Features that could set Sidekick apart. Not expected, but valued when present.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Zero additional cost** | Use Claude Max tokens you already pay for | N/A (core value) | CURRENT differentiator |
| **Code transforms with instructions** | Select code + describe transformation | Medium | Implemented - unique feature |
| **Cursor IDE compatibility** | Broader market reach | Low-Medium | Planned - VS Code fork should work |
| **No external server required** | Simpler setup than current architecture | High | Planned - TS SDK migration |
| **Privacy (local-first)** | Code stays on machine (via CLI) | N/A | Inherent in architecture |
| **Model flexibility per task** | Different models for completions vs transforms | Low | Implemented |
| **Next Edit Suggestions (NES)** | Predict next edit location + content | Very High | Copilot-only (custom model) |
| **Codebase indexing/semantic search** | Whole-project context awareness | Very High | Cursor/Codeium territory |
| **Inline chat** | Ask questions at cursor position | High | Would duplicate Claude Code CLI |
| **Multi-file edit preview** | See changes across files before applying | Very High | Agent-level feature |
| **Fill-in-the-middle (FIM)** | Complete code between prefix and suffix | Medium | Already using prefix/suffix context |
| **Comment-to-code generation** | Write comment, get implementation | Low | Natural from completion context |

### Differentiators Worth Pursuing

1. **Code transforms** - Already implemented. This is a genuine differentiator that Copilot puts behind chat/edits mode. Keep and polish.

2. **Cursor compatibility** - Low effort, expands market. Cursor users may want Claude-powered completions.

3. **TypeScript SDK migration** - Eliminates server setup friction. Meaningful UX improvement.

4. **Fast Haiku completions** - Emphasize speed. Haiku is faster than Copilot in many cases.

### Differentiators NOT Worth Pursuing

1. **NES (Next Edit Suggestions)** - Requires custom-trained model. GitHub invested years in this. Not achievable.

2. **Codebase indexing** - Complex infrastructure (embeddings, vector DB). Cursor's entire value prop. Would require massive investment.

3. **Inline chat** - Duplicates Claude Code CLI. Users who want chat should use CLI. Keep extension focused on completions + transforms.

---

## Anti-Features

Things to deliberately NOT build. Common mistakes in this domain.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Built-in chat panel** | Duplicates Claude Code CLI; unfocused | Point users to Claude Code for chat |
| **Agent/autonomous mode** | Massive scope creep; CLI does this | Keep extension lightweight |
| **Codebase indexing** | Infrastructure burden; privacy concerns | Use immediate file context only |
| **Custom model training** | Requires ML infrastructure | Use Anthropic's models as-is |
| **Streaming ghost text** | Distracting UX; minimal benefit for short completions | Batch response is fine for <10 lines |
| **Telemetry/analytics** | Privacy-focused users choose this for Claude Max | Respect privacy, zero tracking |
| **Account system** | Unnecessary complexity; uses CLI auth | Rely on Claude Code CLI auth |
| **Cloud/hosted option** | Security risk; against local-first principle | Local only |
| **Too many configuration options** | Paradox of choice; maintenance burden | Sensible defaults, minimal config |
| **Language-specific prompts** | Maintenance nightmare for 70+ languages | Generic prompt, let model figure it out |
| **Competing with transforms/CLI** | Own features fighting each other | Clear separation: completions (extension), transforms (extension), complex edits (CLI) |

### Why These Are Anti-Features

**Built-in chat:** Research shows users have "context blindness" with too many AI tools. Sidekick's value is fast completions. Chat belongs in Claude Code CLI which already handles multi-file, agentic workflows.

**Streaming completions:** For short completions (1-10 lines), streaming adds complexity without UX benefit. User sees flickering ghost text instead of stable suggestion. Batch response that arrives in <1 second is superior UX.

**Telemetry:** Privacy is a key differentiator. Tabnine and others market on-prem options. Sidekick already wins here by using local CLI. Don't undermine this.

---

## Feature Dependencies

```
Core Completion Flow (implemented):
  Language Detection ─┬─> Context Building ──> Model Request ──> Ghost Text Display
                      │
  Debouncing ─────────┘

Transform Flow (implemented):
  Selection ──> Instruction Input ──> Context Building ──> Opus Request ──> Replace Selection

Planned Features:
  TS SDK Migration ──> Remove Server Dependency ──> Simplified Setup
                                                         │
                                                         └──> Cursor Compatibility (verify)

Status Bar Enhancement:
  Connection Check ──> Loading State ──> Error State ──> Icon/Text Update

Partial Accept:
  VS Code API (already exists) ──> Just need to verify it works with our InlineCompletionItems
```

### Dependency Notes

1. **Partial accept** should "just work" - VS Code handles `Ctrl+Right` for inline completions. Need to verify no blockers.

2. **Status bar enhancement** is independent of other work. Can be done anytime.

3. **TS SDK migration** is prerequisite for Cursor compatibility confidence. Once extension is self-contained, testing in Cursor is straightforward.

4. **Caching improvements** depend on understanding request patterns. May want metrics first (local only, not telemetry).

---

## MVP vs Post-MVP

### MVP (Current Milestone)

**Keep:**
- Inline completions (implemented)
- Code transforms (implemented)
- Model selection (implemented)
- Debouncing/caching (implemented)

**Add:**
- Status bar with connection/loading state
- Verify partial accept works
- TS SDK migration (eliminate server)
- Cursor compatibility verification

### Post-MVP (Future)

- Performance tuning (adaptive debounce based on network latency)
- Language-specific completion quality improvements
- Smarter context selection (import statements, function signatures)
- Workspace-level settings (different models for different projects)

### Explicitly Out of Scope

- Chat interface
- Agent mode
- Codebase indexing
- Multi-file edits
- NES (Next Edit Suggestions)

---

## Competitor Feature Matrix

| Feature | Copilot | Codeium/Windsurf | Continue | Cursor | Sidekick |
|---------|---------|------------------|----------|--------|----------|
| Inline completions | Yes | Yes | Yes | Yes | Yes |
| Multi-line | Yes | Yes | Yes | Yes | Yes |
| Partial accept | Yes | Yes | ? | Yes | Verify |
| Chat | Yes | Yes | Yes | Yes | No (use CLI) |
| Inline chat | Yes | Yes | Yes | Yes | No |
| NES | Yes | No | No | Yes | No |
| Codebase indexing | Limited | Yes | Via config | Yes | No |
| Code transforms | Via chat | Via command | Via chat | Cmd+K | Yes |
| Local models | No | No | Yes | No | Via CLI |
| Free tier | Students only | Yes | Yes | Limited | Yes (w/ Max) |
| Privacy mode | Enterprise | Some | Self-host | SOC2 | Local-only |
| Model choice | Limited | Fixed | Flexible | Flexible | Haiku/Sonnet/Opus |

### Positioning

Sidekick's niche: **"Use your Claude Max tokens for fast inline completions. No extra subscription. No chat (use Claude Code CLI for that)."**

This is a focused value proposition that doesn't try to compete with Copilot on features but competes on economics and simplicity.

---

## Sources

### Primary (HIGH confidence)
- [VS Code Copilot Documentation](https://code.visualstudio.com/docs/copilot/overview)
- [VS Code Inline Suggestions Documentation](https://code.visualstudio.com/docs/copilot/ai-powered-suggestions)
- [VS Code Status Bar UX Guidelines](https://code.visualstudio.com/api/ux-guidelines/status-bar)
- [GitHub Copilot NES Documentation](https://githubnext.com/projects/copilot-next-edit-suggestions/)
- [VS Code Partial Accept PR](https://github.com/microsoft/vscode/pull/166956)
- [Cursor Codebase Indexing Docs](https://docs.cursor.com/context/codebase-indexing)

### Secondary (MEDIUM confidence)
- [Codeium/Windsurf Marketplace](https://marketplace.visualstudio.com/items?itemName=Codeium.codeium)
- [Continue.dev Documentation](https://docs.continue.dev)
- [Supermaven Overview](https://supermaven.com)
- [VS Code vs Cursor Comparisons](https://graphite.com/guides/cursor-vs-vscode-comparison)
- [AI Coding Tools Comparison 2026](https://playcode.io/blog/best-ai-code-editors-2026)

### Research & Analysis (MEDIUM confidence)
- [The 70% Problem: AI-Assisted Coding](https://addyo.substack.com/p/the-70-problem-hard-truths-about)
- [AI Code Quality Issues Research](https://www.qodo.ai/reports/state-of-ai-code-quality/)
- [User Perception Study on AI Coding Assistants](https://arxiv.org/html/2508.12285v1)
- [Privacy and Security in AI Coding Tools](https://graphite.com/guides/privacy-security-ai-coding-tools)
