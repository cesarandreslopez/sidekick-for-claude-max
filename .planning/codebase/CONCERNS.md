# Codebase Concerns

**Analysis Date:** 2026-01-20

## Tech Debt

**Duplicated Error Handling in Services:**
- Issue: `sidekick-server/services/completion.py` and `sidekick-server/services/modification.py` have nearly identical error handling code blocks (~80 lines each) for handling Claude SDK exceptions
- Files: `sidekick-server/services/completion.py` (lines 168-265), `sidekick-server/services/modification.py` (lines 114-211)
- Impact: Maintenance burden; bug fixes must be applied to both files
- Fix approach: Extract error handling into a shared decorator or utility function in `sidekick-server/utils/`

**Unpinned Dependencies:**
- Issue: `sidekick-server/requirements.txt` has no version pins for any dependency
- Files: `sidekick-server/requirements.txt`
- Impact: Builds may break unexpectedly when dependencies update; security vulnerabilities may be introduced
- Fix approach: Pin all dependencies with exact versions (e.g., `fastapi==0.109.0`) and use a tool like `pip-compile` to manage updates

**Deprecated max_tokens Parameter:**
- Issue: `max_tokens` parameter is accepted but ignored with only a debug log warning
- Files: `sidekick-server/models/request.py` (line 18-20), `sidekick-server/services/completion.py` (lines 102-107)
- Impact: Users may expect this parameter to work; silent failure leads to confusion
- Fix approach: Either implement the feature or remove the parameter and return a validation error

**Missing Type Hints in Tests:**
- Issue: Python test files lack complete type annotations
- Files: `sidekick-server/tests/*.py`
- Impact: Reduced IDE support and potential type-related bugs
- Fix approach: Add type annotations to test functions and fixtures

## Known Bugs

**None detected via static analysis.**

## Security Considerations

**CORS Wildcard Configuration:**
- Risk: Server allows requests from any origin with `allow_origins=["*"]`
- Files: `sidekick-server/main.py` (line 93)
- Current mitigation: Server binds to localhost by default
- Recommendations: Consider restricting to specific origins or adding authentication if network exposure is needed

**No Request Authentication:**
- Risk: Any process on localhost can send requests to the server
- Files: `sidekick-server/routers/completion.py`
- Current mitigation: Server only listens on localhost; rate limiting exists
- Recommendations: Add optional API key authentication for users who expose the server to networks

**Log Files Contain Code Context:**
- Risk: Sensitive code snippets may be logged to disk
- Files: `sidekick-server/utils/logger.py`, log entries include `prefixLength`, `suffixLength`, and truncated completions
- Current mitigation: Logs directory has default OS permissions; retention is 7 days
- Recommendations: Consider adding a config option to disable code logging; ensure log directory permissions are restrictive

**Potential Information Disclosure via Error Messages:**
- Risk: Detailed error messages (including exit codes, exception details) are returned to clients
- Files: `sidekick-server/services/completion.py` (lines 180-265), `sidekick-server/services/modification.py` (lines 126-211)
- Current mitigation: Only impacts localhost clients
- Recommendations: Add a production mode that sanitizes error messages

## Performance Bottlenecks

**Linear Cache Eviction:**
- Problem: Cache eviction scans all entries to find oldest item
- Files: `sidekick-server/utils/cache.py` (lines 95-105, `_find_oldest_entry` method)
- Cause: Uses dict iteration instead of a proper LRU data structure
- Improvement path: Replace with `collections.OrderedDict` or `functools.lru_cache` pattern

**Rate Limiter List Operations:**
- Problem: Rate limiter filters entire request list on every check
- Files: `sidekick-server/utils/rate_limiter.py` (line 48)
- Cause: List comprehension to remove old timestamps on every request
- Improvement path: Use `collections.deque` with maxlen or maintain sorted timestamps with binary search

**No Response Streaming:**
- Problem: Server waits for full Claude response before returning
- Files: `sidekick-server/services/claude_client.py` (lines 88-95)
- Cause: Accumulates all text blocks before returning
- Improvement path: Implement Server-Sent Events (SSE) for streaming completions

## Fragile Areas

**Conversational Pattern Filtering:**
- Files: `sidekick-server/services/completion.py` (lines 23-32, `CONVERSATIONAL_PATTERNS`)
- Why fragile: Regex patterns may match valid code (e.g., a comment containing "however" or variable named `let_me_explain`)
- Safe modification: Add comprehensive test cases before modifying patterns
- Test coverage: Partial - `sidekick-server/tests/test_completion.py` tests some patterns

**VS Code Extension Single File Architecture:**
- Files: `sidekick-vscode/src/extension.ts` (502 lines)
- Why fragile: All functionality in one file; HTTP client, provider, status bar management, and commands are tightly coupled
- Safe modification: Consider extracting into separate modules: `client.ts`, `provider.ts`, `commands.ts`
- Test coverage: Limited - tests only cover isolated logic, not integration

**Cache Key Generation:**
- Files: `sidekick-server/utils/cache.py` (lines 44-53, `_hash_key` method)
- Why fragile: Uses string concatenation with colons as delimiters; could have collisions if content contains colons
- Safe modification: Use proper hashing (e.g., `hashlib.sha256`) or JSON serialization
- Test coverage: Good - `sidekick-server/tests/test_cache.py` covers basic scenarios

## Scaling Limits

**In-Memory Cache:**
- Current capacity: 100 entries (configurable)
- Limit: Memory scales with cache size and code context size (~50KB per entry max)
- Scaling path: Consider Redis or disk-based cache for larger deployments

**In-Memory Rate Limiter:**
- Current capacity: Tracks all requests within window (60 by default)
- Limit: Single-process only; no sharing between instances
- Scaling path: Use Redis for distributed rate limiting

**Single Worker:**
- Current capacity: One uvicorn worker (async)
- Limit: CPU-bound operations block the event loop
- Scaling path: Add `--workers N` to uvicorn for multi-process; already using async

## Dependencies at Risk

**claude-agent-sdk:**
- Risk: Relatively new package; API may change; pinned version unknown
- Impact: Breaking changes could disable all completions
- Migration plan: Abstract SDK usage behind an interface in `sidekick-server/services/claude_client.py`

**pydantic-settings:**
- Risk: v2 migration issues; no version pin
- Impact: Breaking changes in config loading
- Migration plan: Pin version; abstract settings access

## Missing Critical Features

**No Health Check for Claude CLI:**
- Problem: Server starts successfully even if Claude CLI is not installed
- Blocks: Users may not realize completions will fail until first request
- Files: `sidekick-server/main.py` (startup)

**No Graceful Degradation:**
- Problem: When Claude CLI fails, all completion requests fail
- Blocks: No fallback or cached responses for common patterns

**No Telemetry/Metrics Export:**
- Problem: Metrics only available via `/health` endpoint polling
- Blocks: Integration with monitoring systems (Prometheus, Grafana)

## Test Coverage Gaps

**No Tests for Modification Service:**
- What's not tested: `sidekick-server/services/modification.py` - the transform functionality
- Files: No corresponding `test_modification.py`
- Risk: Transform feature regressions would go unnoticed
- Priority: High

**No E2E Tests with Mocked Claude SDK:**
- What's not tested: Full request flow with actual Claude client behavior
- Files: `sidekick-server/tests/test_integration.py` tests routes but SDK calls may fail
- Risk: Integration issues between services
- Priority: Medium

**Limited VS Code Extension Tests:**
- What's not tested: Actual inline completion provider behavior, transform command
- Files: `sidekick-vscode/src/extension.test.ts` only tests isolated logic
- Risk: UI integration issues
- Priority: Medium

**No Tests for Logger Cleanup:**
- What's not tested: `_clean_old_logs` functionality in `sidekick-server/utils/logger.py`
- Files: No test file for logger
- Risk: Old logs may not be cleaned properly
- Priority: Low

---

*Concerns audit: 2026-01-20*
