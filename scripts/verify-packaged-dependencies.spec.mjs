import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  verifyPackagedApplication,
  verifyPackagedDependencies,
} from './verify-packaged-dependencies.mjs';

async function writePackage(directory, packageJson) {
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, 'package.json'),
    JSON.stringify(packageJson),
  );
}

test('rejeita dependência obrigatória ausente no aplicativo empacotado', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'mfe-runner-package-'));
  const applicationRoot = path.join(root, 'release', 'mac', 'Resources', 'app');

  try {
    await writePackage(applicationRoot, { name: 'application' });
    await writePackage(path.join(applicationRoot, 'node_modules', 'parser'), {
      name: 'parser',
      version: '1.0.0',
      dependencies: {
        entities: '1.0.0',
      },
    });

    await assert.rejects(
      verifyPackagedApplication(applicationRoot),
      /entities \(obrigatória para parser@1\.0\.0\)/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('aceita dependências obrigatórias presentes, inclusive pacotes com escopo', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'mfe-runner-package-'));
  const applicationRoot = path.join(root, 'release', 'mac', 'Resources', 'app');

  try {
    await writePackage(applicationRoot, { name: 'application' });
    await writePackage(path.join(applicationRoot, 'node_modules', 'parser'), {
      name: 'parser',
      version: '1.0.0',
      dependencies: {
        '@example/entities': '1.0.0',
      },
    });
    await writePackage(
      path.join(applicationRoot, 'node_modules', '@example', 'entities'),
      {
        name: '@example/entities',
        version: '1.0.0',
      },
    );

    const result = await verifyPackagedApplication(applicationRoot);
    assert.equal(result.packageCount, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejeita verificação sem aplicativo desempacotado', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'mfe-runner-package-'));

  try {
    await assert.rejects(
      verifyPackagedDependencies(root),
      /Nenhum aplicativo desempacotado/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
