import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  SUPERVISOR_PROTOCOL_VERSION,
  SUPERVISOR_REQUEST_LIMIT,
  createFrameDecoder,
  encodeFrame,
} from './supervisor-protocol.mjs';
import { SupervisorServer } from './supervisor-server.mjs';

test('uses protocol v9 for supervised external services', () => {
  assert.equal(SUPERVISOR_PROTOCOL_VERSION, 9);
});

class FakeSupervisor extends EventEmitter {
  records = [];
  get hasRunningProcesses() {
    return false;
  }
  snapshot() {
    return this.records;
  }
  setLogLimit() {}
}

function connect(endpoint) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(endpoint, () => resolve(socket));
    socket.once('error', reject);
  });
}

function nextFrame(socket) {
  return new Promise((resolve, reject) => {
    socket.on('data', createFrameDecoder(
      32 * 1024 * 1024,
      resolve,
      reject,
    ));
    socket.once('error', reject);
  });
}

test('requires an authenticated versioned handshake before requests', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mfe-supervisor-'));
  const server = new SupervisorServer({
    userDataPath: directory,
    token: 'a'.repeat(64),
    supervisor: new FakeSupervisor(),
    idleTimeout: 5000,
  });
  await server.listen();

  const unauthenticated = await connect(server.endpoint);
  unauthenticated.write(encodeFrame({
    type: 'request',
    id: 'request',
    method: 'snapshot',
  }, SUPERVISOR_REQUEST_LIMIT));
  const rejected = await nextFrame(unauthenticated);
  assert.equal(rejected.error.code, 'PROTOCOL_MISMATCH');

  const incorrectToken = await connect(server.endpoint);
  incorrectToken.write(encodeFrame({
    type: 'handshake',
    protocolVersion: SUPERVISOR_PROTOCOL_VERSION,
    token: 'b'.repeat(64),
  }, SUPERVISOR_REQUEST_LIMIT));
  const unauthorized = await nextFrame(incorrectToken);
  assert.equal(unauthorized.error.code, 'AUTHENTICATION_FAILED');

  const authenticated = await connect(server.endpoint);
  authenticated.write(encodeFrame({
    type: 'handshake',
    protocolVersion: SUPERVISOR_PROTOCOL_VERSION,
    token: 'a'.repeat(64),
  }, SUPERVISOR_REQUEST_LIMIT));
  const handshake = await nextFrame(authenticated);
  assert.equal(handshake.protocolVersion, SUPERVISOR_PROTOCOL_VERSION);
  assert.deepEqual(handshake.processes, []);

  authenticated.write(encodeFrame({
    type: 'request',
    id: 'unknown',
    method: 'arbitrary-command',
  }, SUPERVISOR_REQUEST_LIMIT));
  const unknown = await nextFrame(authenticated);
  assert.equal(unknown.error.code, 'METHOD_NOT_ALLOWED');

  authenticated.destroy();
  await server.close();
});

test('bounds frames before parsing them', () => {
  assert.throws(
    () => encodeFrame(
      { payload: 'x'.repeat(SUPERVISOR_REQUEST_LIMIT) },
      SUPERVISOR_REQUEST_LIMIT,
    ),
    (error) => error.code === 'FRAME_TOO_LARGE',
  );

  let receivedError;
  const decode = createFrameDecoder(
    20,
    () => assert.fail('oversized frame must not be decoded'),
    (error) => {
      receivedError = error;
    },
  );
  decode(Buffer.from('{"payload":"01234567890123456789"}'));
  assert.equal(receivedError.code, 'FRAME_TOO_LARGE');
});
