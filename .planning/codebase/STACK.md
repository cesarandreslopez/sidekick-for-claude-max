# Technology Stack

**Analysis Date:** 2026-01-20

## Languages

**Primary:**
- TypeScript ^5.0.0 - VS Code extension (`sidekick-vscode/src/`)
- Python >=3.10 - Backend server (`sidekick-server/`)

**Secondary:**
- Bash - Server startup script (`start-server.sh`)
- Markdown - Prompt templates (`sidekick-server/prompts/`)

## Runtime

**VS Code Extension:**
- Node.js 20 (CI)
- VS Code API ^1.85.0

**Backend Server:**
- Python 3.10, 3.11, or 3.12
- Uvicorn ASGI server

**Package Managers:**
- npm (VS Code extension)
  - Lockfile: `sidekick-vscode/package-lock.json`
- pip with requirements.txt (Python server)
  - Lockfile: None (versions specified in `sidekick-server/pyproject.toml`)
- venv for virtual environment management

## Frameworks

**Backend:**
- FastAPI >=0.109.0 - REST API framework (`sidekick-server/main.py`)
- Uvicorn[standard] >=0.27.0 - ASGI server
- Pydantic >=2.0 - Request/response validation (`sidekick-server/models/`)
- Pydantic-settings >=2.0 - Configuration management (`sidekick-server/config.py`)

**VS Code Extension:**
- VS Code Extension API - InlineCompletionItemProvider pattern

**Testing:**
- pytest >=8.0.0 - Python backend tests
- pytest-asyncio >=0.23.0 - Async test support
- vitest ^2.0.0 - TypeScript extension tests

**Build/Dev:**
- TypeScript ^5.0.0 - Extension compilation
- ESLint ^9.0.0 + typescript-eslint ^8.0.0 - TypeScript linting
- Ruff - Python linting (CI only)
- Hatchling - Python build backend

## Key Dependencies

**Critical:**
- `claude-agent-sdk` >=0.2.2 - Core AI integration; interfaces with Claude Code CLI to get completions
- `fastapi` >=0.109.0 - HTTP API backbone
- `pydantic` >=2.0 - All request/response validation

**Infrastructure:**
- `anyio` >=4.0.0 - Async runtime abstraction
- `httpx` >=0.27.0 - HTTP client for testing
- `python-dotenv` >=1.0.0 - Environment variable loading

**VS Code Extension:**
- `@types/vscode` ^1.85.0 - VS Code API types
- `@types/node` ^20.0.0 - Node.js types

## Configuration

**Environment Variables (Server):**
- `PORT` - Server port (default: 3456)
- `CACHE_TTL_MS` - Cache time-to-live in milliseconds (default: 30000)
- `CACHE_MAX_SIZE` - Maximum cache entries (default: 100)
- `RATE_LIMIT_WINDOW_MS` - Rate limit window (default: 60000)
- `RATE_LIMIT_MAX_REQUESTS` - Max requests per window (default: 60)
- `LOG_RETENTION_DAYS` - Log file retention (default: 7)
- `COMPLETION_TIMEOUT_MS` - Override model-specific timeouts

**VS Code Extension Settings (in `package.json`):**
- `sidekick.serverUrl` - Server URL (default: "http://localhost:3456")
- `sidekick.enabled` - Enable/disable completions (default: true)
- `sidekick.debounceMs` - Debounce delay (default: 300)
- `sidekick.inlineContextLines` - Context lines for inline (default: 30)
- `sidekick.transformContextLines` - Context lines for transforms (default: 50)
- `sidekick.multiline` - Multi-line mode (default: false)
- `sidekick.inlineModel` - Model for inline: "haiku" or "sonnet" (default: "haiku")
- `sidekick.transformModel` - Model for transform: "haiku", "sonnet", or "opus" (default: "opus")

**Build Configuration:**
- `sidekick-vscode/tsconfig.json` - TypeScript config (ES2022, CommonJS modules)
- `sidekick-server/pyproject.toml` - Python project config
- `sidekick-server/pytest.ini` - Pytest config
- `sidekick-vscode/vitest.config.ts` - Vitest config

## Platform Requirements

**Development:**
- Node.js 20+ (VS Code extension development)
- Python 3.10+ (server development)
- VS Code ^1.85.0 (extension testing)
- Claude Code CLI installed globally (`npm install -g @anthropic-ai/claude-code`)
- Active Claude Max subscription (required for Claude Code CLI)

**Production:**
- Local machine with Claude Code CLI authenticated
- No external hosting required (local-only architecture)
- Server runs on localhost:3456 by default

## Build Commands

**VS Code Extension:**
```bash
cd sidekick-vscode
npm install
npm run compile          # Build TypeScript
npm run lint            # ESLint
npm test                # Vitest tests
npx @vscode/vsce package --out dist/  # Package .vsix
```

**Python Server:**
```bash
cd sidekick-server
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pip install -e ".[dev]"  # Install with dev dependencies
python -m pytest -v      # Run tests
```

**Quick Start:**
```bash
./start-server.sh        # Start server (creates venv if needed)
./start-server.sh --dev  # Start with hot reload
./start-server.sh --port 8080  # Custom port
```

---

*Stack analysis: 2026-01-20*
