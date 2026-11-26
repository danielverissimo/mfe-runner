# VCLI release integration — local evidence

Validated on 2026-11-16 on macOS. The change is in MFE Runner; the VCLI checkout
and its preexisting working-tree changes were read only and were preserved.
No new dependency, commit, branch push, installer, or real release was produced.
The installed MFE Runner application has not been replaced.

## Discovery and architectural evidence

The required project detector classified MFE Runner as Angular frontend
(Angular 22.0.6, standalone components and signals) with no Spring backend.
VCLI was unclassified by that detector and uses TypeScript/Vite and Tauri/Rust.
No Spring-specific backend pattern was applied. Repository instructions,
README, architecture and user guides, package/build configuration, existing
Flutter dialog, npm detector, launch builder, IPC validation, supervisor,
protocol and tests were inspected before implementation.

| Classification | Owning source and evidence |
| --- | --- |
| ENFORCED | `electron/main.mjs::registerIpcHandlers`, `electron/lib/contracts.mjs::validateProcessRequest`: native sender/payload validation; release entry point rechecked and native confirmation before starting. |
| ESTABLISHED | `src/app/shared/flutter-launch-dialog/`, `src/app/core/services/runner-api.service.ts::startProject`: standalone Angular dialog, typed intent, existing preload bridge and process logs. |
| ESTABLISHED | `electron/lib/launch-specification.mjs::createLaunchSpecification`, `electron/lib/process-supervisor.mjs::start`: adapter-owned executable/argument arrays with `shell: false`. |
| ESTABLISHED | VCLI `scripts/release-orchestrator.mjs::main`, `prepareReleaseWorktree`, and `docs/distribuicao.md`: existing isolated worktree, explicit version/targets, local/Actions modes, signing and publication workflow. |
| EMERGING | `electron/lib/vcli-release.mjs`, `VcliReleaseDialogComponent`: new integration covered locally; real signing, matrix builds and publication have not been exercised through Runner. |
| CONFLICTING → corrected | `docs/ARCHITECTURE.md` previously described linking as the only project-side command mutation. It now distinguishes Runner's own writes from explicitly invoked project-owned commands and documents release side effects. |

Static inspection of the actual sibling VCLI repository returned the root
Node project with `node:script:release:publish`, `releaseKind: vcli`, and
`node:script:dev` unchanged as the default. The initial implementation also
discovered `src-tauri` separately. The 2026-11-19 discovery correction folds
that native Cargo project into the parent Tauri application, leaving one VCLI
entry. Generated Rust targets and release-worktree copies are excluded.

## Validations run

Using the already installed Node 24.15.0:

- `npm run test:electron`: **153 passed**, including release-contract rejection,
  all target arguments, legacy-script guard, entry-point reread, platform gate,
  environment fallback, generated-directory exclusion, successful synthetic
  npm release, failing synthetic npm release (exit 7), logs and restart guard.
- Affected Angular tests: **86 passed** (`AppComponent`, process table, new
  release dialog and i18n specs), including no automatic execution, validation
  default, publication selection, failure retention, logs navigation, invalid
  inputs, unsupported host, focus containment and existing flows.
- `npm run build`: passed using the configured production build. Existing
  `src/app/app.component.scss` warning remains: 23.87 kB exceeds the 18 kB warning
  budget; that stylesheet was not modified. The error budget was not exceeded.
- `npm run lint`, `node --check electron/main.mjs`, `git diff --check`: passed.
- Chrome/Playwright against the actual production Angular bundle with a
  synthetic preload bridge: project menu → release dialog → explicit version
  and account → validation intent → project Logs. Exactly one structured
  validation intent was emitted. No JavaScript errors. Desktop 1440×1024 and
  narrow 390×844 layouts inspected; no horizontal overflow. The narrow dialog
  scrolls vertically to its footer.

The first build attempt used the shell's older Node 24.11.0 and was rejected
by the installed Angular CLI. Validation was rerun with compatible installed
Node; no runtime was downloaded or installed. A focus test initially failed
because it changed a model before Angular's initial form synchronization;
using actual input events after stabilization fixed the test and verified the
focus behavior.

Screenshots contain only synthetic project/account data:

- [Desktop](evidence/vcli-release/desktop.png)
- [Narrow layout](evidence/vcli-release/mobile.png)

## Not executed and remaining limits

- No actual VCLI `release:publish`, including `--dry-run` (which still pushes
  a branch), was invoked. No GitHub/Apple operation was performed.
- No real signing/keychain authorization, notarization, Docker matrix, Actions
  run, artifact upload, installer or update was validated.
- Browser validation used a synthetic bridge; it does not prove the complete
  native Electron confirmation/preload/daemon journey with real credentials.
  Supervisor execution tests used a synthetic project-owned npm script.
- No MFE Runner installer was built, installed or published. Run the updated
  source/build to use this feature; the previously installed app is unchanged.
- Windows/Linux desktop execution and physical target systems were not tested.
  Platform restrictions and target arguments have local contract coverage.
- The existing protocol replacement behavior stops managed processes when an
  older supervisor is retired. v10 is necessary for release arguments and
  restart guards; development processes may need restarting after app update.
- The adapter assumes the exact existing VCLI script/metadata contract. The
  underlying orchestrator owns prerequisites, duplicate-version rejection,
  credentials, disk space and failure recovery. Staged recovery remains in VCLI.
- Keys/passwords/tokens are not fields in the renderer contract or persisted in
  Runner configuration. Optional paths refer only to a public key and notes.

## 2026-11-19 discovery and badge correction

VCLI is now represented by its root Node project. Its `src-tauri` Cargo package
is an implementation part of that application, and generated release copies
remain excluded. Development and release command IDs are preserved.

Architectural evidence:

- ESTABLISHED: `electron/lib/project-detectors.mjs::removeFlutterAndroidModules`
  and `representedLibraryPath` already fold implementation packages into their
  owning project after detecting all candidates.
- ENFORCED by regression tests: `PackageJsonProjectDetector::detect` records
  `representedTauriPath` only with a declared Tauri CLI/API dependency and
  `src-tauri/tauri.conf.json`. `inspectProjectSource` folds only the matching
  Rust directory, including when scanning an ancestor of the application.
- ENFORCED by component tests: `workspace-dialog.component.html` renders Host,
  MFE and Angular badges only for those exact capability values. Technology
  continues to have its own badge; Rust, Java, .NET, Python and Go capabilities
  no longer become false Angular badges. `ProjectCapability` now includes the
  values already emitted by the ecosystem adapters.

Files changed for this correction (other existing local changes preserved):

- `electron/lib/project-detectors.mjs`
- `electron/lib/project-detectors.spec.mjs`
- `src/app/shared/workspace-dialog/workspace-dialog.component.html`
- `src/app/shared/workspace-dialog/workspace-dialog.component.spec.ts`
- `src/app/core/models/runner.models.ts`
- `docs/ARCHITECTURE.md`
- `docs/USER_GUIDE.md`
- `docs/VCLI_RELEASE_INTEGRATION.md`

Validation performed using Node 24.15.0:

- `node --test electron/lib/project-detectors.spec.mjs electron/lib/discovery.spec.mjs electron/lib/vcli-release.spec.mjs`: 31 passed.
- `npm run test:angular -- --include=src/app/shared/workspace-dialog/workspace-dialog.component.spec.ts --include=src/app/app.component.spec.ts`: 68 passed in ChromeHeadless.
- `npm run build`: production build passed, with the existing 23.87 kB
  `app.component.scss` warning against its 18 kB warning budget.
- `npm run lint` and `git diff --check`: passed.
- Read-only inspection of the actual sibling VCLI root: exactly one Node
  project, source type `project`, default `node:script:dev`, release command
  `node:script:release:publish`, no discovery warnings.
- Regression coverage includes root/ancestor scans, release copies with both
  Node and Cargo manifests, Rust target outputs, unrelated Rust projects,
  standalone Cargo scans, incomplete ownership markers, native technology
  badges, and preservation of genuine Angular/Host/MFE badges.

Limits and assumptions: grouping recognizes the project's existing JSON
Tauri configuration convention. No dependencies were added. No unresolved
architecture conflicts were found. The full unrelated test suite, native
Electron interaction, other operating systems, installation and publication
were not exercised. The installed app remains unchanged; run the updated
checkout and confirm rediscovery to update an existing catalog. Discovery and
catalog cleanup do not delete source files. No real VCLI release was executed.

## Changed files

Execution and contracts:

- `electron/lib/vcli-release.mjs` (new)
- `electron/lib/project-detectors.mjs`
- `electron/lib/contracts.mjs`
- `electron/lib/launch-specification.mjs`
- `electron/lib/process-supervisor.mjs`
- `electron/lib/supervisor-protocol.mjs`
- `electron/main.mjs`

Angular UI and types:

- `src/app/shared/vcli-release-dialog/vcli-release-dialog.component.ts` (new)
- `src/app/shared/vcli-release-dialog/vcli-release-dialog.component.html` (new)
- `src/app/shared/vcli-release-dialog/vcli-release-dialog.component.scss` (new)
- `src/app/shared/process-table/process-table.component.ts`
- `src/app/shared/process-table/process-table.component.html`
- `src/app/core/models/runner.models.ts`
- `src/app/core/i18n/i18n.service.ts`
- `src/app/app.component.ts`
- `src/app/app.component.html`

Tests:

- `electron/lib/vcli-release.spec.mjs` (new)
- `electron/lib/project-detectors.spec.mjs`
- `electron/lib/supervisor-protocol.spec.mjs`
- `src/app/shared/vcli-release-dialog/vcli-release-dialog.component.spec.ts` (new)
- `src/app/shared/process-table/process-table.component.spec.ts`
- `src/app/app.component.spec.ts`

Documentation/evidence:

- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/USER_GUIDE.md`
- `docs/VCLI_RELEASE_INTEGRATION.md` (this file)
- `docs/evidence/vcli-release/desktop.png` (new)
- `docs/evidence/vcli-release/mobile.png` (new)
