# Plan — close current java-free batch + implement `account:setup`

**Difficulty:** hard (with integration/time-consuming validation)

## Scope + target artifacts
- First close the current pending local batch (`adddependencies` + referenced files import) with deterministic evidence.
- Then implement browser-based auth command path (`SDK authenticate`) in Node engine, including persisted auth data and refresh support for runtime operations.
- Keep README and `.sangoi` logs/changelog synchronized with final code behavior.

## Execution checklist
- [x] 1) Baseline and freeze current state
  - **Done criteria:** Working tree mapped and in-flight files identified before any new edits.
  - **Verification:** `git status --short --branch`
  - **Touch:** none (read-only)

- [x] 2) Hard-gate close current batch
  - **Done criteria:** Existing batch behavior validated and docs for that batch not stale (no mixed-state before auth work).
  - **Verification:** `cd packages/node-cli && npm test -- AddDependenciesCommand.test.js NetSuiteObjectCommands.test.js`
  - **Touch:** existing in-flight files/docs only if needed to close gaps.

- [x] 3) Implement Node `authenticate` (PKCE/browser)
  - **Done criteria:** `account:setup` OAuth mode routes to Node SDK command `authenticate`; callback flow handles success, state mismatch, browser-launch failure, and timeout with fail-loud errors.
  - **Verification:** focused jest tests for PKCE authenticate service + executor command branch.
  - **Touch:** `packages/node-cli/src/core/sdkexecutor/NodeSdkExecutor.js`, new auth service files under `packages/node-cli/src/services/auth/`, tests.

- [x] 4) Integrate PKCE token lifecycle safely
  - **Done criteria:** Stored PKCE auth can be reused by runtime flows (`_ensureValidAccessToken`) and refreshed from stored refresh token; clear fatal errors for missing prerequisites/secrets.
  - **Verification:** focused executor + auth-store tests (positive + negative paths).
  - **Touch:** `packages/node-cli/src/core/sdkexecutor/NodeSdkExecutor.js`, `packages/node-cli/src/services/auth/AuthStoreService.js`, tests.

- [x] 5) Align docs and project logs
  - **Done criteria:** README no longer claims `account:setup` is missing; `.sangoi/CHANGELOG.md`, new task-log and handoff reflect exact final behavior and constraints.
  - **Verification:** `rg -n "account:setup|not implemented|pending|java-free" packages/node-cli/README.md .sangoi/CHANGELOG.md .sangoi/task-logs .sangoi/handoffs`
  - **Touch:** README + `.sangoi/*` docs.

- [x] 6) Validation pass (focused then broader)
  - **Done criteria:** new/changed tests pass and no regression in affected auth/object/adddependencies suites.
  - **Verification:**
    - `cd packages/node-cli && npm test -- NetSuitePkceAuthService.test.js`
    - `cd packages/node-cli && npm test -- NetSuiteFileCabinetCommands.test.js NetSuiteObjectCommands.test.js AddDependenciesCommand.test.js NetSuiteCiAuthService.test.js AuthStoreService.test.js`
  - **Touch:** none

- [x] 7) Fix reviewer blockers
  - **Done criteria:** review findings with concrete evidence (blocker/high/medium) are fixed with regression tests.
  - **Verification:** targeted jest for adddependencies action flags, PKCE client-id precedence, and unsupported auth type guard.
  - **Touch:** auth/adddependencies code + tests/docs as needed.

- [x] 8) Final review gate + handoff
  - **Done criteria:** Senior Code Reviewer verdict is `READY` or `READY_WITH_NITS`; any blocker fixed before final response.
  - **Verification:** reviewer evidence + rerun failing checks (if any).
  - **Touch:** as required by fixes.

## Fan-out / fan-in lanes
- **Senior Plan Advisor (mandatory):** challenge intent/assumptions and harden this plan before execution.
- **Implementation lane:** root agent owns code changes.
- **Senior Code Reviewer (mandatory final gate):** adversarial review after all plan items are completed.

## Non-goals for this pass
- No new CLI command surface outside `account:setup`/`authenticate` and required token lifecycle support.
- No unrelated refactors in object/file/project services.
