# Phase 3: Transforms + UX - Research

**Researched:** 2026-01-21
**Domain:** VS Code code transforms, StatusBarItem API, connection state tracking, Cursor IDE compatibility
**Confidence:** HIGH

## Summary

Phase 3 implements two major features: (1) code transformation via a command that replaces selected text with AI-modified code, and (2) enhanced status bar UX showing connection state, loading indicators, and error states.

The transform command already exists in a basic HTTP form in `extension.ts`. The work involves migrating it to use AuthService (like completions in Phase 2), adding proper prompt templates, and improving error handling. The status bar needs enhancement from its current simple toggle state to show connection status, loading spinners during API calls, error states, and the current model.

For Cursor IDE compatibility, no special modifications are needed. Cursor is a VS Code fork that supports the standard extension APIs. The extension should work out of the box since it uses only standard VS Code APIs (StatusBarItem, commands, TextEditor.edit, window.showInputBox).

**Primary recommendation:** Create a TransformService similar to CompletionService that handles transform prompts and API calls. Create a StatusBarManager class that centralizes status bar state management and exposes methods for showing loading, connected, disconnected, and error states.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vscode.window.createStatusBarItem | 1.85+ | Status bar display | Official VS Code API |
| vscode.TextEditor.edit | 1.85+ | Text replacement | Official VS Code API |
| vscode.window.showInputBox | 1.85+ | User instruction input | Official VS Code API |
| vscode.ThemeColor | 1.85+ | Theme-aware colors | Official VS Code API |
| AuthService (Phase 1) | - | Claude API access | Already built |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| EventEmitter (vscode) | native | State change notifications | Notifying components of status changes |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| StatusBarItem for loading | window.withProgress | withProgress is modal/notification-based, status bar is more subtle |
| Manual state tracking | VS Code globalState | globalState is for persistence, not runtime state |
| Custom icons | Built-in Codicons | Codicons are consistent with VS Code theme |

**Installation:**
```bash
# No new dependencies needed - Phase 1/2 installed everything
```

## Architecture Patterns

### Recommended Project Structure
```
sidekick-vscode/
  src/
    services/
      AuthService.ts         # From Phase 1
      CompletionService.ts   # From Phase 2
      TransformService.ts    # NEW: Transform API calls and prompts
      StatusBarManager.ts    # NEW: Centralized status bar management
    providers/
      InlineCompletionProvider.ts  # From Phase 2
    utils/
      prompts.ts             # Extended with transform prompts
    types.ts                 # Extended with transform/status types
    extension.ts             # Updated to use StatusBarManager
```

### Pattern 1: StatusBarManager for Centralized State
**What:** Single class managing status bar item state and updates
**When to use:** All status bar updates go through this manager
**Example:**
```typescript
// Source: VS Code API docs + best practices

import * as vscode from 'vscode';

export type ConnectionState = 'connected' | 'disconnected' | 'loading' | 'error';

export class StatusBarManager implements vscode.Disposable {
  private statusBarItem: vscode.StatusBarItem;
  private state: ConnectionState = 'disconnected';
  private currentModel: string = 'haiku';
  private errorMessage: string | undefined;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.command = 'sidekick.toggle';
    this.update();
    this.statusBarItem.show();
  }

  setConnected(): void {
    this.state = 'connected';
    this.errorMessage = undefined;
    this.update();
  }

  setDisconnected(): void {
    this.state = 'disconnected';
    this.errorMessage = undefined;
    this.update();
  }

  setLoading(operation?: string): void {
    this.state = 'loading';
    this.errorMessage = undefined;
    this.update(operation);
  }

  setError(message: string): void {
    this.state = 'error';
    this.errorMessage = message;
    this.update();
  }

  setModel(model: string): void {
    this.currentModel = model;
    this.update();
  }

  private update(operation?: string): void {
    switch (this.state) {
      case 'loading':
        this.statusBarItem.text = `$(sync~spin) Sidekick`;
        this.statusBarItem.tooltip = operation
          ? `Sidekick: ${operation}...`
          : 'Sidekick: Working...';
        this.statusBarItem.backgroundColor = undefined;
        break;
      case 'error':
        this.statusBarItem.text = `$(error) Sidekick`;
        this.statusBarItem.tooltip = `Sidekick Error: ${this.errorMessage}`;
        this.statusBarItem.backgroundColor = new vscode.ThemeColor(
          'statusBarItem.errorBackground'
        );
        break;
      case 'connected':
        this.statusBarItem.text = `$(sparkle) Sidekick`;
        this.statusBarItem.tooltip = `Sidekick: Connected (${this.currentModel})`;
        this.statusBarItem.backgroundColor = undefined;
        break;
      case 'disconnected':
      default:
        this.statusBarItem.text = `$(circle-slash) Sidekick`;
        this.statusBarItem.tooltip = 'Sidekick: Disconnected (click to toggle)';
        this.statusBarItem.backgroundColor = undefined;
        break;
    }
  }

  dispose(): void {
    this.statusBarItem.dispose();
  }
}
```

### Pattern 2: Transform Command with TextEditor.edit
**What:** Command that replaces selected text with transformed result
**When to use:** User invokes transform via command palette or keybinding
**Example:**
```typescript
// Source: VS Code API docs + existing extension.ts pattern

async function transformCommand(
  authService: AuthService,
  statusBar: StatusBarManager
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.selection.isEmpty) {
    vscode.window.showWarningMessage('Select code to transform first');
    return;
  }

  const instruction = await vscode.window.showInputBox({
    prompt: 'How should this code be transformed?',
    placeHolder: 'e.g., Add error handling, Convert to async/await, Add types',
  });

  if (!instruction) {
    return; // User cancelled
  }

  const selectedText = editor.document.getText(editor.selection);
  const language = editor.document.languageId;
  const config = vscode.workspace.getConfiguration('sidekick');
  const model = config.get<string>('transformModel') ?? 'opus';

  statusBar.setLoading('Transforming');

  try {
    const prompt = buildTransformPrompt(selectedText, instruction, language);
    const result = await authService.complete(prompt, {
      model,
      maxTokens: 4096,
      timeout: 60000, // Transforms can take longer
    });

    const cleanedResult = cleanTransformResponse(result);

    if (!cleanedResult) {
      vscode.window.showWarningMessage('No transformation returned');
      statusBar.setConnected();
      return;
    }

    // Replace selection atomically
    const success = await editor.edit((editBuilder) => {
      editBuilder.replace(editor.selection, cleanedResult);
    });

    if (success) {
      statusBar.setConnected();
    } else {
      statusBar.setError('Failed to apply edit');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    statusBar.setError(message);
    vscode.window.showErrorMessage(`Transform failed: ${message}`);
  }
}
```

### Pattern 3: Transform Prompt Template
**What:** System and user prompts for code transformation
**When to use:** Building prompts for transform API calls
**Example:**
```typescript
// Source: Best practices for code transformation prompts

export function getTransformSystemPrompt(): string {
  return `You are a code transformation assistant. Transform the provided code according to the user's instruction.

RULES:
- Output ONLY the transformed code
- Preserve the code's functionality unless the instruction changes it
- Maintain the same programming language
- Keep the same indentation style
- NO explanations before or after the code
- NO markdown code blocks
- If the instruction is unclear, make a reasonable interpretation`;
}

export function getTransformUserPrompt(
  code: string,
  instruction: string,
  language: string,
  prefix?: string,
  suffix?: string
): string {
  let prompt = `Language: ${language}\n\n`;

  if (prefix) {
    prompt += `Context before:\n${prefix}\n\n`;
  }

  prompt += `Code to transform:\n${code}\n\n`;

  if (suffix) {
    prompt += `Context after:\n${suffix}\n\n`;
  }

  prompt += `Instruction: ${instruction}\n\nTransformed code:`;
  return prompt;
}

export function cleanTransformResponse(text: string): string | undefined {
  // Remove markdown code blocks if present
  let cleaned = text
    .replace(/^```[\w]*\n?/, '')
    .replace(/\n?```$/, '')
    .trim();

  // Check for conversational prefixes
  const conversationalPrefixes = [
    /^here('s| is)/i,
    /^the transformed/i,
    /^i('ve| have)/i,
  ];

  for (const pattern of conversationalPrefixes) {
    if (pattern.test(cleaned)) {
      // Try to extract code after the prefix
      const lines = cleaned.split('\n');
      if (lines.length > 1) {
        cleaned = lines.slice(1).join('\n').trim();
      } else {
        return undefined;
      }
    }
  }

  return cleaned || undefined;
}
```

### Pattern 4: Status Bar Icons Reference
**What:** Available icons for status indication
**When to use:** Choosing icons for status bar states
**Reference:**
```typescript
// Source: VS Code Product Icon Reference

// Status indicators
'$(check)'           // Success/connected
'$(error)'           // Error state
'$(warning)'         // Warning state
'$(info)'            // Information

// Activity/loading (supports ~spin animation)
'$(sync~spin)'       // Spinning sync icon (recommended for loading)
'$(loading~spin)'    // Spinning loading icon
'$(gear~spin)'       // Spinning gear icon

// Connection state
'$(plug)'            // Connected/plugin
'$(circle-slash)'    // Disconnected/disabled
'$(debug-disconnect)'// Disconnected

// Extension-specific (used by Sidekick)
'$(sparkle)'         // AI/magic indicator (enabled)
'$(zap)'             // Quick action

// Example usage in StatusBarItem.text:
statusBarItem.text = '$(sync~spin) Loading...';
statusBarItem.text = '$(check) Connected';
statusBarItem.text = '$(error) Error';
```

### Pattern 5: Error Background Color
**What:** Using ThemeColor for error/warning status bar backgrounds
**When to use:** Highlighting critical states
**Example:**
```typescript
// Source: VS Code Theme Color Reference

// Only these background colors are supported for StatusBarItem:
statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');

// To clear the background:
statusBarItem.backgroundColor = undefined;

// Note: VS Code automatically sets appropriate foreground color when
// error/warning background is used to ensure readability
```

### Anti-Patterns to Avoid
- **Multiple StatusBarItems:** Use one item with state changes, not multiple items
- **Frequent status bar updates:** Batch updates, avoid updating on every keystroke
- **Hardcoded colors:** Use ThemeColor for theme-aware styling
- **Long tooltips:** Keep tooltips concise and actionable
- **Error background for warnings:** Reserve error background for actual errors
- **Not clearing loading state:** Always transition out of loading state (success or error)

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Loading spinner | Custom CSS animation | `$(sync~spin)` icon | Built-in animation, theme-aware |
| Error indicator | Custom red color | `statusBarItem.errorBackground` ThemeColor | Theme-aware, accessible |
| User input dialog | Custom webview | `window.showInputBox` | Native VS Code UX |
| Progress notification | Custom overlay | `window.withProgress` | For blocking operations |
| Text replacement | Manual edit tracking | `TextEditor.edit` with editBuilder | Atomic, undo-friendly |

**Key insight:** VS Code provides all the primitives needed for status indication and text manipulation. The StatusBarItem API with Codicons and ThemeColor covers all status visualization needs without custom styling.

## Common Pitfalls

### Pitfall 1: Status Bar Not Updating During Async Operations
**What goes wrong:** Status bar shows stale state during long operations
**Why it happens:** Forgetting to set loading state before async call
**How to avoid:**
```typescript
// Always set loading BEFORE the async operation
statusBar.setLoading('Transforming');
try {
  const result = await authService.complete(prompt, options);
  statusBar.setConnected();
} catch (error) {
  statusBar.setError(error.message);
}
```
**Warning signs:** Status bar appears frozen during API calls

### Pitfall 2: Error State Persists After Recovery
**What goes wrong:** Error background stays visible after successful operation
**Why it happens:** Not clearing error state on success
**How to avoid:**
```typescript
// Always clear error state in success path
statusBar.setConnected(); // This clears backgroundColor
```
**Warning signs:** Red error background visible when extension is working fine

### Pitfall 3: Selection Changed During Transform
**What goes wrong:** Transform applies to wrong text or fails
**Why it happens:** User or other extension modified selection during API call
**How to avoid:**
```typescript
// Capture selection at start, verify before edit
const originalSelection = editor.selection;
const originalText = editor.document.getText(originalSelection);

// After API call, verify selection still valid
if (!editor.selection.isEqual(originalSelection)) {
  vscode.window.showWarningMessage('Selection changed. Transform cancelled.');
  return;
}
```
**Warning signs:** Transformed code appears in wrong location

### Pitfall 4: TextEditor.edit Returns False
**What goes wrong:** Edit silently fails, user sees no change
**Why it happens:** Document was modified concurrently, or editor closed
**How to avoid:**
```typescript
const success = await editor.edit((editBuilder) => {
  editBuilder.replace(selection, newText);
});

if (!success) {
  vscode.window.showErrorMessage('Failed to apply transformation. Please try again.');
  statusBar.setError('Edit failed');
}
```
**Warning signs:** Transform completes but text unchanged

### Pitfall 5: Transform Prompt Includes Explanation
**What goes wrong:** Claude returns "Here's the transformed code: ..." instead of just code
**Why it happens:** Prompt not explicit enough about output format
**How to avoid:**
1. System prompt says "Output ONLY the transformed code"
2. Clean response removes conversational prefixes
3. Use longer maxTokens to allow complete code output
**Warning signs:** Transformed code starts with "Here", "The", "I", etc.

### Pitfall 6: Cursor IDE Extension Not Loading
**What goes wrong:** Extension fails to activate in Cursor
**Why it happens:** Using APIs not available in Cursor or OpenVSX restrictions
**How to avoid:**
- Use only standard VS Code APIs (which we do)
- Avoid Microsoft-specific extensions as dependencies
- Test in Cursor during development
**Warning signs:** Extension works in VS Code but not Cursor

## Code Examples

Verified patterns from official sources:

### Complete Transform Command Registration
```typescript
// Source: VS Code API + existing extension.ts

context.subscriptions.push(
  vscode.commands.registerCommand('sidekick.transform', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) {
      vscode.window.showWarningMessage('Select code to transform first');
      return;
    }

    const instruction = await vscode.window.showInputBox({
      prompt: 'How should this code be transformed?',
      placeHolder: 'e.g., Add error handling, Convert to async/await',
      ignoreFocusOut: true, // Keep open when focus leaves
    });

    if (!instruction) {
      return;
    }

    // Get context around selection
    const config = vscode.workspace.getConfiguration('sidekick');
    const contextLines = config.get<number>('transformContextLines') ?? 50;
    const model = config.get<string>('transformModel') ?? 'opus';

    const selection = editor.selection;
    const selectedText = editor.document.getText(selection);
    const language = editor.document.languageId;

    // Get prefix (lines before selection)
    const prefixStart = Math.max(0, selection.start.line - contextLines);
    const prefixRange = new vscode.Range(
      new vscode.Position(prefixStart, 0),
      selection.start
    );
    const prefix = editor.document.getText(prefixRange);

    // Get suffix (lines after selection)
    const suffixEnd = Math.min(
      editor.document.lineCount - 1,
      selection.end.line + contextLines
    );
    const suffixRange = new vscode.Range(
      selection.end,
      new vscode.Position(suffixEnd, editor.document.lineAt(suffixEnd).text.length)
    );
    const suffix = editor.document.getText(suffixRange);

    statusBarManager.setLoading('Transforming');

    try {
      const prompt = getTransformSystemPrompt() + '\n\n' +
        getTransformUserPrompt(selectedText, instruction, language, prefix, suffix);

      const result = await authService.complete(prompt, {
        model,
        maxTokens: 4096,
        timeout: 60000,
      });

      const cleaned = cleanTransformResponse(result);
      if (!cleaned) {
        vscode.window.showWarningMessage('No transformation returned');
        statusBarManager.setConnected();
        return;
      }

      const success = await editor.edit((editBuilder) => {
        editBuilder.replace(selection, cleaned);
      });

      if (success) {
        statusBarManager.setConnected();
      } else {
        statusBarManager.setError('Edit failed');
        vscode.window.showErrorMessage('Failed to apply transformation');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      statusBarManager.setError(message);
      vscode.window.showErrorMessage(`Transform failed: ${message}`);
    }
  })
);
```

### StatusBarItem with All States
```typescript
// Source: VS Code API documentation

// Create with alignment and priority
const statusBarItem = vscode.window.createStatusBarItem(
  vscode.StatusBarAlignment.Right,
  100 // Higher = more to the left on the right side
);

// Connected state
statusBarItem.text = '$(sparkle) Sidekick';
statusBarItem.tooltip = 'Sidekick: Connected (haiku)';
statusBarItem.backgroundColor = undefined;
statusBarItem.command = 'sidekick.toggle';

// Loading state
statusBarItem.text = '$(sync~spin) Sidekick';
statusBarItem.tooltip = 'Sidekick: Transforming...';
statusBarItem.backgroundColor = undefined;

// Error state
statusBarItem.text = '$(error) Sidekick';
statusBarItem.tooltip = 'Sidekick Error: Connection failed';
statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');

// Disabled state
statusBarItem.text = '$(circle-slash) Sidekick';
statusBarItem.tooltip = 'Sidekick: Disabled (click to enable)';
statusBarItem.backgroundColor = undefined;

// Always show and add to subscriptions
statusBarItem.show();
context.subscriptions.push(statusBarItem);
```

### InputBox with Validation
```typescript
// Source: VS Code API documentation

const instruction = await vscode.window.showInputBox({
  prompt: 'How should this code be transformed?',
  placeHolder: 'e.g., Add error handling, Convert to async/await',
  ignoreFocusOut: true,
  validateInput: (value) => {
    if (!value || value.trim().length < 3) {
      return 'Please enter a more specific instruction';
    }
    return undefined; // Valid
  },
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| HTTP to Python server | Direct AuthService SDK calls | Phase 3 | Eliminates server dependency |
| Simple on/off status | Multi-state status bar | Phase 3 | Better user feedback |
| No loading indicator | Spinning icon during calls | Phase 3 | User knows operation in progress |
| No error display | Error background + tooltip | Phase 3 | Clear error communication |

**Deprecated/outdated:**
- `serverUrl` setting for transforms - Will be removed in Phase 4
- HTTP `fetchTransform` function - Replaced with AuthService
- Simple toggle-only status bar - Enhanced with connection states

## Cursor IDE Compatibility

### Compatibility Assessment: HIGH

Cursor is a VS Code fork maintaining API compatibility with standard VS Code extensions. Based on research:

**What works in Cursor:**
- Standard VS Code extension APIs (StatusBarItem, commands, TextEditor)
- Built-in Codicon icons ($(sparkle), $(sync~spin), etc.)
- ThemeColor for status bar backgrounds
- window.showInputBox and other UI APIs
- InlineCompletionItemProvider (from Phase 2)

**Known limitations:**
- Some Microsoft-proprietary extensions (C# Dev Kit, Live Share) don't work
- Extension verification may delay availability on Cursor marketplace
- Cursor uses OpenVSX-compatible registry, not VS Code Marketplace directly

**Recommendation:**
- No special modifications needed for Cursor compatibility
- Extension uses only standard APIs
- Test in both VS Code and Cursor during development
- Consider publishing to both VS Code Marketplace and OpenVSX

### UX-05 Implementation

The requirement "Extension works in Cursor IDE without modification" is satisfied by:
1. Using only standard VS Code APIs (no Microsoft-proprietary extensions)
2. No filesystem paths specific to VS Code
3. No dependencies on Marketplace-only packages
4. Standard activation events (onStartupFinished)

## Open Questions

Things that couldn't be fully resolved:

1. **Status Bar Priority Value**
   - What we know: Higher values = more to the left (right-aligned), more to the right (left-aligned)
   - What's unclear: What's a good default priority to not conflict with other extensions?
   - Recommendation: Use 100 (current value), document as configurable if issues arise

2. **Connection Status Detection**
   - What we know: Can test connection via AuthService.testConnection()
   - What's unclear: Should we periodically check connection? On what events?
   - Recommendation: Check on first API call, update on success/failure, provide manual "Test Connection" command

3. **Transform Timeout Duration**
   - What we know: Transforms can take longer than completions
   - What's unclear: What's optimal timeout for Opus model on complex transforms?
   - Recommendation: Default 60s (configurable), show loading spinner with operation name

4. **Error State Auto-Clear**
   - What we know: Error state should eventually clear
   - What's unclear: Should it auto-clear after N seconds or on next successful operation?
   - Recommendation: Clear on next successful operation (completion or transform)

## Sources

### Primary (HIGH confidence)
- [VS Code StatusBarItem API](https://code.visualstudio.com/api/references/vscode-api) - StatusBarItem, ThemeColor, alignment
- [VS Code Status Bar UX Guidelines](https://code.visualstudio.com/api/ux-guidelines/status-bar) - Best practices, loading patterns
- [VS Code Product Icon Reference](https://code.visualstudio.com/api/references/icons-in-labels) - Available icons, spin animation
- [VS Code Theme Color Reference](https://code.visualstudio.com/api/references/theme-color) - statusBarItem.errorBackground, warningBackground
- Existing `extension.ts` - Current transform implementation to migrate

### Secondary (MEDIUM confidence)
- [Cursor Extensions Documentation](https://cursor.com/docs/configuration/extensions) - Cursor compatibility information
- [VS Code Extension Samples](https://github.com/microsoft/vscode-extension-samples) - Official patterns
- [Cursor vs VS Code Comparison](https://graphite.com/guides/cursor-vs-vscode-comparison) - Compatibility details

### Tertiary (LOW confidence)
- [VS Code AI Extensibility Guide](https://code.visualstudio.com/api/extension-guides/ai/ai-extensibility-overview) - Future AI API patterns (not used in this phase)
- Community blog posts on VS Code extension state management

## Metadata

**Confidence breakdown:**
- StatusBarItem API: HIGH - Official docs, well-documented
- Transform pattern: HIGH - Existing implementation to migrate, standard APIs
- Cursor compatibility: HIGH - Multiple sources confirm VS Code fork compatibility
- Prompt templates: MEDIUM - Best practices, but model-specific tuning may be needed
- Connection state tracking: MEDIUM - Pattern clear, optimal strategy needs validation

**Research date:** 2026-01-21
**Valid until:** 2026-02-21 (30 days - VS Code API is stable)
