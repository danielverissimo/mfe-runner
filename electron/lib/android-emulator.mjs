import { execFile, spawn } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import { access, realpath, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ANDROID_EMULATOR_TIMEOUT_MS = 10000;

function platformPath(platform) {
  return platform === 'win32' ? path.win32 : path.posix;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function androidEmulatorCandidates({
  platform = process.platform,
  environment = process.env,
  homeDirectory = os.homedir(),
} = {}) {
  const pathApi = platformPath(platform);
  const executableName = platform === 'win32' ? 'emulator.exe' : 'emulator';
  const sdkRoots = [
    environment.ANDROID_HOME,
    environment.ANDROID_SDK_ROOT,
    platform === 'darwin'
      ? pathApi.join(homeDirectory, 'Library', 'Android', 'sdk')
      : platform === 'linux'
        ? pathApi.join(homeDirectory, 'Android', 'Sdk')
        : environment.LOCALAPPDATA
          ? pathApi.join(environment.LOCALAPPDATA, 'Android', 'Sdk')
          : null,
  ];
  const pathDelimiter = platform === 'win32' ? ';' : ':';
  const pathCandidates = String(environment.PATH ?? '')
    .split(pathDelimiter)
    .filter(Boolean)
    .map((directory) => pathApi.join(directory, executableName));
  return unique([
    ...sdkRoots.filter(Boolean).map((root) =>
      pathApi.join(root, 'emulator', executableName)
    ),
    ...pathCandidates,
  ]);
}

async function isExecutable(candidate, platform = process.platform) {
  try {
    if (!(await stat(candidate)).isFile()) return false;
    await access(
      candidate,
      platform === 'win32' ? fsConstants.F_OK : fsConstants.X_OK,
    );
    return true;
  } catch {
    return false;
  }
}

export async function resolveAndroidEmulator(options = {}) {
  const platform = options.platform ?? process.platform;
  const executableCheck = options.isExecutable ?? isExecutable;
  const canonicalize = options.canonicalize ?? realpath;
  for (const candidate of androidEmulatorCandidates(options)) {
    if (await executableCheck(candidate, platform)) {
      try {
        return await canonicalize(candidate);
      } catch {
        return candidate;
      }
    }
  }
  return null;
}

export function normalizeAndroidEmulators(output) {
  return unique(
    String(output ?? '')
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean),
  ).map((id) => ({ id, name: id }));
}

async function listFromExecutable(executable, executeFile = execFileAsync) {
  const result = await executeFile(executable, ['-list-avds'], {
    timeout: ANDROID_EMULATOR_TIMEOUT_MS,
    windowsHide: true,
    maxBuffer: 256 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  return normalizeAndroidEmulators(result.stdout);
}

export async function listAndroidEmulators(options = {}) {
  const executable = await (options.resolveExecutable ?? resolveAndroidEmulator)(
    options,
  );
  if (!executable) {
    return {
      emulators: [],
      message: 'Android Emulator não encontrado. Verifique o Android SDK.',
    };
  }
  try {
    const emulators = await listFromExecutable(executable, options.executeFile);
    return {
      emulators,
      ...(emulators.length
        ? {}
        : { message: 'Nenhum Android Virtual Device configurado foi encontrado.' }),
    };
  } catch (error) {
    return {
      emulators: [],
      message: error?.stderr?.trim() ||
        'Não foi possível consultar os Android Virtual Devices.',
    };
  }
}

function spawnDetached(executable, args, spawnProcess = spawn) {
  return new Promise((resolve, reject) => {
    const child = spawnProcess(executable, args, {
      shell: false,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

export async function launchAndroidEmulator({ emulatorId, ...options }) {
  const executable = await (options.resolveExecutable ?? resolveAndroidEmulator)(
    options,
  );
  if (!executable) {
    throw new Error('Android Emulator não encontrado. Verifique o Android SDK.');
  }
  const emulators = await listFromExecutable(executable, options.executeFile);
  if (!emulators.some((emulator) => emulator.id === emulatorId)) {
    throw new Error(`O Android Virtual Device "${emulatorId}" não está disponível.`);
  }
  await spawnDetached(
    executable,
    ['-avd', emulatorId],
    options.spawnProcess,
  );
  return { started: true, emulatorId };
}

export const __test__ = {
  listFromExecutable,
  spawnDetached,
};
