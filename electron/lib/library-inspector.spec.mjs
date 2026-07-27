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
  inspectLibraryDirectory,
} from './library-inspector.mjs';

async function createLibrary(rootPath, destination = '../../dist/web-common-lib') {
  await mkdir(path.join(rootPath, 'projects', 'web-common-lib'), {
    recursive: true,
  });
  await writeFile(path.join(rootPath, 'package.json'), JSON.stringify({
    name: 'web-common',
    scripts: { build: 'ng build', watch: 'ng build --watch' },
  }));
  await writeFile(path.join(rootPath, 'angular.json'), JSON.stringify({
    projects: {
      'web-common-lib': {
        projectType: 'library',
        root: 'projects/web-common-lib',
        architect: {
          build: { options: { project: 'projects/web-common-lib/ng-package.json' } },
        },
      },
    },
  }));
  await writeFile(
    path.join(rootPath, 'projects', 'web-common-lib', 'package.json'),
    JSON.stringify({ name: '@valloo/web-common-lib' }),
  );
  await writeFile(
    path.join(rootPath, 'projects', 'web-common-lib', 'ng-package.json'),
    JSON.stringify({ dest: destination }),
  );
}

test('inspects one exact Angular library and infers watch and ng-package output', async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), 'mfe-runner-lib-'));
  await createLibrary(rootPath);

  const result = await inspectLibraryDirectory(rootPath);

  assert.equal(result.packageName, '@valloo/web-common-lib');
  assert.equal(result.developmentScript, 'watch');
  assert.equal(result.artifactRelativePath, 'dist/web-common-lib');
  assert.equal(result.preferredLinkScript, 'link:web-common');
});

test('rejects Angular library artifact paths that escape the configured root', async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), 'mfe-runner-lib-'));
  await createLibrary(rootPath, '../../../../outside');

  await assert.rejects(
    inspectLibraryDirectory(rootPath),
    /Destino do ng-package deve permanecer/,
  );
});

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
