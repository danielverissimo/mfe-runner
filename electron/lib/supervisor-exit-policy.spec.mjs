import assert from 'node:assert/strict';
import test from 'node:test';
import {
  prepareSupervisorForExit,
  prepareSupervisorForUpdate,
} from './supervisor-exit-policy.mjs';

test('disconnects without stopping when processes must be preserved', async () => {
  const calls = [];
  const supervisor = {
    stopAll: async () => calls.push('stop'),
    disconnect: () => calls.push('disconnect'),
  };
  await prepareSupervisorForExit({
    stopProcessesOnExit: false,
    supervisor,
  });
  assert.deepEqual(calls, ['disconnect']);
});

test('stops before disconnecting and preserves the connection on failure', async () => {
  const successfulCalls = [];
  await prepareSupervisorForExit({
    stopProcessesOnExit: true,
    supervisor: {
      stopAll: async () => successfulCalls.push('stop'),
      disconnect: () => successfulCalls.push('disconnect'),
    },
  });
  assert.deepEqual(successfulCalls, ['stop', 'disconnect']);

  let disconnected = false;
  await assert.rejects(
    prepareSupervisorForExit({
      stopProcessesOnExit: true,
      supervisor: {
        stopAll: async () => {
          throw new Error('Falha ao parar');
        },
        disconnect: () => {
          disconnected = true;
        },
      },
    }),
    /Falha ao parar/,
  );
  assert.equal(disconnected, false);
});

test('stops processes and waits for daemon release before an update', async () => {
  const calls = [];
  await prepareSupervisorForUpdate({
    supervisor: {
      stopAll: async () => calls.push('stop'),
      disconnect: () => calls.push('disconnect'),
    },
    wait: async (milliseconds) => calls.push(`wait:${milliseconds}`),
  });
  assert.deepEqual(calls, ['stop', 'disconnect', 'wait:16000']);
});
