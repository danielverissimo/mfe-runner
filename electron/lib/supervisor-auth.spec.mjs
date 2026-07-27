import assert from 'node:assert/strict';
import { mkdtemp, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  acquireSupervisorLock,
  ensureSupervisorToken,
} from './supervisor-auth.mjs';
import { supervisorPaths } from './supervisor-protocol.mjs';

test('allows only one live supervisor owner and recovers a stale lock', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mfe-lock-'));
  const release = await acquireSupervisorLock(directory);
  assert.equal(typeof release, 'function');
  assert.equal(await acquireSupervisorLock(directory), null);
  await release();

  await writeFile(
    supervisorPaths(directory).lockPath,
    JSON.stringify({ pid: 2_147_483_647 }),
  );
  const recoveredRelease = await acquireSupervisorLock(directory);
  assert.equal(typeof recoveredRelease, 'function');
  await recoveredRelease();
});

test('derives a stable per-user named pipe on Windows', () => {
  const first = supervisorPaths('C:\\Users\\developer\\MFE Runner', 'win32');
  const second = supervisorPaths('C:\\Users\\developer\\MFE Runner', 'win32');
  assert.equal(first.endpoint, second.endpoint);
  assert.match(first.endpoint, /^\\\\\.\\pipe\\mfe-runner-supervisor-/);
});

test('stores a 256-bit token in a private file', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mfe-token-'));
  const token = await ensureSupervisorToken(directory);
  assert.match(token, /^[a-f0-9]{64}$/);
  if (process.platform !== 'win32') {
    const details = await stat(supervisorPaths(directory).tokenPath);
    assert.equal(details.mode & 0o777, 0o600);
  }
});
