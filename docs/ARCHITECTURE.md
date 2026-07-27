# Architecture

## Runtime boundaries

MFE Runner has three runtime boundaries:

1. the sandboxed Angular renderer displays catalogs and sends typed user
   intents;
2. the Electron main process owns native dialogs, configuration, discovery,
   Git inspection, developer tools, updates, and IPC validation;
3. a detached Node supervisor owns child processes, health checks, elapsed
   times, and in-memory log buffers.

The renderer has context isolation enabled and no Node.js integration. A small
preload bridge exposes allowlisted methods. Project and executable paths are
resolved again in the main process instead of being trusted from renderer
payloads.

## Configuration

The private configuration uses schema version 6 and is stored in Electron's
per-user application data directory.

Each workspace contains:

- `projectSources[]` with stable source IDs and canonical roots;
- reviewed project classifications and overrides;
- optional local-library link configuration;
- `projectOrder` for the saved visual catalog order;
- environment and generic execution policies;
- per-project command, runtime/tool, health, order, and exclusion settings.

A root project uses the source ID as its project ID. Nested projects use
`<sourceId>/<relativePath>`. These IDs allow settings and visual positions to
survive path rescans and source reordering.

Earlier configurations are backed up before migration. Node policies become
the Node runtime component in `executionPolicies`; saved scripts become stable
command IDs where possible. Workspace sources, classifications, ordering,
exclusions, and local Node library links are preserved.

## Discovery

Discovery is detector/adaptor based. Each `ProjectDetector` normalizes its
ecosystem into the same project candidate model. The initial registry contains
Node.js (stable) and Beta adapters for Java/Maven, Java/Gradle, .NET, Python,
Rust, and Go.

Angular, federation, manifest, and `ng-package` files provide optional evidence
for type and capability suggestions. They do not restrict execution. New
detectors can support other ecosystems without changing the workspace model or
project catalog contracts. Maven XML and TOML files are parsed with fixed-size
limits. Gradle recognition is intentionally static and conservative.

Each adapter provides structured `CommandProfile` entries and runtime
requirements. `RuntimeResolution` combines project, workspace, and global
policies independently for runtimes and tools, then produces a compatibility
state. Explicit unavailable choices are not replaced. Discovery never invokes
wrappers, build tools, project scripts, network access, or dependency
resolution.

Configured source roots are bounded, duplicate paths are rejected, and
overlapping results are deduplicated by canonical project path. Generated,
dependency, and VCS directories are skipped.

## Process supervision

Supervisor protocol v2 uses an authenticated local Unix socket on macOS/Linux
or a named pipe on Windows. A private random token is required before methods
or events are accepted.

Processes are identified by workspace ID, project ID, PID/group, command ID,
and start time. Port occupancy alone never grants ownership. The main process
reconstructs an adapter-owned `LaunchSpecification` containing executable,
argument array, working directory, sanitized environment, port, and health
check. The supervisor is ecosystem-independent and never receives free-form
renderer commands. Windows wrapper launch is handled by a controlled internal
launcher; normal child execution remains `shell: false`.

The v1→v2 transition stops the obsolete daemon when possible and removes only
its scoped socket/pipe, lock, token, and state. Old process/log state may be
discarded, while private workspace configuration is migrated separately.

When configured to keep processes running, closing Electron disconnects the
client while the supervisor remains active. It becomes eligible to exit only
when there are no authenticated clients and no active processes.

## Read/write boundary

Managed project sources are read-only from MFE Runner's perspective. Discovery,
Git inspection, runtime resolution, and developer shortcuts do not edit project
files.

The only intentional project-side mutation is the result of a user-requested
project-owned `link:*` script, normally inside the consumer's `node_modules`.
The Runner itself never rewrites sources, package manifests, environment files,
federation manifests, or Git state.

Removing a project or workspace changes only private Runner configuration after
ending affected managed processes.

## Logs and diagnostics

Logs are redacted before entering the supervisor buffer and classified as info,
warning, or error. The configured limit is applied per process. Renderer
bookmarks and view state are temporary.

Diagnostic export reconstructs data from authoritative main-process catalogs
and supervisor logs. It validates requested entry IDs, redacts sensitive values
again, and removes absolute paths by default before creating the ZIP.

## Distribution

The app is packaged on macOS for supported macOS, Windows, and Linux
architectures. Official binaries and updater metadata are published to GitHub
Releases. `mferunner.com` serves only the landing page and a read-only proxy for
the public release catalog.

Signing, notarization, release publication, and landing-page deployment are
maintainer-only operations.
