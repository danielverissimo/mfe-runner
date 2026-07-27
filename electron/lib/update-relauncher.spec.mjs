import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveMacAppBundle,
  scheduleMacUpdateRelaunch,
} from './update-relauncher.mjs';

test('resolves the macOS app bundle from its executable', () => {
  assert.equal(
    resolveMacAppBundle(
      '/Applications/MFE Runner.app/Contents/MacOS/MFE Runner',
    ),
    '/Applications/MFE Runner.app',
  );
});

test('schedules a detached run-as-node helper only on macOS', () => {
  const calls = [];
  const unrefs = [];
  const scheduled = scheduleMacUpdateRelaunch({
    platform: 'darwin',
    executablePath:
      '/Applications/MFE Runner.app/Contents/MacOS/MFE Runner',
    helperPath: '/Applications/MFE Runner.app/Contents/Resources/helper.mjs',
    expectedVersion: '0.1.7',
    parentPid: 4123,
    spawnProcess(command, args, options) {
      calls.push({ command, args, options });
      return { unref: () => unrefs.push(true) };
    },
  });

  assert.equal(scheduled, true);
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].command,
    '/Applications/MFE Runner.app/Contents/MacOS/MFE Runner',
  );
  assert.deepEqual(calls[0].args, [
    '/Applications/MFE Runner.app/Contents/Resources/helper.mjs',
    '4123',
    '/Applications/MFE Runner.app',
    '0.1.7',
  ]);
  assert.equal(calls[0].options.detached, true);
  assert.equal(calls[0].options.shell, false);
  assert.equal(calls[0].options.stdio, 'ignore');
  assert.equal(calls[0].options.env.ELECTRON_RUN_AS_NODE, '1');
  assert.equal(unrefs.length, 1);
});

test('does not schedule a fallback relaunch outside macOS', () => {
  let called = false;
  const scheduled = scheduleMacUpdateRelaunch({
    platform: 'linux',
    helperPath: '/tmp/helper.mjs',
    expectedVersion: '0.1.7',
    spawnProcess() {
      called = true;
      return { unref() {} };
    },
  });

  assert.equal(scheduled, false);
  assert.equal(called, false);
});
