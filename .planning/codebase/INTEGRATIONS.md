# External Integrations

**Analysis Date:** 2026-01-20

## APIs & External Services

**Claude AI (via Claude Code CLI):**
- Purpose: AI-powered code completion and transformation
- SDK/Client: `claude-agent-sdk` >=0.2.2
- Implementation: `sidekick-server/services/claude_client.py`
- Auth: Claude Max subscription (managed by Claude Code CLI, no env vars needed)
- Models supported: haiku (fast), sonnet (balanced), opus (highest quality)
- Model-specific timeouts:
  - haiku: 5 seconds
  - sonnet: 10 seconds
  - opus: 30 seconds

**Integration Pattern:**
```python
# sidekick-server/services/claude_client.py
from claude_agent_sdk import (
    ClaudeAgentOptions,
    query,
    TextBlock,
    AssistantMessage,
)

options = ClaudeAgentOptions(
    system_prompt=system_prompt,
    model=model,          # "haiku", "sonnet", or "opus"
    max_turns=1,          # Single turn, no back-and-forth
    allowed_tools=[],     # No tools needed for completion
)

async for message in query(prompt=prompt, options=options):
    # Process response
```

## Data Storage

**Databases:**
- None - Fully stateless architecture

**File Storage:**
- Local filesystem only
- Log files: `sidekick-server/logs/server-{timestamp}.log`
- Log format: JSON Lines (structured logging)
- Automatic retention: Configurable via `LOG_RETENTION_DAYS` (default: 7)

**Caching:**
- In-memory LRU cache for completions
- Implementation: `sidekick-server/utils/cache.py`
- TTL: `CACHE_TTL_MS` (default: 30000ms / 30 seconds)
- Max size: `CACHE_MAX_SIZE` (default: 100 entries)
- Cache key: language + model + last 500 chars of prefix + first 200 chars of suffix

## Authentication & Identity

**Auth Provider:**
- None (local-only architecture)
- Claude auth handled by Claude Code CLI (pre-authenticated via `claude` command)

**Security:**
- No authentication on API endpoints
- CORS allows all origins (designed for localhost use)
- Rate limiting protects against runaway requests (60 req/min default)

## Monitoring & Observability

**Error Tracking:**
- None (no external service)
- Errors logged to file and console

**Logs:**
- Custom logger: `sidekick-server/utils/logger.py`
- Console output: Human-readable format
- File output: JSON Lines format for machine parsing
- Log location: `sidekick-server/logs/`
- Retention: Automatic cleanup of files older than `LOG_RETENTION_DAYS`

**Metrics:**
- In-memory metrics: `sidekick-server/utils/metrics.py`
- Available via `/health` endpoint:
  - `totalRequests`: Total request count
  - `cacheHits`: Cache hit count
  - `cacheHitRate`: Percentage
  - `avgResponseTimeMs`: Rolling average (last 1000 requests)
  - `requestsByModel`: Breakdown by model
  - `errorCount`: Total errors

## CI/CD & Deployment

**Hosting:**
- Local machine only (not designed for cloud deployment)
- Server runs as local process via `uvicorn`

**CI Pipeline:**
- GitHub Actions: `.github/workflows/ci.yml`
- Triggers: Push/PR to main/master branches
- Jobs:
  1. `server-tests`: Python tests on 3.10, 3.11, 3.12
  2. `extension-tests`: TypeScript lint, compile, test
  3. `build-extension`: Package .vsix artifact

**Artifacts:**
- VSIX package uploaded on successful build
- Retention: 7 days

## Communication Architecture

**VS Code Extension <-> Server:**
- Protocol: HTTP/HTTPS (configurable)
- Default URL: `http://localhost:3456`
- Content-Type: `application/json`

**Endpoints:**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/inline` | POST | Get inline code completion |
| `/transform` | POST | Transform selected code |
| `/health` | GET | Health check with metrics |
| `/docs` | GET | Swagger UI |
| `/redoc` | GET | ReDoc API docs |

**Request Flow:**
```
VS Code Editor
     │
     ▼ (on typing or command)
VS Code Extension (TypeScript)
     │
     ▼ HTTP POST to /inline or /transform
FastAPI Server (Python)
     │
     ├─► Check rate limit
     ├─► Check cache (inline only)
     │
     ▼ If not cached
Claude Agent SDK
     │
     ▼ Subprocess call
Claude Code CLI
     │
     ▼ API call
Anthropic API (via Max subscription)
```

## Environment Configuration

**Required for operation:**
- Claude Code CLI installed: `npm install -g @anthropic-ai/claude-code`
- Claude Max subscription authenticated via CLI

**Optional environment variables:**
```bash
PORT=3456                      # Server port
CACHE_TTL_MS=30000            # Cache TTL
CACHE_MAX_SIZE=100            # Max cache entries
RATE_LIMIT_WINDOW_MS=60000    # Rate limit window
RATE_LIMIT_MAX_REQUESTS=60    # Max requests per window
LOG_RETENTION_DAYS=7          # Log file retention
COMPLETION_TIMEOUT_MS=5000    # Override all model timeouts
```

**Secrets location:**
- No secrets stored in codebase
- Claude auth handled by Claude Code CLI (stored in user's home directory)

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- None

## Error Handling for Integrations

**Claude SDK Errors (handled in `sidekick-server/services/completion.py`):**
- `CLINotFoundError`: Claude Code CLI not installed
- `CLIConnectionError`: Connection to CLI failed
- `ProcessError`: CLI process failed (includes exit_code)
- `CLIJSONDecodeError`: Response parsing failed
- `TimeoutError`: Request exceeded model timeout
- `ClaudeSDKError`: Catch-all for other SDK errors

**HTTP Error Responses:**
- 429 Too Many Requests: Rate limit exceeded (includes `Retry-After` header)
- 200 with `error` field: Application-level errors

---

*Integration audit: 2026-01-20*
