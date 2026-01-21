# Architecture Research

**Project:** Sidekick for Max - TypeScript-only VS Code Extension
**Researched:** 2026-01-20
**Confidence:** HIGH (based on official documentation and existing codebase analysis)

## Executive Summary

Migrating from Python server + VS Code extension to TypeScript-only VS Code extension with embedded Claude SDK. The target architecture eliminates the server component, embedding Claude API calls directly in the extension. This simplifies deployment (one package vs two processes) and reduces latency (no HTTP roundtrip).

## Recommended Structure

### Component Architecture

```
sidekick-vscode/
  src/
    extension.ts              # Entry point, activation, command registration
    providers/
      InlineCompletionProvider.ts   # VS Code InlineCompletionItemProvider
    services/
      ClaudeService.ts        # Wraps @anthropic-ai/sdk, handles API calls
      CompletionService.ts    # Orchestrates completion logic
      TransformService.ts     # Orchestrates transform logic
      CacheService.ts         # In-memory LRU cache
      RateLimiterService.ts   # Sliding window rate limiter
    utils/
      prompts.ts              # Prompt templates and formatting
      cleaners.ts             # Response cleaning (markdown stripping, filters)
      config.ts               # Configuration reading from VS Code settings
      logger.ts               # Output channel logging
    types/
      requests.ts             # Request interfaces
      responses.ts            # Response interfaces
```

### Component Boundaries

| Component | Responsibility | Depends On |
|-----------|---------------|------------|
| **extension.ts** | Lifecycle management, command/provider registration, status bar | All services, providers |
| **InlineCompletionProvider** | Implements VS Code's InlineCompletionItemProvider interface, debouncing, cancellation handling | CompletionService |
| **ClaudeService** | Anthropic SDK wrapper, API call execution, error handling, streaming | @anthropic-ai/sdk |
| **CompletionService** | Prompt building, cache checking, response cleaning, metrics | ClaudeService, CacheService, prompts utils |
| **TransformService** | Transform prompt building, response handling | ClaudeService, prompts utils |
| **CacheService** | LRU cache with TTL, key hashing | None (pure data structure) |
| **RateLimiterService** | Sliding window rate limiting | None (pure data structure) |

### Key Interfaces

```typescript
// ClaudeService
interface ClaudeService {
  complete(prompt: string, systemPrompt: string, options: ClaudeOptions): Promise<string>;
  // Optional: streaming variant for future use
  streamComplete(prompt: string, systemPrompt: string, options: ClaudeOptions): AsyncIterable<string>;
}

// CompletionService
interface CompletionService {
  getCompletion(request: CompletionRequest): Promise<CompletionResponse>;
}

// TransformService
interface TransformService {
  transform(request: TransformRequest): Promise<TransformResponse>;
}
```

## Data Flow

### Inline Completion Flow

```
User types in editor
    |
    v
VS Code triggers provideInlineCompletionItems()
    |
    v
[InlineCompletionProvider]
    |-- Check if enabled (config + state)
    |-- Debounce (300ms default)
    |-- Check cancellation token
    |
    v
[CompletionService.getCompletion()]
    |-- Check RateLimiter
    |   |-- If rate limited: return empty
    |-- Check CacheService
    |   |-- If cache hit: return cached response
    |-- Build prompt (prefix, suffix, language, filename)
    |-- Build system prompt (multiline mode)
    |
    v
[ClaudeService.complete()]
    |-- Create Anthropic client (lazy singleton)
    |-- Call messages.create() with:
    |   - model: "claude-3-5-haiku-..." or "claude-sonnet-..."
    |   - system: system prompt
    |   - messages: [{ role: "user", content: prompt }]
    |   - max_tokens: appropriate for mode
    |-- Handle errors (timeout, rate limit, auth)
    |
    v
[CompletionService] receives response
    |-- Clean response (remove markdown fences)
    |-- Filter conversational responses
    |-- Check length limits
    |-- Cache successful response
    |-- Record metrics
    |
    v
[InlineCompletionProvider]
    |-- Wrap in InlineCompletionItem
    |-- Return to VS Code
    |
    v
VS Code displays ghost text
```

### Transform Flow

```
User selects code, triggers command
    |
    v
[extension.ts command handler]
    |-- Get selection and context
    |-- Show input box for instruction
    |-- Show progress notification
    |
    v
[TransformService.transform()]
    |-- Check RateLimiter
    |-- Build transform prompt
    |-- Build system prompt
    |
    v
[ClaudeService.complete()]
    |-- Call API with opus model (higher quality)
    |-- Longer timeout (20-30s)
    |
    v
[TransformService]
    |-- Clean response
    |-- Return modified code
    |
    v
[extension.ts]
    |-- Replace selection with modified code
```

## Integration Points

### VS Code API Integration

| VS Code API | Usage |
|-------------|-------|
| `vscode.languages.registerInlineCompletionItemProvider` | Register completion provider for all file types |
| `vscode.window.createStatusBarItem` | Show enable/disable status |
| `vscode.window.showInputBox` | Get transform instruction |
| `vscode.window.withProgress` | Show transform progress |
| `vscode.workspace.getConfiguration` | Read extension settings |
| `vscode.window.createOutputChannel` | Logging output |
| `vscode.CancellationToken` | Handle request cancellation |

### Claude SDK Integration

Using `@anthropic-ai/sdk` (NOT the Agent SDK - simpler API, direct control):

```typescript
import Anthropic from '@anthropic-ai/sdk';

// Singleton client initialization
let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({
      apiKey: getApiKey(), // From VS Code settings or environment
    });
  }
  return client;
}

// Completion call
async function complete(prompt: string, systemPrompt: string, model: string): Promise<string> {
  const response = await getClient().messages.create({
    model: getModelId(model), // Map "haiku" -> "claude-3-5-haiku-..." etc
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: prompt }],
  });

  // Extract text from response
  const textBlock = response.content.find(block => block.type === 'text');
  return textBlock?.text ?? '';
}
```

### Configuration Integration

Extension settings (package.json contributes.configuration):

| Setting | Type | Default | Maps To |
|---------|------|---------|---------|
| `sidekick.apiKey` | string | "" | Anthropic API key (or ANTHROPIC_API_KEY env) |
| `sidekick.enabled` | boolean | true | Global enable/disable |
| `sidekick.debounceMs` | number | 300 | Debounce delay |
| `sidekick.inlineContextLines` | number | 30 | Lines of context |
| `sidekick.inlineModel` | enum | "haiku" | Model for completions |
| `sidekick.transformModel` | enum | "opus" | Model for transforms |
| `sidekick.multiline` | boolean | false | Multi-line mode |

## Build Order

Recommended implementation sequence based on dependencies:

### Phase 1: Core Infrastructure (No External Dependencies)

1. **Types** (`types/requests.ts`, `types/responses.ts`)
   - Define interfaces matching current Python models
   - No dependencies, enables type checking early

2. **Utilities** (`utils/config.ts`, `utils/logger.ts`, `utils/cleaners.ts`)
   - Config reads from VS Code settings
   - Logger wraps OutputChannel
   - Cleaners port from Python (regex patterns)

3. **CacheService** and **RateLimiterService**
   - Port directly from Python implementations
   - Pure TypeScript, testable in isolation

### Phase 2: Claude Integration

4. **ClaudeService**
   - Add `@anthropic-ai/sdk` dependency
   - Implement singleton client pattern
   - Error handling (timeout, rate limit, auth errors)
   - Model ID mapping

5. **Prompt Templates** (`utils/prompts.ts`)
   - Port prompt templates from Python
   - Template string formatting

### Phase 3: Service Layer

6. **CompletionService**
   - Wire together: ClaudeService + CacheService + RateLimiterService
   - Orchestration logic from Python completion.py

7. **TransformService**
   - Similar pattern to CompletionService
   - Port from Python modification.py

### Phase 4: VS Code Integration

8. **InlineCompletionProvider**
   - Refactor existing provider to use CompletionService
   - Remove HTTP fetch logic
   - Keep debouncing and cancellation logic

9. **Extension Entry Point**
   - Update extension.ts to instantiate services
   - Remove serverUrl configuration
   - Add apiKey configuration
   - Update transform command

### Phase 5: Polish

10. **Testing**
    - Unit tests for services
    - Mock ClaudeService for provider tests

11. **Bundling**
    - Configure esbuild to bundle @anthropic-ai/sdk
    - Update .vscodeignore

## SDK Choice: @anthropic-ai/sdk vs @anthropic-ai/claude-agent-sdk

**Recommendation: Use @anthropic-ai/sdk (the standard Messages API)**

| Criterion | @anthropic-ai/sdk | @anthropic-ai/claude-agent-sdk |
|-----------|-------------------|-------------------------------|
| Use case | Simple message/response | Autonomous agents with tools |
| Complexity | Low | High |
| Control | Full control over prompts | Agent loop controls flow |
| Overhead | Minimal | Spawns CLI subprocess |
| Authentication | API key directly | Uses Claude Code auth |
| Dependencies | Light | Heavy (CLI required) |

The Agent SDK is designed for building autonomous agents that need file access, tool use, and multi-turn conversations. For inline completions (simple prompt -> response), the standard SDK is more appropriate.

**Note:** The current Python implementation uses `claude_agent_sdk` which wraps the Claude Code CLI. The TypeScript migration should switch to direct API calls with `@anthropic-ai/sdk` for:
- Lower latency (no CLI subprocess)
- Simpler deployment (no CLI installation required)
- More control over request/response handling

## Anti-Patterns to Avoid

### 1. Blocking the Extension Host

**Problem:** Long-running synchronous operations freeze VS Code.

**Solution:** All Claude API calls must be async. Use cancellation tokens to abort stale requests.

```typescript
// GOOD: Check cancellation after async operations
async provideInlineCompletionItems(document, position, context, token) {
  const response = await this.completionService.getCompletion(request);
  if (token.isCancellationRequested) return undefined; // Check after await
  return [new vscode.InlineCompletionItem(response.completion, range)];
}
```

### 2. Memory Leaks from Unbounded Caches

**Problem:** Cache grows indefinitely.

**Solution:** Implement LRU eviction with max size (already in Python implementation).

### 3. API Key Exposure

**Problem:** Storing API key in plain settings.

**Solution:** Use VS Code's Secret Storage API for sensitive credentials:

```typescript
// Store
await context.secrets.store('sidekick.apiKey', apiKey);
// Retrieve
const apiKey = await context.secrets.get('sidekick.apiKey');
```

### 4. Bundling Issues with Native Modules

**Problem:** @anthropic-ai/sdk may have dependencies that don't bundle cleanly.

**Solution:** The SDK is pure JavaScript/TypeScript, so bundling should work. Test esbuild configuration early.

## Scalability Considerations

| Concern | Current (Server) | Target (Extension) |
|---------|-----------------|-------------------|
| Concurrent users | Server handles isolation | N/A (single user) |
| Request queuing | Server can queue | Debouncing in provider |
| Memory | Server process | VS Code extension host |
| CPU | Separate process | Extension host (shared) |

The extension architecture is inherently single-user, so scalability concerns shift to:
- Not blocking the extension host
- Efficient memory use (bounded cache)
- Request cancellation for stale completions

## Sources

### Official Documentation (HIGH confidence)
- [VS Code Extension API](https://code.visualstudio.com/api/references/vscode-api)
- [Anthropic TypeScript SDK](https://github.com/anthropics/anthropic-sdk-typescript)
- [VS Code Bundling Extensions](https://code.visualstudio.com/api/working-with-extensions/bundling-extension)
- [VS Code Extension Samples - Inline Completions](https://github.com/microsoft/vscode-extension-samples/blob/main/inline-completions/src/extension.ts)
- [Agent SDK Reference - TypeScript](https://platform.claude.com/docs/en/agent-sdk/typescript)

### Codebase Analysis (HIGH confidence)
- Current extension: `/home/cal/code/sidekick-for-claude-max/sidekick-vscode/src/extension.ts`
- Python services: `/home/cal/code/sidekick-for-claude-max/sidekick-server/services/`
- Python utils: `/home/cal/code/sidekick-for-claude-max/sidekick-server/utils/`

### Community Resources (MEDIUM confidence)
- [Building VS Code Extensions in 2026](https://abdulkadersafi.com/blog/building-vs-code-extensions-in-2026-the-complete-modern-guide)
