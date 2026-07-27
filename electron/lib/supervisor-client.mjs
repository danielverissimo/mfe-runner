import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import net from 'node:net';
import {
  SUPERVISOR_PROTOCOL_VERSION,
  SUPERVISOR_REQUEST_LIMIT,
  SUPERVISOR_RESPONSE_LIMIT,
  createFrameDecoder,
  encodeFrame,
  supervisorPaths,
} from './supervisor-protocol.mjs';
import { ensureSupervisorToken } from './supervisor-auth.mjs';

// A primeira execução no Windows pode ser atrasada pelo Defender enquanto o
// executável Electron é reutilizado como Node. Mantenha a UI aguardando tempo
// suficiente para o named pipe ser criado sem iniciar outro daemon.
const CONNECT_RETRY_DELAYS = [
  0,
  100,
  200,
  400,
  700,
  1000,
  1500,
  2000,
  2500,
  3000,
];

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class SupervisorClient extends EventEmitter {
  #socket = null;
  #pending = new Map();
  #processes = [];
  #token = null;
  #connecting = null;
  #explicitDisconnect = false;
  #reconnectAttempts = 0;
  #launchError = null;

  constructor({
    userDataPath,
    entryPath,
    executablePath = process.execPath,
    platform = process.platform,
    spawnProcess = spawn,
    idleTimeout,
  }) {
    super();
    this.userDataPath = userDataPath;
    this.entryPath = entryPath;
    this.executablePath = executablePath;
    this.platform = platform;
    this.spawnProcess = spawnProcess;
    this.idleTimeout = idleTimeout;
    this.endpoint = supervisorPaths(userDataPath, platform).endpoint;
  }

  get connected() {
    return Boolean(this.#socket && !this.#socket.destroyed);
  }

  get hasRunningProcesses() {
    return this.#processes.some((record) =>
      ['starting', 'linking', 'healthy', 'running', 'degraded', 'stopping']
        .includes(record.status)
    );
  }

  snapshot() {
    return structuredClone(this.#processes);
  }

  async connectOrStart() {
    if (this.connected) return this.snapshot();
    if (this.#connecting) return this.#connecting;
    this.#explicitDisconnect = false;
    this.#connecting = this.#connectOrStartInternal()
      .finally(() => {
        this.#connecting = null;
      });
    return this.#connecting;
  }

  disconnect() {
    this.#explicitDisconnect = true;
    this.#socket?.destroy();
    this.#socket = null;
    this.#rejectPending(new Error('Conexão com o supervisor encerrada.'));
  }

  start(payload) {
    return this.#request('start', payload);
  }

  stop(workspaceId, projectId) {
    return this.#request('stop', { workspaceId, projectId });
  }

  restart(workspaceId, projectId) {
    return this.#request('restart', { workspaceId, projectId });
  }

  stopWorkspace(workspaceId, projectIds) {
    return this.#request('stopWorkspace', { workspaceId, projectIds });
  }

  stopAll() {
    return this.#request('stopAll', {});
  }

  runTask(payload) {
    return this.#request('runTask', payload);
  }

  clearLogs(workspaceId, projectId) {
    return this.#request('clearLogs', { workspaceId, projectId });
  }

  setLogLimit(logLimit) {
    return this.#request('setLogLimit', { logLimit });
  }

  resolveExternalConflict(workspaceId, projectId, message) {
    return this.#request('resolveExternalConflict', {
      workspaceId,
      projectId,
      message,
    });
  }

  async #connectOrStartInternal() {
    this.#token ??= await ensureSupervisorToken(this.userDataPath);
    try {
      return await this.#connect();
    } catch (firstError) {
      if (firstError?.code === 'PROTOCOL_MISMATCH') throw firstError;
      this.#launchSupervisor();
      let lastError = firstError;
      for (const wait of CONNECT_RETRY_DELAYS) {
        if (wait) await delay(wait);
        try {
          return await this.#connect();
        } catch (error) {
          lastError = error;
          if (error?.code === 'PROTOCOL_MISMATCH') throw error;
        }
      }
      const detail = this.#launchError?.message ?? lastError.message;
      throw new Error(
        `Não foi possível conectar ao supervisor local: ${detail}`,
      );
    }
  }

  #launchSupervisor() {
    this.#launchError = null;
    const child = this.spawnProcess(
      this.executablePath,
      [this.entryPath],
      {
        cwd: this.userDataPath,
        detached: true,
        stdio: 'ignore',
        shell: false,
        windowsHide: true,
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: '1',
          MFE_RUNNER_USER_DATA: this.userDataPath,
          ...(this.idleTimeout
            ? { MFE_RUNNER_SUPERVISOR_IDLE_MS: String(this.idleTimeout) }
            : {}),
        },
      },
    );
    child.once('error', (error) => {
      this.#launchError = error;
    });
    child.unref();
  }

  #connect() {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(this.endpoint);
      let settled = false;
      const fail = (error) => {
        if (settled) {
          socket.destroy();
          return;
        }
        settled = true;
        socket.destroy();
        reject(error);
      };
      socket.setTimeout(2500, () => fail(new Error('Timeout de conexão.')));
      socket.once('error', fail);
      socket.once('connect', () => {
        socket.setTimeout(0);
        socket.write(encodeFrame({
          type: 'handshake',
          protocolVersion: SUPERVISOR_PROTOCOL_VERSION,
          token: this.#token,
        }, SUPERVISOR_REQUEST_LIMIT));
      });
      socket.on('data', createFrameDecoder(
        SUPERVISOR_RESPONSE_LIMIT,
        (frame) => {
          if (!settled) {
            if (frame?.type === 'error') {
              fail(Object.assign(
                new Error(frame.error?.message ?? 'Conexão recusada.'),
                { code: frame.error?.code },
              ));
              return;
            }
            if (
              frame?.type !== 'handshake' ||
              frame.protocolVersion !== SUPERVISOR_PROTOCOL_VERSION
            ) {
              fail(Object.assign(
                new Error('Versão incompatível do protocolo do supervisor.'),
                { code: 'PROTOCOL_MISMATCH' },
              ));
              return;
            }
            settled = true;
            socket.off('error', fail);
            this.#attachSocket(socket);
            this.#processes = Array.isArray(frame.processes)
              ? frame.processes
              : [];
            this.#reconnectAttempts = 0;
            this.emit('connected');
            this.emit('snapshot', this.snapshot());
            resolve(this.snapshot());
            return;
          }
          this.#handleFrame(frame);
        },
        fail,
      ));
    });
  }

  #attachSocket(socket) {
    this.#socket?.destroy();
    this.#socket = socket;
    socket.on('error', () => {});
    socket.on('close', () => {
      if (this.#socket !== socket) return;
      this.#socket = null;
      this.#rejectPending(new Error('Conexão com o supervisor perdida.'));
      this.emit('disconnected');
      if (!this.#explicitDisconnect && this.#reconnectAttempts < 5) {
        const wait = [250, 500, 1000, 2000, 4000][this.#reconnectAttempts++];
        const timer = setTimeout(() => {
          void this.connectOrStart().catch(() => {});
        }, wait);
        timer.unref?.();
      }
    });
  }

  #handleFrame(frame) {
    if (frame?.type === 'event') {
      if (frame.event === 'snapshot' && Array.isArray(frame.payload)) {
        this.#processes = frame.payload;
        this.emit('snapshot', this.snapshot());
      } else if (frame.event === 'log') {
        this.emit('log', frame.payload);
      }
      return;
    }
    if (frame?.type !== 'response') return;
    const pending = this.#pending.get(frame.id);
    if (!pending) return;
    this.#pending.delete(frame.id);
    clearTimeout(pending.timer);
    if (frame.ok) {
      pending.resolve(frame.result);
    } else {
      pending.reject(Object.assign(
        new Error(frame.error?.message ?? 'Falha no supervisor.'),
        { code: frame.error?.code },
      ));
    }
  }

  async #request(method, payload) {
    if (!this.connected) await this.connectOrStart();
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`Timeout ao executar ${method} no supervisor.`));
      }, method === 'runTask' ? 310_000 : 30_000);
      this.#pending.set(id, { resolve, reject, timer });
      try {
        this.#socket.write(encodeFrame({
          type: 'request',
          id,
          method,
          payload,
        }, SUPERVISOR_REQUEST_LIMIT));
      } catch (error) {
        clearTimeout(timer);
        this.#pending.delete(id);
        reject(error);
      }
    });
  }

  #rejectPending(error) {
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.#pending.clear();
  }
}
