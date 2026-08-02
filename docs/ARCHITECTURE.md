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

Global settings may store only an optional ngrok executable path. ngrok
authtokens, API keys, domain catalogs, and tunnel state are not persisted in
the Runner configuration.

Each workspace contains:

- `projectSources[]` with stable source IDs and canonical roots;
- reviewed project classifications and overrides;
- optional local-library link configuration;
- `projectOrder` for the saved visual catalog order;
- environment and generic execution policies;
- per-project command, runtime/tool, health, order, and exclusion settings.
- optional `externalServices[]` definitions containing a validated HTTP/HTTPS
  upstream, provider identity, and log-source policy.

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
Rust, Go, and Flutter.

Angular, federation, manifest, and `ng-package` files provide optional evidence
for type and capability suggestions. They do not restrict execution. New
detectors can support other ecosystems without changing the workspace model or
project catalog contracts. Maven XML and TOML files are parsed with fixed-size
limits. Gradle recognition is intentionally static and conservative.
Detectors that do not own a directory return without diagnostics when their
marker is absent. Gradle projects inside a detected Flutter project's
`android/` directory are treated as implementation modules of that Flutter
project rather than independent workspace projects.

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

Supervisor protocol v9 uses an authenticated local Unix socket on macOS/Linux
or a named pipe on Windows. A private random token is required before methods
or events are accepted.

Processes are identified by workspace ID, project ID, PID/group, command ID,
and start time. Port occupancy alone never grants ownership. The main process
reconstructs an adapter-owned `LaunchSpecification` containing executable,
argument array, working directory, sanitized environment, port, and health
check. The supervisor is ecosystem-independent and never receives free-form
renderer commands. Windows wrapper launch is handled by a controlled internal
launcher; normal child execution remains `shell: false`.

Flutter command profiles remain adapter-owned. The project table groups them
as Run, Test, and Build, while an individual launch dialog supplies only a
structured Web, Android, or iOS target and an allowlisted device identifier.
The main process validates that the selected profile matches the target and
rechecks mobile device availability before creating the launch specification.
If no Android device is running, separate allowlisted IPC operations resolve
the Android Emulator from `ANDROID_HOME`, compatible/default SDK locations, or
`PATH`; list AVD IDs with `-list-avds`; and launch only an ID revalidated by the
main process using `-avd`. The detached emulator is not owned by the project
supervisor. The renderer polls the existing Flutter device catalog and resumes
the original action only after one new Android emulator is available.

Flutter Web launch specifications carry an internal `flutter-web` port
strategy. Immediately before spawning, the supervisor reserves a loopback port
and appends the fixed `--web-hostname 127.0.0.1 --web-port <port>` arguments.
The effective port is exposed in the managed-process snapshot and is never
provided by the renderer.

ngrok is modeled as one optional sidecar per managed process. Account and
status operations enter through allowlisted IPC handlers in `electron/main.mjs`.
The main process resolves the executable and configuration, freshly validates
the domain against the account catalog, and obtains the port from the
supervisor snapshot. The renderer never supplies an executable, config path,
port, or free-form arguments.

For domain creation, the renderer supplies only a DNS label and one typed
suffix from the fixed ngrok-managed suffix catalog. `electron/main.mjs`
reconstructs the exact hostname after `electron/lib/contracts.mjs` validates
both fields. Existing account domains are reused without a second mutation.
Because the public Reserved Domains API has no documented availability lookup,
the controlled create call is the final availability check; known conflicts
are normalized before they reach the renderer.

`electron/lib/ngrok.mjs` owns bounded CLI calls, executable/config resolution,
domain normalization, and the fixed HTTP launch specification.
`ProcessSupervisor.startNgrok` validates that specification again and owns the
sidecar state, redacted logs, domain exclusivity, and restart restoration.

Credential command copying reuses the bounded clipboard IPC and contains only
documented placeholders. Opening the ngrok configuration uses a parameterless
IPC intent. The main process reruns ngrok status resolution, canonicalizes and
verifies the detected regular file, then passes that authoritative path to the
IDE adapter in `electron/lib/developer-tools.mjs`; no path is accepted from the
renderer.

External services are non-owned supervisor records with `source: external`.
They never contain a project child process and move through `connecting`,
`online`, `offline`, or `identity-mismatch`. Discovery is explicit and
platform-specific: `lsof` on macOS, `ss` with `lsof` fallback on Linux,
PowerShell TCP/process APIs on Windows, and fixed Docker `container ls` plus
`container inspect` calls. The main process excludes catalog/project ports and
revalidates process or container identity before import, rebind, or stop.

The supervisor periodically checks the validated upstream. Docker logs use a
fixed `docker container logs --follow --tail 200 --timestamps <id>` launch.
File logs are tailed natively with bounded initial content and support append,
truncation, and rotation. When the upstream disappears, collectors and ngrok
stop; matching identity restores monitoring but never restores public exposure.
Global project lifecycle actions only receive managed project IDs and cannot
terminate external targets. Detach removes collectors and sidecars only;
individual termination requires native confirmation and fresh identity checks.

For external ngrok targets, the renderer still sends only service and domain
references. `electron/main.mjs` reconstructs `http://host:port` or
`https://host:port` from the validated workspace definition, and the ngrok
adapter accepts no credentials, path, query, or free-form arguments.

Protocol transitions request a graceful `stopAll` from a recognized obsolete
daemon before terminating it and removing only its scoped socket/pipe, lock,
token, and state. The v2→v3 transition ensures that processes and one-shot
tasks use the runtime environment resolved by the current application instead
of environment variables inherited by a previously launched daemon. The
v3→v4 transition makes signal-terminated child processes retryable instead of
mistaking them for tasks that are still running. The v4→v5 transition disables
npm audit and funding requests only for local linking tasks so they do not
depend on registry network availability. Private workspace configuration is
migrated separately. The v6→v7 transition adds ngrok sidecar state and
lifecycle methods to the authenticated supervisor contract.
The v7→v8 transition replaces detached supervisors that predate controlled
Flutter Web port reservation, ensuring that the effective port is published in
the managed-process snapshot.
The v8→v9 transition adds persistent non-owned external records, bounded log
collectors, identity reconciliation, and external HTTP/HTTPS ngrok upstreams.

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
ending affected managed processes. External services are detached without
terminating their process or container.

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
