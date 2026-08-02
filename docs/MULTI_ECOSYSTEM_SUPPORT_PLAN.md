# Multi-ecosystem support plan

> Cross-ecosystem service note: ngrok is implemented as a supervised HTTP
> sidecar and is intentionally independent from project adapters. It can be
> attached only after a supported ecosystem has produced an active managed
> process with a known port. Account access remains explicit and credentials
> remain in ngrok's official configuration.
>
> External HTTP/HTTPS services use the same generic supervisor model as
> non-owned records. They do not participate in ecosystem runtime resolution
> or global project lifecycle actions.

## Goal

Generalize MFE Runner so a workspace can discover and supervise Node.js,
Java/Maven, Java/Gradle, .NET, Python, Rust, Go, and Flutter projects without changing
their source files or installing runtimes automatically.

Node.js remains stable. Every newly introduced ecosystem starts as Beta.
Java/Maven and Java/Gradle are the first Beta integrations to receive full
implementation and cross-platform validation.

## Architecture decisions

- Each ecosystem is implemented by an adapter that provides project
  detection, structured commands, runtime/tool resolution, launch environment,
  health-check defaults, and a support level.
- The renderer sends only workspace, project, and command identifiers.
  Executables, arguments, working directories, and environment variables are
  reconstructed in the authoritative Electron main process.
- Commands are always launched with argument arrays and `shell: false`.
- Runtime/tool policies use the precedence
  `project -> workspace -> global` and the modes `inherit`, `auto`, and
  `explicit`. Global policies cannot inherit.
- Runtime and tool selections are independent. An explicit unavailable
  selection is never silently replaced.
- Compatibility is represented as `ready`, `warning`, `incompatible`,
  `unavailable`, or `unknown`. Incompatible and unavailable projects cannot be
  started.
- Node local-library linking remains a Node-specific optional capability.

## Configuration and migration

- Upgrade the private configuration to schema version 6.
- Store `executionPolicies` by ecosystem in global settings, workspaces, and
  project overrides.
- Migrate Node policies and default scripts to the generic model while
  preserving workspaces, source IDs, classifications, order, exclusions, and
  local-link configuration.
- Back up the previous private configuration before migration.
- Upgrade the supervisor protocol to version 2. Existing managed processes and
  in-memory logs may be discarded during this development migration; project
  source files must never be removed.

## Ecosystems

### Node.js (stable)

- Preserve package scripts, `.nvmrc`, NVM discovery, npm/pnpm/Yarn metadata,
  default `start` behavior, and local `link:*` workflows.

### Java/Maven (Beta)

- Detect `pom.xml`, Maven Wrapper, modules, coordinates, packaging, Java
  compiler requirements, Spring Boot, Quarkus, and exec plugins.
- Provide structured run/dev, test, and package commands when statically
  identifiable.
- Resolve Maven from an explicit selection, wrapper, `MAVEN_HOME`, known
  installations, or `PATH`.

### Java/Gradle (Beta)

- Detect Gradle settings/build files, wrappers, subprojects, Java toolchains,
  Application, Spring Boot, and Quarkus plugins.
- Provide structured `run`, `bootRun`, `quarkusDev`, `test`, and `build`
  commands without running `gradle tasks` during discovery.

### JDK

- Resolve requirements from Gradle toolchains, Maven compiler configuration,
  `.sdkmanrc`, `.java-version`, `JAVA_HOME`, installed JDKs, and `PATH`.
- Detect standard macOS, Linux, and Windows installations plus SDKMAN, jenv,
  asdf, and mise paths.
- Configure `JAVA_HOME` and `PATH`; never download or install a JDK.

### Other Beta adapters

- .NET: `.sln`, `.csproj`, `global.json`, and structured `dotnet` commands.
- Python: `pyproject.toml`, requirements, Pipfile, Poetry, uv, virtual
  environments, and known framework entrypoints.
- Rust: Cargo packages/workspaces and rustup toolchain files.
- Go: modules/workspaces and `go` commands with `GOTOOLCHAIN=path`.
- Flutter: `pubspec.yaml`, Flutter/FVM resolution, Web/Android/iOS run/test/build,
  and explicit device discovery.

## Parsing and safety

- Use `fast-xml-parser` for Maven files with entity processing disabled.
- Use `smol-toml` for Cargo, Python, and TOML toolchain metadata.
- Pin both dependencies through the lockfile.
- Limit inspected file sizes and scan depth.
- Discovery does not access the network, run builds, resolve plugins, or list
  Gradle tasks.
- Unknown or ambiguous execution entrypoints remain visible but require a
  structured user choice before execution.

## Interface and documentation

- Replace the global Node-only card with collapsible runtime/tool cards.
- Show only relevant ecosystems in workspace and project settings.
- Display technology badges, Beta badges, runtime readiness, required/effective
  versions, command choices, and a consolidated workspace Beta notice.
- Keep Host and MFE as informative capabilities rather than required project
  types.
- Add all messages in Brazilian Portuguese, English, Spanish, and French.
- Update README, architecture, user guide, security notes, and landing page.

## Delivery checklist

- [x] Record the implementation plan.
- [x] Add generic contracts and configuration v6 migration.
- [x] Move Node behavior behind the stable adapter.
- [x] Generalize supervisor launch specifications.
- [x] Implement JDK and Java/Maven.
- [x] Implement Java/Gradle.
- [x] Adapt Angular runtime, command, diagnostics, and Beta UI.
- [x] Add .NET, Python, Rust, and Go Beta adapters.
- [x] Add Flutter Beta adapter and FVM/device support.
- [x] Add the cross-platform Android AVD fallback and detached emulator launch.
- [x] Update translations and public documentation.
- [x] Run Electron tests.
- [x] Run Angular tests.
- [x] Run lint and production build.
- [ ] Complete manual Java acceptance on macOS, Windows, and Linux.

Automated validation completed on 2026-07-27. Local runtime inspection on
macOS confirmed JDK 8/11/15/17/21 installations, Maven 3.9.9, and Gradle 8.13.
Manual start/stop/restart acceptance still needs to be performed on all three
desktop platforms before Java is promoted beyond Beta.

## Acceptance

- Mixed-technology roots are discovered without executing project code.
- Missing runtimes produce diagnostics without hiding the project.
- Only authoritative structured commands can be launched.
- Node behavior and local linking remain compatible.
- Java/Maven and Java/Gradle work with wrappers and system tools.
- Beta technologies are clearly identified in the app and documentation.
- No discovery, execution, removal, or migration step edits or deletes project
  source files.
