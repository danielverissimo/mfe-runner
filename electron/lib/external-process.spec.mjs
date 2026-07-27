import assert from 'node:assert/strict';
import test from 'node:test';
import {
  __test__,
  inspectExternalProcess,
  terminateExternalProcess,
} from './external-process.mjs';

test('parses a single POSIX listener and resolves bounded process details', async () => {
  const commands = [];
  const processInfo = await inspectExternalProcess(4313, {
    platform: 'linux',
    runCommand: async (command, args) => {
      commands.push([command, args]);
      if (command === 'lsof') return 'p1234\ncnode\nLdeveloper\n';
      return 'developer node /workspace/server.js\n';
    },
  });

  assert.deepEqual(processInfo, {
    pid: 1234,
    name: 'node',
    owner: 'developer',
    command: 'node /workspace/server.js',
  });
  assert.deepEqual(commands[0][1], [
    '-nP',
    '-iTCP:4313',
    '-sTCP:LISTEN',
    '-FpLc',
  ]);
});

test('refuses an ambiguous port with multiple listener PIDs', async () => {
  await assert.rejects(
    inspectExternalProcess(4313, {
      platform: 'linux',
      runCommand: async () => 'p1234\ncnode\np5678\ncnode\n',
    }),
    /mais de um processo ouvinte/,
  );
});

test('revalidates the PID before terminating the listener', async () => {
  await assert.rejects(
    terminateExternalProcess(4313, 1234, {
      platform: 'linux',
      inspect: async () => ({ pid: 5678 }),
      killProcess: () => assert.fail('kill must not be called'),
      portIsOpen: async () => true,
    }),
    /mudou antes da confirmação/,
  );
});

test('terminates without elevation when the owner allows it', async () => {
  const signals = [];
  let open = true;
  const result = await terminateExternalProcess(4313, 1234, {
    platform: 'linux',
    inspect: async () => ({ pid: 1234 }),
    killProcess: (pid, signal) => {
      signals.push([pid, signal]);
      open = false;
    },
    portIsOpen: async () => open,
  });

  assert.deepEqual(result, {
    terminated: true,
    elevated: false,
    alreadyClosed: false,
  });
  assert.deepEqual(signals, [[1234, 'SIGTERM']]);
});

test('uses the operating-system elevation prompt only after permission denial', async () => {
  const commands = [];
  let openChecks = 0;
  const result = await terminateExternalProcess(4313, 1234, {
    platform: 'darwin',
    inspect: async () => ({ pid: 1234 }),
    killProcess: () => {
      const error = new Error('operation not permitted');
      error.code = 'EPERM';
      throw error;
    },
    portIsOpen: async () => openChecks++ === 0,
    runCommand: async (command, args) => {
      commands.push([command, args]);
      return '';
    },
  });

  assert.equal(result.elevated, true);
  assert.equal(commands[0][0], '/usr/bin/osascript');
  assert.match(commands[0][1][1], /administrator privileges/);
});

test('validates ports and PIDs before constructing system commands', () => {
  assert.throws(() => __test__.validatePort(0), /Porta local inválida/);
  assert.throws(() => __test__.validatePid(-1), /PID externo inválido/);
});
