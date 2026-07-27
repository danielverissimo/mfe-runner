# MFE Runner user guide

MFE Runner is a desktop control center for local applications, services,
frontends, monoliths, monorepos, micro frontends, and shared libraries. A
project does not need to use Angular or micro frontend architecture. Node.js
support is stable. Java/Maven, Java/Gradle, .NET, Python, Rust, and Go are Beta
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
