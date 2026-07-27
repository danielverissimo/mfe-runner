import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { cleanArtifacts } from './clean-artifacts.mjs';

test('remove somente as saídas geradas de dist e release', async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), 'mfe-runner-clean-'));

  try {
    await mkdir(path.join(projectRoot, 'dist', 'browser'), { recursive: true });
    await mkdir(path.join(projectRoot, 'release', 'runtime-cache'), {
      recursive: true,
    });
    await writeFile(path.join(projectRoot, 'dist', 'browser', 'index.html'), 'build');
    await writeFile(path.join(projectRoot, 'release', 'installer.dmg'), 'installer');
    await writeFile(
      path.join(projectRoot, 'release', 'runtime-cache', 'runtime.tar.xz'),
      'cache',
    );
    await writeFile(path.join(projectRoot, 'package.json'), '{"private":true}');

    await cleanArtifacts(projectRoot);

    await assert.rejects(readFile(path.join(projectRoot, 'dist', 'browser', 'index.html')));
    await assert.rejects(readFile(path.join(projectRoot, 'release', 'installer.dmg')));
    await assert.rejects(
      readFile(path.join(projectRoot, 'release', 'runtime-cache', 'runtime.tar.xz')),
    );
    assert.equal(
      await readFile(path.join(projectRoot, 'package.json'), 'utf8'),
      '{"private":true}',
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
