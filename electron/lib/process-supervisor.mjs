import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { open, stat } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { createLaunchSpecification } from './launch-specification.mjs';
import { inspectExternalProcess } from './external-process.mjs';
import { inspectDockerService } from './external-services.mjs';

const HEALTH_INTERVAL_MS = 1800;
const STOP_TIMEOUT_MS = 7000;
const TASK_TIMEOUT_MS = 300000;
const NGROK_READY_FALLBACK_MS = 1800;
const EXTERNAL_HEALTH_INTERVAL_MS = 1800;
const EXTERNAL_FILE_INTERVAL_MS = 1000;
const EXTERNAL_FILE_INITIAL_BYTES = 256 * 1024;
const EXTERNAL_FILE_READ_BYTES = 512 * 1024;

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

function nodeTaskEnvironment(project, baseEnvironment = process.env) {
  const runtimeEnvironment = project.runtime?.environment ?? {};
  const binDirectory = project.node?.binDirectory;
  return {
    ...baseEnvironment,
    ...runtimeEnvironment,
    npm_config_audit: 'false',
    npm_config_fund: 'false',
    PATH: [
      binDirectory,
      runtimeEnvironment.PATH,
      baseEnvironment.PATH,
    ].filter(Boolean).join(path.delimiter),
    ...(binDirectory ? { NVM_BIN: binDirectory } : {}),
    ...(binDirectory && process.platform !== 'win32'
      ? {
          NVM_INC: path.resolve(
            binDirectory,
            '..',
            'include',
            'node',
          ),
        }
      : {}),
  };
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

function isChildRunning(child) {
  return Boolean(child?.pid) &&
    child.exitCode === null &&
    child.signalCode === null;
}

function networkHost(value) {
  return value?.startsWith('[') && value.endsWith(']')
    ? value.slice(1, -1)
    : value;
}

function validateExternalLogLaunch(value, service) {
  if (service.logSource?.type !== 'docker') return null;
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== 'object' || !path.isAbsolute(value.executablePath)) {
    throw new TypeError('Especificação de logs Docker inválida.');
  }
  const expected = [
    'container', 'logs', '--follow', '--tail', '200', '--timestamps',
    service.identity?.containerId,
  ];
  if (!Array.isArray(value.args) ||
      value.args.length !== expected.length ||
      !expected.every((argument, index) => value.args[index] === argument)) {
    throw new TypeError('Argumentos de logs Docker não autorizados.');
  }
  return { executablePath: value.executablePath, args: [...value.args] };
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

async function reserveLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close((error) => {
        if (error) reject(error);
        else if (!port) reject(new Error('Não foi possível reservar uma porta para o Flutter Web.'));
        else resolve(port);
      });
    });
  });
}

async function prepareLaunchSpecification(launch, reservePort = reserveLoopbackPort) {
  if (launch.portStrategy !== 'flutter-web') return launch;
  const port = await reservePort();
  return {
    ...launch,
    args: [
      ...launch.args,
      '--web-hostname',
      '127.0.0.1',
      '--web-port',
      String(port),
    ],
    port,
    healthCheck: {
      type: 'tcp',
      host: '127.0.0.1',
      port,
    },
  };
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
  if (!isChildRunning(child)) return;

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
  if (!isChildRunning(child)) return Promise.resolve(true);
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

function validateNgrokLaunchSpecification(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Especificação de inicialização do ngrok inválida.');
  }
  const requiredStrings = [
    'executablePath', 'domainId', 'domain', 'publicUrl', 'upstream',
  ];
  for (const field of requiredStrings) {
    if (typeof value[field] !== 'string' || !value[field].trim()) {
      throw new TypeError(`Campo ngrok inválido: ${field}.`);
    }
  }
  if (!path.isAbsolute(value.executablePath)) {
    throw new TypeError('O executável do ngrok deve usar um path absoluto.');
  }
  if (!Array.isArray(value.args) || value.args.some((argument) => typeof argument !== 'string')) {
    throw new TypeError('Argumentos do ngrok inválidos.');
  }
  if (value.args.length > 12 || value.args.some((argument) => argument.length > 4096)) {
    throw new TypeError('Argumentos do ngrok excedem o limite permitido.');
  }
  if (value.publicUrl !== `https://${value.domain}`) {
    throw new TypeError('URL pública do ngrok inválida.');
  }
  const numericPort = Number(value.upstream);
  let validUpstream = Number.isInteger(numericPort) &&
    numericPort >= 1 && numericPort <= 65_535;
  if (!validUpstream) {
    try {
      const upstream = new URL(value.upstream);
      validUpstream = ['http:', 'https:'].includes(upstream.protocol) &&
        Boolean(upstream.hostname) && Boolean(upstream.port) &&
        !upstream.username && !upstream.password &&
        upstream.pathname === '/' && !upstream.search && !upstream.hash;
    } catch {
      validUpstream = false;
    }
  }
  if (
    value.args[0] !== 'http' ||
    value.args[1] !== value.upstream ||
    !validUpstream ||
    value.args[2] !== '--url' ||
    value.args[3] !== value.publicUrl
  ) {
    throw new TypeError('Destino do ngrok inválido.');
  }
  const suffix = ['--log', 'stdout', '--log-format', 'json', '--log-level', 'info'];
  const middle = value.args.slice(4, -suffix.length);
  const validConfig = middle.length === 0 || (
    middle.length === 2 && middle[0] === '--config' && path.isAbsolute(middle[1])
  );
  if (!validConfig || !suffix.every(
    (argument, index) => value.args[value.args.length - suffix.length + index] === argument
  )) {
    throw new TypeError('Argumentos do ngrok não autorizados.');
  }
  return {
    executablePath: value.executablePath,
    args: [...value.args],
    domainId: value.domainId,
    domain: value.domain,
    publicUrl: value.publicUrl,
    upstream: value.upstream,
    cwd: typeof value.cwd === 'string' && path.isAbsolute(value.cwd)
      ? value.cwd
      : undefined,
    env: value.env && typeof value.env === 'object' && !Array.isArray(value.env)
      ? { ...value.env }
      : process.env,
  };
}

export class ProcessSupervisor extends EventEmitter {
  #records = new Map();
  #logLimit;

  constructor({
    logLimit = 1500,
    spawnProcess = spawn,
    inspectExternal = inspectExternalProcess,
    inspectDocker = inspectDockerService,
  } = {}) {
    super();
    this.#logLimit = logLimit;
    this.spawnProcess = spawnProcess;
    this.inspectExternal = inspectExternal;
    this.inspectDocker = inspectDocker;
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
      ['starting', 'linking', 'healthy', 'running', 'degraded', 'stopping',
        'connecting', 'online', 'identity-mismatch'].includes(
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
      source: record.source ?? 'managed',
      script: record.script,
      commandId: record.commandId,
      status: record.status,
      pid: record.child?.pid ?? record.external?.identity?.pid ?? null,
      port: record.port,
      startedAt: record.startedAt,
      stoppedAt: record.stoppedAt,
      exitCode: record.exitCode,
      message: record.message,
      logs: record.logs,
      external: record.external
        ? {
            scheme: record.external.scheme,
            host: record.external.host,
            provider: record.external.provider,
            identity: structuredClone(record.external.identity),
            logSource: structuredClone(record.external.logSource),
            canTerminate: record.external.canTerminate,
          }
        : null,
      ngrok: record.ngrok
        ? {
            status: record.ngrok.status,
            domainId: record.ngrok.domainId,
            domain: record.ngrok.domain,
            publicUrl: record.ngrok.publicUrl,
            pid: record.ngrok.child?.pid ?? null,
            startedAt: record.ngrok.startedAt,
            stoppedAt: record.ngrok.stoppedAt,
            exitCode: record.ngrok.exitCode,
            message: record.ngrok.message,
          }
        : null,
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
    const launch = await prepareLaunchSpecification(
      createLaunchSpecification({
        workspace,
        project,
        commandId: selectedCommandId,
      }),
    );
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
      ngrok: null,
      pendingNgrokLaunch: null,
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
      void this.#stopNgrokRecord(record);
    });

    this.#startHealth(record);
    return this.snapshot().find((item) => item.key === key);
  }

  async attachExternal({ workspace, service, logLaunch = null }) {
    const key = processKey(workspace.id, service.id);
    const existing = this.#records.get(key);
    if (existing?.source === 'external') {
      this.#stopExternalMonitor(existing);
      await this.#stopExternalLogs(existing);
    } else if (existing) {
      throw new Error('O identificador externo colide com um projeto gerenciado.');
    }
    const validatedLogLaunch = validateExternalLogLaunch(logLaunch, service);
    const record = {
      key,
      workspaceId: workspace.id,
      projectId: service.id,
      projectName: service.name,
      source: 'external',
      script: 'external',
      commandId: null,
      status: 'connecting',
      child: null,
      port: service.port,
      startedAt: existing?.startedAt ?? new Date().toISOString(),
      stoppedAt: null,
      exitCode: null,
      message: `Conectando a ${service.host}:${service.port}…`,
      logs: existing?.logs ?? [],
      workspace,
      project: null,
      healthTimer: null,
      ngrok: existing?.ngrok ?? null,
      pendingNgrokLaunch: null,
      external: {
        ...structuredClone(service),
        logLaunch: validatedLogLaunch,
        canTerminate: service.provider === 'docker' ||
          Number.isInteger(service.identity?.pid),
        healthBusy: false,
        logChild: null,
        fileTimer: null,
        fileBusy: false,
        fileOffset: 0,
        fileIdentity: null,
        fileRemainder: '',
        stdoutRemainder: '',
        stderrRemainder: '',
        logUnavailableMessage: null,
      },
    };
    this.#records.set(key, record);
    this.#pushLog(
      record,
      'system',
      `Serviço externo vinculado em ${service.scheme}://${service.host}:${service.port}.`,
    );
    this.#startExternalMonitor(record);
    await this.#checkExternal(record);
    this.#emitSnapshot();
    return this.snapshot().find((item) => item.key === key);
  }

  async detachExternal(workspaceId, serviceId) {
    const key = processKey(workspaceId, serviceId);
    const record = this.#records.get(key);
    if (!record) return;
    if (record.source !== 'external') {
      throw new Error('O alvo selecionado não é um serviço externo.');
    }
    if (record.ngrok) await this.#stopNgrokRecord(record);
    this.#stopExternalMonitor(record);
    await this.#stopExternalLogs(record);
    this.#records.delete(key);
    this.#emitSnapshot();
  }

  async reconcileExternal(workspace, services) {
    const expected = new Set(services.map((service) => service.id));
    const stale = [...this.#records.values()].filter((record) =>
      record.workspaceId === workspace.id &&
      record.source === 'external' &&
      !expected.has(record.projectId)
    );
    for (const record of stale) {
      await this.detachExternal(record.workspaceId, record.projectId);
    }
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
    if (isChildRunning(existing?.child)) {
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
          ...nodeTaskEnvironment(project),
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
    if (record?.ngrok) await this.#stopNgrokRecord(record);
    if (!isChildRunning(record?.child)) {
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
    const ngrokLaunch = ['starting', 'online'].includes(record.ngrok?.status)
      ? structuredClone(record.ngrok.launchSpecification)
      : null;
    await this.stop(workspaceId, projectId);
    const restarted = await this.start({ workspace, project, script, commandId });
    if (ngrokLaunch) {
      const restartedRecord = this.#records.get(processKey(workspaceId, projectId));
      if (restartedRecord.port && ngrokLaunch.args?.[1]) {
        ngrokLaunch.upstream = String(restartedRecord.port);
        ngrokLaunch.args[1] = ngrokLaunch.upstream;
      }
      restartedRecord.pendingNgrokLaunch = ngrokLaunch;
      void this.#restorePendingNgrok(restartedRecord);
    }
    return restarted;
  }

  async startNgrok(workspaceId, projectId, launchSpecification) {
    const record = this.#records.get(processKey(workspaceId, projectId));
    if (!record || !['running', 'healthy', 'degraded', 'online'].includes(record.status)) {
      throw new Error('O serviço precisa estar disponível antes de vincular o ngrok.');
    }
    return this.#startNgrokRecord(record, launchSpecification);
  }

  async stopNgrok(workspaceId, projectId) {
    const record = this.#records.get(processKey(workspaceId, projectId));
    if (!record?.ngrok) return;
    await this.#stopNgrokRecord(record);
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
    const records = [...this.#records.values()];
    await Promise.all(records.map((record) =>
      record.source === 'external'
        ? this.detachExternal(record.workspaceId, record.projectId)
        : this.stop(record.workspaceId, record.projectId)
    ));
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

  #startExternalMonitor(record) {
    record.healthTimer = setInterval(
      () => void this.#checkExternal(record),
      EXTERNAL_HEALTH_INTERVAL_MS,
    );
    record.healthTimer.unref?.();
  }

  #stopExternalMonitor(record) {
    if (record.healthTimer) clearInterval(record.healthTimer);
    record.healthTimer = null;
  }

  async #checkExternal(record) {
    if (
      record.source !== 'external' ||
      record.external.healthBusy ||
      this.#records.get(record.key) !== record
    ) return;
    record.external.healthBusy = true;
    try {
      const reachable = await isPortOpen(
        record.port,
        networkHost(record.external.host),
      );
      let nextStatus = reachable ? 'online' : 'offline';
      let message = reachable
        ? `Serviço externo disponível em ${record.external.host}:${record.port}.`
        : `Serviço externo indisponível em ${record.external.host}:${record.port}.`;
      const expectedPid = record.external.provider === 'process'
        ? record.external.identity?.pid
        : null;
      if (reachable && Number.isInteger(expectedPid)) {
        const current = await this.inspectExternal(record.port).catch(() => null);
        if (current && current.pid !== expectedPid) {
          nextStatus = 'identity-mismatch';
          message =
            `A porta ${record.port} agora pertence a outro processo ` +
            `(PID ${current.pid}).`;
        }
      } else if (reachable && record.external.provider === 'docker') {
        const sameContainer = await this.inspectDocker(record.external)
          .catch(() => null);
        if (sameContainer === false) {
          nextStatus = 'identity-mismatch';
          message = 'A porta publicada não pertence mais ao container vinculado.';
        }
      }
      const changed = record.status !== nextStatus;
      record.status = nextStatus;
      record.message = message;
      if (nextStatus === 'online') {
        record.stoppedAt = null;
        if (changed) {
          record.startedAt = new Date().toISOString();
          this.#pushLog(record, 'system', message);
        }
        await this.#startExternalLogs(record);
      } else {
        record.stoppedAt = new Date().toISOString();
        if (changed) this.#pushLog(record, 'system', message);
        await this.#stopExternalLogs(record);
        if (record.ngrok) await this.#stopNgrokRecord(record);
      }
      this.#emitSnapshot();
    } finally {
      record.external.healthBusy = false;
    }
  }

  async #startExternalLogs(record) {
    const external = record.external;
    if (external.logSource.type === 'none') return;
    if (external.logSource.type === 'docker') {
      if (isChildRunning(external.logChild)) return;
      const launch = external.logLaunch;
      if (!launch) {
        this.#pushExternalLogUnavailable(record, 'Logs Docker indisponíveis.');
        return;
      }
      external.logUnavailableMessage = null;
      const child = this.spawnProcess(launch.executablePath, launch.args, {
        shell: false,
        detached: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      external.logChild = child;
      const consume = (stream, remainderKey, chunk) => {
        const parsed = splitBufferedLines(external[remainderKey], chunk);
        external[remainderKey] = parsed.remainder;
        parsed.lines.forEach((line) => this.#pushLog(record, stream, line));
      };
      child.stdout?.on('data', (chunk) => consume('stdout', 'stdoutRemainder', chunk));
      child.stderr?.on('data', (chunk) => consume('stderr', 'stderrRemainder', chunk));
      child.once('error', (error) => {
        this.#pushLog(record, 'system', `Falha ao acompanhar logs Docker: ${error.message}`);
      });
      child.once('close', () => {
        if (external.stdoutRemainder) {
          this.#pushLog(record, 'stdout', external.stdoutRemainder);
        }
        if (external.stderrRemainder) {
          this.#pushLog(record, 'stderr', external.stderrRemainder);
        }
        external.stdoutRemainder = '';
        external.stderrRemainder = '';
        external.logChild = null;
      });
      return;
    }
    if (external.fileTimer) return;
    try {
      const info = await stat(external.logSource.filePath);
      external.fileOffset = Math.max(0, info.size - EXTERNAL_FILE_INITIAL_BYTES);
      external.fileIdentity = `${info.dev}:${info.ino}`;
      external.logUnavailableMessage = null;
      await this.#readExternalFile(record);
      external.fileTimer = setInterval(
        () => void this.#readExternalFile(record),
        EXTERNAL_FILE_INTERVAL_MS,
      );
      external.fileTimer.unref?.();
    } catch (error) {
      this.#pushExternalLogUnavailable(
        record,
        `Arquivo de log indisponível: ${error.message}`,
      );
    }
  }

  #pushExternalLogUnavailable(record, message) {
    if (record.external.logUnavailableMessage === message) return;
    record.external.logUnavailableMessage = message;
    this.#pushLog(record, 'system', message);
  }

  async #readExternalFile(record) {
    const external = record.external;
    if (external.fileBusy || !external.logSource.filePath) return;
    external.fileBusy = true;
    let handle;
    try {
      const info = await stat(external.logSource.filePath);
      const identity = `${info.dev}:${info.ino}`;
      if (identity !== external.fileIdentity || info.size < external.fileOffset) {
        external.fileIdentity = identity;
        external.fileOffset = 0;
        external.fileRemainder = '';
        this.#pushLog(record, 'system', 'O arquivo de log foi rotacionado ou truncado.');
      }
      if (info.size <= external.fileOffset) return;
      const length = Math.min(
        info.size - external.fileOffset,
        EXTERNAL_FILE_READ_BYTES,
      );
      const buffer = Buffer.alloc(length);
      handle = await open(external.logSource.filePath, 'r');
      const { bytesRead } = await handle.read(
        buffer,
        0,
        length,
        external.fileOffset,
      );
      external.fileOffset += bytesRead;
      const parsed = splitBufferedLines(
        external.fileRemainder,
        buffer.subarray(0, bytesRead),
      );
      external.fileRemainder = parsed.remainder;
      parsed.lines.forEach((line) => this.#pushLog(record, 'stdout', line));
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        this.#pushLog(record, 'system', `Falha ao ler o arquivo de log: ${error.message}`);
      }
    } finally {
      await handle?.close().catch(() => {});
      external.fileBusy = false;
    }
  }

  async #stopExternalLogs(record) {
    const external = record.external;
    if (!external) return;
    if (external.fileTimer) clearInterval(external.fileTimer);
    external.fileTimer = null;
    if (isChildRunning(external.logChild)) {
      external.logChild.kill('SIGTERM');
      await waitForClose(external.logChild, 2000);
    }
    external.logChild = null;
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
      if (!isChildRunning(record.child)) return;
      const health = record.launchSpecification?.healthCheck ?? {
        type: record.port ? 'tcp' : 'process',
        port: record.port,
      };
      if (health.type === 'none' || health.type === 'process') {
        record.status = 'running';
        record.message = 'Processo ativo.';
        this.#emitSnapshot();
        void this.#restorePendingNgrok(record);
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
        void this.#restorePendingNgrok(record);
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
      void this.#restorePendingNgrok(record);
    };

    void update();
    record.healthTimer = setInterval(update, HEALTH_INTERVAL_MS);
  }

  #stopHealth(record) {
    if (record.healthTimer) clearInterval(record.healthTimer);
    record.healthTimer = null;
  }

  async #restorePendingNgrok(record) {
    if (!record.pendingNgrokLaunch || record.ngrok) return;
    const launch = record.pendingNgrokLaunch;
    record.pendingNgrokLaunch = null;
    try {
      await this.#startNgrokRecord(record, launch);
    } catch (error) {
      this.#pushLog(record, 'system', `[ngrok] Falha ao restaurar: ${error.message}`);
      this.#emitSnapshot();
    }
  }

  async #startNgrokRecord(record, launchSpecification) {
    if (record.ngrok && ['starting', 'online', 'stopping'].includes(record.ngrok.status)) {
      throw new Error('Este projeto já possui um túnel ngrok ativo.');
    }
    const launch = validateNgrokLaunchSpecification(launchSpecification);
    const duplicate = [...this.#records.values()].find((candidate) =>
      candidate.key !== record.key &&
      candidate.ngrok?.domain === launch.domain &&
      ['starting', 'online', 'stopping'].includes(candidate.ngrok.status)
    );
    if (duplicate) {
      throw new Error(
        `O domínio ${launch.domain} já está vinculado a ${duplicate.projectName}.`,
      );
    }

    const ngrok = {
      status: 'starting',
      domainId: launch.domainId,
      domain: launch.domain,
      publicUrl: launch.publicUrl,
      child: null,
      startedAt: new Date().toISOString(),
      stoppedAt: null,
      exitCode: null,
      message: 'Conectando ao ngrok…',
      stopRequested: false,
      stdoutRemainder: '',
      stderrRemainder: '',
      readyTimer: null,
      launchSpecification: launch,
    };
    record.ngrok = ngrok;
    this.#pushLog(record, 'system', `[ngrok] Vinculando ${launch.publicUrl}.`);
    this.#emitSnapshot();

    let child;
    try {
      child = this.spawnProcess(launch.executablePath, launch.args, {
        cwd: launch.cwd,
        env: launch.env,
        shell: false,
        detached: process.platform !== 'win32',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      ngrok.status = 'failed';
      ngrok.message = error.message;
      this.#pushLog(record, 'system', `[ngrok] Falha ao iniciar: ${error.message}`);
      this.#emitSnapshot();
      throw error;
    }
    ngrok.child = child;

    const receive = (stream, chunk) => {
      const remainderKey = stream === 'stdout' ? 'stdoutRemainder' : 'stderrRemainder';
      const parsed = splitBufferedLines(ngrok[remainderKey], chunk);
      ngrok[remainderKey] = parsed.remainder;
      parsed.lines.forEach((line) => this.#pushNgrokLog(record, stream, line));
    };
    child.stdout?.on('data', (chunk) => receive('stdout', chunk));
    child.stderr?.on('data', (chunk) => receive('stderr', chunk));
    child.once('error', (error) => {
      clearTimeout(ngrok.readyTimer);
      ngrok.status = 'failed';
      ngrok.message = error.message;
      this.#pushLog(record, 'system', `[ngrok] Falha ao iniciar: ${error.message}`);
      this.#emitSnapshot();
    });
    child.once('close', (code, signal) => {
      clearTimeout(ngrok.readyTimer);
      if (ngrok.stdoutRemainder) this.#pushNgrokLog(record, 'stdout', ngrok.stdoutRemainder);
      if (ngrok.stderrRemainder) this.#pushNgrokLog(record, 'stderr', ngrok.stderrRemainder);
      ngrok.exitCode = code;
      ngrok.stoppedAt = new Date().toISOString();
      ngrok.status = ngrok.stopRequested ? 'stopping' : 'failed';
      ngrok.message = ngrok.stopRequested
        ? 'Encerrando túnel ngrok…'
        : signal
          ? `ngrok encerrado por ${signal}.`
          : `ngrok encerrado com código ${code ?? 'desconhecido'}.`;
      this.#pushLog(record, 'system', `[ngrok] ${ngrok.message}`);
      this.#emitSnapshot();
    });
    ngrok.readyTimer = setTimeout(() => {
      if (record.ngrok === ngrok && ngrok.status === 'starting' && isChildRunning(child)) {
        ngrok.status = 'online';
        ngrok.message = `Túnel disponível em ${ngrok.publicUrl}.`;
        this.#emitSnapshot();
      }
    }, NGROK_READY_FALLBACK_MS);
    ngrok.readyTimer.unref?.();
    return this.snapshot().find((item) => item.key === record.key);
  }

  async #stopNgrokRecord(record, { clear = true } = {}) {
    const ngrok = record.ngrok;
    if (!ngrok) return;
    clearTimeout(ngrok.readyTimer);
    if (isChildRunning(ngrok.child)) {
      ngrok.status = 'stopping';
      ngrok.stopRequested = true;
      ngrok.message = 'Encerrando túnel ngrok…';
      this.#emitSnapshot();
      await terminateProcessTree(ngrok.child, 'SIGTERM');
      const stopped = await waitForClose(ngrok.child, STOP_TIMEOUT_MS);
      if (!stopped) {
        await terminateProcessTree(ngrok.child, 'SIGKILL');
        await waitForClose(ngrok.child, 2000);
      }
    }
    if (clear && record.ngrok === ngrok) {
      record.ngrok = null;
      this.#emitSnapshot();
    }
  }

  #pushNgrokLog(record, stream, rawLine) {
    let message = rawLine;
    try {
      const parsed = JSON.parse(rawLine);
      message = parsed.msg ?? parsed.message ?? rawLine;
      const url = parsed.url ?? parsed.public_url;
      if (url && record.ngrok && String(url) === record.ngrok.publicUrl) {
        record.ngrok.status = 'online';
        record.ngrok.message = `Túnel disponível em ${record.ngrok.publicUrl}.`;
      }
    } catch {
      // Versões antigas podem emitir logfmt; ele continua útil no painel.
    }
    if (String(message).trim().toLowerCase() === 'join connections') return;
    this.#pushLog(record, stream, `[ngrok] ${message}`);
    this.#emitSnapshot();
  }

  #emitSnapshot() {
    this.emit('snapshot', this.snapshot());
  }
}

export const __test__ = {
  healthPathFor,
  isChildRunning,
  isPortOpen,
  nodeTaskEnvironment,
  npmInvocation,
  processKey,
  redactLog,
  prepareLaunchSpecification,
  reserveLoopbackPort,
  splitBufferedLines,
  validateNgrokLaunchSpecification,
};
