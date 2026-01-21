# Architecture

**Analysis Date:** 2026-01-20

## Pattern Overview

**Overall:** Client-Server with VS Code Extension Frontend

**Key Characteristics:**
- Two-component system: Python FastAPI server + TypeScript VS Code extension
- Server proxies requests to Claude Code CLI via Agent SDK
- Extension provides inline completion UI using VS Code's InlineCompletionItemProvider
- Stateless request handling with optional caching
- Singleton patterns for cross-cutting concerns (logging, metrics, rate limiting, caching)

## Layers

**VS Code Extension (Client):**
- Purpose: Captures code context, displays completions as ghost text, handles user commands
- Location: `sidekick-vscode/src/`
- Contains: Extension activation, inline completion provider, HTTP client, transform command
- Depends on: VS Code API, HTTP module
- Used by: End users via VS Code editor

**FastAPI Server (API Layer):**
- Purpose: Exposes REST endpoints, handles CORS, rate limiting, request routing
- Location: `sidekick-server/main.py`, `sidekick-server/routers/`
- Contains: FastAPI app setup, route handlers, middleware configuration
- Depends on: FastAPI, services layer, utils
- Used by: VS Code extension via HTTP

**Services Layer (Business Logic):**
- Purpose: Core completion/modification logic, prompt construction, response cleaning
- Location: `sidekick-server/services/`
- Contains: `completion.py` (inline completions), `modification.py` (code transforms), `claude_client.py` (SDK wrapper)
- Depends on: Claude Agent SDK, models, utils
- Used by: Routers

**Models Layer (Data Transfer):**
- Purpose: Request/response validation and serialization
- Location: `sidekick-server/models/`
- Contains: Pydantic models for CompletionRequest, ModifyRequest, responses
- Depends on: Pydantic
- Used by: Routers, services

**Utils Layer (Cross-Cutting):**
- Purpose: Shared infrastructure concerns
- Location: `sidekick-server/utils/`
- Contains: Logger, metrics, cache, rate limiter, prompt loading
- Depends on: Python stdlib, config
- Used by: All server layers

## Data Flow

**Inline Completion Flow:**

1. User types code in VS Code
2. Extension debounces (300ms default), extracts prefix/suffix context
3. HTTP POST to `/inline` with code context, language, model preference
4. Router checks rate limit, generates request ID
5. Completion service checks cache
6. On cache miss: loads prompts from markdown, calls Claude Agent SDK
7. SDK executes Claude Code CLI with system/user prompts
8. Response cleaned (markdown fences removed, conversational patterns filtered)
9. Result cached, metrics recorded, response returned
10. Extension displays completion as ghost text

**Transform Flow:**

1. User selects code, triggers transform command (Ctrl+Shift+M)
2. User enters instruction in input box
3. HTTP POST to `/transform` with selected code, instruction, context
4. Router checks rate limit, generates request ID
5. Modification service loads prompts, calls Claude Agent SDK (opus model default)
6. Response cleaned, metrics recorded
7. Extension replaces selection with transformed code

**State Management:**
- Server: Singleton instances for cache, rate limiter, metrics, logger
- Extension: Module-level state for enabled flag, debounce timer, request counter
- No persistent database - all state is in-memory and resets on restart

## Key Abstractions

**CompletionRequest/Response:**
- Purpose: Standardized data contract between extension and server
- Examples: `sidekick-server/models/request.py`, `sidekick-server/models/response.py`
- Pattern: Pydantic BaseModel with Field validators

**ClaudeAgentOptions:**
- Purpose: Configuration for Claude SDK queries
- Examples: `sidekick-server/services/claude_client.py`
- Pattern: SDK-provided configuration object

**Prompt Templates:**
- Purpose: Externalized system/user prompts for LLM
- Examples: `sidekick-server/prompts/system.md`, `sidekick-server/prompts/user.md`
- Pattern: Markdown files with Python format string placeholders

**SidekickInlineCompletionProvider:**
- Purpose: VS Code provider interface implementation
- Examples: `sidekick-vscode/src/extension.ts`
- Pattern: InlineCompletionItemProvider interface with provideInlineCompletionItems

## Entry Points

**VS Code Extension:**
- Location: `sidekick-vscode/src/extension.ts`
- Triggers: VS Code activation event (onStartupFinished)
- Responsibilities: Register completion provider, commands, status bar item

**FastAPI Server:**
- Location: `sidekick-server/main.py`
- Triggers: `python main.py` or `uvicorn main:app`
- Responsibilities: Create FastAPI app, register routes, configure CORS, lifecycle management

**Start Script:**
- Location: `start-server.sh`
- Triggers: Manual execution
- Responsibilities: Virtual environment setup, dependency installation, uvicorn launch

## Error Handling

**Strategy:** Graceful degradation - errors return empty completions, never crash

**Patterns:**
- SDK errors: Typed exceptions (CLINotFoundError, CLIConnectionError, ProcessError, CLIJSONDecodeError)
- All errors logged with request ID for correlation
- Empty completion returned on error (extension shows nothing instead of crashing)
- Rate limiting returns 429 with Retry-After header
- Timeout errors handled per-model (haiku: 5s, sonnet: 10s, opus: 30s)

## Cross-Cutting Concerns

**Logging:**
- Custom Logger class in `sidekick-server/utils/logger.py`
- Dual output: human-readable console + JSON Lines file
- Automatic log rotation (7 days default)
- Structured data with request IDs

**Validation:**
- Pydantic models with Field constraints (max_length, min_length)
- Automatic 422 responses for invalid requests
- Extension-side validation (empty selection check for transform)

**Authentication:**
- No explicit auth - relies on Claude Code CLI being authenticated
- Server binds to localhost by default

**Caching:**
- In-memory LRU cache in `sidekick-server/utils/cache.py`
- Key: language + model + last 500 chars prefix + first 200 chars suffix
- TTL: 30 seconds (configurable via CACHE_TTL_MS)
- Max size: 100 entries (configurable via CACHE_MAX_SIZE)

**Rate Limiting:**
- Sliding window algorithm in `sidekick-server/utils/rate_limiter.py`
- Default: 60 requests per 60 seconds
- Configurable via RATE_LIMIT_WINDOW_MS and RATE_LIMIT_MAX_REQUESTS

---

*Architecture analysis: 2026-01-20*
