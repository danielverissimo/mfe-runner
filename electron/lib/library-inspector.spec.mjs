import assert from 'node:assert/strict';
import {
  mkdir,
  mkdtemp,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  effectiveLinkScript,
  inspectConsumerLink,
} from './library-inspector.mjs';

test('resolves link script precedence and verifies the real linked artifact', async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), 'mfe-runner-link-'));
  const artifactPath = path.join(base, 'library', 'dist', 'web-common-lib');
  const consumerPath = path.join(base, 'consumer');
  const installedPath = path.join(
    consumerPath,
    'node_modules',
    '@valloo',
    'web-common-lib',
  );
  await mkdir(artifactPath, { recursive: true });
  await mkdir(path.dirname(installedPath), { recursive: true });
  await writeFile(
    path.join(artifactPath, 'package.json'),
    JSON.stringify({ name: '@valloo/web-common-lib' }),
  );
  await symlink(artifactPath, installedPath, 'dir');

  const library = {
    libraryId: 'lib',
    displayName: 'Web Common',
    packageName: '@valloo/web-common-lib',
    artifactPath,
    artifactRelativePath: 'dist/web-common-lib',
    preferredLinkScript: 'link:web-common',
  };
  const consumer = {
    absolutePath: consumerPath,
    scripts: {
      'link:web-common': 'node link.js',
      'link:custom': 'node custom.js',
    },
    scriptNames: ['link:web-common', 'link:custom'],
    libraryLinkScriptOverrides: { lib: 'link:custom' },
  };

  assert.equal(effectiveLinkScript(consumer, library), 'link:custom');
  const status = await inspectConsumerLink(consumer, library);
  assert.equal(status.state, 'linked');
  assert.equal(status.script, 'link:custom');
});
