import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parseElectronChecksums, prepareLinuxElectron, verifyElectronArchive } from './prepare-linux-electron.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'runner-linux-electron-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const version = '43.2.0';
  const checksums = {};
  const archives = {};
  for (const arch of ['x64', 'arm64']) {
    const file = `electron-v${version}-linux-${arch}.zip`;
    archives[arch] = path.join(root, file);
    await writeFile(archives[arch], `synthetic-${arch}`);
    checksums[file] = createHash('sha256').update(`synthetic-${arch}`).digest('hex');
  }
  const manifest = path.join(root, 'SHASUMS256.txt');
  await writeFile(manifest, Object.entries(checksums).map(([file, hash]) => `${hash} *${file}`).join('\n'));
  const calls = [];
  return {
    root, version, archives, checksums, manifest, calls,
    options: {
      cacheRoot: root, version, log: () => {},
      downloadArtifact: async (details) => {
        calls.push(details);
        return details.isGeneric ? manifest : archives[details.arch];
      },
    },
  };
}

test('prepares both Linux archives with official checksums and reuses verified prepared output', async (t) => {
  const f = await fixture(t);
  const directory = await prepareLinuxElectron(f.options);
  assert.deepEqual(f.calls.map((call) => call.artifactName), ['SHASUMS256.txt', 'electron', 'electron']);
  for (const arch of ['x64', 'arm64']) {
    const target = path.join(directory, `electron-v${f.version}-linux-${arch}.zip`);
    assert.equal(await readFile(target, 'utf8'), `synthetic-${arch}`);
  }
  for (const call of f.calls.slice(1)) {
    assert.equal(call.platform, 'linux');
    assert.deepEqual(call.checksums, f.checksums);
    assert.equal(call.unsafelyDisableChecksums, undefined);
    assert.ok(call.downloadOptions.fetchOptions.signal instanceof AbortSignal);
  }
  f.calls.length = 0;
  await prepareLinuxElectron(f.options);
  assert.deepEqual(f.calls.map((call) => call.artifactName), ['SHASUMS256.txt']);
});

test('rejects downloads that fail checksum validation and repairs corrupted prepared copies', async (t) => {
  const f = await fixture(t);
  const directory = await prepareLinuxElectron(f.options);
  const target = path.join(directory, `electron-v${f.version}-linux-x64.zip`);
  await writeFile(target, 'corrupted');
  f.calls.length = 0;
  await prepareLinuxElectron(f.options);
  assert.equal(await readFile(target, 'utf8'), 'synthetic-x64');
  assert.deepEqual(f.calls.map((call) => call.arch).filter(Boolean), ['x64']);

  await writeFile(target, 'corrupted');
  await writeFile(f.archives.x64, 'invalid-download');
  await assert.rejects(prepareLinuxElectron(f.options), /Checksum do Electron não confere/);
  await assert.rejects(verifyElectronArchive(target, ''), /ausente ou inválido/);
});

test('fails before preparing archives when required checksum entries are missing', async (t) => {
  const f = await fixture(t);
  await writeFile(f.manifest, 'invalid manifest');
  await assert.rejects(prepareLinuxElectron(f.options), /Checksum oficial ausente/);
  assert.equal(f.calls.length, 1);
  assert.deepEqual(parseElectronChecksums('invalid manifest'), {});
  await assert.rejects(prepareLinuxElectron({ ...f.options, cacheRoot: '../cache' }), /absoluto/);
});
