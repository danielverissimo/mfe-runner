import { spawn } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import { access, realpath, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const COMMAND_TIMEOUT_MS = 20_000;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const DOMAIN_PAGE_SIZE = 100;
const MAX_DOMAIN_PAGES = 100;

export const NGROK_MANAGED_DOMAIN_SUFFIXES = Object.freeze([
  'ngrok.app',
  'ngrok.dev',
  'ngrok.pizza',
  'ngrok.pro',
  'ngrok-free.app',
  'ngrok-free.dev',
  'ngrok.io',
]);

function redactSensitive(value) {
  return String(value ?? '')
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s]+/gi, '$1[REDACTED]')
    .replace(/((?:authtoken|token|api[_-]?key|secret)\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]');
}

function normalizeNgrokError(value) {
  const detail = redactSensitive(value);
  if (/ERR_NGROK_414|already reserved for another account/i.test(detail)) {
    return 'Este domínio não está disponível. Escolha outra opção.';
  }
  if (/ERR_NGROK_431|limited to .*reserved domains/i.test(detail)) {
    return 'Sua conta atingiu o limite de domínios reservados do plano atual.';
  }
  if (/ERR_NGROK_313|ERR_NGROK_314|paid plan|upgrade/i.test(detail)) {
    return 'O plano atual não permite reservar este domínio. Escolha outra opção ou revise seu plano ngrok.';
  }
  if (/401|unauthorized|api key/i.test(detail)) {
    return 'A API key do ngrok está ausente, inválida ou sem permissão.';
  }
  return detail
    .replace(/(?:ERROR:\s*)+/gi, '')
    .replace(/Operation ID:\s*\S+/gi, '')
    .trim();
}

async function isExecutable(candidate, platform = process.platform) {
  if (!candidate) return false;
  try {
    const details = await stat(candidate);
    if (!details.isFile()) return false;
    if (platform !== 'win32') await access(candidate, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function ngrokExecutableCandidates({
  configuredPath,
  platform = process.platform,
  environment = process.env,
  homeDirectory = os.homedir(),
} = {}) {
  const candidates = [];
  if (configuredPath) candidates.push({ path: configuredPath, source: 'configured' });

  if (platform === 'darwin') {
    candidates.push(
      { path: '/opt/homebrew/bin/ngrok', source: 'homebrew' },
      { path: '/usr/local/bin/ngrok', source: 'homebrew' },
    );
  } else if (platform === 'linux') {
    candidates.push(
      { path: '/usr/local/bin/ngrok', source: 'system' },
      { path: '/usr/bin/ngrok', source: 'system' },
      { path: '/snap/bin/ngrok', source: 'snap' },
      { path: path.join(homeDirectory, '.local', 'bin', 'ngrok'), source: 'user' },
    );
  } else if (platform === 'win32') {
    const localAppData = environment.LOCALAPPDATA;
    const userProfile = environment.USERPROFILE ?? homeDirectory;
    const chocolatey = environment.ChocolateyInstall;
    candidates.push(
      ...(localAppData
        ? [{
            path: path.join(localAppData, 'Microsoft', 'WindowsApps', 'ngrok.exe'),
            source: 'microsoft-store',
          }]
        : []),
      ...(userProfile
        ? [{
            path: path.join(userProfile, 'scoop', 'shims', 'ngrok.exe'),
            source: 'scoop',
          }]
        : []),
      ...(chocolatey
        ? [{ path: path.join(chocolatey, 'bin', 'ngrok.exe'), source: 'chocolatey' }]
        : []),
    );
  }

  const executableNames = platform === 'win32' ? ['ngrok.exe', 'ngrok'] : ['ngrok'];
  for (const directory of String(environment.PATH ?? '').split(path.delimiter).filter(Boolean)) {
    for (const executableName of executableNames) {
      candidates.push({ path: path.join(directory, executableName), source: 'path' });
    }
  }

  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = platform === 'win32' ? candidate.path.toLowerCase() : candidate.path;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function resolveNgrokExecutable(options = {}) {
  const platform = options.platform ?? process.platform;
  for (const candidate of ngrokExecutableCandidates(options)) {
    if (await (options.isExecutable ?? isExecutable)(candidate.path, platform)) {
      return {
        executablePath: await (options.realpath ?? realpath)(candidate.path).catch(() => candidate.path),
        source: candidate.source,
      };
    }
  }
  return null;
}

export function runNgrokCommand(
  executablePath,
  args,
  {
    cwd,
    environment = process.env,
    timeout = COMMAND_TIMEOUT_MS,
    maximumBytes = MAX_OUTPUT_BYTES,
    spawnProcess = spawn,
  } = {},
) {
  return new Promise((resolve, reject) => {
    const child = spawnProcess(executablePath, args, {
      cwd,
      env: environment,
      shell: false,
      detached: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    let bytes = 0;

    let timer;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(result);
    };
    const append = (stream, chunk) => {
      bytes += chunk.length;
      if (bytes > maximumBytes) {
        child.kill();
        finish(new Error('A resposta do ngrok excedeu o limite permitido.'));
        return;
      }
      if (stream === 'stdout') stdout += chunk.toString('utf8');
      else stderr += chunk.toString('utf8');
    };

    child.stdout?.on('data', (chunk) => append('stdout', chunk));
    child.stderr?.on('data', (chunk) => append('stderr', chunk));
    child.once('error', (error) => finish(new Error(
      `Não foi possível executar o ngrok: ${redactSensitive(error.message)}`,
    )));
    child.once('close', (code, signal) => {
      if (code === 0) {
        finish(null, { stdout, stderr });
        return;
      }
      const detail = normalizeNgrokError(stderr.trim() || stdout.trim());
      finish(new Error(
        detail || (signal
          ? `O ngrok foi encerrado por ${signal}.`
          : `O ngrok encerrou com código ${code ?? 'desconhecido'}.`),
      ));
    });
    timer = setTimeout(() => {
      child.kill();
      finish(new Error('A operação do ngrok excedeu o tempo limite.'));
    }, timeout);
    timer.unref?.();
  });
}

function parseVersion(value) {
  return String(value).match(/ngrok\s+(?:version\s+)?v?([^\s]+)/i)?.[1] ?? null;
}

function parseConfigPath(value) {
  const lines = String(value).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines.toReversed()) {
    const match = line.match(/(?:file\s+at|arquivo\s+em|\bat)\s+(.+)$/i);
    if (match?.[1]) return match[1].trim().replace(/^['"]|['"]$/g, '');
  }
  return null;
}

export async function getNgrokStatus({ configuredPath, ...options } = {}) {
  const resolved = await resolveNgrokExecutable({ configuredPath, ...options });
  if (!resolved) {
    return {
      installed: false,
      available: false,
      version: null,
      source: null,
      executablePath: null,
      configValid: false,
      configPath: null,
      message: 'ngrok não foi encontrado. Instale o agente e atualize a detecção.',
    };
  }

  let version = null;
  let configPath = null;
  let configValid = false;
  let message = 'ngrok instalado; configure o authtoken e a API key para continuar.';
  try {
    const result = await runNgrokCommand(
      resolved.executablePath,
      ['version'],
      options,
    );
    version = parseVersion(result.stdout || result.stderr);
  } catch (error) {
    return {
      installed: true,
      available: false,
      version,
      source: resolved.source,
      executablePath: resolved.executablePath,
      configValid: false,
      configPath: null,
      message: error.message,
    };
  }

  try {
    const result = await runNgrokCommand(
      resolved.executablePath,
      ['config', 'check'],
      options,
    );
    configPath = parseConfigPath(`${result.stdout}\n${result.stderr}`);
    configValid = !!configPath;
    message = configValid
      ? 'ngrok e arquivo de configuração disponíveis.'
      : 'ngrok instalado, mas o caminho do arquivo de configuração não pôde ser identificado.';
  } catch (error) {
    message = `ngrok instalado, mas a configuração não é válida: ${error.message}`;
  }

  return {
    installed: true,
    available: configValid,
    version,
    source: resolved.source,
    executablePath: resolved.executablePath,
    configValid,
    configPath,
    message,
  };
}

function parseJsonOutput(value, label) {
  const text = String(value ?? '').trim();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`O ngrok retornou uma resposta inválida ao ${label}.`);
  }
}

function normalizeCertificateStatus(domain) {
  const provisioning = domain.certificate_management_status?.provisioning_job;
  if (provisioning?.error_code || provisioning?.msg) return 'error';
  if (provisioning) return 'provisioning';
  if (domain.certificate || domain.certificate_management_policy) return 'ready';
  return 'none';
}

export function normalizeNgrokDomain(domain) {
  if (!domain || typeof domain.id !== 'string' || typeof domain.domain !== 'string') {
    return null;
  }
  const hostname = domain.domain.trim().toLowerCase();
  if (!hostname) return null;
  return {
    id: domain.id,
    domain: hostname,
    description: typeof domain.description === 'string' ? domain.description : '',
    createdAt: typeof domain.created_at === 'string' ? domain.created_at : null,
    cnameTarget: typeof domain.cname_target === 'string' && domain.cname_target
      ? domain.cname_target
      : null,
    certificateStatus: normalizeCertificateStatus(domain),
    dnsStatus: typeof domain.dns_status === 'string'
      ? domain.dns_status
      : (typeof domain.status === 'string' ? domain.status : null),
    wildcard: hostname.includes('*'),
    compatible: !hostname.includes('*'),
  };
}

function beforeIdFromNextPage(nextPageUri) {
  if (!nextPageUri || typeof nextPageUri !== 'string') return null;
  try {
    return new URL(nextPageUri, 'https://api.ngrok.com').searchParams.get('before_id');
  } catch {
    return null;
  }
}

async function requireNgrok(options) {
  const status = await getNgrokStatus(options);
  if (!status.installed) throw new Error(status.message);
  if (!status.configValid) throw new Error(status.message);
  return status;
}

export async function listNgrokDomains(options = {}) {
  const status = await requireNgrok(options);
  const domains = new Map();
  let beforeId = null;
  for (let page = 0; page < MAX_DOMAIN_PAGES; page += 1) {
    const args = [
      'api', 'reserved-domains', 'list',
      '--limit', String(DOMAIN_PAGE_SIZE),
      ...(beforeId ? ['--before-id', beforeId] : []),
      ...(status.configPath ? ['--config', status.configPath] : []),
    ];
    const result = await runNgrokCommand(status.executablePath, args, options);
    const pageResult = parseJsonOutput(result.stdout, 'listar os domínios');
    for (const rawDomain of pageResult.reserved_domains ?? []) {
      const domain = normalizeNgrokDomain(rawDomain);
      if (domain && !domains.has(domain.id)) domains.set(domain.id, domain);
    }
    beforeId = beforeIdFromNextPage(pageResult.next_page_uri);
    if (!beforeId) break;
  }
  return {
    domains: [...domains.values()].toSorted((left, right) =>
      left.domain.localeCompare(right.domain)),
    message: domains.size
      ? `${domains.size} domínio(s) encontrado(s).`
      : 'Nenhum domínio reservado foi encontrado nesta conta.',
  };
}

export function validateNgrokHostname(value) {
  const hostname = String(value ?? '').trim().toLowerCase();
  if (
    hostname.length < 3 ||
    hostname.length > 253 ||
    hostname.includes('*') ||
    !hostname.includes('.') ||
    !hostname.split('.').every((label) =>
      label.length >= 1 &&
      label.length <= 63 &&
      /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
    )
  ) {
    throw new TypeError('Informe um hostname completo e válido, sem wildcard.');
  }
  return hostname;
}

export function validateNgrokDomainName(value) {
  const name = String(value ?? '').trim().toLowerCase();
  if (
    name.length < 1 ||
    name.length > 63 ||
    !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(name)
  ) {
    throw new TypeError(
      'Informe somente o nome do domínio, usando letras, números ou hífen.',
    );
  }
  return name;
}

export function composeNgrokManagedDomain(name, suffix) {
  const normalizedName = validateNgrokDomainName(name);
  const normalizedSuffix = String(suffix ?? '').trim().toLowerCase();
  if (!NGROK_MANAGED_DOMAIN_SUFFIXES.includes(normalizedSuffix)) {
    throw new TypeError('A opção de domínio selecionada não é suportada pelo ngrok.');
  }
  return `${normalizedName}.${normalizedSuffix}`;
}

export async function createNgrokDomain({ domain, description = '', ...options }) {
  const hostname = validateNgrokHostname(domain);
  const status = await requireNgrok(options);
  const args = [
    'api', 'reserved-domains', 'create',
    '--domain', hostname,
    ...(description ? ['--description', description] : []),
    ...(status.configPath ? ['--config', status.configPath] : []),
  ];
  const result = await runNgrokCommand(status.executablePath, args, options);
  const created = normalizeNgrokDomain(
    parseJsonOutput(result.stdout, 'criar o domínio'),
  );
  if (!created) throw new Error('O ngrok não retornou o domínio criado.');
  return created;
}

export function createNgrokLaunchSpecification({
  executablePath,
  configPath,
  port,
  upstream,
  domainId,
  domain,
}) {
  const target = upstream ?? port;
  if (typeof target === 'number' &&
      (!Number.isInteger(target) || target < 1 || target > 65_535)) {
    throw new TypeError('Porta do processo inválida para o ngrok.');
  }
  if (typeof target !== 'number') {
    let parsed;
    try {
      parsed = new URL(target);
    } catch {
      throw new TypeError('Upstream inválido para o ngrok.');
    }
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      !parsed.hostname ||
      !parsed.port ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== '/' ||
      parsed.search ||
      parsed.hash
    ) {
      throw new TypeError('Upstream inválido para o ngrok.');
    }
  }
  const hostname = validateNgrokHostname(domain);
  return {
    executablePath,
    domainId,
    upstream: String(target),
    args: [
      'http', String(target),
      '--url', `https://${hostname}`,
      ...(configPath ? ['--config', configPath] : []),
      '--log', 'stdout',
      '--log-format', 'json',
      '--log-level', 'info',
    ],
    domain: hostname,
    publicUrl: `https://${hostname}`,
  };
}

export const ngrokInternals = {
  beforeIdFromNextPage,
  isExecutable,
  parseConfigPath,
  parseVersion,
  redactSensitive,
  normalizeNgrokError,
};
