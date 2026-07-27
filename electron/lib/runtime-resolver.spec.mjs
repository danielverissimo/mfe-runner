import assert from 'node:assert/strict';
import test from 'node:test';
import {
  __test__,
  listRuntimeInstallations,
} from './runtime-resolver.mjs';

test('compares runtime versions without requiring exact patch equality', () => {
  assert.equal(__test__.compareVersions('21.0.4', '17'), 1);
  assert.equal(__test__.compareVersions('3.12.1', '3.12'), 1);
  assert.equal(__test__.compareVersions('8', '17'), -1);
});

test('marks a runtime below the project requirement as incompatible', () => {
  assert.deepEqual(
    __test__.compatibilityFor('17.0.12', '21'),
    {
      status: 'incompatible',
      required: '21',
      reason: 'Versão 17.0.12 incompatível; o projeto requer 21 ou superior.',
    },
  );
});

test('keeps an unparseable requirement visible without blocking execution', () => {
  assert.deepEqual(
    __test__.compatibilityFor('3.12.4', 'latest-compatible'),
    {
      status: 'ready',
      required: null,
    },
  );
});

test('normalizes legacy Java 8 version output before compatibility checks', () => {
  assert.equal(__test__.normalizeJavaVersion('java version "1.8.0_402"'), '8');
  assert.equal(__test__.normalizeJavaVersion('openjdk version "21.0.4"'), '21.0.4');
});

test('lists runtime installations using a bounded normalized catalog', async () => {
  const catalog = await listRuntimeInstallations({
    ecosystem: 'go',
    component: 'runtime',
  });
  assert.equal(catalog.ecosystem, 'go');
  assert.equal(catalog.component, 'runtime');
  assert.ok(Array.isArray(catalog.installations));
  for (const installation of catalog.installations) {
    assert.equal(typeof installation.path, 'string');
    assert.ok(installation.path.length > 0);
    assert.equal(typeof installation.id, 'string');
  }
});
