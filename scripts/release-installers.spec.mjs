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
    /electron-builder --linux deb rpm --arm64 --x64 --publish never/,
  );
  assert.match(packageJson.scripts['dist:linux:arm64:rpm'], /--linux rpm --arm64/);
  assert.match(packageJson.scripts['dist:linux:x64:rpm'], /--linux rpm --x64/);
});

test('release checks rpmbuild before changing the published version', async () => {
  const releaseScript = await readFile(
    new URL('scripts/release-installers.sh', projectRoot),
    'utf8',
  );

  const prerequisiteCheck = releaseScript.indexOf('command -v rpmbuild');
  const versionBump = releaseScript.indexOf('npm run release:bump');
  assert.ok(prerequisiteCheck >= 0);
  assert.ok(versionBump > prerequisiteCheck);
});

test('GitHub publication uploads RPM files and requires both architectures', async () => {
  const publishScript = await readFile(
    new URL('docker-server/scripts/publish-update.sh', projectRoot),
    'utf8',
  );

  assert.match(publishScript, /MFE-Runner-\$VERSION-\*\.rpm/);
  assert.match(publishScript, /if \[ "\$RPM_COUNT" -ne 2 \]/);
});
