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

The private configuration uses schema version 5 and is stored in Electron's
per-user application data directory.

Each workspace contains:

- `projectSources[]` with stable source IDs and canonical roots;
- reviewed project classifications and overrides;
- optional local-library link configuration;
- `projectOrder` for the saved visual catalog order;
- environment and Node.js policy;
- per-project script, runtime, order, and exclusion settings.

A root project uses the source ID as its project ID. Nested projects use
`<sourceId>/<relativePath>`. These IDs allow settings and visual positions to
survive path rescans and source reordering.

Version 4 configurations are backed up before migration. Previous shell, MFE
root, and library entries become unified project sources.

## Discovery

Discovery is detector-based. `PackageJsonProjectDetector` is the first
implementation and normalizes any package with `package.json` into a common
candidate model.

Angular, federation, manifest, and `ng-package` files provide optional evidence
for type and capability suggestions. They do not restrict execution. New
detectors can support other ecosystems without changing the workspace model or
project catalog contracts.

Configured source roots are bounded, duplicate paths are rejected, and
overlapping results are deduplicated by canonical project path. Generated,
dependency, and VCS directories are skipped.

## Process supervision

The supervisor protocol uses an authenticated local Unix socket on macOS/Linux
or a named pipe on Windows. A private random token is required before methods
or events are accepted.

Processes are identified by workspace ID, project ID, PID/group, script, and
start time. Port occupancy alone never grants ownership. Commands use argument
arrays with `shell: false` and must resolve to scripts declared by the
authoritative project catalog.

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
