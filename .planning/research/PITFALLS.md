# Pitfalls Research: VS Code Extension with AI SDK Integration

**Project:** Sidekick for Max
**Migration:** Python server to TypeScript SDK embedded in VS Code extension
**Researched:** 2026-01-20
**Confidence:** HIGH (verified with official docs and recent GitHub issues)

---

## Critical Pitfalls

Mistakes that cause rewrites, extension host crashes, or major user experience failures.

### Pitfall 1: Blocking the Extension Host with Synchronous Operations

**What goes wrong:** The extension host is single-threaded. Any synchronous operation blocks ALL extensions and the entire VS Code UI. Spawning the Claude CLI synchronously, waiting for responses without async handling, or processing large completions in the main thread freezes the editor.

**Why it happens:** Developers treat VS Code like a regular Node.js application. The extension host architecture means your code shares a thread with other extensions.

**Consequences:**
- "Extension host is unresponsive" dialogs appear
- Users see "Extension host with pid exited with code: 133" crashes
- All extensions become unusable until the blocking operation completes
- VS Code may kill your extension process entirely

**Warning signs:**
- Extension works locally but users report freezes
- Completion requests work but UI becomes unresponsive during slow API calls
- "Extension Host Process exited" errors in production

**Prevention:**
```typescript
// BAD: Synchronous spawn
const result = spawnSync('claude', ['--print', prompt]);

// GOOD: Async spawn with proper stream handling
const child = spawn('claude', ['--print', prompt]);
child.stdout.on('data', (chunk) => {
  // Process incrementally
});
```

**Phase mapping:** Phase 1 - Core SDK integration. Establish async patterns from the start.

**Sources:**
- [VS Code Extension Host Documentation](https://code.visualstudio.com/api/advanced-topics/extension-host)
- [Extension Host Unresponsive Issue #58661](https://github.com/microsoft/vscode/issues/58661)

---

### Pitfall 2: Claude CLI 1000ms Timeout Errors

**What goes wrong:** The Claude Code CLI has an internal 1000ms timeout that causes `Error: Timeout waiting after 1000ms` crashes. This is insufficient under normal network conditions and causes process crashes during promise resolution.

**Why it happens:** The SDK subprocess transport has tight timeouts for initial handshake/startup. Network latency, system load, or keychain access delays can exceed this limit.

**Consequences:**
- Crashes 3-5 times per hour in production
- `node:internal/process/promises` uncaught exception kills the process
- Users must restart VS Code repeatedly

**Warning signs:**
- Intermittent crashes without apparent cause
- Errors mentioning "security find-generic-password" (macOS keychain)
- More failures on slower machines or networks

**Prevention:**
```typescript
// Use the Agent SDK with proper timeout configuration
const options: Options = {
  abortController: new AbortController(),
  // Don't rely on default timeouts
  // Handle the streaming response properly
};

// Set longer subprocess timeouts via environment
process.env.CLAUDE_SUBPROCESS_TIMEOUT_MS = '30000';
```

**Also:**
- Pre-warm the CLI connection during extension activation
- Implement retry logic with exponential backoff
- Handle keychain access failures gracefully

**Phase mapping:** Phase 1 - Core SDK integration. Must be addressed in initial implementation.

**Sources:**
- [Issue #2489: Timeout waiting after 1000ms](https://github.com/anthropics/claude-code/issues/2489)
- [Issue #2460: Frequent timeout errors](https://github.com/anthropics/claude-code/issues/2460)
- [Issue #771: Can't spawn from Node.js](https://github.com/anthropics/claude-code/issues/771)

---

### Pitfall 3: Memory Leaks from Event Listener Mismanagement

**What goes wrong:** Event subscriptions (document changes, cursor moves, configuration changes) that are never unsubscribed leak memory and cause the extension to consume increasing resources over time.

**Why it happens:** Developers attach listeners but forget to remove them, or remove the wrong listener (due to method binding issues). VS Code's Disposable pattern is not intuitive to all developers.

**Consequences:**
- Memory usage grows continuously
- Extension becomes slower over time
- Eventually causes VS Code to crash or become unresponsive

**Warning signs:**
- Memory usage increases after each completion cycle
- Extension performance degrades over multi-hour sessions
- Memory profiler shows detached event listeners

**Prevention:**
```typescript
// BAD: Listener attached, never removed
vscode.workspace.onDidChangeTextDocument(handleChange);

// GOOD: Push to subscriptions for automatic disposal
context.subscriptions.push(
  vscode.workspace.onDidChangeTextDocument(handleChange)
);

// GOOD: For class-based handlers, use DisposableStore
class CompletionProvider implements vscode.Disposable {
  private disposables = new vscode.DisposableStore();

  constructor() {
    this.disposables.add(
      vscode.workspace.onDidChangeTextDocument(this.handleChange.bind(this))
    );
  }

  dispose() {
    this.disposables.dispose();
  }
}
```

**Phase mapping:** Phase 2 - Completion provider implementation. Critical during provider refactoring.

**Sources:**
- [VS Blog: Avoiding Memory Leaks in Extensions](https://devblogs.microsoft.com/visualstudio/avoiding-memory-leaks-in-visual-studio-editor-extensions/)
- [Memory leak fix PR #225334](https://github.com/microsoft/vscode/pull/225334)

---

### Pitfall 4: Cancellation Token Misunderstanding

**What goes wrong:** Developers check `token.isCancellationRequested` at the wrong times or not at all, causing stale completions to appear, wasted API calls, or completion provider hangs.

**Why it happens:** JavaScript is single-threaded - the token won't suddenly become cancelled in the middle of synchronous code. It only updates when you `await` something.

**Consequences:**
- Stale completions appear after user has moved cursor
- API calls continue even after user cancelled
- Completion provider appears to hang

**Warning signs:**
- Completions appear at wrong positions
- Multiple completions "stack up" and appear sequentially
- Completions appear after user has typed more

**Prevention:**
```typescript
async provideInlineCompletionItems(
  document: vscode.TextDocument,
  position: vscode.Position,
  context: vscode.InlineCompletionContext,
  token: vscode.CancellationToken
): Promise<vscode.InlineCompletionItem[] | undefined> {

  // Check BEFORE expensive operations
  if (token.isCancellationRequested) return undefined;

  const completion = await this.fetchFromSDK(prompt);

  // Check AFTER every await
  if (token.isCancellationRequested) return undefined;

  // Only return if still valid
  return [new vscode.InlineCompletionItem(completion)];
}
```

**Phase mapping:** Phase 2 - Completion provider. Essential for the inline completion flow.

**Sources:**
- [Writing a VS Code Completion Provider](https://blog.dendron.so/notes/IThOx1Oag1r0JAglpiDLp/)
- [Inline Completions Architecture](https://deepwiki.com/hekpac/openvscode-server/5.4-inline-completions-and-code-actions)

---

### Pitfall 5: Native Module Bundling Failures

**What goes wrong:** When bundling with esbuild, native `.node` modules (if the SDK uses any) are not handled correctly. They get treated as static assets or the paths resolve incorrectly at runtime.

**Why it happens:** esbuild transforms require() calls and changes paths. Native binaries need to be in specific locations at runtime.

**Consequences:**
- Extension fails to load in production but works in development
- `require_xyz is not a function` errors
- Module resolution errors after packaging

**Warning signs:**
- Extension works with `npm run watch` but not when packaged
- Errors mentioning `.node` files
- "Cannot find module" errors for native dependencies

**Prevention:**
```javascript
// esbuild.config.js
const config = {
  entryPoints: ['./src/extension.ts'],
  bundle: true,
  external: [
    'vscode',
    // Mark native modules as external
    '@anthropic-ai/claude-agent-sdk' // if it has native deps
  ],
  platform: 'node',
  format: 'cjs',
};
```

**Also:**
- Check if the SDK has native dependencies
- Use `--no-dependencies` with vsce if bundling manually
- Test the packaged .vsix before publishing

**Phase mapping:** Phase 3 - Packaging and distribution. Critical before marketplace release.

**Sources:**
- [esbuild native module issue #4154](https://github.com/evanw/esbuild/issues/4154)
- [VS Code Extension Bundling Guide](https://code.visualstudio.com/api/working-with-extensions/bundling-extension)

---

## Moderate Pitfalls

Mistakes that cause delays, degraded UX, or technical debt.

### Pitfall 6: Stdout Buffer Overflow from CLI Output

**What goes wrong:** The Claude CLI can return large responses. If using Node.js `child_process` with default buffer sizes, output gets truncated or the process hangs waiting for buffer space.

**Why it happens:** Default pipe buffers are platform-specific and limited (often 200KB-1MB). Large completions or verbose output can exceed this.

**Consequences:**
- Truncated completions
- Process hangs indefinitely
- Incomplete or corrupted responses

**Prevention:**
```typescript
// BAD: exec with default maxBuffer
const result = await exec('claude --print prompt');

// GOOD: spawn with streaming
const child = spawn('claude', ['--print', prompt]);
let output = '';

child.stdout.on('data', (chunk) => {
  output += chunk.toString();
});

// Or increase maxBuffer for exec
const result = await exec('claude --print prompt', {
  maxBuffer: 10 * 1024 * 1024 // 10MB
});
```

**Phase mapping:** Phase 1 - SDK integration. Affects core completion fetching.

**Sources:**
- [Node.js child_process documentation](https://nodejs.org/api/child_process.html)
- [Buffer truncation issue #19218](https://github.com/nodejs/node/issues/19218)

---

### Pitfall 7: Ghost Text Flickering

**What goes wrong:** Inline completions flicker on/off rapidly, or flash when the same completion is re-served from cache after partial acceptance.

**Why it happens:** Even synchronous providers can have 10-50ms latency causing visual flicker. Caching and re-serving completions doesn't preserve ghost text state properly.

**Consequences:**
- Distracting visual experience
- Users think extension is broken
- Difficult to read/accept completions

**Warning signs:**
- Completions appear and disappear rapidly
- Ghost text flashes after accepting partial completion
- Multiple completions seem to "fight" for display

**Prevention:**
```typescript
// Implement proper caching with position awareness
private cache = new Map<string, {
  completion: string;
  position: vscode.Position;
  timestamp: number;
}>();

// Don't re-trigger if cache is valid for current position
if (this.isCacheValid(document, position)) {
  return this.getCachedCompletion(position);
}

// Add debouncing to reduce re-triggers
private debounceMs = 300;
```

**Phase mapping:** Phase 2 - Completion provider optimization.

**Sources:**
- [Ghost text flickering issue #208152](https://github.com/microsoft/vscode/issues/208152)
- [Ghost text stuck issue #235977](https://github.com/microsoft/vscode/issues/235977)

---

### Pitfall 8: Deactivation Cleanup Failures

**What goes wrong:** Async cleanup in `deactivate()` doesn't complete because VS Code only waits ~4 seconds before killing the extension host.

**Why it happens:** VS Code has a hard timeout on extension shutdown. Complex cleanup (flushing telemetry, closing connections, killing subprocesses) may not finish.

**Consequences:**
- Orphaned child processes
- Lost telemetry data
- Resource leaks across restarts

**Prevention:**
```typescript
export async function deactivate(): Promise<void> {
  // Keep cleanup fast - under 4 seconds total

  // 1. Signal subprocess to stop (don't wait for graceful shutdown)
  childProcess?.kill('SIGTERM');

  // 2. Clear timers synchronously
  if (debounceTimer) clearTimeout(debounceTimer);

  // 3. Only await critical cleanup
  try {
    await Promise.race([
      criticalCleanup(),
      new Promise(resolve => setTimeout(resolve, 2000)) // 2s timeout
    ]);
  } catch {
    // Swallow errors during shutdown
  }
}
```

**Phase mapping:** Phase 1 - Extension lifecycle management.

**Sources:**
- [Extension deactivation issue #122825](https://github.com/microsoft/vscode/issues/122825)
- [VS Code Extension Anatomy](https://code.visualstudio.com/api/get-started/extension-anatomy)

---

### Pitfall 9: Cursor Editor Compatibility Issues

**What goes wrong:** Extension works in VS Code but fails in Cursor, or vice versa. Cursor uses a different extension marketplace and has subtle API differences.

**Why it happens:** Cursor is a VS Code fork but Microsoft has been restricting their extensions from working in non-Microsoft editors. Some APIs behave differently.

**Consequences:**
- Users in Cursor can't use the extension
- Microsoft-only extensions (like some language servers) don't work
- Extension may need separate builds or testing

**Warning signs:**
- Users report "doesn't work in Cursor"
- Extension loads but features don't work
- Marketplace installation fails

**Prevention:**
- Test explicitly in both VS Code and Cursor
- Avoid depending on Microsoft-only extensions
- Use OpenVSX-compatible publishing if targeting Cursor
- Don't use APIs that are VS Code-specific (check docs)

**Phase mapping:** Phase 4 - Testing and compatibility validation.

**Sources:**
- [Cursor Extension Compatibility](https://cursor.com/docs/configuration/extensions)
- [VS Code Marketplace Wars article](https://devclass.com/2025/04/08/vs-code-extension-marketplace-wars-cursor-users-hit-roadblocks/)

---

### Pitfall 10: Activation Event Over-triggering

**What goes wrong:** Extension activates too eagerly (e.g., on `*` or `onStartupFinished`), consuming resources even when not needed.

**Why it happens:** Developers want the extension to "just work" without configuration, so they use broad activation events.

**Consequences:**
- Slows VS Code startup for all users
- Wastes memory when extension isn't being used
- Bad user perception of extension performance

**Current state:** The existing extension uses `onStartupFinished` which is reasonable, but the migration should consider lazy activation for the SDK subprocess.

**Prevention:**
```json
// Good: Activate only when relevant
"activationEvents": [
  "onLanguage:typescript",
  "onLanguage:javascript",
  "onCommand:sidekick.triggerCompletion"
]

// Avoid: Activating for everyone
"activationEvents": ["*"]
```

**Also consider lazy-loading the SDK:**
```typescript
let sdkInstance: ClaudeAgent | undefined;

async function getSDK() {
  if (!sdkInstance) {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    sdkInstance = await initializeSDK();
  }
  return sdkInstance;
}
```

**Phase mapping:** Phase 3 - Performance optimization.

**Sources:**
- [VS Code Activation Events](https://code.visualstudio.com/api/references/activation-events)

---

## Minor Pitfalls

Mistakes that cause annoyance but are fixable without major refactoring.

### Pitfall 11: Missing Request Deduplication

**What goes wrong:** Rapid typing triggers multiple completion requests. Without deduplication, the extension hammers the API and returns stale results.

**Current state:** The existing extension HAS debouncing (300ms default) but the migration needs to preserve this.

**Prevention:**
- Maintain debounce timer
- Track request IDs to ignore stale responses
- Consider request coalescing for rapid changes

**Phase mapping:** Phase 2 - Already implemented, preserve during migration.

---

### Pitfall 12: Configuration Change Handling

**What goes wrong:** User changes settings but extension doesn't pick up changes until restart.

**Prevention:**
```typescript
// Listen for configuration changes
context.subscriptions.push(
  vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('sidekick')) {
      this.reloadConfiguration();
    }
  })
);
```

**Phase mapping:** Phase 2 - Settings integration.

---

### Pitfall 13: Error Message Exposure

**What goes wrong:** Raw SDK errors or stack traces shown to users instead of friendly messages.

**Prevention:**
```typescript
try {
  await fetchCompletion();
} catch (error) {
  // Don't show raw error
  // BAD: vscode.window.showErrorMessage(error.message);

  // GOOD: Map to user-friendly message
  const message = this.mapErrorToUserMessage(error);
  vscode.window.showWarningMessage(message);

  // Log full error for debugging
  console.error('Completion error:', error);
}
```

**Phase mapping:** Phase 2 - Error handling.

---

## Phase-Specific Warnings

| Phase | Topic | Likely Pitfall | Mitigation |
|-------|-------|---------------|------------|
| Phase 1 | SDK Integration | CLI timeout errors (#2) | Pre-warm connection, implement retries |
| Phase 1 | Subprocess management | Buffer overflow (#6) | Use streaming, not buffered reads |
| Phase 1 | Lifecycle | Deactivation failures (#8) | Keep cleanup under 4 seconds |
| Phase 2 | Completion provider | Cancellation token (#4) | Check token after every await |
| Phase 2 | Ghost text | Flickering (#7) | Proper caching with position awareness |
| Phase 2 | Event handling | Memory leaks (#3) | Use DisposableStore pattern |
| Phase 3 | Bundling | Native modules (#5) | Mark externals, test packaged build |
| Phase 3 | Performance | Over-activation (#10) | Lazy-load SDK |
| Phase 4 | Compatibility | Cursor issues (#9) | Test in both editors |

---

## SDK-Specific Considerations

Based on the Claude Agent SDK TypeScript reference:

### AbortController Usage

The SDK accepts an `abortController` in options. Use this to properly cancel requests:

```typescript
const controller = new AbortController();

const query = await import('@anthropic-ai/claude-agent-sdk').then(m =>
  m.query({
    prompt: contextPrompt,
    options: {
      abortController: controller,
      model: 'haiku',
      maxTurns: 1,
      allowedTools: [], // No tools for completions
    }
  })
);

// When user cancels or types more
controller.abort();
```

### Streaming vs Buffered

For inline completions, you likely want the full response before showing. But for transforms, streaming might improve perceived performance:

```typescript
// For transforms - stream and show progress
for await (const message of query) {
  if (message.type === 'stream_event' && includePartialMessages) {
    updateProgress(message);
  }
}
```

### Permission Mode

For headless/embedded use, consider `bypassPermissions` but be aware of security implications:

```typescript
options: {
  permissionMode: 'bypassPermissions',
  allowDangerouslySkipPermissions: true, // Required
  allowedTools: [], // Minimize surface area
}
```

---

## Sources

### Official Documentation (HIGH confidence)
- [VS Code Extension Host](https://code.visualstudio.com/api/advanced-topics/extension-host)
- [VS Code Extension Anatomy](https://code.visualstudio.com/api/get-started/extension-anatomy)
- [VS Code Bundling Extensions](https://code.visualstudio.com/api/working-with-extensions/bundling-extension)
- [Claude Agent SDK TypeScript Reference](https://platform.claude.com/docs/en/agent-sdk/typescript)
- [Node.js child_process](https://nodejs.org/api/child_process.html)

### GitHub Issues (MEDIUM confidence - real-world bugs)
- [claude-code #2489](https://github.com/anthropics/claude-code/issues/2489) - Timeout errors
- [claude-code #771](https://github.com/anthropics/claude-code/issues/771) - Node.js spawn issues
- [vscode #58661](https://github.com/microsoft/vscode/issues/58661) - Extension host unresponsive
- [vscode #208152](https://github.com/microsoft/vscode/issues/208152) - Ghost text flickering
- [esbuild #4154](https://github.com/evanw/esbuild/issues/4154) - Native module bundling

### Community Resources (MEDIUM confidence)
- [VS Blog: Memory Leaks in Extensions](https://devblogs.microsoft.com/visualstudio/avoiding-memory-leaks-in-visual-studio-editor-extensions/)
- [Cursor Extensions Documentation](https://cursor.com/docs/configuration/extensions)
- [AI SDK: Stopping Streams](https://ai-sdk.dev/docs/advanced/stopping-streams)
