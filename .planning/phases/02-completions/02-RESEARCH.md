# Phase 2: Completions - Research

**Researched:** 2026-01-21
**Domain:** VS Code InlineCompletionItemProvider, debouncing, caching, Claude API integration
**Confidence:** HIGH

## Summary

Phase 2 implements inline code completions using the VS Code InlineCompletionItemProvider API. The extension already has AuthService infrastructure from Phase 1 - the main work is migrating the existing HTTP-based inline completion provider to use AuthService directly, implementing proper cancellation, and adding caching.

The VS Code API handles Tab acceptance and partial word acceptance (Ctrl+Right) automatically - no extension code needed. The provider just needs to return `InlineCompletionItem` objects with the completion text. VS Code's built-in commands (`editor.action.inlineSuggest.commit` for Tab, `editor.action.inlineSuggest.acceptNextWord` for Ctrl+Right) handle user acceptance gestures.

Key implementation focus: Replace HTTP fetch calls with AuthService.complete(), add AbortController for request cancellation that respects CancellationToken, implement LRU cache with TTL, and port the existing prompt templates from Python to TypeScript.

**Primary recommendation:** Create a CompletionService class that wraps AuthService with caching, prompt formatting, and response cleaning. Wire it into the existing InlineCompletionProvider.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vscode InlineCompletionItemProvider | 1.85+ | Ghost text completions | Official VS Code API |
| AuthService (Phase 1) | - | Claude API access | Already built, abstracts API key/Max subscription |
| AbortController | native | Request cancellation | Native API, works with both SDK and fetch |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Map | native | LRU cache storage | Simple, O(1) operations, no dependencies |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom Map-based cache | lru-cache npm | lru-cache is more feature-rich but adds dependency; our needs are simple |
| Custom debounce | lodash.debounce | Unnecessary dependency for simple timing |
| Native fetch for API | AuthService | AuthService already handles both auth modes |

**Installation:**
```bash
# No new dependencies needed - Phase 1 installed everything
```

## Architecture Patterns

### Recommended Project Structure
```
sidekick-vscode/
  src/
    services/
      AuthService.ts         # From Phase 1
      CompletionService.ts   # NEW: Wraps AuthService with caching/prompts
      CompletionCache.ts     # NEW: LRU cache with TTL
    providers/
      InlineCompletionProvider.ts  # NEW: Extracted from extension.ts
    utils/
      prompts.ts             # NEW: System/user prompt templates
    types.ts                 # Extended with completion types
    extension.ts             # Updated to use new components
```

### Pattern 1: InlineCompletionItemProvider Implementation
**What:** Provider that returns ghost text completions
**When to use:** Required for inline completions
**Example:**
```typescript
// Source: VS Code API documentation + existing extension.ts pattern

import * as vscode from 'vscode';

export class InlineCompletionProvider implements vscode.InlineCompletionItemProvider {
  constructor(private completionService: CompletionService) {}

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionItem[] | undefined> {
    // Check config and enabled state
    const config = vscode.workspace.getConfiguration('sidekick');
    if (!config.get('enabled')) {
      return undefined;
    }

    // Early exit if already cancelled
    if (token.isCancellationRequested) {
      return undefined;
    }

    try {
      const completion = await this.completionService.getCompletion(
        document,
        position,
        token
      );

      if (!completion || token.isCancellationRequested) {
        return undefined;
      }

      return [
        new vscode.InlineCompletionItem(
          completion,
          new vscode.Range(position, position)
        ),
      ];
    } catch (error) {
      console.error('Completion error:', error);
      return undefined;
    }
  }
}
```

### Pattern 2: CompletionService with Debouncing and Cancellation
**What:** Service layer that coordinates caching, debouncing, and API calls
**When to use:** All completion requests flow through this service
**Example:**
```typescript
// Source: Architecture based on existing extension.ts + best practices

export class CompletionService implements vscode.Disposable {
  private cache: CompletionCache;
  private authService: AuthService;
  private pendingController: AbortController | undefined;
  private debounceTimer: NodeJS.Timeout | undefined;
  private lastRequestId = 0;

  constructor(authService: AuthService) {
    this.authService = authService;
    this.cache = new CompletionCache();
  }

  async getCompletion(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<string | undefined> {
    const config = vscode.workspace.getConfiguration('sidekick');
    const debounceMs = config.get<number>('debounceMs') ?? 300;
    const requestId = ++this.lastRequestId;

    // Cancel any pending request
    this.pendingController?.abort();

    // Debounce
    await new Promise<void>(resolve => {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }
      this.debounceTimer = setTimeout(resolve, debounceMs);
    });

    // Check if this request is still valid after debounce
    if (requestId !== this.lastRequestId || token.isCancellationRequested) {
      return undefined;
    }

    // Build context
    const context = this.buildContext(document, position, config);

    // Check cache
    const cached = this.cache.get(context);
    if (cached) {
      return cached;
    }

    // Create new AbortController for this request
    this.pendingController = new AbortController();

    // Link VS Code CancellationToken to AbortController
    const abortHandler = () => this.pendingController?.abort();
    token.onCancellationRequested(abortHandler);

    try {
      const prompt = this.buildPrompt(context);
      const completion = await this.authService.complete(prompt, {
        model: config.get<string>('inlineModel') ?? 'haiku',
        maxTokens: 200,
        timeout: 10000,
      });

      // Check validity after API call
      if (requestId !== this.lastRequestId || token.isCancellationRequested) {
        return undefined;
      }

      // Clean and validate completion
      const cleaned = this.cleanCompletion(completion, context.multiline);
      if (!cleaned) {
        return undefined;
      }

      // Cache successful completion
      this.cache.set(context, cleaned);
      return cleaned;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return undefined; // Request was cancelled, not an error
      }
      throw error;
    }
  }

  dispose(): void {
    this.pendingController?.abort();
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.cache.clear();
  }
}
```

### Pattern 3: LRU Cache with TTL
**What:** Simple LRU cache using Map (preserves insertion order)
**When to use:** For caching completion results
**Example:**
```typescript
// Source: Based on existing Python cache.py + TypeScript best practices

interface CacheEntry {
  completion: string;
  timestamp: number;
}

export class CompletionCache {
  private cache = new Map<string, CacheEntry>();
  private readonly maxSize: number;
  private readonly ttlMs: number;

  constructor(maxSize = 100, ttlMs = 30000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  private hashKey(context: CompletionContext): string {
    // Use last 500 chars of prefix and first 200 of suffix
    const prefixTail = context.prefix.slice(-500);
    const suffixHead = context.suffix.slice(0, 200);
    return `${context.language}:${context.model}:${prefixTail}:${suffixHead}`;
  }

  get(context: CompletionContext): string | undefined {
    const key = this.hashKey(context);
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    // Check TTL
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return undefined;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.completion;
  }

  set(context: CompletionContext, completion: string): void {
    const key = this.hashKey(context);

    // Evict oldest if at capacity (first entry in Map)
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      completion,
      timestamp: Date.now(),
    });
  }

  clear(): void {
    this.cache.clear();
  }
}
```

### Pattern 4: Prompt Templates
**What:** System and user prompts for code completion
**When to use:** Building prompts for Claude API
**Example:**
```typescript
// Source: Ported from sidekick-server/prompts/*.md

export function getSystemPrompt(multiline: boolean): string {
  const blockType = multiline ? 'block/function' : 'line/statement';
  const lineLimit = multiline ? 'up to 10 lines' : '1-3 lines';

  return `You are an autocomplete engine. Complete the code at the cursor position.

RULES:
- Output ONLY code that completes the ${blockType}
- If unsure, output a reasonable default (e.g., None, 0, "", [], {})
- NEVER ask questions or explain
- NEVER say you need more context
- NO markdown, NO backticks
- Maximum ${lineLimit}`;
}

export function getUserPrompt(
  language: string,
  filename: string,
  prefix: string,
  suffix: string
): string {
  // The cursor is represented by the transition from prefix to suffix
  return `${language} | ${filename}

${prefix}<CURSOR>${suffix}

Completion:`;
}
```

### Pattern 5: Response Cleaning
**What:** Clean and validate Claude's completion response
**When to use:** After every API call
**Example:**
```typescript
// Source: Ported from sidekick-server/services/completion.py

const CONVERSATIONAL_PATTERNS = [
  /^I (need|cannot|can't|don't|would|could)/i,
  /^(Could|Would|Can) you/i,
  /more context/i,
  /cannot provide/i,
  /please provide/i,
  /let me/i,
  /however/i,
  /without (additional|more)/i,
];

export function cleanCompletion(
  text: string,
  multiline: boolean
): string | undefined {
  const maxLength = multiline ? 1000 : 200;

  // Remove markdown code blocks
  let cleaned = text
    .replace(/^```[\w]*\n?/, '')
    .replace(/\n?```$/, '')
    .trim();

  // Check for conversational patterns (model didn't follow instructions)
  for (const pattern of CONVERSATIONAL_PATTERNS) {
    if (pattern.test(cleaned)) {
      console.debug(`Filtered conversational response: ${pattern}`);
      return undefined;
    }
  }

  // Check length
  if (cleaned.length > maxLength) {
    console.debug(`Filtered response (too long): ${cleaned.length} > ${maxLength}`);
    return undefined;
  }

  return cleaned || undefined;
}
```

### Anti-Patterns to Avoid
- **Creating new AbortController per debounce:** Always abort the previous controller before creating a new one
- **Not checking CancellationToken after await:** Check `token.isCancellationRequested` after every async operation
- **Caching empty/error responses:** Only cache successful, non-empty completions
- **Hard-coded debounce values:** Read from VS Code configuration
- **Blocking during provider callback:** All operations must be async

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tab acceptance | Custom keymap handler | VS Code built-in | `InlineCompletionItem` auto-wires Tab acceptance |
| Partial word accept | Command registration | VS Code built-in | `editor.action.inlineSuggest.acceptNextWord` (Ctrl+Right) is automatic |
| Ghost text rendering | DOM manipulation | VS Code API | Return `InlineCompletionItem`, VS Code renders ghost text |
| Request cancellation | Manual tracking | AbortController + CancellationToken | Native APIs that work together |
| Multi-line completion display | Line-by-line insertion | VS Code API | Just return multi-line string, VS Code handles display |

**Key insight:** VS Code handles ALL user acceptance gestures automatically. The provider just needs to return completion text - Tab and Ctrl+Right work out of the box without any extension code.

## Common Pitfalls

### Pitfall 1: Not Aborting Previous Requests
**What goes wrong:** Multiple API requests in flight simultaneously, wasting API quota and causing race conditions
**Why it happens:** User types fast, each keystroke triggers completion
**How to avoid:**
```typescript
// Store controller at service level
private pendingController: AbortController | undefined;

// In getCompletion:
this.pendingController?.abort(); // Cancel previous
this.pendingController = new AbortController();
```
**Warning signs:** Multiple completion requests in logs for single typing session, stale completions appearing

### Pitfall 2: Debounce Timer Not Cleared
**What goes wrong:** Completion requests fire after user has moved on
**Why it happens:** Timer not cleared when new input arrives
**How to avoid:**
```typescript
if (this.debounceTimer) {
  clearTimeout(this.debounceTimer);
}
this.debounceTimer = setTimeout(resolve, debounceMs);
```
**Warning signs:** Completions appearing with delay even after user stopped typing elsewhere

### Pitfall 3: Cache Key Too Broad or Narrow
**What goes wrong:** Cache misses when should hit (key too narrow) or wrong completions returned (key too broad)
**Why it happens:** Cache key doesn't capture the right context
**How to avoid:**
- Include: language, model, last ~500 chars of prefix, first ~200 chars of suffix
- Exclude: timestamp, request ID, full document
**Warning signs:** Same completion appearing for different contexts, or cache never hitting

### Pitfall 4: Not Respecting CancellationToken After Await
**What goes wrong:** Stale completions returned to wrong document position
**Why it happens:** User moved cursor during API call but result still processed
**How to avoid:**
```typescript
const completion = await this.authService.complete(prompt, options);

// Check AGAIN after await
if (token.isCancellationRequested || requestId !== this.lastRequestId) {
  return undefined;
}
```
**Warning signs:** Completions appearing at wrong cursor position

### Pitfall 5: Multi-line Completions Breaking Indentation
**What goes wrong:** Multi-line completions have inconsistent indentation
**Why it happens:** Completion doesn't account for current line's indentation
**How to avoid:** The prefix already includes indentation context - Claude should match it. If issues persist, could normalize first line but preserve relative indentation of subsequent lines
**Warning signs:** Multi-line completions that start at column 0 or have wrong indentation

### Pitfall 6: Model Response Includes Explanations
**What goes wrong:** Claude returns "Here's the completion: ..." instead of just code
**Why it happens:** Prompt not strict enough about output format
**How to avoid:**
1. System prompt explicitly says "Output ONLY code"
2. Clean response by filtering conversational patterns
3. Use max_tokens limit to discourage verbose responses
**Warning signs:** Completions starting with "Here", "I", "The", etc.

## Code Examples

Verified patterns from official sources:

### VS Code InlineCompletionItem Construction
```typescript
// Source: VS Code API documentation

// Basic completion
new vscode.InlineCompletionItem(
  'completionText',
  new vscode.Range(position, position)
);

// Multi-line completion (just use newlines in string)
new vscode.InlineCompletionItem(
  'line1\n  line2\n  line3',
  new vscode.Range(position, position)
);
```

### Linking CancellationToken to AbortController
```typescript
// Source: Best practice from VS Code extension patterns

const controller = new AbortController();

// VS Code will call this when user types or moves cursor
token.onCancellationRequested(() => {
  controller.abort();
});

// Pass controller signal to fetch or SDK call
await fetch(url, { signal: controller.signal });
```

### Proper Debounce with Cancellation
```typescript
// Source: Combined from multiple best practices

class CompletionService {
  private debounceTimer: NodeJS.Timeout | undefined;
  private requestId = 0;

  async getCompletion(token: vscode.CancellationToken): Promise<string | undefined> {
    const currentId = ++this.requestId;

    // Clear previous timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Wait for debounce period
    await new Promise<void>(resolve => {
      this.debounceTimer = setTimeout(resolve, 300);
    });

    // Check if still valid after debounce
    if (currentId !== this.requestId) {
      return undefined; // Newer request superseded this one
    }

    if (token.isCancellationRequested) {
      return undefined; // VS Code cancelled (user typed more)
    }

    // Proceed with API call...
  }
}
```

### Configuration Reading Pattern
```typescript
// Source: VS Code Extension API + existing extension.ts

function getCompletionConfig(): CompletionConfig {
  const config = vscode.workspace.getConfiguration('sidekick');
  return {
    enabled: config.get<boolean>('enabled') ?? true,
    debounceMs: config.get<number>('debounceMs') ?? 300,
    contextLines: config.get<number>('inlineContextLines') ?? 30,
    multiline: config.get<boolean>('multiline') ?? false,
    model: config.get<string>('inlineModel') ?? 'haiku',
  };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| HTTP to Python server | Direct AuthService SDK calls | Phase 2 (now) | Eliminates server dependency |
| Custom request tracking | AbortController + CancellationToken | Established pattern | Native cancellation support |
| Custom ghost text rendering | VS Code InlineCompletionItem | VS Code 1.55+ (2021) | Built-in support |
| Manual Tab/Ctrl+Right handling | VS Code built-in commands | VS Code 1.55+ | No extension code needed |

**Deprecated/outdated:**
- `serverUrl` setting - Will be removed in Phase 4, no longer used after Phase 2
- HTTP fetch for completions - Replaced with AuthService
- `TextEdit` for ghost text - Use `InlineCompletionItem` instead

## Open Questions

Things that couldn't be fully resolved:

1. **handleDidPartiallyAcceptCompletionItem Usage**
   - What we know: VS Code calls this when user accepts word-by-word
   - What's unclear: Is it useful for our use case? Does it help with caching?
   - Recommendation: Implement basic logging first, enhance if needed

2. **Optimal Debounce Timing**
   - What we know: 300ms is current default, VS Code internally uses 350ms for outline
   - What's unclear: Is 300ms optimal for Claude API latency?
   - Recommendation: Keep configurable, consider adaptive debouncing later

3. **Cache Invalidation on Document Change**
   - What we know: Cache uses prefix/suffix as key which naturally invalidates
   - What's unclear: Should we clear cache on document edit events?
   - Recommendation: Current key-based approach should work, monitor for issues

4. **System Prompt for FIM-like Behavior**
   - What we know: Claude doesn't have native FIM endpoint
   - What's unclear: Is "<CURSOR>" marker optimal for indicating insertion point?
   - Recommendation: Port existing Python prompts, adjust based on completion quality

## Sources

### Primary (HIGH confidence)
- [VS Code API - InlineCompletionItemProvider](https://code.visualstudio.com/api/references/vscode-api) - API reference for inline completions
- [VS Code Extension Samples - inline-completions](https://github.com/microsoft/vscode-extension-samples/blob/main/inline-completions/src/extension.ts) - Official sample implementation
- [VS Code Programmatic Language Features](https://code.visualstudio.com/api/language-extensions/programmatic-language-features) - Ghost text documentation
- Existing `sidekick-server/services/completion.py` - Proven prompt and cleaning patterns
- Existing `sidekick-vscode/src/extension.ts` - Current provider implementation

### Secondary (MEDIUM confidence)
- [VS Code Issue #167042](https://github.com/microsoft/vscode/issues/167042) - Inline completion commands UI discussion
- [VS Code Issue #234330](https://github.com/microsoft/vscode/issues/234330) - Partial accept behavior details
- [TypeScript LRU Cache implementations](https://dev.to/shayy/using-lru-cache-in-nodejs-and-typescript-7d9) - Cache patterns
- [AbortController with Debounce patterns](https://svarden.se/post/debounced-fetch-with-abort-controller) - Request cancellation

### Tertiary (LOW confidence)
- Community blog posts on FIM prompting for Claude - No official Claude FIM documentation exists

## Metadata

**Confidence breakdown:**
- VS Code API patterns: HIGH - Official docs and samples
- Debouncing/cancellation: HIGH - Established patterns, multiple sources agree
- Caching strategy: HIGH - Existing Python implementation proven, straightforward port
- Prompt format: MEDIUM - Existing prompts work, but Claude has no FIM spec
- Partial accept handling: MEDIUM - API exists but limited documentation on best use

**Research date:** 2026-01-21
**Valid until:** 2026-02-21 (30 days - VS Code API is stable)
