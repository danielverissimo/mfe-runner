# Security policy

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Contact the
maintainer privately through the contact information on
[mferunner.com](https://mferunner.com/) and include the affected version,
operating system, clear reproduction steps, and expected impact. Remove
secrets and personal data from any proof of concept.

Allow reasonable time for investigation and a coordinated fix before public
disclosure.

## Supported versions

Security fixes are provided through the latest published release. Users should
update through the application or
[GitHub Releases](https://github.com/danielverissimo/mfe-runner/releases).

## Trust model

MFE Runner executes structured commands declared by supported project adapters that the local user
explicitly adds to a workspace. Only add trusted project directories.

The application:

- does not accept arbitrary shell commands from the renderer;
- launches adapter-owned command profiles with argument arrays and
  `shell: false`;
- reconstructs executable paths and arguments in the main process from
  workspace/project/command IDs;
- keeps the renderer sandboxed and validates preload IPC payloads;
- uses authenticated local IPC for its persistent supervisor;
- treats project files and Git state as read-only;
- redacts known sensitive values in logs and diagnostic exports;
- removes absolute paths from diagnostic exports by default.

Discovery is deliberately passive. It does not access the network or execute
wrappers, builds, Maven plugins, Gradle tasks, dependency managers, or project
scripts. XML/TOML/build metadata is size-limited before parsing; XML entity
expansion is disabled; Gradle parsing recognizes only conservative static
patterns. Missing runtimes and tools are diagnosed, never installed.
Flutter device discovery is an explicit read-only query to the selected local
Flutter executable; device IDs and commands are validated before launch.
Android AVD discovery invokes only the resolved SDK Emulator with
`-list-avds`. Launch accepts only an exact ID from a freshly queried catalog
and reconstructs the fixed `-avd` argument in the main process with
`shell: false`; the renderer cannot provide an executable or extra arguments.

External-service discovery is explicit. The main process invokes only fixed
listener-inspection commands for the current platform and fixed Docker CLI
operations with `shell: false`. Renderer requests identify a workspace,
catalog candidate, or saved service; executable paths, container arguments,
process IDs, upstream URLs, and log launch arguments are reconstructed from
freshly validated authoritative state. Commands and diagnostics exposed to the
renderer are bounded and sanitized.

Process/container identity and published port are revalidated before import,
rebind, or termination. Unlinking never sends a signal to the target. Local
process or Docker termination requires a native confirmation and is never part
of global stop/restart or exit handling. Log files must be selected with the
native picker and canonicalized before they may be followed. The file follower
is read-only and bounded; Docker logging uses only `container logs --follow`.
Remote hosts are monitor-only and cannot be terminated by MFE Runner.

ngrok account queries occur only after explicit user actions. The Runner does
not read, persist, render, or log ngrok authtokens or API keys. The main process
resolves the installed executable and the configuration path reported by
`ngrok config check`, bounds CLI output and execution time, and redacts
credential-shaped diagnostics. Reserved domains are freshly revalidated before
launch. The supervisor accepts only the fixed HTTP endpoint argument shape,
uses `shell: false`, and prevents a domain from being shared by two managed or
external services.
Domain creation requires a native confirmation because it changes the user's
ngrok account and may have billing consequences.
The renderer cannot submit an arbitrary hostname for creation: it sends only a
single validated DNS label and an allowlisted ngrok suffix. The main process
reconstructs the hostname, revalidates it, and normalizes account-conflict
errors without exposing operation identifiers or raw CLI output.
Credential command copy actions contain placeholders only. Opening the ngrok
configuration accepts no renderer path: the main process resolves it again
through `ngrok config check`, canonicalizes it, verifies that it is a regular
file, and launches only the IDE selected through the existing developer-tool
policy.

Windows `.cmd`/`.bat` wrappers use a controlled internal launcher because they
cannot be spawned directly on Windows. The wrapper path and arguments still
come from the authoritative adapter, never from renderer-provided command
text.

An explicitly requested project-owned `link:*` script may update that project's
dependencies. Its behavior is controlled by the project, not by MFE Runner.

## Maintainer operations

Signing credentials, notarization profiles, GitHub authentication, SSH access,
and deployment secrets must never be committed. Release publication and
landing-page deployment are restricted to authorized maintainers using local
credentials and protected GitHub permissions.
