# MFE Runner user guide

MFE Runner is a desktop control center for local applications, services,
frontends, monoliths, monorepos, micro frontends, and shared libraries. A
project does not need to use Angular or micro frontend architecture. Node.js
support is stable. Java/Maven, Java/Gradle, .NET, Python, Rust, Go, and Flutter are Beta
integrations and are labeled as such in the workspace.

## Workspaces

A workspace groups projects that are normally developed together. It can
contain any number of configured paths and does not require a shell, MFE, main
project, or library.

Each path can point to an exact project, a directory containing multiple
projects, or a monorepo containing root and nested projects.

When a path is added, MFE Runner scans it and displays progress. Generated and
dependency directories such as `node_modules`, `dist`, `.angular`, and `.git`
are ignored.

The review screen shows every candidate with its relative path, detection
evidence, and suggested type:

- **Project** for an executable application, service, frontend, or package;
- **Library** for a reusable package.

Automatic classification is only a suggestion. You can change it, and a manual
choice is preserved during later rediscovery. Host and MFE badges are
informative capabilities rather than required project types.

## Rediscovery

Rediscovery scans the configured sources and presents unchanged, new, and
missing projects before changing the catalog. Confirming applies the reviewed
result. Canceling keeps the previous configuration and running processes.

Projects removed by a confirmed review are stopped when necessary, but no
source file is deleted.

## Project order

Use the project options menu to move an item up or down. The order is stored in
the workspace and restored on the next launch or discovery.

Reordering is available while the complete project list is visible. It is
disabled while filtering by name or showing only running projects. Newly
discovered projects without a saved position are appended to the catalog.

Visual order is separate from startup order. Startup order continues to favor
libraries and watchers before applications and hosts, unless explicitly
overridden in project settings.

## Running projects

The Projects screen supports individual and batch process controls. Commands
are detected statically by each ecosystem adapter and displayed before
execution. Node prefers the declared `start` script. Java recognizes supported
Maven/Gradle application plugins and safe run/test/build profiles. Ambiguous
projects remain discovered but require a reviewed command.

The status column reports stopped, starting, healthy, failed, port conflict,
and one-shot task states. A port conflict can be inspected and resolved only
after explicit user confirmation.

## Runtimes and tools

All ecosystems use this precedence:

```text
project → workspace → global settings
```

Choose automatic detection or an explicit local installation. Workspace
settings display only ecosystems discovered in that workspace, while project
settings display only relevant runtime/tool components. An incompatible or
unavailable result blocks Start and explains why. MFE Runner never downloads
or installs a runtime, SDK, wrapper, package manager, or toolchain.

### Node.js

Node.js is resolved with this precedence:

```text
project → workspace → global settings
```

Automatic mode reads the nearest applicable `.nvmrc`. An explicit setting can
use a locally installed NVM version or a manually entered version. MFE Runner
does not install Node.js and blocks execution when the requested runtime is
unavailable.

### Java/Maven and Java/Gradle (Beta)

The Runner detects Maven/Gradle wrappers, installed tools, JDK requirements,
Spring Boot, Quarkus, Application plugins, and common test/build tasks without
running the build during discovery. JDK, Maven, and Gradle can be selected
independently at global, workspace, or project level.

### .NET, Python, Rust, and Go (Beta)

These adapters provide static project discovery, basic runtime diagnostics,
and structured run/test/build commands. Python launches the resolved
interpreter directly. Go sets `GOTOOLCHAIN=path` so a command cannot download a
toolchain automatically. Review diagnostics and command profiles before use,
and report platform-specific gaps with a minimal fixture when possible.

### Flutter (Beta)

Flutter applications are detected from `pubspec.yaml`. The command selector is
reduced to Run, Test, and Build. When an individual Flutter action is started,
the Runner opens a target dialog for Web, Android, or iOS. Web does not require
a device; Android and iOS require selecting an available physical device,
emulator, or simulator from the refreshed Flutter catalog. FVM is resolved
automatically from the project-local SDK link or its metadata before falling
back to a Flutter installation already available on the machine. Flutter and
FVM are never installed automatically. When Android has no running device, the
same dialog lists AVDs already configured in the local Android SDK. Starting an
AVD keeps the dialog open until Flutter detects it, then continues the selected
Run, Test, or Build action automatically. Closing the Runner or stopping the
project does not close that emulator. The Runner does not create, repair, or
install AVDs.

When running on Web, the Runner assigns an available local port to Flutter and
shows it in the **Port** column. The local-address and ngrok actions use this
same HTTP port, which is hidden again after the process stops.

## Publishing a process with ngrok

Open **Settings > ngrok** to check the local installation and the configuration
file selected by the ngrok CLI. If the agent is missing, use the operating
system-specific guidance and the official installation page. MFE Runner does
not run package managers or installers.

Configure the authtoken and API key outside the Runner with the official ngrok
configuration commands. The authtoken starts the HTTP endpoint; the API key
lists or creates reserved domains. They are distinct credentials and remain
exclusively in ngrok's configuration. Use **Test API access** to query the
account explicitly.

Use the individual **Copy** buttons to copy either credential command with its
placeholder. Replace the placeholder only in your terminal; the Runner does
not request the credential value. When a valid configuration file is detected,
**Open in editor** opens that exact file using the IDE selected in Settings.
If no compatible IDE is configured, select one in the developer-tools section
before trying again.

For a running project with a known port, choose **Link ngrok** in the project
row, refresh the reserved-domain catalog, and select an exact hostname. A new
domain can be created by entering only its short name and choosing one of the
ngrok suffixes shown by the Runner. A full hostname cannot be entered manually.
The dialog identifies matching domains already present in the account. For a
new domain, ngrok confirms final availability when the user requests creation;
an unavailable suffix remains marked so another option can be selected.
Creation continues only after confirming the plan/billing warning. When ngrok
returns a CNAME target, configure that DNS record before relying on the public
URL. Wildcards are visible but incompatible with this version.

An online tunnel can be opened, copied, or stopped from the same row. Stopping
the project also stops its tunnel. Restarting the project with **Restart**
restores it after the project is ready; stopping and starting manually does
not. If the interface closes under the keep-running policy, both remain in the
local supervisor.

## Linking a service started elsewhere

Choose **Link external service** above the process table when an application is
already running in IntelliJ, Docker, another terminal, or on a reachable host.
The **Discovered** tab lists eligible local TCP listeners and running Docker
containers with published ports. Refresh is explicit; the Runner does not scan
continuously. A port already associated with a workspace project, managed
process, or linked service is omitted.

The **Add manually** tab accepts a name, HTTP/HTTPS scheme, host, and TCP port.
Use it for remote or network services as well as local services that cannot be
identified automatically. A Docker container with multiple published ports is
listed once per eligible host port so the intended upstream is explicit.

Docker services use `docker container logs --follow`. For a generic process,
select an optional application log file. MFE Runner can follow existing and new
content and handles truncation or rotation, but it cannot recover stdout/stderr
already captured by IntelliJ. Configure the application to write a log file if
that output must appear in the Runner. Without a log source, only monitoring,
identity, ngrok, and Runner action events are shown.

External rows can open or copy the upstream address and link ngrok while they
are online. Going offline stops the collector and ngrok. The Runner reconnects
monitoring when the same identity returns, but public exposure is never restored
automatically. A reused port with a different PID is marked **Identity changed**
until the user confirms the new binding.

**Unlink without stopping** only removes the saved definition and Runner-owned
collectors/tunnels. **Stop external service** is separate, requires confirmation,
and is available only for a revalidated local process or Docker container.
Remote services cannot be stopped. Global project actions and exit policy never
terminate external services. Docker must already be installed and its daemon
available; MFE Runner does not install or configure it.

## Health checks

Project settings can use no health check, process-liveness, a local TCP port,
or a local HTTP endpoint. HTTP checks are limited to the configured local port
and path; a remote URL cannot be supplied by the renderer.

## Local libraries

A Library can run like any other project. Local linking is optional.

When local linking is enabled, configure its development script, relative
artifact directory, and preferred consumer script beginning with `link:`.
Links can be requested for one consumer, every consumer of one library, or all
configured libraries.

MFE Runner can prepare the artifact, link consumers sequentially, and restore
consumers that were previously active. The project-owned link script may change
its `node_modules`; the Runner does not edit package manifests or sources.

## Logs and diagnostics

The compact panel and full Logs screen provide:

- filters for one or more projects;
- case-insensitive text search or regular expressions;
- info, warning, and error level filters;
- pause without stopping capture and optional follow mode;
- line bookmarks and previous/next error navigation;
- a selected time interval;
- copy selected text, selected interval, or filtered logs;
- sanitized diagnostic ZIP export.

Diagnostic exports can include workspace metadata, project runtimes, Git
context, warnings, and selected logs. Absolute paths are removed by default,
and known sensitive values are redacted again during export.

The per-process log buffer limit is configurable in Settings.

## Appearance

Settings provides Light, Dark, and System themes. System is the default for new
and existing configurations that do not contain an explicit preference. It
follows operating-system appearance changes while the application is open.
The selected preference is global, is applied immediately to both the renderer
and the native Electron window, and is preserved between launches.

## Git context

Git inspection is read-only. MFE Runner shows the current branch, abbreviated
commit, dirty state, modified file count, and local ahead/behind values when an
upstream exists. It never performs `fetch`, `checkout`, commit, or other Git
mutations.

## Development shortcuts

Each project can be opened in a detected or selected IDE, the platform file
manager, a terminal at the project directory, or the default browser at its
local address. The options menu can also copy the canonical project path or
local address.

## Closing the interface

Settings provides two lifecycle policies:

- **Keep processes running — recommended:** the Electron interface closes,
  while a lightweight local supervisor continues managing processes and
  capturing logs. Opening MFE Runner again reconnects to the same supervisor
  and restores its process state, elapsed times, and buffered logs.
- **End managed processes on exit:** MFE Runner asks the supervisor to close
  every managed session before the interface exits.

The supervisor is started only for the current user and communicates through
authenticated local IPC. It is not installed as a system service and does not
survive a machine restart.

## Safe configuration removal

Removing an individual project or library removes it only from MFE Runner's
private workspace configuration. Removing a workspace first ends its managed
processes and then removes that private configuration.

Neither action deletes project folders, source files, repositories,
dependencies, or links created by project scripts.

## Languages and updates

The app supports Brazilian Portuguese, English, Spanish, and French. The saved
language is restored when the app starts.

MFE Runner checks GitHub Releases for updates after startup and through
**Help → Check for updates…**. Download and installation require explicit user
confirmation.


## VCLI releases

1. Run the updated MFE Runner from this checkout (`npm start`, using a Node
   version accepted by the installed Angular CLI). This source change does not
   replace a previously installed application.
2. Add the VCLI repository root as a workspace source and confirm the root
   Node.js project. If already configured, use **Rediscover** and apply the
   review. VCLI appears as one Node.js project: its native `src-tauri` Cargo
   project is part of that application. Generated `target` and
   `release-worktrees` directories are excluded from scanning. On rediscovery,
   previously listed native/release copies are removed from the catalog after
   review; their source files are preserved.
3. Stop the development process for that row before starting a release.
   Choose **Gerar release do VCLI** in the tools menu, or select it in the
   command dropdown and press Start.
4. Enter an unused stable version (`X.Y.Z`). Choose all platforms or one of
   macOS/Windows/Linux with x64/arm64, and select **Local · macOS + Docker** or
   **GitHub Actions**. The local flow requires macOS; including macOS targets
   in either flow also requires a Mac for DMG validation. On other systems,
   choose Actions and a Windows/Linux target.
5. Keep **Validar sem publicar** for a validation run or explicitly choose
   **Publicar release**. Review inclusion of tracked working-tree changes.
   Untracked files are excluded unless their checkbox is selected (the VCLI
   orchestrator may include its own bootstrap tooling automatically).
6. Optionally select an account from this computer's GitHub CLI installation.
   The list loads when the dialog opens; **Atualizar contas** reloads it.
   Accounts come from `gh auth status --hostname github.com --json hosts`,
   independently of VCLI's own settings. Accounts with unavailable
   authentication are disabled. The **Usar conta ativa do GitHub CLI** option
   preserves the existing default. Selecting a specific account sends only its
   login as `--gh-user`; refreshing never silently replaces a selected account
   that disappeared. If no accounts are found, authenticate with `gh auth login`
   and refresh. No token is requested or displayed by Runner.
   Optional public-key and release-notes files require absolute paths, without
   shell expansion such as `~`. Leave them empty to use the orchestrator's
   defaults. No private key or password is requested by Runner.
7. Confirm the native dialog. Runner opens the selected project's Logs view;
   output, failures and exit status come from the managed process.

**Validation has remote effects:** the VCLI `--dry-run` flow still creates a
release worktree/commit, pushes a provenance branch and executes local or
Actions builds. It skips publishing the GitHub Release. Canceling the native
confirmation starts no process. Discovery and opening the form are read-only.

The root project must be named `vcli`, contain `distribution.config.json` and
`src-tauri/tauri.conf.json`, and expose
`release:publish: node scripts/release-orchestrator.mjs` in `package.json`.
Runner recognizes that exact existing contract; it does not generate or
rewrite release scripts in the managed project. After changes to that entry
point, rediscover the repository.

Install and authenticate the tools required by the VCLI distribution guide
before launching. Runner uses the resolved Node runtime and inherited
environment. On macOS it also appends conventional Cargo, Homebrew and Docker
CLI directories as PATH fallbacks, preserving the selected Node/inherited
PATH first. Runner installs no tools. The VCLI orchestrator owns signing,
keychain access, local private profiles, notarization, GitHub access, disk-space
checks, target builds and artifact verification. Actions mode requires the
project's CI configuration and secrets; local mode reads the operator's local
keys/profiles. Neither mode retrieves secrets from Actions into Runner.

Releases are individual actions. Workspace startup skips a release configured
as the default command, restoration skips release records, and individual or
workspace restart cannot repeat a VCLI release. Open the form again for a new
execution. Stop cancels the managed process; it does not undo a branch push or
remove a draft/worktree already created by the project script. On failure or
validation, use the recovery paths printed by the VCLI orchestrator. The staged
low-level publisher is not configured by this dialog.

Supervisor protocol v10 replaces older detached daemons so release parameters
and restart guards are understood. The existing protocol migration gracefully
stops previously managed processes before replacement; restart development
processes after updating Runner if needed.

See [VCLI release integration evidence](VCLI_RELEASE_INTEGRATION.md) for local
checks and the distinction between simulated execution and a real release.
