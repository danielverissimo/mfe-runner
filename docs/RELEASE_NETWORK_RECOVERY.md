# Recovery from Linux release download failures

The 0.1.25 build on 2026-11-26 generated macOS x64/arm64 and Windows arm64/ia32
installers, then stopped with `getaddrinfo EAI_AGAIN github.com` inside the
Linux packaging container. The failed operation was an Electron download, not
the Angular build or macOS notarization. At failure, only `package.json` and
`package-lock.json` had been incremented; the release commit and publication
had not run.

## Owning sources and change

- ESTABLISHED: `scripts/release-installers.sh` prepares Linux prerequisites
  before `release:bump`, builds every installer before committing the version,
  then pushes and invokes `publish:update`.
- ESTABLISHED: `scripts/build-linux-installers.sh` runs Linux packaging in an
  isolated Node 24 Docker image with read-only host dependencies and shared
  Electron/tool caches. This isolation is preserved.
- ENFORCED: `scripts/build-network.mjs::runBuildCommand` streams subprocess
  output with `shell: false`; the Docker availability query has a 15-second
  limit. Diagnostic capture for retry classification is bounded to 32 KiB.
- ENFORCED: `retryNetwork` allows three attempts with 3/6-second backoff only
  for recognized temporary DNS, timeout or connection errors. Permanent
  failures, including checksum errors, stop without retry.
- ENFORCED: `prepare-linux-electron.mjs::prepareLinuxElectron` uses the
  existing locked `@electron/get` build dependency on the host, prepares Linux
  x64/arm64 ZIPs with their official SHA-256 checksums, verifies cached ZIPs,
  repairs corrupt prepared files, and writes prepared output atomically.
  Downloads have a 180-second abort signal per attempt.
- ENFORCED: the container receives a directory of already verified ZIPs through
  `--config.electronDist`; it need not resolve github.com to download Electron.
  Other packaging tools may still need networking and use bounded retries.

The existing electron-builder 26.15.3 implementation in
`node_modules/app-builder-lib/out/electron/ElectronFramework.js::selectElectron`
supports a directory of architecture-specific Electron ZIPs. Its documented
[`electronDist` configuration](https://www.electron.build/v26/docs/api/app-builder-lib.interface.configuration/)
is used without disabling TLS or checksum validation. No new dependency,
global Docker/DNS configuration, or unrelated service is changed.

## Resume the existing version

After a partially successful full release, do not restart the full publication
command: it requires a clean Git tree, bumps again and cleans previous output.
Keep the version already present in `package.json` and the existing installers:

```bash
./scripts/build-linux-installers.sh deb rpm --arm64 --x64
npm run verify:packaged-dependencies
```

Commit and push the version files plus the build fixes before invoking:

```bash
npm run publish:update
```

That last command publishes existing artifacts. It does not compile the app or
create the source-version commit. Never publish if the preceding build or
verification is incomplete.

## Files changed

- `scripts/build-network.mjs` and its test (new)
- `scripts/prepare-linux-electron.mjs` and its test (new)
- `scripts/build-linux-installers.sh`
- `scripts/release-installers.spec.mjs`
- `package.json`: adds the new regression suites to `test:release-installers`;
  the existing version bump is preserved.
- `README.md`, `docker-server/README.md`, and this report

The prior 0.1.25 version changes are preserved, not generated again by this fix.

## Validation

- `npm run test:release-installers`: 12 passed. Covers transient and
  persistent DNS errors, permanent failures, subprocess timeout, bounded
  diagnostics, literal arguments, both Linux architectures, verified cache
  reuse, corrupt cache repair, checksum rejection, and preflight ordering.
- Including the existing clean-artifact and packaged-dependency suites:
  16 tests passed.
- JavaScript and shell syntax checks and `git diff --check`: passed.
- Real host preparation of Electron 43.2.0 Linux x64/arm64: passed, including
  official checksum verification and subsequent cache reuse.
- Real selective recovery using
  `./scripts/build-linux-installers.sh deb rpm --arm64 --x64`: completed with
  exit 0. Generated the 0.1.25 x64/arm64 DEB and RPM installers using the
  prepared Electron ZIPs. No new version bump or full artifact cleanup.
- `npm run verify:packaged-dependencies`: all six unpacked applications passed,
  each with 26 required packages (two macOS, two Windows, two Linux).
- All 12 preexisting macOS/Windows artifacts were compared before/after recovery
  and are byte-identical by SHA-256.
- All eight expected installers are present. Four `latest*.yml` files match
  0.1.25; all ten referenced assets match their SHA-512 checksums and sizes.

The Angular application and its dependencies were not changed by this fix;
renderer tests/build are not repeated for release-script-only changes.
No commit, Git push, installer installation, or public release is performed by
these validations. Cross-platform application runtime testing is separate from
installer generation.
