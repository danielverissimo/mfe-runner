import assert from 'node:assert/strict';
import test from 'node:test';
import { collectSystemInfo, platformName } from './system-info.mjs';

test('uses friendly names for supported desktop platforms', () => {
  assert.equal(platformName('darwin'), 'macOS');
  assert.equal(platformName('linux'), 'Linux');
  assert.equal(platformName('win32'), 'Windows');
});

test('exposes bounded technical information without machine identifiers', () => {
  const info = collectSystemInfo({
    appVersion: '0.1.0',
    versions: {
      node: '24.15.0',
      electron: '43.2.0',
      chrome: '150.0.0.0',
      v8: '14.0',
    },
  });

  assert.equal(info.runtime.app, '0.1.0');
  assert.equal(info.runtime.node, '24.15.0');
  assert.ok(info.hardware.logicalCores > 0);
  assert.ok(info.hardware.totalMemoryBytes > 0);
  assert.equal('hostname' in info, false);
  assert.equal('environment' in info, false);
});
