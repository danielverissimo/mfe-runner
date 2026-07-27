# MFE Runner

MFE Runner is a cross-platform desktop control center for local development.
It discovers, starts, stops, supervises, and diagnoses related applications
from a single interface, without modifying their source files.

Despite its name, MFE Runner is not limited to micro frontends. It can manage a
standalone SPA, a monolith, a backend or frontend application, a shared
library, or a workspace composed of a shell and multiple micro frontends. Any
project with scripts declared in `package.json` can benefit from centralized
process control, Node.js resolution, logs, Git context, and development
shortcuts.

[Website](https://mferunner.com/) ·
[Downloads](https://github.com/danielverissimo/mfe-runner/releases) ·
[Report an issue](https://github.com/danielverissimo/mfe-runner/issues)

![MFE Runner interface](docker-server/landing-page/assets/mfe-runner-interface.png)

## Official website

Visit [mferunner.com](https://mferunner.com/) to learn more about MFE Runner,
review its main features, and download the recommended installer for your
operating system. Other supported platforms and architectures remain available
through the download selector.

## Highlights

- Unified workspaces containing any number of exact projects, project roots,
  monorepos, and optional locally linked libraries.
- Automatic source inspection with reviewable Project/Library classification,
  stable project identities, and a visual order saved per workspace.
- Individual and batch start, stop, restart, and health monitoring.
- Persistent lightweight supervisor that can keep processes and logs alive
  after the Electron interface closes.
- Consolidated logs with project filters, text or regular-expression search,
  severity filters, bookmarks, pause/follow modes, error navigation, and
  sanitized diagnostic exports.
- Node.js selection at global, workspace, and project level, including `.nvmrc`
  detection and installed NVM versions.
- Read-only Git context with branch, commit, dirty state, and local
  ahead/behind information.
- Safe shortcuts for opening a project in an IDE, terminal, file manager, or
  browser.
- Local library watch and link workflows through existing `link:*` scripts.
- Brazilian Portuguese, English, Spanish, and French interfaces.
- Automatic updates distributed through the official GitHub Releases.

## Supported platforms

Installers are published for:

- macOS on Apple Silicon (`arm64`) and Intel (`x64`);
- Windows 11 on ARM (`arm64`) and legacy 32-bit Windows (`ia32`);
- Debian/Ubuntu Linux on ARM (`arm64`) and Intel/AMD (`x64`).

Download the recommended installer for your platform from
[mferunner.com](https://mferunner.com/) or directly from
[GitHub Releases](https://github.com/danielverissimo/mfe-runner/releases).

> The Windows `ia32` build is a legacy compatibility edition. Electron 43 is
> the last Electron series that provides Windows `ia32` binaries.

## How it works

1. Create a workspace and add one or more paths. Each path may point to an
   exact project, a root containing multiple projects, or a monorepo.
2. MFE Runner scans only the configured roots. It ignores generated,
   dependency, and VCS directories such as `node_modules`, `dist`, `.angular`,
   and `.git`.
3. Review every detected package and confirm whether it is a Project or a
   Library. Detection evidence and optional Host/MFE capabilities remain
   informative and can be overridden without changing project files.
4. Arrange the catalog in the order that best matches your workflow. The visual
   order is stored per workspace and remains independent from process startup
   order.
5. All confirmed projects appear in one catalog. MFE Runner reads
   `package.json`, optional Angular/federation metadata, ports, and `.nvmrc`
   files without editing them.
6. Only scripts already declared in a project's `package.json` may be
   executed. `start` is preferred on first discovery when available.
7. Runtime state, logs, health information, and private overrides remain in
   MFE Runner's own user-data directory.

The private configuration format is currently version 5 and stores unified
`projectSources[]` inside `workspaces[]`. Version 4 configurations are backed
up and migrated automatically, preserving stable project IDs, overrides,
exclusions, visual order, and local-library link settings.

Rediscovery is review-first: new, unchanged, and missing projects are shown
before the catalog is changed. Canceling the review leaves the active catalog
and running processes untouched.

## Local libraries

A discovered package may be classified as a Library. Angular library metadata
such as `projectType: library` and `ng-package` provides a reliable automatic
suggestion, while other packages can be classified manually.

MFE Runner can:

- run a library normally without configuring local linking;
- optionally enable local linking, selecting `watch` as the development
  script and falling back to `build`;
- infer the artifact directory from `ng-package.json`;
- start the library watcher before linking when the artifact does not exist;
- link one consumer, all consumers, or all configured libraries;
- run only an existing consumer script whose name starts with `link:`;
- restore consumers that were running before a link operation.

Libraries are never treated as consumers. Removing a library
from MFE Runner removes only its private configuration; it does not delete
files or undo links previously created by project-owned scripts.

## Safe removal

Removing a project hides it from the workspace configuration without deleting
its directory. Removing a complete workspace first stops its managed processes
and then deletes only the private MFE Runner configuration. Source files,
repositories, dependencies, and project-owned links are never removed.

## Node.js resolution

Each project, workspace, and global setting supports inherited, automatic, or
explicit Node.js selection:

```text
project → workspace → global settings
```

Automatic mode searches for the nearest applicable `.nvmrc`. Explicit mode
can list locally installed versions from `nvm-sh` or NVM for Windows, while
still allowing manual version input. MFE Runner resolves the `node` and `npm`
executables directly and never constructs a free-form `nvm use` shell command.

A missing requested version blocks the process with a diagnostic message.
MFE Runner never installs Node.js automatically.

## Safety principles

- The Electron renderer is sandboxed with context isolation and no Node.js
  integration.
- The preload exposes a small allowlisted API and the main process validates
  senders and payloads.
- Project scripts are launched with argument arrays and `shell: false`.
- Only scripts declared in `package.json` are eligible for execution.
- Native project actions resolve their paths again in the main process.
- Git inspection is read-only and uses local references.
- Known sensitive fields are redacted from displayed and exported logs.
- Diagnostic exports remove absolute paths by default.
- Project manifests, `.nvmrc`, `.env`, `package.json`, and source files remain
  unchanged.

The only intentional project-side mutation is whatever an explicitly requested
project-owned `link:*` script performs, normally inside `node_modules`.

## Development setup

### Requirements

- Node.js `>=22.12.0` (`24.15.0` recommended);
- npm `>=10` (npm 11 recommended);
- Chrome or Chromium available for Angular headless tests;
- NVM is optional, but recommended for testing Node.js version resolution.

Install dependencies and start the packaged development build:

```bash
npm ci
npm start
```

For Angular renderer development with reload:

```bash
npm run dev
```

### Project structure

```text
src/                    Angular renderer
electron/               Electron main, preload, supervisor, and native adapters
electron/assets/        Application icons and packaging assets
scripts/                Development, packaging, and release automation
docker-server/          Landing page and deployment configuration
vm-smoke-fixture/       Cross-platform smoke-test fixture
```

More detailed documentation:

- [User guide](docs/USER_GUIDE.md)
- [Architecture and security boundaries](docs/ARCHITECTURE.md)
- [Security policy](SECURITY.md)
- [Landing-page and release operations](docker-server/README.md)

### Validation

Run the full local validation before submitting a change:

```bash
npm test
npm run lint
npm run build
```

Focused commands are also available:

```bash
npm run test:electron
npm run test:angular
```

## Contributing

Contributions are welcome. Bug fixes, tests, documentation, translations,
accessibility improvements, platform compatibility fixes, and focused UX
improvements are especially useful.

### Contribution workflow

1. Fork [`danielverissimo/mfe-runner`](https://github.com/danielverissimo/mfe-runner)
   and clone your fork.
2. Create a branch from the current default branch:

   ```bash
   git checkout -b fix/short-description
   ```

3. Install the locked dependencies:

   ```bash
   npm ci
   ```

4. Make a focused change and avoid unrelated formatting or generated output.
5. Add or update tests for behavior changes.
6. Add translations for every new user-facing message in all supported
   languages.
7. Run the validation commands:

   ```bash
   npm test
   npm run lint
   npm run build
   ```

8. Push your branch and open a pull request. Explain the problem, the chosen
   solution, the validation performed, and any platform-specific limitations.
   Include screenshots or a short recording for visual changes.

### Contribution guidelines

- Never commit secrets, signing certificates, private keys, tokens, local
  configuration, installers, or generated `dist/` and `release/` output.
- Preserve the read-only boundary of managed projects.
- Do not add free-form shell execution or accept executable paths directly
  from the renderer.
- Keep macOS, Windows, and Linux behavior in mind when changing native
  adapters, paths, process trees, sockets, installers, or update flows.
- Discuss new production dependencies and broad architectural changes in an
  issue before implementing them.
- Publishing, signing, notarization, and server deployment are maintainer-only
  operations and should not be run from a contribution branch.

If a contribution cannot be validated on every platform, state exactly which
platforms were tested in the pull request.

## Packaging

Official application artifacts are built on the macOS host. Windows and Linux
virtual machines are used to run and test the generated artifacts.

Generate all recommended installers:

```bash
npm run dist:installers
```

Generate one platform and architecture:

```bash
npm run dist:mac:arm64:installer
npm run dist:mac:x64:installer
npm run dist:win:arm64:installer
npm run dist:win:ia32:installer
npm run dist:linux:arm64:installer
npm run dist:linux:x64:installer
```

Every `dist:*` command clears generated `dist/` and `release/` output before
building. Run `npm run clean:artifacts` to perform only that cleanup.

The macOS artifacts require the `mfe-runner-notary` Keychain profile and fail
instead of silently distributing an unnotarized application. Windows
installers remain unsigned until an Authenticode certificate is configured, so
Windows SmartScreen may display a warning.

## Releases and automatic updates

Official binaries and updater metadata are hosted in
[GitHub Releases](https://github.com/danielverissimo/mfe-runner/releases).
The `mferunner.com` server hosts the landing page and reads the public GitHub
release catalog; it does not mirror application binaries.

MFE Runner checks for updates shortly after startup and also exposes
**Help → Check for updates…**. It never downloads or installs an update without
user confirmation.

Maintainers can publish a complete patch release with:

```bash
npm run dist:installers:publish
```

This workflow requires an authenticated GitHub CLI, a clean and synchronized
Git branch, and the required Apple signing and notarization credentials. It
updates the patch version, records and pushes the version files, builds all
installers, uploads a draft release, and publishes it after the complete
artifact set is available.

To publish already-built artifacts for the current version:

```bash
npm run publish:update
```

Existing releases are not overwritten. A correction must use a new version.
See [`docker-server/README.md`](docker-server/README.md) for landing-page
deployment details.
