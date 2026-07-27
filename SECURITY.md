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

MFE Runner executes scripts already declared by projects that the local user
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
