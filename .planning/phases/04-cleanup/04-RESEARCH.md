# Phase 4: Cleanup - Research

**Researched:** 2026-01-21
**Domain:** Repository cleanup, documentation update, CI/CD modification
**Confidence:** HIGH

## Summary

This phase involves removing all remnants of the Python server architecture after completing the SDK migration (Phases 1-3). The cleanup is straightforward file deletion and text editing with no technical complexity. The main risk is missing references scattered throughout documentation.

The research identified **5 categories of cleanup**:
1. **Directory deletion** - `sidekick-server/` (full Python server)
2. **File deletion** - `start-server.sh` (server startup script)
3. **Configuration removal** - `sidekick.serverUrl` setting in `package.json`
4. **Documentation updates** - README.md, CONTRIBUTING.md, and other docs
5. **CI/CD modification** - Remove Python test job from `.github/workflows/ci.yml`

**Primary recommendation:** Execute deletions first, then systematically update all documentation files, then update CI/CD. Order matters to avoid partial states.

## Standard Stack

Not applicable for this cleanup phase. This is file deletion and text editing, not feature implementation.

## Artifacts to Delete

### Directory: sidekick-server/

**Location:** `/home/cal/code/sidekick-for-claude-max/sidekick-server/`

**Contents (all to be deleted):**
```
sidekick-server/
├── config.py            # Server settings
├── main.py              # FastAPI entry point
├── models/              # Pydantic request/response models
├── prompts/             # Prompt templates (already ported to TypeScript)
├── routers/             # API route handlers
├── services/            # Business logic (completion, modification, claude_client)
├── utils/               # Utilities (cache, rate_limiter, metrics, logger)
├── tests/               # Python tests
├── logs/                # Runtime logs (gitignored but may exist locally)
├── venv/                # Virtual environment (gitignored but may exist locally)
├── static/              # Static files
├── __pycache__/         # Python bytecode (gitignored)
├── pyproject.toml       # Python project metadata
├── pytest.ini           # Pytest configuration
├── requirements.txt     # Python dependencies
└── README.md            # Server documentation
```

**Deletion command:**
```bash
rm -rf sidekick-server/
```

### File: start-server.sh

**Location:** `/home/cal/code/sidekick-for-claude-max/start-server.sh`

**Purpose:** Shell script that starts Python server with venv activation and uvicorn.

**Deletion command:**
```bash
rm start-server.sh
```

## Configuration to Remove

### Extension Setting: sidekick.serverUrl

**Location:** `/home/cal/code/sidekick-for-claude-max/sidekick-vscode/package.json`

**Lines 55-59 (to be removed):**
```json
"sidekick.serverUrl": {
  "type": "string",
  "default": "http://localhost:3456",
  "description": "URL of the Sidekick server"
},
```

**Note:** This setting is currently unused after Phase 2/3 migration. It was kept for backward compatibility during migration. No code references `serverUrl` in extension.ts anymore.

### Test Mocks to Update

**Location:** `/home/cal/code/sidekick-for-claude-max/sidekick-vscode/src/extension.test.ts`

**Lines 19-27 contain serverUrl mock:**
```typescript
get: vi.fn((key: string) => {
  const defaults: Record<string, unknown> = {
    serverUrl: "http://localhost:3456",  // REMOVE THIS LINE
    enabled: true,
    debounceMs: 300,
    // ...
  };
```

**Lines 73 test serverUrl:**
```typescript
expect(config.get("serverUrl")).toBe("http://localhost:3456");  // REMOVE THIS TEST
```

## Documentation Updates

### Files Requiring Updates

| File | Server References | Required Changes |
|------|-------------------|------------------|
| `README.md` | Python badge, architecture diagram, Quick Start server step, sidekick-server link | Complete rewrite of setup flow |
| `README-SERVER.md` | Entire file is server documentation | **DELETE ENTIRE FILE** |
| `README-VSCODE.md` | serverUrl setting, server prerequisites, troubleshooting | Remove server references |
| `CONTRIBUTING.md` | Python setup, server tests, project structure | Remove server sections |
| `SECURITY.md` | References sidekick-server/ | Update scope section |
| `.github/ISSUE_TEMPLATE/bug_report.md` | Python version, Server component | Remove server options |
| `.github/PULL_REQUEST_TEMPLATE.md` | Server checkbox | Remove server option |
| `.gitignore` | Python-specific entries | Keep for now (may contribute Python in future) or remove |

### README.md Updates Required

**Current sections needing changes:**

1. **Line 11** - Remove Python badge:
   ```html
   <img src="https://img.shields.io/badge/python-3.10+-blue.svg" alt="Python 3.10+">
   ```

2. **Lines 35-44** - Remove/update architecture diagram that shows server:
   ```
   VS Code Extension                    Local Server (port 3456)
        │                                      │
   ...
   ```

3. **Lines 48-49** - Remove sidekick-server component reference:
   ```markdown
   - **[sidekick-server](./sidekick-server/)** - FastAPI server that calls Claude Code CLI
   ```

4. **Lines 66-69** - Remove server start step:
   ```markdown
   2. Start the server:
      ```bash
      ./start-server.sh
      ```
   ```

**New README flow should be:**
1. Install Claude Code CLI and authenticate
2. Install VS Code extension from Marketplace
3. Start coding

### CONTRIBUTING.md Updates Required

**Sections to remove/update:**

1. **Prerequisites (line 9)** - Remove "Python 3.10+"
2. **Lines 21-28** - Remove server setup section
3. **Lines 40-46** - Remove server test commands
4. **Lines 54** - Remove `./start-server.sh --dev`
5. **Lines 61-69** - Remove Python code style section
6. **Lines 74-80** - Remove server test commands
7. **Lines 125-133** - Update project structure to remove sidekick-server/
8. **Line 139** - Remove start-server.sh reference

### README-VSCODE.md Updates Required

1. **Line 8** - Remove server prerequisite
2. **Lines 55-65** - Remove server startup instructions
3. **Lines 88-90** - Remove serverUrl from settings table
4. **Lines 103** - Remove serverUrl from example settings.json
5. **Lines 124** - Remove serverUrl from configuration table
6. **Lines 136-143** - Update troubleshooting (remove server references)

## CI/CD Updates

### File: .github/workflows/ci.yml

**Current jobs:**
1. `server-tests` (lines 10-41) - **DELETE ENTIRE JOB**
2. `extension-tests` (lines 43-71) - Keep
3. `build-extension` (lines 73-106) - Keep

**Lines 10-41 to remove (entire server-tests job):**
```yaml
server-tests:
  name: Server Tests (Python ${{ matrix.python-version }})
  runs-on: ubuntu-latest
  strategy:
    matrix:
      python-version: ['3.10', '3.11', '3.12']
  defaults:
    run:
      working-directory: sidekick-server
  steps:
    - uses: actions/checkout@v4
    - name: Set up Python ${{ matrix.python-version }}
      uses: actions/setup-python@v5
      with:
        python-version: ${{ matrix.python-version }}
    - name: Install dependencies
      run: |
        python -m pip install --upgrade pip
        pip install -r requirements.txt
        pip install -e ".[dev]"
    - name: Lint with Ruff
      run: |
        pip install ruff
        ruff check .
    - name: Run tests
      run: python -m pytest -v
```

**Result after cleanup:**
```yaml
name: CI

on:
  push:
    branches: [master, main]
  pull_request:
    branches: [master, main]

jobs:
  extension-tests:
    # ... existing extension tests job

  build-extension:
    # ... existing build job
```

## .gitignore Updates

**Current Python entries (lines 39-50):**
```gitignore
# Python
__pycache__/
*.py[cod]
*$py.class
*.so
venv/
.venv/
*.egg-info/
*.egg
.pytest_cache/
.mypy_cache/
.ruff_cache/
```

**Recommendation:** Keep Python entries. They don't hurt and may be useful if:
- Someone contributes Python tooling
- Future development adds Python components
- Users accidentally create Python files

If strict cleanup desired, remove lines 39-50.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Directory deletion | Manual file-by-file | `rm -rf sidekick-server/` | Single atomic operation |
| Finding all references | Manual search | `grep -r "server"` + editor | Comprehensive, won't miss |
| CI workflow editing | Manual YAML edits | Direct job removal | Simple, well-understood |

## Common Pitfalls

### Pitfall 1: Incomplete Reference Removal

**What goes wrong:** Missing a reference to server/Python in docs leaves confusing instructions.
**Why it happens:** References scattered across many files.
**How to avoid:** Use grep to find ALL references, verify each file.
**Warning signs:** User reports confusion about "missing server."

**Search commands:**
```bash
# Find all server references
grep -r "sidekick-server" --include="*.md" .
grep -r "start-server" --include="*.md" .
grep -r "serverUrl" .
grep -r "Python" --include="*.md" . | grep -v ".planning"
```

### Pitfall 2: Breaking CI/CD

**What goes wrong:** Malformed YAML after removing job.
**Why it happens:** YAML indentation sensitivity.
**How to avoid:** Validate YAML after edit, run CI to verify.
**Warning signs:** CI fails immediately after merge.

### Pitfall 3: Leaving Orphaned Config

**What goes wrong:** serverUrl setting left in package.json causes confusion.
**Why it happens:** Setting removal forgotten or incomplete.
**How to avoid:** Check package.json contributes.configuration.properties.
**Warning signs:** Setting appears in VS Code settings UI but does nothing.

### Pitfall 4: Test Mock Drift

**What goes wrong:** Tests reference serverUrl but extension doesn't use it.
**Why it happens:** Test mocks not updated with code.
**How to avoid:** Update extension.test.ts to remove serverUrl mocks.
**Warning signs:** Tests pass but test non-existent functionality.

## Execution Order

Recommended order for cleanup:

1. **Delete sidekick-server/ directory** - Removes bulk of server code
2. **Delete start-server.sh** - Removes startup script
3. **Update package.json** - Remove serverUrl setting
4. **Update extension.test.ts** - Remove serverUrl mocks
5. **Delete README-SERVER.md** - Entire file obsolete
6. **Update README.md** - New simplified setup flow
7. **Update README-VSCODE.md** - Remove server references
8. **Update CONTRIBUTING.md** - Remove Python sections
9. **Update SECURITY.md** - Update scope
10. **Update .github/workflows/ci.yml** - Remove server-tests job
11. **Update .github/ISSUE_TEMPLATE/bug_report.md** - Remove Python/server
12. **Update .github/PULL_REQUEST_TEMPLATE.md** - Remove server checkbox
13. **Optional: Update .gitignore** - Remove Python entries

## Verification Checklist

After cleanup, verify:

1. `ls sidekick-server/` returns "No such file or directory"
2. `ls start-server.sh` returns "No such file or directory"
3. `grep -r "serverUrl" sidekick-vscode/package.json` returns nothing
4. `grep -r "sidekick-server" README.md` returns nothing
5. `grep -r "start-server" README.md` returns nothing
6. `cat .github/workflows/ci.yml | grep "server-tests"` returns nothing
7. CI pipeline passes (only extension tests run)
8. Extension still works (manual test)

## Open Questions

None. This is straightforward deletion and documentation update.

## Sources

### Primary (HIGH confidence)

All findings based on direct file inspection of the current codebase:

- `/home/cal/code/sidekick-for-claude-max/sidekick-server/` - Confirmed exists with full Python server
- `/home/cal/code/sidekick-for-claude-max/start-server.sh` - Confirmed exists
- `/home/cal/code/sidekick-for-claude-max/sidekick-vscode/package.json` - serverUrl setting at lines 55-59
- `/home/cal/code/sidekick-for-claude-max/.github/workflows/ci.yml` - server-tests job at lines 10-41
- `/home/cal/code/sidekick-for-claude-max/README.md` - Server references throughout
- `/home/cal/code/sidekick-for-claude-max/CONTRIBUTING.md` - Python sections throughout
- Grep search for all "serverUrl", "sidekick-server", "start-server", "Python" references

## Metadata

**Confidence breakdown:**
- Artifacts to delete: HIGH - Direct file inspection
- Documentation locations: HIGH - Grep search verified
- CI/CD changes: HIGH - Direct file inspection
- Execution order: HIGH - Standard cleanup pattern

**Research date:** 2026-01-21
**Valid until:** Indefinite (cleanup requirements don't change)
