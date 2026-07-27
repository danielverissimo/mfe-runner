import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import net from 'node:net';
import path from 'node:path';
import { createLaunchSpecification } from './launch-specification.mjs';

const HEALTH_INTERVAL_MS = 1800;
const STOP_TIMEOUT_MS = 7000;
const TASK_TIMEOUT_MS = 300000;

function processKey(workspaceId, projectId) {
  return `${workspaceId}::${projectId}`;
}

function npmInvocation(node, args, platform = process.platform) {
  if (platform === 'win32' && path.extname(node.npmExecutable) === '.cmd') {
    return {
      command: node.nodeExecutable,
      args: [
        path.join(
          path.dirname(node.npmExecutable),
          'node_modules',
          'npm',
          'bin',
          'npm-cli.js',
        ),
        ...args,
      ],
    };
  }
  return { command: node.npmExecutable, args };
}

export function redactLog(value) {
  return value
    .replace(
      /(authorization\s*[:=]\s*bearer\s+)[^\s]+/gi,
      '$1[REDACTED]',
    )
    .replace(
      /((?:token|password|passwd|secret|client_secret|api[_-]?key)\s*[:=]\s*)[^\s,;]+/gi,
      '$1[REDACTED]',
    );
}

export function classifyLogLevel(stream, message) {
  if (
    /\b(?:error|fatal|failed|failure|exception|uncaught|erro|falha)\b/i.test(
      message,
    )
  ) {
    return 'error';
  }
  if (
    /\b(?:warn|warning|deprecated|deprecation|aviso)\b/i.test(message)
  ) {
    return 'warning';
  }
  return stream === 'system' &&
      /\b(?:encerrado com código [1-9]|timeout)\b/i.test(message)
    ? 'error'
    : 'info';
}

function splitBufferedLines(previous, chunk) {
  const combined = `${previous}${chunk.toString('utf8')}`;
  const lines = combined.split(/\r?\n/);
  return {
    remainder: lines.pop() ?? '',
    lines,
  };
}

async function isPortOpen(port, host = '127.0.0.1', timeout = 500) {
  if (!port) return false;
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host });
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeout);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

async function checkHttp(url, timeout = 1200) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'manual',
    });
    return response.status >= 200 && response.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function healthPathFor(project) {
  if (project.role === 'mfe') {
    const classic = project.registrations?.some(
      (registration) => registration.type === 'module-federation',
    );
    return classic ? '/remoteEntry.js' : '/remoteEntry.json';
  }
  return '/';
}

async function terminateProcessTree(child, signal = 'SIGTERM') {
  if (!child?.pid || child.exitCode !== null) return;

  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      const killer = spawn(
        'taskkill',
        [
          '/pid',
          String(child.pid),
          '/t',
          '/f',
        ],
        { windowsHide: true, stdio: 'ignore' },
      );
      killer.once('close', resolve);
      killer.once('error', resolve);
    });
    return;
  }

  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error;
  }
}

function waitForClose(child, timeout) {
  if (!child || child.exitCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.off('close', onClose);
      resolve(false);
    }, timeout);
    const onClose = () => {
      clearTimeout(timer);
      resolve(true);
    };
    child.once('close', onClose);
  });
}

export class ProcessSupervisor extends EventEmitter {
  #records = new Map();
  #logLimit;

  constructor({ logLimit = 1500 } = {}) {
    super();
    this.#logLimit = logLimit;
  }

  setLogLimit(logLimit) {
    this.#logLimit = Math.min(Math.max(logLimit, 200), 10000);
    for (const record of this.#records.values()) {
      record.logs = record.logs.slice(-this.#logLimit);
    }
    this.#emitSnapshot();
  }

  get hasRunningProcesses() {
    return [...this.#records.values()].some((record) =>
      ['starting', 'linking', 'healthy', 'running', 'degraded', 'stopping'].includes(
        record.status,
      ),
    );
  }

  snapshot() {
    return [...this.#records.values()].map((record) => ({
      key: record.key,
      workspaceId: record.workspaceId,
      projectId: record.projectId,
      projectName: record.projectName,
      script: record.script,
      commandId: record.commandId,
      status: record.status,
      pid: record.child?.pid ?? null,
      port: record.port,
      startedAt: record.startedAt,
      stoppedAt: record.stoppedAt,
      exitCode: record.exitCode,
      message: record.message,
      logs: record.logs,
    }));
  }

  async start({ workspace, project, script, commandId }) {
    const key = processKey(workspace.id, project.id);
    const existing = this.#records.get(key);
    if (
      existing &&
      ['starting', 'linking', 'healthy', 'running', 'degraded', 'stopping'].includes(
        existing.status,
      )
    ) {
      throw new Error(`${project.name} já está em execução.`);
    }

    const selectedCommandId = commandId ??
      project.commands?.find((command) => command.task === script)?.id ??
      project.defaultCommandId;
    const launch = createLaunchSpecification({
      workspace,
      project,
      commandId: selectedCommandId,
    });
    const profile = project.commands?.find(
      (command) => command.id === launch.commandId,
    );
    const selectedScript = profile?.task ?? script ?? launch.commandId;
    if (launch.port && await isPortOpen(launch.port)) {
      const conflict = {
        key,
        workspaceId: workspace.id,
        projectId: project.id,
        projectName: project.name,
        script: selectedScript,
        commandId: launch.commandId,
        status: 'conflict',
        child: null,
        port: launch.port,
        startedAt: null,
        stoppedAt: null,
        exitCode: null,
        message: `Porta ${project.port} ocupada por um processo externo.`,
        logs: [],
        project,
        workspace,
      };
      this.#records.set(key, conflict);
      this.#emitSnapshot();
      throw new Error(conflict.message);
    }

    const record = {
      key,
      workspaceId: workspace.id,
      projectId: project.id,
      projectName: project.name,
      script: selectedScript,
      commandId: launch.commandId,
      status: 'starting',
      child: null,
      port: launch.port,
      startedAt: new Date().toISOString(),
      stoppedAt: null,
      exitCode: null,
      stopRequested: false,
      message: 'Iniciando processo…',
      logs: existing?.logs ?? [],
      project,
      workspace,
      healthTimer: null,
      stdoutRemainder: '',
      stderrRemainder: '',
      launchSpecification: launch,
    };
    this.#records.set(key, record);
    this.#pushLog(record, 'system', `${launch.label}: ${launch.commandId}`);
    this.#emitSnapshot();

    const child = spawn(
      launch.executable,
      launch.args,
      {
        cwd: launch.cwd,
        env: launch.env,
        shell: false,
        detached: process.platform !== 'win32',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    record.child = child;

    child.stdout?.on('data', (chunk) => {
      const parsed = splitBufferedLines(record.stdoutRemainder, chunk);
      record.stdoutRemainder = parsed.remainder;
      parsed.lines.forEach((line) => this.#pushLog(record, 'stdout', line));
    });
    child.stderr?.on('data', (chunk) => {
      const parsed = splitBufferedLines(record.stderrRemainder, chunk);
      record.stderrRemainder = parsed.remainder;
      parsed.lines.forEach((line) => this.#pushLog(record, 'stderr', line));
    });
    child.once('error', (error) => {
      record.status = 'failed';
      record.message = error.message;
      this.#pushLog(record, 'system', `Falha ao iniciar: ${error.message}`);
      this.#stopHealth(record);
      this.#emitSnapshot();
    });
    child.once('close', (code, signal) => {
      if (record.stdoutRemainder) {
        this.#pushLog(record, 'stdout', record.stdoutRemainder);
      }
      if (record.stderrRemainder) {
        this.#pushLog(record, 'stderr', record.stderrRemainder);
      }
      record.exitCode = code;
      record.stoppedAt = new Date().toISOString();
      record.status =
        record.stopRequested || record.status === 'stopping' || code === 0
          ? 'stopped'
          : 'failed';
      record.message = signal
        ? `Processo encerrado por ${signal}.`
        : `Processo encerrado com código ${code ?? 'desconhecido'}.`;
      this.#pushLog(record, 'system', record.message);
      this.#stopHealth(record);
      this.#emitSnapshot();
    });

    this.#startHealth(record);
    return this.snapshot().find((item) => item.key === key);
  }

  async runTask({
    workspace,
    project,
    script,
    label = 'Operação',
    timeout = TASK_TIMEOUT_MS,
  }) {
    const key = processKey(workspace.id, project.id);
    const existing = this.#records.get(key);
    if (
      existing?.child &&
      existing.child.exitCode === null
    ) {
      throw new Error(`${project.name} ainda está em execução.`);
    }
    if (
      typeof script !== 'string' ||
      !script.startsWith('link:') ||
      !project.scripts[script]
    ) {
      throw new Error(
        `Script de vínculo não disponível para ${project.name}.`,
      );
    }
    if (!project.node?.available) {
      throw new Error(
        project.node?.reason || `Node indisponível para ${project.name}.`,
      );
    }

    const record = {
      key,
      workspaceId: workspace.id,
      projectId: project.id,
      projectName: project.name,
      script,
      status: 'linking',
      child: null,
      port: project.port,
      startedAt: new Date().toISOString(),
      stoppedAt: null,
      exitCode: null,
      message: `${label} em andamento…`,
      logs: existing?.logs ?? [],
      project,
      workspace,
      healthTimer: null,
      stdoutRemainder: '',
      stderrRemainder: '',
    };
    this.#records.set(key, record);
    this.#pushLog(record, 'system', `${label}: npm run ${script}`);
    this.#emitSnapshot();

    const invocation = npmInvocation(project.node, ['run', script]);
    const child = spawn(
      invocation.command,
      invocation.args,
      {
        cwd: project.absolutePath,
        env: {
          ...process.env,
          PATH: [
            project.node.binDirectory,
            process.env.PATH,
          ].filter(Boolean).join(path.delimiter),
          MFE_RUNNER_WORKSPACE: workspace.name,
          MFE_RUNNER_ENVIRONMENT: workspace.environment,
        },
        shell: false,
        detached: process.platform !== 'win32',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    record.child = child;
    record.status = 'linking';
    this.#emitSnapshot();

    child.stdout?.on('data', (chunk) => {
      const parsed = splitBufferedLines(record.stdoutRemainder, chunk);
      record.stdoutRemainder = parsed.remainder;
      parsed.lines.forEach((line) => this.#pushLog(record, 'stdout', line));
    });
    child.stderr?.on('data', (chunk) => {
      const parsed = splitBufferedLines(record.stderrRemainder, chunk);
      record.stderrRemainder = parsed.remainder;
      parsed.lines.forEach((line) => this.#pushLog(record, 'stderr', line));
    });

    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (record.stdoutRemainder) {
          this.#pushLog(record, 'stdout', record.stdoutRemainder);
          record.stdoutRemainder = '';
        }
        if (record.stderrRemainder) {
          this.#pushLog(record, 'stderr', record.stderrRemainder);
          record.stderrRemainder = '';
        }
        record.stoppedAt = new Date().toISOString();
        record.status = error ? 'failed' : 'stopped';
        record.message = error
          ? `${label} falhou: ${error.message}`
          : `${label} concluída.`;
        this.#pushLog(record, 'system', record.message);
        this.#emitSnapshot();
        if (error) reject(error);
        else resolve(this.snapshot().find((item) => item.key === key));
      };
      const timer = setTimeout(async () => {
        await terminateProcessTree(child, 'SIGTERM');
        const stopped = await waitForClose(child, 2000);
        if (!stopped) await terminateProcessTree(child, 'SIGKILL');
        finish(new Error(`${label} excedeu o limite de ${timeout} ms.`));
      }, timeout);
      child.once('error', finish);
      child.once('close', (code, signal) => {
        record.exitCode = code;
        if (code === 0) {
          finish();
        } else {
          finish(new Error(
            signal
              ? `Processo encerrado por ${signal}.`
              : `Processo encerrado com código ${code ?? 'desconhecido'}.`,
          ));
        }
      });
    });
  }

  async stop(workspaceId, projectId) {
    const record = this.#records.get(processKey(workspaceId, projectId));
    if (!record?.child || record.child.exitCode !== null) {
      if (record?.status === 'conflict') {
        record.status = 'stopped';
        record.message = 'Conflito descartado; nenhum processo externo foi encerrado.';
        this.#emitSnapshot();
      }
      return;
    }

    record.status = 'stopping';
    record.stopRequested = true;
    record.message = 'Encerrando a árvore de processos…';
    this.#emitSnapshot();
    await terminateProcessTree(record.child, 'SIGTERM');
    const stopped = await waitForClose(record.child, STOP_TIMEOUT_MS);
    if (!stopped) {
      this.#pushLog(
        record,
        'system',
        'Timeout no encerramento gracioso; forçando a parada.',
      );
      await terminateProcessTree(record.child, 'SIGKILL');
      await waitForClose(record.child, 2000);
    }
  }

  async restart(workspaceId, projectId) {
    const record = this.#records.get(processKey(workspaceId, projectId));
    if (!record) throw new Error('Processo não encontrado para reinício.');
    const { workspace, project, script, commandId } = record;
    await this.stop(workspaceId, projectId);
    return this.start({ workspace, project, script, commandId });
  }

  async stopWorkspace(workspaceId, projectIds) {
    const workspaceRecords = [...this.#records.values()].filter(
      (record) => record.workspaceId === workspaceId,
    );
    const byProjectId = new Map(
      workspaceRecords.map((record) => [record.projectId, record]),
    );
    const records = projectIds
      ? projectIds.map((projectId) => byProjectId.get(projectId)).filter(Boolean)
      : workspaceRecords;
    for (const record of records) {
      await this.stop(record.workspaceId, record.projectId);
    }
  }

  async stopAll() {
    const running = [...this.#records.values()].filter((record) => record.child);
    await Promise.all(
      running.map((record) => this.stop(record.workspaceId, record.projectId)),
    );
  }

  clearLogs(workspaceId, projectId) {
    if (!workspaceId) {
      for (const record of this.#records.values()) record.logs = [];
    } else if (!projectId) {
      for (const record of this.#records.values()) {
        if (record.workspaceId === workspaceId) record.logs = [];
      }
    } else {
      const record = this.#records.get(processKey(workspaceId, projectId));
      if (record) record.logs = [];
    }
    this.#emitSnapshot();
  }

  resolveExternalConflict(workspaceId, projectId, message) {
    const record = this.#records.get(processKey(workspaceId, projectId));
    if (!record || record.status !== 'conflict') return;
    record.status = 'stopped';
    record.message = message;
    record.stoppedAt = new Date().toISOString();
    this.#pushLog(record, 'system', message);
    this.#emitSnapshot();
  }

  #pushLog(record, stream, rawMessage) {
    const message = redactLog(rawMessage);
    if (!message) return;
    const entry = {
      id: `${record.key}:${Date.now()}:${record.logs.length}`,
      workspaceId: record.workspaceId,
      projectId: record.projectId,
      projectName: record.projectName,
      stream,
      level: classifyLogLevel(stream, message),
      message,
      timestamp: new Date().toISOString(),
    };
    record.logs.push(entry);
    if (record.logs.length > this.#logLimit) {
      record.logs.splice(0, record.logs.length - this.#logLimit);
    }
    this.emit('log', entry);
  }

  #startHealth(record) {
    const update = async () => {
      if (!record.child || record.child.exitCode !== null) return;
      const health = record.launchSpecification?.healthCheck ?? {
        type: record.port ? 'tcp' : 'process',
        port: record.port,
      };
      if (health.type === 'none' || health.type === 'process') {
        record.status = 'running';
        record.message = 'Processo ativo.';
        this.#emitSnapshot();
        return;
      }

      const port = health.port ?? record.port;
      const portOpen = await isPortOpen(port, health.host ?? '127.0.0.1');
      if (!portOpen) {
        record.status = 'starting';
        record.message = `Aguardando a porta ${port}…`;
        this.#emitSnapshot();
        return;
      }

      if (health.type === 'tcp') {
        record.status = 'healthy';
        record.message = `Saudável na porta ${port}.`;
        this.#emitSnapshot();
        return;
      }

      const url = health.url ??
        `http://${health.host ?? '127.0.0.1'}:${port}${
          health.path ?? healthPathFor(record.project)
        }`;
      const healthy = await checkHttp(url);
      record.status = healthy ? 'healthy' : 'degraded';
      record.message = healthy
        ? `Saudável na porta ${port}.`
        : `Porta ${port} aberta, mas o endpoint de saúde não respondeu.`;
      this.#emitSnapshot();
    };

    void update();
    record.healthTimer = setInterval(update, HEALTH_INTERVAL_MS);
  }

  #stopHealth(record) {
    if (record.healthTimer) clearInterval(record.healthTimer);
    record.healthTimer = null;
  }

  #emitSnapshot() {
    this.emit('snapshot', this.snapshot());
  }
}

export const __test__ = {
  healthPathFor,
  isPortOpen,
  npmInvocation,
  processKey,
  redactLog,
  splitBufferedLines,
};
