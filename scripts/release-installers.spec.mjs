import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const projectRoot = new URL('../', import.meta.url);

test('complete installer build includes DEB and RPM for both Linux architectures', async () => {
  const packageJson = JSON.parse(
    await readFile(new URL('package.json', projectRoot), 'utf8'),
  );

  assert.match(
    packageJson.scripts['dist:installers'],
    /build-linux-installers\.sh deb rpm --arm64 --x64/,
  );
  assert.match(
    packageJson.scripts['dist:linux:arm64:rpm'],
    /build-linux-installers\.sh rpm --arm64/,
  );
  assert.match(
    packageJson.scripts['dist:linux:x64:rpm'],
    /build-linux-installers\.sh rpm --x64/,
  );
});

test('release prepares the Linux container before changing the published version', async () => {
  const releaseScript = await readFile(
    new URL('scripts/release-installers.sh', projectRoot),
    'utf8',
  );

  const prerequisiteCheck = releaseScript.indexOf('build-linux-installers.sh --prepare');
  const versionBump = releaseScript.indexOf('npm run release:bump');
  assert.ok(prerequisiteCheck >= 0);
  assert.ok(versionBump > prerequisiteCheck);
});

test('release builds every installer before committing and pushing the version', async () => {
  const releaseScript = await readFile(
    new URL('scripts/release-installers.sh', projectRoot),
    'utf8',
  );

  const installerBuild = releaseScript.indexOf('npm run dist:installers');
  const versionCommit = releaseScript.indexOf('git commit');
  const versionPush = releaseScript.indexOf('git push');
  assert.ok(installerBuild >= 0);
  assert.ok(versionCommit > installerBuild);
  assert.ok(versionPush > versionCommit);
});

test('Linux packaging uses an isolated Node 24 container with RPM tools', async () => {
  const [buildScript, dockerfile] = await Promise.all([
    readFile(new URL('scripts/build-linux-installers.sh', projectRoot), 'utf8'),
    readFile(new URL('scripts/linux-packager.Dockerfile', projectRoot), 'utf8'),
  ]);

  assert.match(dockerfile, /^FROM node:24\.15\.0-bookworm-slim@sha256:/m);
  assert.match(dockerfile, /apt-get install[^\n]*binutils ca-certificates rpm xz-utils/);
  assert.match(buildScript, /docker info/);
  assert.match(
    buildScript,
    /source=\$NODE_MODULES_DIR,target=\/project\/node_modules,readonly/,
  );
  assert.doesNotMatch(buildScript, /run_in_linux_packager npm ci/);
});

test('GitHub publication uploads RPM files and requires both architectures', async () => {
  const publishScript = await readFile(
    new URL('docker-server/scripts/publish-update.sh', projectRoot),
    'utf8',
  );

  assert.match(publishScript, /MFE-Runner-\$VERSION-\*\.rpm/);
  assert.match(publishScript, /if \[ "\$RPM_COUNT" -ne 2 \]/);
});
