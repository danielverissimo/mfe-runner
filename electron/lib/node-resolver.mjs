import { constants } from 'node:fs';
import { access, readFile, readdir, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

async function isExecutable(candidate) {
  try {
    await access(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function normalizeVersion(version) {
  return version?.trim().replace(/^v/, '') ?? '';
}

function compareVersionsDescending(left, right) {
  const a = normalizeVersion(left).split('.').map(Number);
  const b = normalizeVersion(right).split('.').map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (b[index] ?? 0) - (a[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

function pathIsInside(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function directoryExists(candidate) {
  try {
    await readdir(candidate);
    return true;
  } catch {
    return false;
  }
}

function nvmLocations(environment, platform, homeDirectory) {
  if (platform === 'win32') {
    return [
      environment.NVM_HOME,
      environment.APPDATA && path.join(environment.APPDATA, 'nvm'),
      path.join(homeDirectory, 'AppData', 'Roaming', 'nvm'),
    ].filter(Boolean);
  }
  return [
    environment.NVM_DIR || path.join(homeDirectory, '.nvm'),
  ];
}

/**
 * Lists installed runtimes from the NVM filesystem layout. It intentionally
 * does not source nvm.sh or execute a user-controlled shell.
 */
export async function listInstalledNodeVersions({
  environment = process.env,
  platform = process.platform,
  homeDirectory = os.homedir(),
} = {}) {
  const manager = platform === 'win32' ? 'nvm-windows' : 'nvm-sh';
  const locations = nvmLocations(environment, platform, homeDirectory);

  for (const nvmDirectory of locations) {
    const versionsDirectory = platform === 'win32'
      ? nvmDirectory
      : path.join(nvmDirectory, 'versions', 'node');
    if (!await directoryExists(nvmDirectory)) continue;

    let entries = [];
    try {
      entries = await readdir(versionsDirectory, { withFileTypes: true });
    } catch {
      return {
        detected: true,
        manager,
        versions: [],
        message: 'NVM detectado, mas nenhuma versão instalada foi encontrada.',
      };
    }

    const versions = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const version = normalizeVersion(entry.name);
      if (!/^\d+\.\d+\.\d+(?:[-+].+)?$/.test(version)) continue;
      const binDirectory = platform === 'win32'
        ? path.join(versionsDirectory, entry.name)
        : path.join(versionsDirectory, entry.name, 'bin');
      const nodeExecutable = path.join(
        binDirectory,
        platform === 'win32' ? 'node.exe' : 'node',
      );
      const npmExecutable = path.join(
        binDirectory,
        platform === 'win32' ? 'npm.cmd' : 'npm',
      );
      if (
        await isExecutable(nodeExecutable) &&
        await isExecutable(npmExecutable)
      ) {
        versions.push(version);
      }
    }

    versions.sort(compareVersionsDescending);
    return {
      detected: true,
      manager,
      versions,
      message: versions.length
        ? `${versions.length} versão(ões) instalada(s) encontrada(s).`
        : 'NVM detectado, mas nenhuma versão instalada foi encontrada.',
    };
  }

  return {
    detected: false,
    manager: null,
    versions: [],
    message: 'NVM não foi detectado. A versão ainda pode ser informada manualmente.',
  };
}

export async function findNearestNvmrc(projectPath, workspaceRoot) {
  const canonicalRoot = await realpath(workspaceRoot);
  let current = await realpath(projectPath);

  if (!pathIsInside(current, canonicalRoot)) {
    throw new Error('O projeto está fora dos paths da workspace.');
  }

  while (pathIsInside(current, canonicalRoot)) {
    const candidate = path.join(current, '.nvmrc');
    try {
      const version = (await readFile(candidate, 'utf8')).trim();
      if (version) {
        return { path: candidate, version };
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    if (current === canonicalRoot) break;
    current = path.dirname(current);
  }
  return null;
}

export function selectPolicy({
  projectPolicy,
  workspacePolicy,
  globalPolicy,
}) {
  return [projectPolicy, workspacePolicy, globalPolicy].find(
    (policy) => policy && policy.mode !== 'inherit',
  ) ?? { mode: 'auto' };
}

async function findOnPath(executable, environment = process.env) {
  const names = process.platform === 'win32'
    ? path.extname(executable)
      ? [executable]
      : [`${executable}.exe`, `${executable}.cmd`, executable]
    : [executable];
  for (const directory of (environment.PATH ?? '').split(path.delimiter)) {
    if (!directory) continue;
    for (const name of names) {
      const candidate = path.join(directory, name);
      if (await isExecutable(candidate)) return candidate;
    }
  }
  return null;
}

async function findNvmVersion(
  version,
  environment = process.env,
  platform = process.platform,
  homeDirectory = os.homedir(),
) {
  const normalized = normalizeVersion(version);

  if (platform === 'win32') {
    for (const nvmHome of nvmLocations(environment, platform, homeDirectory)) {
      const candidate = path.join(nvmHome, `v${normalized}`, 'node.exe');
      const npmExecutable = path.join(path.dirname(candidate), 'npm.cmd');
      if (
        await isExecutable(candidate) &&
        await isExecutable(npmExecutable)
      ) {
        return {
          nodeExecutable: candidate,
          npmExecutable,
          binDirectory: path.dirname(candidate),
        };
      }
    }
    return null;
  }

  const nvmDirectory = environment.NVM_DIR || path.join(homeDirectory, '.nvm');
  const versionsDirectory = path.join(nvmDirectory, 'versions', 'node');
  let installed = [];
  try {
    installed = await readdir(versionsDirectory);
  } catch {
    return null;
  }

  const candidates = installed
    .filter((entry) => entry.startsWith('v'))
    .map((entry) => entry.slice(1))
    .filter((entry) => entry === normalized || entry.startsWith(`${normalized}.`))
    .sort(compareVersionsDescending);

  for (const candidateVersion of candidates) {
    const binDirectory = path.join(
      versionsDirectory,
      `v${candidateVersion}`,
      'bin',
    );
    const nodeExecutable = path.join(binDirectory, 'node');
    const npmExecutable = path.join(binDirectory, 'npm');
    if (
      await isExecutable(nodeExecutable) &&
      await isExecutable(npmExecutable)
    ) {
      return { nodeExecutable, npmExecutable, binDirectory };
    }
  }
  return null;
}

export async function resolveNodeRuntime({
  projectPath,
  workspaceRoot,
  projectPolicy,
  workspacePolicy,
  globalPolicy,
  environment = process.env,
  platform = process.platform,
  homeDirectory = os.homedir(),
}) {
  const policy = selectPolicy({ projectPolicy, workspacePolicy, globalPolicy });
  const nvmrc = await findNearestNvmrc(projectPath, workspaceRoot);
  const requestedVersion = policy.mode === 'explicit'
    ? policy.version
    : nvmrc?.version;

  if (requestedVersion) {
    const runtime = await findNvmVersion(
      requestedVersion,
      environment,
      platform,
      homeDirectory,
    );
    if (!runtime) {
      return {
        available: false,
        version: normalizeVersion(requestedVersion),
        source: policy.mode === 'explicit' ? 'explicit' : 'nvmrc',
        sourcePath: policy.mode === 'auto' ? nvmrc?.path : undefined,
        reason: `Node ${requestedVersion} não está instalado no NVM detectado.`,
      };
    }
    return {
      available: true,
      version: normalizeVersion(requestedVersion),
      source: policy.mode === 'explicit' ? 'explicit' : 'nvmrc',
      sourcePath: policy.mode === 'auto' ? nvmrc?.path : undefined,
      ...runtime,
    };
  }

  const nodeExecutable = await findOnPath('node', environment);
  const npmExecutable = await findOnPath(
    'npm',
    environment,
  );
  if (!nodeExecutable || !npmExecutable) {
    return {
      available: false,
      version: null,
      source: 'path',
      reason: 'Node/npm não foram encontrados no PATH.',
    };
  }
  return {
    available: true,
    version: null,
    source: 'path',
    nodeExecutable,
    npmExecutable,
    binDirectory: path.dirname(nodeExecutable),
  };
}

export const __test__ = {
  compareVersionsDescending,
  normalizeVersion,
  pathIsInside,
};
