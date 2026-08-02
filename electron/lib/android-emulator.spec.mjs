import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import {
  androidEmulatorCandidates,
  launchAndroidEmulator,
  listAndroidEmulators,
  normalizeAndroidEmulators,
  resolveAndroidEmulator,
} from './android-emulator.mjs';

test('builds Android Emulator candidates in environment, default and PATH order', () => {
  assert.deepEqual(androidEmulatorCandidates({
    platform: 'darwin',
    homeDirectory: '/Users/test',
    environment: {
      ANDROID_HOME: '/custom/sdk',
      ANDROID_SDK_ROOT: '/legacy/sdk',
      PATH: '/usr/local/bin:/usr/bin',
    },
  }), [
    '/custom/sdk/emulator/emulator',
    '/legacy/sdk/emulator/emulator',
    '/Users/test/Library/Android/sdk/emulator/emulator',
    '/usr/local/bin/emulator',
    '/usr/bin/emulator',
  ]);
  assert.deepEqual(androidEmulatorCandidates({
    platform: 'linux',
    homeDirectory: '/home/test',
    environment: {},
  }), ['/home/test/Android/Sdk/emulator/emulator']);
  assert.deepEqual(androidEmulatorCandidates({
    platform: 'win32',
    homeDirectory: 'C:\\Users\\test',
    environment: {
      LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local',
      PATH: 'C:\\tools;D:\\bin',
    },
  }), [
    'C:\\Users\\test\\AppData\\Local\\Android\\Sdk\\emulator\\emulator.exe',
    'C:\\tools\\emulator.exe',
    'D:\\bin\\emulator.exe',
  ]);
});

test('resolves the first available emulator executable', async () => {
  const checked = [];
  const result = await resolveAndroidEmulator({
    platform: 'linux',
    homeDirectory: '/home/test',
    environment: { ANDROID_HOME: '/missing', PATH: '/opt/android/bin' },
    isExecutable: async (candidate) => {
      checked.push(candidate);
      return candidate === '/opt/android/bin/emulator';
    },
    canonicalize: async (candidate) => `/real${candidate}`,
  });
  assert.equal(result, '/real/opt/android/bin/emulator');
  assert.deepEqual(checked, [
    '/missing/emulator/emulator',
    '/home/test/Android/Sdk/emulator/emulator',
    '/opt/android/bin/emulator',
  ]);
});

test('normalizes, trims and deduplicates configured AVD names', () => {
  assert.deepEqual(
    normalizeAndroidEmulators('Pixel_9a\r\n Tablet_API_35 \nPixel_9a\n\n'),
    [
      { id: 'Pixel_9a', name: 'Pixel_9a' },
      { id: 'Tablet_API_35', name: 'Tablet_API_35' },
    ],
  );
});

test('returns diagnostics when Android Emulator is unavailable or has no AVDs', async () => {
  assert.match(
    (await listAndroidEmulators({ resolveExecutable: async () => null })).message,
    /Android Emulator não encontrado/,
  );
  assert.deepEqual(await listAndroidEmulators({
    resolveExecutable: async () => '/sdk/emulator/emulator',
    executeFile: async () => ({ stdout: '' }),
  }), {
    emulators: [],
    message: 'Nenhum Android Virtual Device configurado foi encontrado.',
  });
});

test('re-lists and launches only an exact catalogued AVD without a shell', async () => {
  let invocation;
  const child = new EventEmitter();
  child.unref = () => { child.unreferenced = true; };
  const launch = launchAndroidEmulator({
    emulatorId: 'Pixel_9a',
    resolveExecutable: async () => '/sdk/emulator/emulator',
    executeFile: async () => ({ stdout: 'Pixel_9a\n' }),
    spawnProcess: (executable, args, options) => {
      invocation = { executable, args, options };
      queueMicrotask(() => child.emit('spawn'));
      return child;
    },
  });
  assert.deepEqual(await launch, { started: true, emulatorId: 'Pixel_9a' });
  assert.equal(invocation.executable, '/sdk/emulator/emulator');
  assert.deepEqual(invocation.args, ['-avd', 'Pixel_9a']);
  assert.equal(invocation.options.shell, false);
  assert.equal(invocation.options.detached, true);
  assert.equal(child.unreferenced, true);

  await assert.rejects(
    launchAndroidEmulator({
      emulatorId: 'Other; rm -rf data',
      resolveExecutable: async () => '/sdk/emulator/emulator',
      executeFile: async () => ({ stdout: 'Pixel_9a\n' }),
    }),
    /não está disponível/,
  );
});

test('reports a process spawn failure without changing the selected AVD', async () => {
  const child = new EventEmitter();
  child.unref = () => {};
  const launch = launchAndroidEmulator({
    emulatorId: 'Pixel_9a',
    resolveExecutable: async () => '/sdk/emulator/emulator',
    executeFile: async () => ({ stdout: 'Pixel_9a\n' }),
    spawnProcess: () => {
      queueMicrotask(() => child.emit('error', new Error('spawn failed')));
      return child;
    },
  });
  await assert.rejects(launch, /spawn failed/);
});
