# Plan — follow-up 2 & 3 (OAuth messages + adddependencies expansion)

**Difficulty:** hard

## Scope + targets
- Follow-up 2: externalize PKCE/OAuth error messages from code to translation keys/messages (including PKCE refresh-precondition error surfaced in executor path).
- Follow-up 3: expand `project:adddependencies -all` to cover more dependency categories with deterministic manifest updates and output-handler-compatible payload shape.

## Execution checklist
- [x] 1) Baseline + contract lock
  - **Done criteria:** define qualifier→manifest mapping and `addedDependencies` output shape (`FOLDER`/`PLATFORMEXTENSION`/`OBJECT.bundleIds`) before implementation.
  - **Verification:** `rg -n "AddDependenciesOutputHandler|ProjectAddDependenciesService|throw new Error" packages/node-cli/src`

- [x] 2) Externalize OAuth error messages
  - **Done criteria:** PKCE/OAuth service throws translated messages via `TranslationKeys` + `messages.json`; no behavior regressions in existing auth flows.
  - **Touch:** `packages/node-cli/src/services/auth/NetSuitePkceAuthService.js`, `packages/node-cli/src/services/TranslationKeys.js`, `packages/node-cli/messages.json`.
  - **Verification:** focused tests in `NetSuitePkceAuthService.test.js` still pass.

- [x] 3) Expand adddependencies categories (`-all`)
  - **Done criteria:** `ProjectAddDependenciesService` supports additional categories from parsed dependency qualifiers (bundles/files/folders/platformextensions) while preserving existing object/feature behavior and idempotency.
  - **Touch:** `packages/node-cli/src/services/ProjectAddDependenciesService.js`, related tests.
  - **Verification:** add/extend tests covering new manifest sections, output rendering, and repeated run idempotency.

- [x] 4) Update docs/log artifacts
  - **Done criteria:** `.sangoi` task-log/handoff/changelog reflect new categories and message externalization (after validation is green).
  - **Touch:** `.sangoi/CHANGELOG.md`, `.sangoi/task-logs/*`, `.sangoi/handoffs/*`.
  - **Verification:** `rg -n "OAuth|adddependencies|bundles|platformextensions|folders|messages" .sangoi`

- [x] 5) Validation pass (targeted)
  - **Done criteria:** relevant suites pass; user requested manual broader testing, so only targeted automated checks run here.
  - **Verification:**
    - `cd packages/node-cli && npm test -- NetSuitePkceAuthService.test.js`
    - `cd packages/node-cli && npm test -- AddDependenciesAction.test.js AddDependenciesCommand.test.js`
    - `cd packages/node-cli && npm test -- AddDependenciesOutputHandler.test.js`

- [x] 6) Final review gate + handoff
  - **Done criteria:** Senior Code Reviewer returns `READY` or `READY_WITH_NITS`; blocker fixes applied if any.
  - **Outcome:** reviewer first returned `NOT_READY` (self-app `platformextension` leak), fix applied in `ProjectAddDependenciesService`, tests re-run, commit-noise removed, final verdict `READY`.

## Fan-out / fan-in
- Senior Plan Advisor reviews this plan before implementation.
- Root lane implements changes.
- Senior Code Reviewer gates final state.
