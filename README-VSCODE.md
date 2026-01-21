# Sidekick for Max - VS Code Extension

VS Code extension that provides AI-powered inline code completions and transformations using your Claude Max subscription.

## Prerequisites

- **VS Code** v1.85.0 or higher
- **One of the following**:
  - **Claude Max subscription**: Claude Code CLI installed and authenticated (`npm install -g @anthropic-ai/claude-code && claude auth`)
  - **Anthropic API key**: Set via the extension or `ANTHROPIC_API_KEY` environment variable

## Installation

### From Source (Development)

1. Navigate to the extension directory:
   ```bash
   cd sidekick-vscode
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Compile the extension:
   ```bash
   npm run compile
   ```

4. Open the extension in VS Code:
   ```bash
   code .
   ```

5. Press `F5` to launch the Extension Development Host with the extension loaded.

### Building a VSIX Package

To create an installable package:

```bash
cd sidekick-vscode
npm run compile
npx @vscode/vsce package --out dist/
```

Install the generated `.vsix` file via VS Code:
- Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
- Run "Extensions: Install from VSIX..."
- Select the `.vsix` file

## Features

### Inline Completions

Code completions appear automatically as you type. Suggestions display as "ghost text" that you can:

- **Accept**: Press `Tab` to insert the suggestion
- **Dismiss**: Press `Escape` or continue typing

**Manual Trigger:**
- **Keyboard**: `Ctrl+Shift+Space` (Windows/Linux) or `Cmd+Shift+Space` (Mac)
- **Command Palette**: "Sidekick: Trigger Completion"

### Code Transforms

Transform selected code using natural language instructions:

1. Select the code you want to modify
2. Press `Ctrl+Shift+M` (Windows/Linux) or `Cmd+Shift+M` (Mac)
3. Enter your instruction (e.g., "Add error handling", "Convert to async/await")
4. The selection is replaced with the transformed code

### Status Bar Menu

Click "Sidekick" in the bottom-right status bar to open the menu:

- **Enable/Disable** - Toggle inline completions on/off
- **Configure Extension** - Open Sidekick settings
- **View Logs** - Open the output channel for debugging
- **Test Connection** - Verify Claude API connection
- **Set API Key** - Configure an Anthropic API key

The status bar icon shows:
- `$(sparkle) Sidekick [model]` - Enabled (shows current inline model)
- `$(circle-slash) Sidekick` - Disabled
- `$(sync~spin) Sidekick` - Loading/processing
- `$(warning) Sidekick` - Error state

## Configuration

Open VS Code Settings (`Ctrl+,` / `Cmd+,`) and search for "Sidekick", or click the status bar and select "Configure Extension".

| Setting | Default | Description |
|---------|---------|-------------|
| `sidekick.authMode` | `max-subscription` | Authentication: `max-subscription` (Claude Code CLI) or `api-key` |
| `sidekick.enabled` | `true` | Enable/disable inline completions |
| `sidekick.debounceMs` | `1000` | Delay before requesting completion (ms) |
| `sidekick.inlineContextLines` | `30` | Lines of context before/after cursor for inline |
| `sidekick.transformContextLines` | `50` | Lines of context before/after selection for transforms |
| `sidekick.multiline` | `false` | Enable multi-line completions (prose files always use multiline) |
| `sidekick.inlineModel` | `haiku` | Model for inline: `haiku`, `sonnet`, or `opus` |
| `sidekick.transformModel` | `opus` | Model for transforms: `opus`, `sonnet`, or `haiku` |

> **Note:** Prose files (Markdown, plaintext, HTML, XML, LaTeX, etc.) automatically use multiline mode regardless of the setting.

### Example settings.json

```json
{
  "sidekick.authMode": "max-subscription",
  "sidekick.enabled": true,
  "sidekick.debounceMs": 1000,
  "sidekick.inlineContextLines": 30,
  "sidekick.transformContextLines": 50,
  "sidekick.multiline": false,
  "sidekick.inlineModel": "haiku",
  "sidekick.transformModel": "opus"
}
```

### Authentication Modes

**Max Subscription (default):**
- Uses Claude Code CLI for authentication
- Requires: `npm install -g @anthropic-ai/claude-code && claude auth`
- No API costs - uses your Max subscription

**API Key:**
- Uses Anthropic API directly
- Set key via "Sidekick: Set API Key" command or `ANTHROPIC_API_KEY` environment variable
- Standard API pricing applies

### Model Selection

**For Inline Completions:**
- **haiku** (default): Fastest completions, lowest latency. Best for quick suggestions.
- **sonnet**: Balanced speed and quality.
- **opus**: Highest quality. Best for complex code.

**For Transforms:**
- **opus** (default): Highest quality transformations. Best for refactoring.
- **sonnet**: Balanced speed and quality.
- **haiku**: Fastest, lower quality.

## Commands

| Command | Keybinding | Description |
|---------|------------|-------------|
| Sidekick: Show Menu | Click status bar | Open the Sidekick menu |
| Sidekick: Toggle Inline Completions | - | Toggle completions on/off |
| Sidekick: Trigger Completion | `Ctrl+Shift+Space` / `Cmd+Shift+Space` | Manually trigger a completion |
| Sidekick: Transform Selected Code | `Ctrl+Shift+M` / `Cmd+Shift+M` | Transform selected code |
| Sidekick: View Logs | - | Open the output channel |
| Sidekick: Test Connection | - | Verify API connection |
| Sidekick: Set API Key | - | Configure Anthropic API key |

## How It Works

```
+---------------------------------------------------------+
|                    VS Code Editor                       |
+---------------------------------------------------------+
|  User types code                                        |
|       |                                                 |
|       v                                                 |
|  InlineCompletionProvider                               |
|       |                                                 |
|       +---> Debounce (1000ms default)                   |
|       |                                                 |
|       +---> Extract context (prefix + suffix)           |
|       |                                                 |
|       v                                                 |
|  Claude API call (Max subscription or API key)          |
|                                                         |
|  Display ghost text <------------------ Response        |
|       |                                                 |
|       v                                                 |
|  User accepts (Tab) or dismisses (Esc)                  |
+---------------------------------------------------------+
```

1. **Context Capture**: The extension captures code around the cursor (configurable lines before/after)
2. **Debouncing**: Requests are debounced to avoid overwhelming the API during rapid typing
3. **Request Cancellation**: Stale requests are automatically cancelled when new keystrokes arrive
4. **Ghost Text**: Completions appear as ghost text that can be accepted with Tab

## Troubleshooting

### No completions appearing

1. **Test the connection**:
   - Click status bar → "Test Connection"
   - Or run "Sidekick: Test Connection" from Command Palette

2. **Check authentication** (for Max subscription):
   ```bash
   claude auth status
   ```

3. **Verify extension is enabled**:
   - Check status bar shows `$(sparkle) Sidekick`
   - Check Settings: `sidekick.enabled` is `true`

4. **View logs for errors**:
   - Click status bar → "View Logs"
   - Or run "Sidekick: View Logs" from Command Palette
   - Look for error messages or failed requests

### Slow completions

- Reduce `inlineContextLines` to send less context
- Use `haiku` model (fastest)
- Increase `debounceMs` to reduce request frequency

### Authentication errors

**For Max subscription:**
- Re-authenticate: `claude auth`
- Check Claude Max subscription is active
- Ensure Claude Code CLI is installed globally

**For API key:**
- Run "Sidekick: Set API Key" to reconfigure
- Verify key is valid at console.anthropic.com
- Check `ANTHROPIC_API_KEY` environment variable if using that method

## Development

### Watch Mode

Compile automatically on file changes:

```bash
npm run watch
```

### Running Tests

```bash
npm test
```

### Linting

```bash
npm run lint        # Check for issues
npm run lint:fix    # Auto-fix issues
```

## File Structure

```
sidekick-vscode/
├── src/
│   ├── extension.ts                    # Main extension entry point
│   ├── providers/
│   │   └── InlineCompletionProvider.ts # VS Code completion provider
│   ├── services/
│   │   ├── AuthService.ts              # Authentication orchestration
│   │   ├── CompletionService.ts        # Completion logic & caching
│   │   ├── CompletionCache.ts          # LRU cache for completions
│   │   ├── StatusBarManager.ts         # Status bar UI management
│   │   ├── Logger.ts                   # Output channel logging
│   │   └── clients/
│   │       ├── MaxSubscriptionClient.ts # Claude Code CLI integration
│   │       └── ApiKeyClient.ts         # Direct API key client
│   ├── utils/
│   │   └── prompts.ts                  # Prompt templates & response cleaning
│   └── types.ts                        # TypeScript type definitions
├── package.json                        # Extension manifest & configuration
├── tsconfig.json                       # TypeScript configuration
├── esbuild.js                          # Build configuration
└── out/                                # Compiled JavaScript (generated)
```
