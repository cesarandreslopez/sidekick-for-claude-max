---
phase: 01-foundation
plan: 02
subsystem: auth
tags: [anthropic-sdk, claude-agent-sdk, vscode-extension, dual-auth]

# Dependency graph
requires:
  - phase: 01-foundation/01-01
    provides: esbuild bundling and Anthropic SDK dependencies
provides:
  - Dual-auth abstraction layer (API key and Max subscription)
  - ClaudeClient interface for uniform API access
  - SecretsManager for secure API key storage
  - AuthService for mode switching and client lifecycle
affects: [01-03, 02-integration]

# Tech tracking
tech-stack:
  added: []
  patterns: [dual-auth-abstraction, lazy-initialization, disposable-pattern]

key-files:
  created:
    - sidekick-vscode/src/types.ts
    - sidekick-vscode/src/services/SecretsManager.ts
    - sidekick-vscode/src/services/ApiKeyClient.ts
    - sidekick-vscode/src/services/MaxSubscriptionClient.ts
    - sidekick-vscode/src/services/AuthService.ts
  modified: []

key-decisions:
  - "Max subscription as default auth mode (leverages existing Claude Max subscription)"
  - "Lazy client initialization (only create client when first needed)"
  - "Environment variable fallback for API key (supports CI/testing)"

patterns-established:
  - "ClaudeClient interface: all API clients implement complete(), isAvailable(), dispose()"
  - "AuthService as central auth orchestrator with config change listener"
  - "Disposable pattern for cleanup in VS Code extension context"

# Metrics
duration: 3min
completed: 2026-01-20
---

# Phase 1 Plan 2: Project Scaffolding Summary

**Dual-auth service layer with ClaudeClient interface, supporting both API key (sdk) and Max subscription (claude-agent-sdk) authentication modes**

## Performance

- **Duration:** 3 min
- **Started:** 2026-01-20T17:15:05Z
- **Completed:** 2026-01-20T17:17:33Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- Created shared type definitions (AuthMode, CompletionOptions, ClaudeClient interface)
- Implemented SecretsManager for secure API key storage via VS Code SecretStorage
- Built ApiKeyClient using @anthropic-ai/sdk for direct API access
- Built MaxSubscriptionClient using @anthropic-ai/claude-agent-sdk for Max subscription
- Created AuthService orchestrator managing dual-auth mode switching

## Task Commits

Each task was committed atomically:

1. **Task 1: Create shared types and SecretsManager** - `8466520` (feat)
2. **Task 2: Create ApiKeyClient and MaxSubscriptionClient** - `38ca742` (feat)
3. **Task 3: Create AuthService orchestrator** - `7250ba4` (feat)

## Files Created/Modified
- `sidekick-vscode/src/types.ts` - AuthMode, CompletionOptions, ClaudeClient interfaces
- `sidekick-vscode/src/services/SecretsManager.ts` - Secure API key storage wrapper
- `sidekick-vscode/src/services/ApiKeyClient.ts` - Direct API key authentication client
- `sidekick-vscode/src/services/MaxSubscriptionClient.ts` - Max subscription authentication client
- `sidekick-vscode/src/services/AuthService.ts` - Central auth orchestrator with mode switching

## Decisions Made
- Max subscription as default auth mode (most users will use their existing Claude Max subscription)
- Environment variable (ANTHROPIC_API_KEY) checked before SecretStorage for CI/testing flexibility
- Lazy client initialization to avoid unnecessary API calls at startup
- Model shorthand mapping (haiku/sonnet/opus) in each client for consistent interface

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all tasks completed successfully.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Auth service layer complete and ready for integration
- Extension.ts needs to be updated to use AuthService instead of HTTP server
- Ready for 01-03 (Configuration System) to add user settings management

---
*Phase: 01-foundation*
*Completed: 2026-01-20*
