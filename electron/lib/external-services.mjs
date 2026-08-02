import { execFile } from 'node:child_process';
import { access, constants, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { inspectExternalProcess } from './external-process.mjs';

const execFileAsync = promisify(execFile);
const COMMAND_TIMEOUT_MS = 8_000;
const MAXIMUM_OUTPUT_BYTES = 4 * 1024 * 1024;

async function execute(command, args) {
  const { stdout } = await execFileAsync(command, args, {
    encoding: 'utf8',
    maxBuffer: MAXIMUM_OUTPUT_BYTES,
    timeout: COMMAND_TIMEOUT_MS,
    windowsHide: true,
  });
  return stdout;
}

function normalizeListenerHost(value) {
  const host = String(value ?? '').trim();
  if (!host || host === '*' || host === '0.0.0.0' || host === '::') {
    return 'localhost';
  }
  if (host.startsWith('[') && host.endsWith(']')) return host.toLowerCase();
  return host.toLowerCase();
}

function parseAddress(value) {
  const address = String(value ?? '').trim();
  const match = address.match(/^(.*):(\d+)$/);
  if (!match) return null;
  const port = Number(match[2]);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) return null;
  let host = match[1];
  if (host.includes('->')) host = host.slice(host.lastIndexOf('->') + 2);
  return { host: normalizeListenerHost(host), port };
}

export function parseLsofListeners(output) {
  const listeners = [];
  let current = null;
  for (const line of String(output ?? '').split(/\r?\n/)) {
    if (line.startsWith('p')) {
      const pid = Number(line.slice(1));
      current = Number.isInteger(pid) && pid > 1
        ? { pid, name: 'Processo', owner: '' }
        : null;
    } else if (current && line.startsWith('c')) {
      current.name = line.slice(1).trim() || current.name;
    } else if (current && line.startsWith('L')) {
      current.owner = line.slice(1).trim();
    } else if (current && line.startsWith('n')) {
      const address = parseAddress(line.slice(1));
      if (address) listeners.push({ ...current, ...address });
    }
  }
  return listeners;
}

export function parseSsListeners(output) {
  return String(output ?? '').split(/\r?\n/).flatMap((line) => {
    if (!line.trim()) return [];
    const columns = line.trim().split(/\s+/);
    const local = columns.find((column) => /:\d+$/.test(column));
    const address = parseAddress(local);
    if (!address) return [];
    const processMatch = line.match(/pid=(\d+)/);
    const nameMatch = line.match(/\(\("([^"]+)"/);
    return [{
      ...address,
      pid: processMatch ? Number(processMatch[1]) : null,
      name: nameMatch?.[1] ?? 'Processo',
      owner: '',
    }];
  });
}

export function parseWindowsListeners(output) {
  if (!String(output ?? '').trim()) return [];
  const parsed = JSON.parse(output);
  return (Array.isArray(parsed) ? parsed : [parsed]).flatMap((item) => {
    const port = Number(item.LocalPort);
    const pid = Number(item.Pid);
    if (!Number.isInteger(port) || !Number.isInteger(pid) || pid <= 1) return [];
    return [{
      host: normalizeListenerHost(item.LocalAddress),
      port,
      pid,
      name: String(item.Name || 'Processo').slice(0, 200),
      owner: '',
    }];
  });
}

async function listPosixListeners(platform, runCommand) {
  if (platform === 'linux') {
    try {
      return parseSsListeners(await runCommand('ss', ['-H', '-ltnp']));
    } catch (error) {
      if (error?.code !== 'ENOENT' && error?.code !== 1) throw error;
    }
  }
  const command = platform === 'darwin' ? '/usr/sbin/lsof' : 'lsof';
  try {
    return parseLsofListeners(await runCommand(
      command,
      ['-nP', '-iTCP', '-sTCP:LISTEN', '-FpLcLn'],
    ));
  } catch (error) {
    if (error?.code === 1) return [];
    if (error?.code === 'ENOENT') {
      throw new Error('Nenhum utilitário para listar portas TCP foi encontrado.');
    }
    throw error;
  }
}

async function listWindowsListeners(runCommand) {
  const script =
    '$items = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | ' +
    'ForEach-Object { $p = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue; ' +
    '[PSCustomObject]@{LocalAddress=$_.LocalAddress;LocalPort=$_.LocalPort;' +
    'Pid=$_.OwningProcess;Name=if($p){$p.ProcessName}else{"Processo"}} }; ' +
    '$items | ConvertTo-Json -Compress';
  return parseWindowsListeners(await runCommand('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    script,
  ]));
}

async function isExecutable(filePath) {
  try {
    await access(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function dockerExecutableCandidates({
  platform = process.platform,
  environment = process.env,
} = {}) {
  const home = environment.HOME || os.homedir();
  const localAppData = environment.LOCALAPPDATA;
  const pathApi = platform === 'win32' ? path.win32 : path.posix;
  const known = platform === 'darwin'
    ? [
        '/Applications/Docker.app/Contents/Resources/bin/docker',
        '/opt/homebrew/bin/docker',
        '/usr/local/bin/docker',
      ]
    : platform === 'win32'
      ? [
          localAppData && pathApi.join(localAppData, 'Docker', 'resources', 'bin', 'docker.exe'),
          'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe',
        ].filter(Boolean)
      : [
          '/usr/bin/docker',
          '/usr/local/bin/docker',
          home && pathApi.join(home, '.docker', 'bin', 'docker'),
        ].filter(Boolean);
  const executableName = platform === 'win32' ? 'docker.exe' : 'docker';
  const delimiter = platform === 'win32' ? ';' : ':';
  const fromPath = String(environment.PATH ?? '').split(delimiter)
    .filter(Boolean)
    .map((directory) => pathApi.join(directory, executableName));
  return [...new Set([...known, ...fromPath])];
}

export async function resolveDockerExecutable({
  isExecutable: checkExecutable = isExecutable,
  ...options
} = {}) {
  const candidates = dockerExecutableCandidates(options);
  for (const candidate of candidates) {
    if (await checkExecutable(candidate)) return candidate;
  }
  return null;
}

export function normalizeDockerInspect(value) {
  const container = value && typeof value === 'object' ? value : null;
  if (!container?.Id || container.State?.Running !== true) return null;
  const ports = [];
  for (const [containerPort, mappings] of Object.entries(
    container.NetworkSettings?.Ports ?? {},
  )) {
    if (!containerPort.endsWith('/tcp') || !Array.isArray(mappings)) continue;
    for (const mapping of mappings) {
      const port = Number(mapping?.HostPort);
      if (!Number.isInteger(port) || port < 1 || port > 65_535) continue;
      ports.push({
        host: normalizeListenerHost(mapping.HostIp),
        port,
        containerPort: Number(containerPort.split('/')[0]),
      });
    }
  }
  if (!ports.length) return null;
  return {
    containerId: String(container.Id),
    name: String(container.Name ?? '').replace(/^\//, '') || String(container.Id).slice(0, 12),
    image: String(container.Config?.Image ?? container.Image ?? ''),
    ports,
  };
}

async function listDockerContainers(executablePath, runCommand) {
  if (!executablePath) {
    return { containers: [], available: false, message: 'Docker CLI não encontrado.' };
  }
  try {
    const rawIds = await runCommand(executablePath, [
      'container', 'ls', '--quiet', '--no-trunc',
    ]);
    const ids = rawIds.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    if (!ids.length) {
      return { containers: [], available: true, message: 'Nenhum container em execução.' };
    }
    const raw = await runCommand(executablePath, ['container', 'inspect', ...ids]);
    const parsed = JSON.parse(raw);
    const containers = (Array.isArray(parsed) ? parsed : [parsed])
      .map(normalizeDockerInspect)
      .filter(Boolean);
    return {
      containers,
      available: true,
      message: containers.length
        ? `${containers.length} container(s) com porta publicada.`
        : 'Nenhum container com porta TCP publicada.',
    };
  } catch (error) {
    const detail = error?.code === 'ENOENT'
      ? 'Docker CLI não encontrado.'
      : 'Docker indisponível ou daemon não iniciado.';
    return { containers: [], available: false, message: detail };
  }
}

function listenerCandidate(listener) {
  return {
    id: `process:${listener.pid ?? 'unknown'}:${listener.port}`,
    provider: 'process',
    name: listener.name,
    host: listener.host,
    port: listener.port,
    pid: listener.pid,
    owner: listener.owner,
    canTerminate: Number.isInteger(listener.pid),
    ports: [{ host: listener.host, port: listener.port }],
  };
}

function dockerCandidates(container) {
  return container.ports.map((mapping) => ({
    id: `docker:${container.containerId}:${mapping.port}`,
    provider: 'docker',
    name: container.name,
    host: mapping.host,
    port: mapping.port,
    containerId: container.containerId,
    image: container.image,
    canTerminate: true,
    ports: container.ports,
  }));
}

export async function discoverExternalServiceCandidates({
  excludedPorts = [],
  platform = process.platform,
  runCommand = execute,
  environment = process.env,
} = {}) {
  const excluded = new Set(excludedPorts.filter(Number.isInteger));
  const dockerExecutable = await resolveDockerExecutable({ platform, environment });
  const [listenersResult, docker] = await Promise.all([
    (platform === 'win32'
      ? listWindowsListeners(runCommand)
      : listPosixListeners(platform, runCommand))
      .then((listeners) => ({ listeners, message: null }))
      .catch((error) => ({ listeners: [], message: error.message })),
    listDockerContainers(dockerExecutable, runCommand),
  ]);
  const dockerItems = docker.containers.flatMap(dockerCandidates)
    .filter((candidate) => !excluded.has(candidate.port));
  const dockerPorts = new Set(dockerItems.map((candidate) => candidate.port));
  const processItems = listenersResult.listeners
    .map(listenerCandidate)
    .filter((candidate) =>
      !excluded.has(candidate.port) && !dockerPorts.has(candidate.port)
    );
  const candidates = [...dockerItems, ...processItems]
    .filter((candidate, index, all) =>
      all.findIndex((item) => item.id === candidate.id) === index
    )
    .toSorted((left, right) => left.port - right.port || left.name.localeCompare(right.name));
  return {
    candidates,
    docker: {
      available: docker.available,
      message: docker.message,
    },
    processMessage: listenersResult.message,
  };
}

export async function validateExternalLogFile(filePath) {
  if (!filePath) return null;
  const info = await stat(filePath);
  if (!info.isFile()) throw new Error('A fonte de logs deve ser um arquivo regular.');
  return filePath;
}

export async function buildExternalServiceDefinition(request, catalog) {
  const candidate = request.candidateId
    ? catalog.candidates.find((item) => item.id === request.candidateId)
    : null;
  if (request.candidateId && !candidate) {
    throw new Error('O processo externo mudou antes da confirmação. Atualize a lista.');
  }
  const provider = candidate?.provider ?? 'process';
  const logFilePath = await validateExternalLogFile(request.logFilePath);
  let identity = {};
  if (provider === 'docker') {
    identity = {
      containerId: candidate.containerId,
      name: candidate.name,
      image: candidate.image,
    };
  } else if (candidate?.pid) {
    const current = await inspectExternalProcess(candidate.port);
    if (!current || current.pid !== candidate.pid) {
      throw new Error('O processo externo mudou antes da confirmação. Atualize a lista.');
    }
    identity = { pid: current.pid, name: current.name };
  } else if (['localhost', '127.0.0.1', '[::1]'].includes(request.host)) {
    const current = await inspectExternalProcess(request.port).catch(() => null);
    if (current) identity = { pid: current.pid, name: current.name };
  }
  return {
    name: request.name,
    scheme: request.scheme,
    host: candidate?.host ?? request.host,
    port: candidate?.port ?? request.port,
    provider,
    identity,
    logSource: provider === 'docker'
      ? { type: 'docker' }
      : logFilePath
        ? { type: 'file', filePath: logFilePath }
        : { type: 'none' },
  };
}

export async function resolveDockerLogLaunch(service, options = {}) {
  const executablePath = await resolveDockerExecutable(options);
  if (!executablePath) throw new Error('Docker CLI não encontrado.');
  return {
    executablePath,
    args: [
      'container', 'logs', '--follow', '--tail', '200', '--timestamps',
      service.identity.containerId,
    ],
  };
}

export async function inspectDockerService(service, {
  runCommand = execute,
  ...options
} = {}) {
  const executablePath = await resolveDockerExecutable(options);
  if (!executablePath) return null;
  try {
    const raw = await runCommand(executablePath, [
      'container', 'inspect', service.identity.containerId,
    ]);
    const current = normalizeDockerInspect(JSON.parse(raw)?.[0]);
    if (!current) return false;
    return current.containerId === service.identity.containerId &&
      current.ports.some((mapping) => mapping.port === service.port);
  } catch {
    return false;
  }
}

export async function stopDockerContainer(service, {
  runCommand = execute,
  ...options
} = {}) {
  const executablePath = await resolveDockerExecutable(options);
  if (!executablePath) throw new Error('Docker CLI não encontrado.');
  const raw = await runCommand(executablePath, [
    'container', 'inspect', service.identity.containerId,
  ]);
  const current = normalizeDockerInspect(JSON.parse(raw)?.[0]);
  if (!current || current.containerId !== service.identity.containerId) {
    throw new Error('A identidade do container mudou; encerramento cancelado.');
  }
  await runCommand(executablePath, [
    'container', 'stop', '--time', '7', current.containerId,
  ]);
}

export const externalServiceInternals = {
  normalizeListenerHost,
  parseAddress,
};
