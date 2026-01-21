# Coding Conventions

**Analysis Date:** 2026-01-20

## Naming Patterns

**Files:**
- TypeScript: `kebab-case.ts` or `camelCase.ts` (e.g., `extension.ts`, `extension.test.ts`)
- Python: `snake_case.py` (e.g., `completion.py`, `test_completion.py`, `claude_client.py`)
- Test files: `*.test.ts` (TypeScript), `test_*.py` (Python)

**Functions:**
- TypeScript: `camelCase` (e.g., `provideInlineCompletionItems`, `fetchCompletion`, `updateStatusBar`)
- Python: `snake_case` (e.g., `get_completion`, `clean_completion`, `get_log_file_path`)

**Variables:**
- TypeScript: `camelCase` for variables, `UPPER_SNAKE_CASE` for constants
- Python: `snake_case` for variables, `UPPER_SNAKE_CASE` for module-level constants

**Classes:**
- TypeScript: `PascalCase` (e.g., `SidekickInlineCompletionProvider`)
- Python: `PascalCase` (e.g., `CompletionCache`, `RateLimiter`, `Settings`)

**Types/Interfaces:**
- TypeScript: `PascalCase` (e.g., `CompletionResponse`, `TransformResponse`)
- Python (Pydantic): `PascalCase` (e.g., `CompletionRequest`, `HealthResponse`)

## Code Style

**TypeScript (VS Code Extension):**
- Formatter: None explicitly configured
- Linter: ESLint 9.x with `typescript-eslint`
- Config: `sidekick-vscode/eslint.config.js`
- Key rules:
  - `@typescript-eslint/no-unused-vars`: error (allows `_` prefix for unused args)
  - `@typescript-eslint/explicit-function-return-type`: off
  - `@typescript-eslint/no-explicit-any`: warn
- Strict TypeScript: enabled in `tsconfig.json`

**Python (Server):**
- Formatter: None explicitly configured
- Linter: None explicitly configured
- Type hints: Used throughout with `typing` module
- Pydantic v2 for data validation

## Import Organization

**TypeScript (`sidekick-vscode/src/extension.ts`):**
1. VS Code API imports (`import * as vscode from "vscode"`)
2. Node.js built-in modules (`import * as https from "https"`)

**Python (Server files):**
1. Standard library imports (sorted alphabetically)
2. Third-party imports (`fastapi`, `pydantic`, etc.)
3. Local imports (relative within project)

Example from `sidekick-server/services/completion.py`:
```python
import re
import time
from typing import Optional

from models.request import CompletionRequest
from models.response import CompletionResponse
from services.claude_client import (
    get_claude_completion,
    ClaudeSDKError,
    ...
)
from utils.cache import completion_cache
from utils.logger import log
```

**Path Aliases:**
- None configured

## Error Handling

**TypeScript Patterns:**
- Async functions return `undefined` on error (no exceptions thrown to caller)
- Errors logged to console: `console.error("Completion error:", error)`
- User-facing errors shown via `vscode.window.showErrorMessage()` or `showWarningMessage()`
- HTTP errors resolved with error object, never rejected:
```typescript
req.on("error", (error) => {
  resolve({ completion: "", error: error.message });
});
```

**Python Patterns:**
- Custom exception hierarchy re-exported from `claude_agent_sdk`:
  - `ClaudeSDKError` (base)
  - `CLINotFoundError`, `CLIConnectionError`, `ProcessError`, `CLIJSONDecodeError`
- Specific exception handlers for each error type with appropriate logging
- Always return response object with `error` field, never raise to HTTP layer
- Example from `sidekick-server/services/completion.py`:
```python
except CLINotFoundError:
    elapsed = time.time() * 1000 - start_time
    error_msg = "Claude Code CLI not found..."
    log.error("CLI not found", {"requestId": request_id, "elapsed": elapsed})
    return CompletionResponse(completion="", error=error_msg, requestId=request_id)
```

## Logging

**TypeScript Framework:** `console` (built-in)
- `console.log()` for info
- `console.error()` for errors
- `console.debug()` for debug info

**Python Framework:** Custom `Logger` class in `sidekick-server/utils/logger.py`
- Singleton instance: `log`
- Methods: `log.info()`, `log.debug()`, `log.error()`
- Structured logging with JSON data parameter:
```python
log.info("Processing completion request", {
    "requestId": request_id,
    "language": language,
    "filename": filename,
    "model": model,
})
```
- Writes to both console (human-readable) and file (JSON Lines format)
- Log files: `sidekick-server/logs/server-{timestamp}.log`
- Automatic cleanup of old logs (configurable retention)

## Comments

**When to Comment:**
- Module-level docstrings for all Python files
- JSDoc for TypeScript module header and public functions
- Inline comments for non-obvious logic

**Docstring Style:**

TypeScript (JSDoc):
```typescript
/**
 * Activates the extension.
 *
 * @param context - The extension context provided by VS Code
 */
export function activate(context: vscode.ExtensionContext) {
```

Python (Google-style docstrings):
```python
def clean_completion(text: str, max_length: int) -> tuple[str, Optional[str]]:
    """
    Clean up the completion response.

    Args:
        text: Raw completion text from Claude
        max_length: Maximum allowed length

    Returns:
        Tuple of (cleaned text, filter reason if filtered)
    """
```

## Function Design

**Size:**
- Keep functions focused on single responsibility
- Typical length: 10-50 lines

**Parameters:**
- Use typed parameters throughout
- Use default values for optional parameters
- Python: Use Pydantic `Field()` with descriptions for API models

**Return Values:**
- TypeScript: Return `undefined` instead of `null` for missing values
- Python: Return typed response objects (Pydantic models)
- Always include `requestId` in API responses for tracing

## Module Design

**Exports:**
- TypeScript: Export via ES modules (`export function`, `export class`)
- Python: Use `__all__` for explicit public API in `sidekick-server/services/claude_client.py`

**Singletons:**
- Python uses module-level singleton instances:
  - `log = Logger()` in `utils/logger.py`
  - `completion_cache = CompletionCache()` in `utils/cache.py`
  - `rate_limiter = RateLimiter()` in `utils/rate_limiter.py`
  - `metrics = Metrics()` in `utils/metrics.py`
  - `settings = Settings()` in `config.py`

**Module Structure (Python Server):**
```
sidekick-server/
├── main.py              # FastAPI app entry point
├── config.py            # Settings via pydantic-settings
├── models/              # Pydantic request/response models
├── routers/             # FastAPI route handlers
├── services/            # Business logic
└── utils/               # Shared utilities (cache, logger, etc.)
```

## Pydantic Model Conventions

**Request Models:**
- Use `Field()` with constraints and descriptions
- Use `Literal` for enum-like fields
- Example from `sidekick-server/models/request.py`:
```python
class CompletionRequest(BaseModel):
    prefix: str = Field(..., max_length=50000, description="Code before cursor")
    model: Literal["haiku", "sonnet"] = Field(default="haiku", description="Model to use")
    multiline: bool = Field(default=False, description="Enable multi-line mode")
```

**Response Models:**
- Always include optional `error` and `requestId` fields
- Use `default_factory` for mutable defaults

## Configuration Patterns

**Environment Variables:**
- Python: Read via `pydantic-settings` with defaults in `config.py`
- Also support direct `os.environ.get()` with defaults in utility modules
- Variable names: `UPPER_SNAKE_CASE` (e.g., `CACHE_TTL_MS`, `LOG_RETENTION_DAYS`)

**VS Code Extension:**
- Settings via `vscode.workspace.getConfiguration("sidekick")`
- All settings defined in `package.json` under `contributes.configuration`

---

*Convention analysis: 2026-01-20*
