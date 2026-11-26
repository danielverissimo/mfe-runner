# GitHub CLI account selector

Implemented and validated locally on 2026-11-25. The release dialog now lists
accounts from the computer's GitHub CLI, using VCLI only as a UI/implementation
reference. It does not read VCLI application state or account bindings.

## Evidence and contract

- ESTABLISHED: `electron/main.mjs::withValidatedSender`,
  `electron/preload.cjs`, and `electron/lib/contracts.mjs::IPC_CHANNELS`
  constrain native capabilities. The new `listGitHubAccounts()` intent has no
  renderer-supplied executable, host, path or arguments.
- ESTABLISHED: `RunnerApiService`, `AppComponent` catalog/loading signals,
  `RunnerSelectComponent` and `I18nRootDirective` supply the existing UI patterns.
- ENFORCED by tests: `github-accounts.mjs::listGitHubAccounts` executes a fixed,
  bounded `gh auth status` query and returns `GitHubAccountCatalog` containing
  `available`, `accounts`, and a normalized message. Each account contains only
  login, active state and authentication state; output is validated and deduped.
- ENFORCED by tests: opening the release dialog loads the catalog. Refresh
  preserves a valid selection, ignores obsolete responses, and never silently
  falls back if a previously selected account disappears. Unavailable accounts
  are disabled. The explicit active-account default omits `ghUser`.
- ENFORCED by tests: only an operator submission emits a release intent. The
  existing native confirmation, credential resolution and publication flow
  remain authoritative. Listing performs no account switch or token request.

The native adapter follows the installed CLI's supported JSON interface. See
the [official gh auth status manual](https://cli.github.com/manual/gh_auth_status).
Authentication status can require network access; an unavailable CLI, empty
catalog or failed query produces a specific UI state instead of raw diagnostics.

## Files changed

- `electron/lib/github-accounts.mjs` (new adapter)
- `electron/lib/github-accounts.spec.mjs` (new adapter coverage)
- `electron/lib/contracts.mjs`
- `electron/main.mjs`
- `electron/preload.cjs`
- `src/app/core/models/runner.models.ts`
- `src/app/core/services/runner-api.service.ts` and its spec
- `src/app/app.component.ts`, its template and spec
- `src/app/shared/vcli-release-dialog/vcli-release-dialog.component.ts`, its
  template, styles and spec
- `src/app/core/i18n/i18n.service.ts`
- `src/testing/runner-fixtures.ts`
- `README.md`, `docs/ARCHITECTURE.md`, `docs/USER_GUIDE.md`, and this report
- `docs/evidence/github-accounts/desktop.png` and `mobile.png`

## Validation

- `node --test electron/lib/github-accounts.spec.mjs electron/lib/vcli-release.spec.mjs electron/lib/contracts.spec.mjs`: 34 passed.
- `npm run test:angular -- --include=src/app/shared/vcli-release-dialog/vcli-release-dialog.component.spec.ts --include=src/app/app.component.spec.ts --include=src/app/core/services/runner-api.service.spec.ts --include=src/app/core/i18n/i18n.service.spec.ts`: 78 passed in ChromeHeadless.
- `npm run build`: production build passed. The existing
  `app.component.scss` warning remains: 23.87 kB against an 18 kB warning budget.
- `npm run lint`, `node --check electron/main.mjs`,
  `node --check electron/preload.cjs`, and `git diff --check`: passed.
- Real native adapter on this computer with gh 2.83.2: two accounts returned,
  both in successful authentication state. No credentials or raw CLI output
  were logged. No repository-access operation or release was executed.
- Chrome against the production Angular bundle with synthetic bridge data:
  open project tools → release dialog → open account selector → select account
  → refresh → submit validation. Exactly two catalog reads and one synthetic
  launch with `ghUser: work-user` and `dryRun: true`; no JavaScript errors.
- Desktop 1440×1024 and narrow 390×844 screenshots inspected. No horizontal
  overflow inside the narrow dialog; the existing vertical scroll is retained.

## Limits

No new dependencies, installation, publishing, or real release execution.
The installed Runner was not replaced. Browser integration uses a synthetic
preload bridge; the native helper was validated separately against the real CLI.
The complete native Electron click-through, Windows/Linux runtimes, offline
GitHub authentication, and unrelated test suites were not executed. Tests cover
platform path candidates, missing CLI, empty accounts, invalid/duplicate logins,
malformed/unsupported JSON, bounded failures, selection, refresh and errors.
No unresolved architectural conflicts were found. Only github.com accounts
are listed, matching the existing release account contract.
