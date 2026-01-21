# Phase 1: Foundation - Research

**Researched:** 2026-01-20
**Domain:** SDK integration, authentication, VS Code extension infrastructure
**Confidence:** HIGH

## Summary

Phase 1 establishes the foundation for the Sidekick for Max TypeScript migration. The core challenge is implementing dual authentication: API key mode (via `@anthropic-ai/sdk`) and Max subscription mode (via `@anthropic-ai/claude-agent-sdk`). Both SDKs are actively maintained by Anthropic with recent releases (January 2026).

The `@anthropic-ai/claude-agent-sdk` is the official way to leverage Max subscription tokens programmatically. It spawns Claude Code CLI as a subprocess and streams messages through an async iterator. The `@anthropic-ai/sdk` provides direct API access with an API key. Both patterns are well-documented with clear TypeScript interfaces.

Key technical decisions: use esbuild for bundling (official VS Code recommendation), implement a service abstraction layer to switch between auth modes, and store the auth mode preference in VS Code settings with a SecretStorage-backed API key.

**Primary recommendation:** Build an `AuthService` that abstracts both SDKs behind a common interface, with auth mode selection via `sidekick.authMode` setting.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @anthropic-ai/sdk | ^0.71.0 | API key authentication | Official Anthropic TypeScript SDK |
| @anthropic-ai/claude-agent-sdk | ^0.2.12 | Max subscription authentication | Official SDK for Claude Code CLI integration |
| esbuild | ^0.20.0 | Extension bundling | Official VS Code recommendation, 10-100x faster than webpack |
| typescript | ^5.4.0 | Type safety | Already in project, required for SDK types |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @types/vscode | ^1.85.0 | VS Code API types | Already in project |
| vitest | ^2.0.0 | Unit testing | Already in project |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| esbuild | webpack | Webpack is more configurable but 10-100x slower |
| claude-agent-sdk | Direct CLI spawn | SDK provides types, streaming, error handling |
| SecretStorage | plaintext settings | SecretStorage is secure, uses system keychain |

**Installation:**
```bash
cd sidekick-vscode
npm install @anthropic-ai/claude-agent-sdk @anthropic-ai/sdk
npm install -D esbuild
```

## Architecture Patterns

### Recommended Project Structure
```
sidekick-vscode/
  src/
    extension.ts              # Entry point, activation
    services/
      AuthService.ts          # Auth mode abstraction
      ClaudeService.ts        # SDK wrapper for API calls
    providers/
      InlineCompletionProvider.ts  # VS Code completion interface
    utils/
      config.ts               # Settings reader
      secrets.ts              # SecretStorage wrapper
  esbuild.js                  # Build configuration
```

### Pattern 1: Dual-Auth Service Abstraction
**What:** A service that provides a unified interface for both authentication modes
**When to use:** Always - this is the core pattern for the phase
**Example:**
```typescript
// Source: Architecture based on SDK APIs from official docs

export type AuthMode = 'api-key' | 'max-subscription';

export interface ClaudeClient {
  complete(prompt: string, options: CompletionOptions): Promise<string>;
  isAvailable(): Promise<boolean>;
}

export class AuthService {
  private mode: AuthMode;
  private apiKeyClient?: AnthropicSDKClient;
  private maxClient?: ClaudeAgentSDKClient;

  async getClient(): Promise<ClaudeClient> {
    if (this.mode === 'api-key') {
      return this.getApiKeyClient();
    }
    return this.getMaxClient();
  }

  async switchMode(mode: AuthMode): Promise<void> {
    this.mode = mode;
    // Dispose old client, initialize new
  }
}
```

### Pattern 2: API Key Client (via @anthropic-ai/sdk)
**What:** Direct API access using an API key stored in SecretStorage
**When to use:** When user selects API key auth mode
**Example:**
```typescript
// Source: https://github.com/anthropics/anthropic-sdk-typescript

import Anthropic from '@anthropic-ai/sdk';

export class ApiKeyClient implements ClaudeClient {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async complete(prompt: string, options: CompletionOptions): Promise<string> {
    const message = await this.client.messages.create({
      model: options.model ?? 'claude-3-5-haiku-20241022',
      max_tokens: options.maxTokens ?? 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    // Extract text from response
    const textBlock = message.content.find(b => b.type === 'text');
    return textBlock?.text ?? '';
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Simple test call
      await this.client.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'test' }],
      });
      return true;
    } catch {
      return false;
    }
  }
}
```

### Pattern 3: Max Subscription Client (via @anthropic-ai/claude-agent-sdk)
**What:** Claude Code CLI integration for Max subscription tokens
**When to use:** When user selects Max subscription auth mode
**Example:**
```typescript
// Source: https://platform.claude.com/docs/en/agent-sdk/typescript

import { query } from '@anthropic-ai/claude-agent-sdk';

export class MaxSubscriptionClient implements ClaudeClient {
  async complete(prompt: string, options: CompletionOptions): Promise<string> {
    const abortController = new AbortController();

    // Set timeout to avoid hanging
    const timeout = setTimeout(() => abortController.abort(), 30000);

    try {
      for await (const message of query({
        prompt,
        options: {
          abortController,
          model: this.mapModel(options.model),
          maxTurns: 1,
          allowedTools: [], // No tools for simple completion
          permissionMode: 'bypassPermissions',
        }
      })) {
        if (message.type === 'result') {
          clearTimeout(timeout);
          if (message.subtype === 'success') {
            return message.result;
          }
          throw new Error(message.errors?.join(', ') ?? 'Unknown error');
        }
      }
      throw new Error('No result received');
    } finally {
      clearTimeout(timeout);
    }
  }

  private mapModel(model?: string): string {
    // Map user-facing names to SDK names
    switch (model) {
      case 'haiku': return 'haiku';
      case 'sonnet': return 'sonnet';
      case 'opus': return 'opus';
      default: return 'haiku';
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Check if Claude Code CLI is available
      const { execSync } = require('child_process');
      execSync('claude --version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }
}
```

### Pattern 4: esbuild Configuration
**What:** Minimal esbuild config for VS Code extension
**When to use:** For building/bundling the extension
**Example:**
```javascript
// esbuild.js
// Source: https://code.visualstudio.com/api/working-with-extensions/bundling-extension

const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'out/extension.js',
    external: ['vscode'],
    logLevel: 'warning',
  });

  if (watch) {
    await ctx.watch();
    console.log('Watching for changes...');
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
```

### Pattern 5: VS Code Settings for Auth Mode
**What:** Configuration contribution for auth mode selection
**When to use:** In package.json contributes section
**Example:**
```json
{
  "contributes": {
    "configuration": {
      "title": "Sidekick for Max",
      "properties": {
        "sidekick.authMode": {
          "type": "string",
          "enum": ["api-key", "max-subscription"],
          "default": "max-subscription",
          "description": "Authentication mode for Claude API",
          "enumDescriptions": [
            "Use an Anthropic API key (requires ANTHROPIC_API_KEY or configured key)",
            "Use Claude Max subscription (requires Claude Code CLI installed and authenticated)"
          ]
        },
        "sidekick.apiKey": {
          "type": "string",
          "default": "",
          "description": "Anthropic API key (leave empty to use ANTHROPIC_API_KEY environment variable). Stored securely.",
          "markdownDescription": "Anthropic API key. Leave empty to use `ANTHROPIC_API_KEY` environment variable. **Stored securely in system keychain.**"
        }
      }
    },
    "commands": [
      {
        "command": "sidekick.setApiKey",
        "title": "Sidekick: Set API Key"
      },
      {
        "command": "sidekick.testConnection",
        "title": "Sidekick: Test Connection"
      }
    ]
  }
}
```

### Anti-Patterns to Avoid
- **Blocking the extension host:** Never use synchronous subprocess operations. All SDK calls MUST be async.
- **Storing API key in plaintext settings:** Use VS Code SecretStorage API for sensitive data.
- **Ignoring cancellation tokens:** Check `token.isCancellationRequested` after every await.
- **Hard-coded timeouts:** Make timeouts configurable, but provide sensible defaults (30s for completions).

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| API key storage | Custom encryption | VS Code SecretStorage | Uses system keychain, handles cross-platform |
| CLI subprocess management | Raw child_process | claude-agent-sdk | Handles streaming, errors, types |
| HTTP client | fetch wrapper | @anthropic-ai/sdk | Handles auth headers, retries, types |
| Settings schema | Manual JSON parsing | package.json contribution | VS Code validates, provides UI |
| Build tooling | Custom bundler | esbuild | Fast, maintained, official recommendation |

**Key insight:** Both SDKs handle the hard parts (subprocess management, streaming, error handling, retries). Focus on the abstraction layer that switches between them.

## Common Pitfalls

### Pitfall 1: Claude Agent SDK 1000ms Timeout
**What goes wrong:** The Claude Code CLI has an internal 1000ms startup timeout that can fail under load or slow keychain access.
**Why it happens:** Default subprocess handshake timeout is too short for real-world conditions.
**How to avoid:**
1. Pre-warm the SDK connection during extension activation
2. Implement retry logic with exponential backoff
3. Set longer external timeout (30s) wrapping the SDK call
4. Handle `AbortError` gracefully
**Warning signs:** Intermittent "Timeout waiting after 1000ms" errors, especially on macOS with keychain prompts.

### Pitfall 2: Blocking Extension Host
**What goes wrong:** Synchronous operations freeze VS Code UI and cause "Extension host unresponsive" dialogs.
**Why it happens:** Extension host is single-threaded; blocking affects all extensions.
**How to avoid:**
1. All SDK calls must be async with proper await
2. Check cancellation token after every await
3. Use AbortController for timeouts
**Warning signs:** UI freezes during completions, "Extension Host with pid exited" crashes.

### Pitfall 3: Memory Leaks from Event Listeners
**What goes wrong:** Subscriptions not cleaned up cause memory growth over time.
**Why it happens:** VS Code's Disposable pattern requires manual cleanup.
**How to avoid:**
```typescript
// Push all subscriptions to context.subscriptions
context.subscriptions.push(
  vscode.workspace.onDidChangeConfiguration(handleChange)
);

// For class instances, implement Disposable
class AuthService implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];

  dispose() {
    this.disposables.forEach(d => d.dispose());
  }
}
```
**Warning signs:** Memory usage grows over multi-hour sessions.

### Pitfall 4: SecretStorage Async Patterns
**What goes wrong:** Treating SecretStorage as synchronous causes race conditions.
**Why it happens:** SecretStorage operations are async (keychain access).
**How to avoid:**
```typescript
// BAD: Assuming sync access
const key = secrets.get('apiKey'); // Returns Promise!

// GOOD: Proper async handling
const key = await secrets.get('apiKey');
if (!key) {
  throw new Error('API key not configured');
}
```
**Warning signs:** Undefined values when key should exist, intermittent auth failures.

### Pitfall 5: Claude Agent SDK Not Finding CLI
**What goes wrong:** SDK fails to find `claude` binary even when installed.
**Why it happens:** PATH not set correctly in VS Code's extension host environment.
**How to avoid:**
1. Check for CLI in activation, show helpful error
2. Allow user to configure explicit path via `pathToClaudeCodeExecutable` option
3. Provide clear error messages with installation instructions
**Warning signs:** "Claude Code not found" errors despite CLI working in terminal.

## Code Examples

Verified patterns from official sources:

### Reading VS Code Configuration
```typescript
// Source: VS Code API documentation

function getConfig(): SidekickConfig {
  const config = vscode.workspace.getConfiguration('sidekick');
  return {
    authMode: config.get<AuthMode>('authMode') ?? 'max-subscription',
    enabled: config.get<boolean>('enabled') ?? true,
    debounceMs: config.get<number>('debounceMs') ?? 300,
    inlineModel: config.get<string>('inlineModel') ?? 'haiku',
  };
}

// Listen for changes
context.subscriptions.push(
  vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('sidekick')) {
      const newConfig = getConfig();
      authService.handleConfigChange(newConfig);
    }
  })
);
```

### SecretStorage for API Key
```typescript
// Source: VS Code API documentation

export class SecretsManager {
  constructor(private secrets: vscode.SecretStorage) {}

  async getApiKey(): Promise<string | undefined> {
    // Check environment variable first
    const envKey = process.env.ANTHROPIC_API_KEY;
    if (envKey) return envKey;

    // Then check secret storage
    return this.secrets.get('sidekick.apiKey');
  }

  async setApiKey(key: string): Promise<void> {
    await this.secrets.store('sidekick.apiKey', key);
  }

  async deleteApiKey(): Promise<void> {
    await this.secrets.delete('sidekick.apiKey');
  }
}
```

### Async Iterator with AbortController
```typescript
// Source: https://platform.claude.com/docs/en/agent-sdk/typescript

async function completeWithTimeout(
  prompt: string,
  timeoutMs: number = 30000
): Promise<string> {
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

  try {
    for await (const message of query({
      prompt,
      options: {
        abortController,
        maxTurns: 1,
        allowedTools: [],
      }
    })) {
      if (message.type === 'result' && message.subtype === 'success') {
        return message.result;
      }
    }
    throw new Error('No result received');
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
```

### Proper Extension Lifecycle
```typescript
// Source: VS Code Extension documentation

let authService: AuthService | undefined;

export async function activate(context: vscode.ExtensionContext) {
  // Initialize services
  authService = new AuthService(context.secrets);
  context.subscriptions.push(authService);

  // Pre-warm connection (async, don't block activation)
  authService.warmup().catch(err => {
    console.warn('Failed to warm up auth service:', err);
  });

  // Register providers and commands
  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider(
      { pattern: '**' },
      new InlineCompletionProvider(authService)
    )
  );
}

export async function deactivate(): Promise<void> {
  // Keep cleanup fast - VS Code only waits ~4 seconds
  authService?.dispose();
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Claude Code SDK | Claude Agent SDK | Sept 2025 (renamed) | Same functionality, new name |
| Webpack bundling | esbuild bundling | 2024 | 10-100x faster builds |
| Manual CLI spawning | claude-agent-sdk | Sept 2025 | Typed interface, proper streaming |
| Plaintext settings | SecretStorage | Always preferred | Secure API key storage |

**Deprecated/outdated:**
- `@anthropic-ai/claude-code-sdk` - Renamed to `@anthropic-ai/claude-agent-sdk`
- Webpack for VS Code extensions - esbuild is now recommended
- Synchronous subprocess spawning - Always use async patterns

## Open Questions

Things that couldn't be fully resolved:

1. **CLI Path Discovery**
   - What we know: SDK has `pathToClaudeCodeExecutable` option
   - What's unclear: Best cross-platform detection strategy
   - Recommendation: Check common paths, allow user override in settings

2. **Warm-up Strategy**
   - What we know: Pre-warming reduces first-request latency
   - What's unclear: Optimal timing for warm-up (immediate vs lazy)
   - Recommendation: Warm up lazily on first completion request, not activation

3. **Token Usage Surfacing**
   - What we know: Both SDKs return usage statistics
   - What's unclear: Best UX for showing usage to users
   - Recommendation: Defer to later phase, not blocking for foundation

## Sources

### Primary (HIGH confidence)
- [Claude Agent SDK TypeScript Reference](https://platform.claude.com/docs/en/agent-sdk/typescript) - Full API documentation
- [Claude Agent SDK Quickstart](https://platform.claude.com/docs/en/agent-sdk/quickstart) - Setup and prerequisites
- [Anthropic TypeScript SDK GitHub](https://github.com/anthropics/anthropic-sdk-typescript) - API key SDK source
- [VS Code Bundling Extensions](https://code.visualstudio.com/api/working-with-extensions/bundling-extension) - esbuild configuration
- [VS Code Contribution Points](https://code.visualstudio.com/api/references/contribution-points) - Settings schema
- [VS Code Extension Samples - esbuild](https://github.com/microsoft/vscode-extension-samples/tree/main/esbuild-sample) - Reference implementation

### Secondary (MEDIUM confidence)
- [Building VS Code Extensions in 2026](https://abdulkadersafi.com/blog/building-vs-code-extensions-in-2026-the-complete-modern-guide) - Modern patterns
- [Claude Code Timeout Issue #2489](https://github.com/anthropics/claude-code/issues/2489) - 1000ms timeout bug details
- [VS Code Authentication Provider Sample](https://github.com/microsoft/vscode-extension-samples/tree/main/authenticationprovider-sample) - Auth patterns

### Tertiary (LOW confidence)
- Community blog posts on dual authentication patterns - Need validation with official docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Official Anthropic SDKs with recent releases
- Architecture: HIGH - Based on official VS Code patterns and SDK APIs
- Pitfalls: HIGH - Verified with GitHub issues and official documentation
- esbuild config: HIGH - Official VS Code recommendation with samples

**Research date:** 2026-01-20
**Valid until:** 2026-02-20 (30 days - SDKs are actively updated)
