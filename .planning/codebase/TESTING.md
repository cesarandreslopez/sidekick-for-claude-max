# Testing Patterns

**Analysis Date:** 2026-01-20

## Test Frameworks

### TypeScript (VS Code Extension)

**Runner:**
- Vitest 2.x
- Config: `sidekick-vscode/vitest.config.ts`

**Assertion Library:**
- Vitest built-in (`expect`)

**Run Commands:**
```bash
cd sidekick-vscode
npm test              # Run all tests once
npm run test:watch    # Watch mode
```

### Python (Server)

**Runner:**
- pytest 8.x with pytest-asyncio
- Config: `sidekick-server/pytest.ini` and `pyproject.toml [tool.pytest.ini_options]`

**Assertion Library:**
- pytest built-in (`assert`)

**Run Commands:**
```bash
cd sidekick-server
pytest                # Run all tests (verbose by default via addopts)
pytest -x             # Stop on first failure
pytest tests/test_cache.py  # Run specific test file
```

## Test File Organization

### TypeScript

**Location:** Co-located with source
- `sidekick-vscode/src/extension.test.ts`

**Naming:**
- `*.test.ts` pattern

**Structure:**
```
sidekick-vscode/src/
├── extension.ts
└── extension.test.ts
```

### Python

**Location:** Separate `tests/` directory
- `sidekick-server/tests/`

**Naming:**
- `test_*.py` pattern (configured in pytest.ini)

**Structure:**
```
sidekick-server/
├── services/
│   └── completion.py
├── utils/
│   ├── cache.py
│   ├── rate_limiter.py
│   └── metrics.py
└── tests/
    ├── conftest.py
    ├── test_cache.py
    ├── test_completion.py
    ├── test_integration.py
    ├── test_metrics.py
    ├── test_rate_limiter.py
    └── test_validation.py
```

## Test Structure

### TypeScript (Vitest)

**Suite Organization:**
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock external dependencies at top
vi.mock("vscode", () => ({
  window: { ... },
  workspace: { ... },
  ...
}));

describe("Extension Configuration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should have correct default configuration values", async () => {
    const vscode = await import("vscode");
    const config = vscode.workspace.getConfiguration("sidekick");

    expect(config.get("serverUrl")).toBe("http://localhost:3456");
  });
});
```

**Test Naming:**
- Use `should...` prefix: `"should remove markdown code blocks"`

### Python (pytest)

**Suite Organization:**
```python
"""Tests for the completion cache."""

import pytest
from models.request import CompletionRequest
from models.response import CompletionResponse
from utils.cache import CompletionCache


@pytest.fixture
def cache():
    """Create a fresh cache for each test."""
    return CompletionCache(ttl_ms=1000, max_size=10)


def test_cache_miss(cache):
    """Should return None for cache miss."""
    result = cache.get(CompletionRequest(prefix="test", language="typescript"))
    assert result is None
```

**Class-Based Tests (alternative):**
```python
class TestCleanCompletion:
    """Tests for the clean_completion function."""

    def test_removes_markdown_code_blocks(self):
        """Should remove markdown code blocks."""
        text = "```python\nprint('hello')\n```"
        cleaned, reason = clean_completion(text, max_length=200)
        assert cleaned == "print('hello')"
```

**Test Naming:**
- Function names: `test_*` pattern
- Docstrings: `"Should..."` description

## Mocking

### TypeScript (Vitest)

**Framework:** Vitest (`vi`)

**Patterns:**

Module mock at top of file:
```typescript
vi.mock("vscode", () => ({
  window: {
    createStatusBarItem: vi.fn(() => ({
      show: vi.fn(),
      hide: vi.fn(),
      dispose: vi.fn(),
      text: "",
      tooltip: "",
      command: "",
    })),
    showInformationMessage: vi.fn(),
  },
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn((key: string) => {
        const defaults: Record<string, unknown> = {
          serverUrl: "http://localhost:3456",
          enabled: true,
        };
        return defaults[key];
      }),
    })),
  },
  StatusBarAlignment: { Right: 1 },
  Position: class { constructor(public line: number, public character: number) {} },
  Range: class { constructor(public start: unknown, public end: unknown) {} },
}));
```

**What to Mock:**
- VS Code API (`vscode` module)
- External HTTP requests (not currently mocked in existing tests)

**What NOT to Mock:**
- Pure logic functions (test directly)

### Python

**Framework:** No mocking framework (pytest alone)

**Patterns:**

Direct state manipulation for singletons:
```python
@pytest.fixture(autouse=True)
def reset_state():
    """Reset all state before each test."""
    completion_cache.clear()
    rate_limiter.reset()
    metrics.reset()
    yield
```

Creating fresh instances in fixtures:
```python
@pytest.fixture
def cache():
    """Create a fresh cache for each test."""
    return CompletionCache(ttl_ms=1000, max_size=10)

@pytest.fixture
def limiter():
    """Create a fresh rate limiter for each test."""
    return RateLimiter(window_ms=1000, max_requests=5)
```

**What to Mock:**
- No mocking currently used - tests use real instances with reset state

**What NOT to Mock:**
- Pydantic models (test validation directly)
- Utility classes (test with fresh instances)

## Fixtures and Factories

### Python Fixtures

**Test Data (conftest.py):**
```python
"""Pytest configuration and fixtures."""

import sys
from pathlib import Path

# Add the parent directory to the path so imports work
sys.path.insert(0, str(Path(__file__).parent.parent))
```

**Per-test Fixtures:**
```python
@pytest.fixture
def cache():
    """Create a fresh cache for each test."""
    return CompletionCache(ttl_ms=1000, max_size=10)

@pytest.fixture
def metrics_instance():
    """Create a fresh metrics instance for each test."""
    return Metrics()
```

**Auto-use Fixtures:**
```python
@pytest.fixture(autouse=True)
def reset_state():
    """Reset all state before each test."""
    completion_cache.clear()
    rate_limiter.reset()
    metrics.reset()
    yield
```

**Async Test Client:**
```python
@pytest.fixture
async def client():
    """Create an async test client."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac
```

### TypeScript Fixtures

- No dedicated fixture system
- Setup/teardown via `beforeEach`/`afterEach`

## Coverage

**Requirements:** None enforced

**TypeScript Coverage:**
```bash
# Coverage configured but not in npm scripts
# Would use: npx vitest run --coverage
```

**Python Coverage:**
- Not configured in pytest.ini
- Would use: `pytest --cov=. --cov-report=html`

**Vitest Coverage Config:**
```typescript
// sidekick-vscode/vitest.config.ts
coverage: {
  reporter: ["text", "json", "html"],
  exclude: ["node_modules", "out"],
},
```

## Test Types

### Unit Tests

**TypeScript:**
- `sidekick-vscode/src/extension.test.ts`
- Tests configuration defaults, request body formation, response parsing
- Tests pure logic like debouncing and context extraction

**Python:**
- `test_cache.py` - Cache operations, TTL, eviction
- `test_completion.py` - Completion cleaning/filtering logic
- `test_rate_limiter.py` - Rate limiting behavior
- `test_metrics.py` - Metrics tracking
- `test_validation.py` - Pydantic model validation

### Integration Tests

**Python:**
- `test_integration.py` - Full HTTP endpoint tests
- Uses `httpx.AsyncClient` with `ASGITransport` for async testing
- Tests endpoints: `/health`, `/inline`, `/transform`
- Tests CORS headers, validation errors, rate limiting

### E2E Tests

- Not implemented

## Common Patterns

### Async Testing (Python)

```python
@pytest.mark.asyncio
async def test_expire_after_ttl():
    """Should expire entries after TTL."""
    cache = CompletionCache(ttl_ms=50, max_size=10)

    request = CompletionRequest(prefix="test", language="ts")
    cache.set(request, CompletionResponse(completion="value"))

    cached = cache.get(request)
    assert cached is not None

    # Wait for expiration
    await asyncio.sleep(0.06)

    assert cache.get(request) is None
```

### Async Testing (TypeScript)

```typescript
it("should respect debounce timing", async () => {
  const debounceMs = 300;
  let executed = false;

  const debouncePromise = new Promise<void>((resolve) => {
    setTimeout(() => {
      executed = true;
      resolve();
    }, debounceMs);
  });

  expect(executed).toBe(false);
  await debouncePromise;
  expect(executed).toBe(true);
});
```

### Error/Validation Testing (Python)

```python
def test_reject_invalid_model():
    """Should reject invalid model."""
    with pytest.raises(ValidationError) as exc_info:
        CompletionRequest(prefix="test", language="typescript", model="invalid")

    errors = exc_info.value.errors()
    assert any(e["loc"] == ("model",) for e in errors)
```

### HTTP Endpoint Testing (Python)

```python
@pytest.mark.asyncio
async def test_health_endpoint(client):
    """Should return health status."""
    response = await client.get("/health")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "version" in data
    assert "metrics" in data
```

### Rate Limit Testing

```python
@pytest.mark.asyncio
async def test_rate_limiting(client):
    """Should enforce rate limiting."""
    rate_limiter._max_requests = 2  # Temporarily lower limit

    await client.post("/inline", json={"prefix": "test", "language": "typescript"})
    await client.post("/inline", json={"prefix": "test", "language": "typescript"})

    response = await client.post("/inline", json={"prefix": "test", "language": "typescript"})

    assert response.status_code == 429
    assert "Retry-After" in response.headers

    rate_limiter._max_requests = 60  # Reset
```

## Test Configuration

### Vitest (`sidekick-vscode/vitest.config.ts`)

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,              // Use globals (describe, it, expect)
    environment: "node",        // Node environment
    include: ["src/**/*.test.ts"],
    coverage: {
      reporter: ["text", "json", "html"],
      exclude: ["node_modules", "out"],
    },
  },
});
```

### pytest (`sidekick-server/pytest.ini`)

```ini
[pytest]
asyncio_mode = auto          # Auto-detect async tests
testpaths = tests            # Test directory
python_files = test_*.py     # Test file pattern
python_functions = test_*    # Test function pattern
addopts = -v                 # Verbose output by default
```

---

*Testing analysis: 2026-01-20*
