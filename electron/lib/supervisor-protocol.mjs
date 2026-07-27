import { createHash, timingSafeEqual } from 'node:crypto';
import path from 'node:path';

export const SUPERVISOR_PROTOCOL_VERSION = 1;
export const SUPERVISOR_REQUEST_LIMIT = 2 * 1024 * 1024;
export const SUPERVISOR_RESPONSE_LIMIT = 32 * 1024 * 1024;
export const SUPERVISOR_IDLE_TIMEOUT_MS = 15_000;

export const SUPERVISOR_METHODS = new Set([
  'snapshot',
  'start',
  'stop',
  'restart',
  'stopWorkspace',
  'stopAll',
  'runTask',
  'clearLogs',
  'setLogLimit',
  'resolveExternalConflict',
]);

export function supervisorPaths(userDataPath, platform = process.platform) {
  const identifier = createHash('sha256')
    .update(path.resolve(userDataPath))
    .digest('hex')
    .slice(0, 24);
  return {
    endpoint: platform === 'win32'
      ? `\\\\.\\pipe\\mfe-runner-supervisor-${identifier}`
      : path.join(userDataPath, 'supervisor.sock'),
    lockPath: path.join(userDataPath, 'supervisor.lock'),
    tokenPath: path.join(userDataPath, 'supervisor.token'),
  };
}

export function encodeFrame(value, maximumBytes) {
  const frame = `${JSON.stringify(value)}\n`;
  if (Buffer.byteLength(frame, 'utf8') > maximumBytes) {
    throw new SupervisorProtocolError(
      'FRAME_TOO_LARGE',
      'Mensagem do supervisor excede o limite permitido.',
    );
  }
  return frame;
}

export function createFrameDecoder(maximumBytes, onFrame, onError) {
  let buffered = '';
  return (chunk) => {
    buffered += chunk.toString('utf8');
    if (
      Buffer.byteLength(buffered, 'utf8') > maximumBytes &&
      !buffered.includes('\n')
    ) {
      onError(new SupervisorProtocolError(
        'FRAME_TOO_LARGE',
        'Mensagem do supervisor excede o limite permitido.',
      ));
      return;
    }
    let separator;
    while ((separator = buffered.indexOf('\n')) >= 0) {
      const raw = buffered.slice(0, separator);
      buffered = buffered.slice(separator + 1);
      if (!raw.trim()) continue;
      if (Buffer.byteLength(raw, 'utf8') > maximumBytes) {
        onError(new SupervisorProtocolError(
          'FRAME_TOO_LARGE',
          'Mensagem do supervisor excede o limite permitido.',
        ));
        return;
      }
      try {
        onFrame(JSON.parse(raw));
      } catch {
        onError(new SupervisorProtocolError(
          'INVALID_FRAME',
          'Mensagem inválida recebida pelo supervisor.',
        ));
        return;
      }
    }
  };
}

export function safeTokenEqual(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string') return false;
  const actualBuffer = Buffer.from(actual, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

export function serializeSupervisorError(error) {
  return {
    name: error?.name ?? 'Error',
    code: error?.code ?? 'SUPERVISOR_ERROR',
    message: error instanceof Error ? error.message : String(error),
  };
}

export class SupervisorProtocolError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SupervisorProtocolError';
    this.code = code;
  }
}
