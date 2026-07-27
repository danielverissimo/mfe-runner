import { EventEmitter } from 'node:events';
import { unlink } from 'node:fs/promises';
import net from 'node:net';
import {
  SUPERVISOR_IDLE_TIMEOUT_MS,
  SUPERVISOR_METHODS,
  SUPERVISOR_PROTOCOL_VERSION,
  SUPERVISOR_REQUEST_LIMIT,
  SUPERVISOR_RESPONSE_LIMIT,
  createFrameDecoder,
  encodeFrame,
  safeTokenEqual,
  serializeSupervisorError,
  supervisorPaths,
} from './supervisor-protocol.mjs';

async function unlinkIfPresent(filePath) {
  try {
    await unlink(filePath);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

export class SupervisorServer extends EventEmitter {
  #server;
  #sockets = new Set();
  #authenticatedClients = new Set();
  #idleTimer = null;
  #closed = false;

  constructor({
    userDataPath,
    token,
    supervisor,
    platform = process.platform,
    idleTimeout = SUPERVISOR_IDLE_TIMEOUT_MS,
  }) {
    super();
    this.token = token;
    this.supervisor = supervisor;
    this.platform = platform;
    this.idleTimeout = idleTimeout;
    this.endpoint = supervisorPaths(userDataPath, platform).endpoint;
    this.#server = net.createServer((socket) => this.#accept(socket));
    supervisor.on('snapshot', (records) => {
      this.#broadcast({ type: 'event', event: 'snapshot', payload: records });
      this.#refreshIdleTimer();
    });
    supervisor.on('log', (entry) => {
      this.#broadcast({ type: 'event', event: 'log', payload: entry });
    });
  }

  async listen() {
    if (this.platform !== 'win32') await unlinkIfPresent(this.endpoint);
    await new Promise((resolve, reject) => {
      this.#server.once('error', reject);
      this.#server.listen(this.endpoint, () => {
        this.#server.off('error', reject);
        resolve();
      });
    });
    this.#refreshIdleTimer();
  }

  async close() {
    if (this.#closed) return;
    this.#closed = true;
    clearTimeout(this.#idleTimer);
    for (const socket of this.#sockets) socket.destroy();
    await new Promise((resolve) => this.#server.close(() => resolve()));
    if (this.platform !== 'win32') await unlinkIfPresent(this.endpoint);
  }

  #accept(socket) {
    this.#sockets.add(socket);
    let authenticated = false;
    const fail = (error) => {
      socket.end(encodeFrame({
        type: 'error',
        error: serializeSupervisorError(error),
      }, SUPERVISOR_RESPONSE_LIMIT));
    };
    socket.on('data', createFrameDecoder(
      SUPERVISOR_REQUEST_LIMIT,
      (frame) => {
        if (!authenticated) {
          const protocolMismatch =
            frame?.protocolVersion !== SUPERVISOR_PROTOCOL_VERSION;
          if (
            frame?.type !== 'handshake' ||
            protocolMismatch ||
            !safeTokenEqual(frame.token, this.token)
          ) {
            fail(Object.assign(
              new Error(
                protocolMismatch
                  ? 'Versão incompatível do protocolo do supervisor.'
                  : 'Autenticação do supervisor recusada.',
              ),
              {
                code: protocolMismatch
                  ? 'PROTOCOL_MISMATCH'
                  : 'AUTHENTICATION_FAILED',
              },
            ));
            return;
          }
          authenticated = true;
          this.#authenticatedClients.add(socket);
          clearTimeout(this.#idleTimer);
          try {
            socket.write(encodeFrame({
              type: 'handshake',
              protocolVersion: SUPERVISOR_PROTOCOL_VERSION,
              processes: this.supervisor.snapshot(),
            }, SUPERVISOR_RESPONSE_LIMIT));
          } catch (error) {
            fail(error);
          }
          return;
        }
        void this.#handleRequest(socket, frame);
      },
      fail,
    ));
    socket.on('error', () => {});
    socket.on('close', () => {
      this.#sockets.delete(socket);
      this.#authenticatedClients.delete(socket);
      this.#refreshIdleTimer();
    });
  }

  async #handleRequest(socket, frame) {
    const id = typeof frame?.id === 'string' ? frame.id : '';
    const method = frame?.method;
    if (frame?.type !== 'request' || !id || !SUPERVISOR_METHODS.has(method)) {
      this.#respond(socket, id, false, null, {
        code: 'METHOD_NOT_ALLOWED',
        message: 'Método não autorizado no supervisor.',
      });
      return;
    }
    try {
      const result = await this.#dispatch(method, frame.payload ?? {});
      this.#respond(socket, id, true, result ?? null);
    } catch (error) {
      this.#respond(socket, id, false, null, serializeSupervisorError(error));
    }
    this.#refreshIdleTimer();
  }

  async #dispatch(method, payload) {
    switch (method) {
      case 'snapshot':
        return this.supervisor.snapshot();
      case 'start':
        return this.supervisor.start(payload);
      case 'stop':
        return this.supervisor.stop(payload.workspaceId, payload.projectId);
      case 'restart':
        return this.supervisor.restart(
          payload.workspaceId,
          payload.projectId,
        );
      case 'stopWorkspace':
        return this.supervisor.stopWorkspace(
          payload.workspaceId,
          payload.projectIds,
        );
      case 'stopAll':
        return this.supervisor.stopAll();
      case 'runTask':
        return this.supervisor.runTask(payload);
      case 'clearLogs':
        return this.supervisor.clearLogs(
          payload.workspaceId,
          payload.projectId,
        );
      case 'setLogLimit':
        return this.supervisor.setLogLimit(payload.logLimit);
      case 'resolveExternalConflict':
        return this.supervisor.resolveExternalConflict(
          payload.workspaceId,
          payload.projectId,
          payload.message,
        );
    }
  }

  #respond(socket, id, ok, result, error) {
    socket.write(encodeFrame({
      type: 'response',
      id,
      ok,
      ...(ok ? { result } : { error }),
    }, SUPERVISOR_RESPONSE_LIMIT));
  }

  #broadcast(event) {
    let encoded;
    try {
      encoded = encodeFrame(event, SUPERVISOR_RESPONSE_LIMIT);
    } catch (error) {
      this.emit('error', error);
      return;
    }
    for (const socket of this.#authenticatedClients) {
      if (socket.writable) socket.write(encoded);
    }
  }

  #refreshIdleTimer() {
    clearTimeout(this.#idleTimer);
    if (
      this.#closed ||
      this.#authenticatedClients.size ||
      this.supervisor.hasRunningProcesses
    ) {
      return;
    }
    this.#idleTimer = setTimeout(() => this.emit('idle'), this.idleTimeout);
    this.#idleTimer.unref?.();
  }
}
