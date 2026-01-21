# Codebase Structure

**Analysis Date:** 2026-01-20

## Directory Layout

```
sidekick-for-claude-max/
├── .github/                    # GitHub Actions workflows
├── .planning/                  # GSD planning documents
│   └── codebase/              # Codebase analysis docs
├── images/                     # Repository images (icons, screenshots)
├── sidekick-server/           # Python FastAPI server
│   ├── logs/                  # Runtime log files (gitignored)
│   ├── models/                # Pydantic request/response models
│   ├── prompts/               # LLM prompt templates (markdown)
│   ├── routers/               # FastAPI route handlers
│   ├── services/              # Business logic layer
│   ├── static/                # Static assets (favicon)
│   ├── tests/                 # pytest test suite
│   ├── utils/                 # Shared utilities
│   └── venv/                  # Python virtual environment (gitignored)
├── sidekick-vscode/           # VS Code extension (TypeScript)
│   ├── images/                # Extension icon
│   ├── out/                   # Compiled JavaScript (gitignored)
│   └── src/                   # TypeScript source
├── CHANGELOG.md               # Version history
├── CODE_OF_CONDUCT.md         # Community guidelines
├── CONTRIBUTING.md            # Contribution guide
├── LICENSE                    # MIT license
├── README.md                  # Main documentation
├── README-SERVER.md           # Server-specific documentation
├── README-VSCODE.md           # Extension-specific documentation
├── SECURITY.md                # Security policy
└── start-server.sh            # Server startup script
```

## Directory Purposes

**sidekick-server/:**
- Purpose: Python backend that proxies requests to Claude Code CLI
- Contains: FastAPI application with layered architecture
- Key files: `main.py` (app entry), `config.py` (settings)

**sidekick-server/models/:**
- Purpose: Pydantic data models for API contracts
- Contains: Request and response model classes
- Key files: `request.py` (CompletionRequest, ModifyRequest), `response.py` (CompletionResponse, ModifyResponse, HealthResponse)

**sidekick-server/prompts/:**
- Purpose: Externalized LLM prompt templates
- Contains: Markdown files with format string placeholders
- Key files: `system.md`, `user.md` (completion prompts), `modify_system.md`, `modify_user.md` (transform prompts)

**sidekick-server/routers/:**
- Purpose: FastAPI route handlers
- Contains: API endpoint definitions
- Key files: `completion.py` (POST /inline, POST /transform, GET /health)

**sidekick-server/services/:**
- Purpose: Core business logic and external integrations
- Contains: Completion generation, modification, Claude SDK wrapper
- Key files: `completion.py` (inline completion logic), `modification.py` (transform logic), `claude_client.py` (SDK wrapper)

**sidekick-server/utils/:**
- Purpose: Cross-cutting infrastructure concerns
- Contains: Logging, caching, rate limiting, metrics, prompt loading
- Key files: `logger.py`, `cache.py`, `rate_limiter.py`, `metrics.py`, `prompts.py`

**sidekick-server/tests/:**
- Purpose: pytest test suite
- Contains: Unit and integration tests
- Key files: `conftest.py` (fixtures), `test_completion.py`, `test_cache.py`, `test_rate_limiter.py`, `test_metrics.py`, `test_validation.py`, `test_integration.py`

**sidekick-vscode/:**
- Purpose: VS Code extension providing UI
- Contains: TypeScript source, package configuration, tests
- Key files: `src/extension.ts` (all extension code), `package.json` (extension manifest)

**sidekick-vscode/src/:**
- Purpose: Extension source code
- Contains: Single-file extension implementation
- Key files: `extension.ts` (activation, completion provider, commands), `extension.test.ts` (tests)

## Key File Locations

**Entry Points:**
- `sidekick-server/main.py`: FastAPI application entry point
- `sidekick-vscode/src/extension.ts`: VS Code extension entry point
- `start-server.sh`: Shell script to launch server

**Configuration:**
- `sidekick-server/config.py`: Server settings from environment variables
- `sidekick-server/pyproject.toml`: Python project metadata and version
- `sidekick-vscode/package.json`: Extension manifest, VS Code settings schema
- `sidekick-vscode/tsconfig.json`: TypeScript compiler configuration

**Core Logic:**
- `sidekick-server/services/completion.py`: Inline completion generation
- `sidekick-server/services/modification.py`: Code transformation generation
- `sidekick-server/services/claude_client.py`: Claude Agent SDK wrapper

**Testing:**
- `sidekick-server/tests/`: Python tests (pytest)
- `sidekick-vscode/src/extension.test.ts`: Extension tests (vitest)

## Naming Conventions

**Files:**
- Python: snake_case (e.g., `completion.py`, `rate_limiter.py`)
- TypeScript: camelCase (e.g., `extension.ts`)
- Prompts: snake_case with .md extension (e.g., `modify_system.md`)
- Tests: `test_*.py` (Python), `*.test.ts` (TypeScript)

**Directories:**
- All lowercase, plural for collections (e.g., `models/`, `services/`, `tests/`)
- Singular for specific purposes (e.g., `static/`)

## Where to Add New Code

**New API Endpoint:**
- Route handler: `sidekick-server/routers/completion.py` (or new router file)
- Request/response models: `sidekick-server/models/request.py`, `sidekick-server/models/response.py`
- Service logic: `sidekick-server/services/` (new file if distinct concern)
- Tests: `sidekick-server/tests/test_<feature>.py`

**New LLM Feature:**
- Prompt templates: `sidekick-server/prompts/` (new .md files)
- Prompt loading: `sidekick-server/utils/prompts.py` (add load functions)
- Service logic: `sidekick-server/services/` (new or existing file)

**New VS Code Command:**
- Command registration: `sidekick-vscode/src/extension.ts` in `activate()` function
- Command definition: `sidekick-vscode/package.json` in `contributes.commands`
- Keybinding: `sidekick-vscode/package.json` in `contributes.keybindings`
- Settings: `sidekick-vscode/package.json` in `contributes.configuration`

**New Utility:**
- Server utility: `sidekick-server/utils/` (new file, export singleton if needed)
- Import singleton in services that need it

**New Test:**
- Server: `sidekick-server/tests/test_<feature>.py`
- Extension: `sidekick-vscode/src/<feature>.test.ts`

## Special Directories

**sidekick-server/logs/:**
- Purpose: Runtime log files
- Generated: Yes (at server startup)
- Committed: No (gitignored)

**sidekick-server/venv/:**
- Purpose: Python virtual environment
- Generated: Yes (by start-server.sh or manually)
- Committed: No (gitignored)

**sidekick-vscode/out/:**
- Purpose: Compiled JavaScript output
- Generated: Yes (by TypeScript compiler)
- Committed: No (gitignored)

**sidekick-server/static/:**
- Purpose: Static assets served by FastAPI
- Generated: No
- Committed: Yes
- Contains: `favicon.ico`

**sidekick-server/prompts/:**
- Purpose: LLM prompt templates
- Generated: No
- Committed: Yes
- Format: Markdown with Python format string placeholders ({variable})

---

*Structure analysis: 2026-01-20*
