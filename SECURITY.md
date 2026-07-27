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
- launches declared scripts with argument arrays and `shell: false`;
- keeps the renderer sandboxed and validates preload IPC payloads;
- uses authenticated local IPC for its persistent supervisor;
- treats project files and Git state as read-only;
- redacts known sensitive values in logs and diagnostic exports;
- removes absolute paths from diagnostic exports by default.

An explicitly requested project-owned `link:*` script may update that project's
dependencies. Its behavior is controlled by the project, not by MFE Runner.

## Maintainer operations

Signing credentials, notarization profiles, GitHub authentication, SSH access,
and deployment secrets must never be committed. Release publication and
landing-page deployment are restricted to authorized maintainers using local
credentials and protected GitHub permissions.
