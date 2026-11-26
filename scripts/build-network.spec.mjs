import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import test from 'node:test';
import { isTransientNetworkError, retryNetwork, runBuildCommand } from './build-network.mjs';

function outputSink() {
  let output = '';
  return { stream: new Writable({ write(chunk, _encoding, done) { output += chunk; done(); } }), text: () => output };
}

test('retries transient DNS errors and stops after success with bounded backoff', async () => {
  const waits = [];
  const messages = [];
  let calls = 0;
  const result = await retryNetwork(async () => {
    if (++calls < 3) throw Object.assign(new Error('getaddrinfo'), { code: 'EAI_AGAIN' });
    return 'ready';
  }, { sleep: async (ms) => waits.push(ms), log: (message) => messages.push(message) });
  assert.equal(result, 'ready');
  assert.equal(calls, 3);
  assert.deepEqual(waits, [3000, 6000]);
  assert.equal(messages.length, 2);
});

test('limits persistent network failures and never retries checksum or packaging errors', async () => {
  let calls = 0;
  await assert.rejects(retryNetwork(async () => {
    calls++;
    throw new Error('getaddrinfo EAI_AGAIN github.com');
  }, { sleep: async () => {}, log: () => {} }), /EAI_AGAIN/);
  assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(retryNetwork(async () => {
    calls++;
    throw new Error('Checksum não confere.');
  }, { sleep: async () => {}, log: () => {} }), /Checksum/);
  assert.equal(calls, 1);
  assert.equal(isTransientNetworkError({ cause: { code: 'ECONNRESET' } }), true);
  assert.equal(isTransientNetworkError({ output: 'Error: getaddrinfo EAI_AGAIN github.com' }), true);
});

test('executes without a shell, streams progress and preserves argument boundaries', async () => {
  const stdout = outputSink();
  const stderr = outputSink();
  await runBuildCommand(process.execPath, ['-e', 'console.log(process.argv[1]); console.error("progress");', 'literal $(echo unsafe)'], {
    stdout: stdout.stream, stderr: stderr.stream,
  });
  assert.equal(stdout.text().trim(), 'literal $(echo unsafe)');
  assert.equal(stderr.text().trim(), 'progress');
});

test('times out an unresponsive prerequisite and keeps only bounded failure diagnostics', async () => {
  const stdout = outputSink();
  const stderr = outputSink();
  await assert.rejects(runBuildCommand(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
    timeoutMs: 100, stdout: stdout.stream, stderr: stderr.stream,
  }), /não respondeu/);
  await assert.rejects(runBuildCommand(process.execPath, ['-e', 'process.stderr.write("x".repeat(40000)+" EAI_AGAIN"); process.exitCode=1'], {
    stdout: stdout.stream, stderr: stderr.stream,
  }), (error) => error.exitCode === 1 && error.output.length <= 32768 && isTransientNetworkError(error));
});
