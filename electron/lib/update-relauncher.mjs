import { spawn } from 'node:child_process';
import path from 'node:path';

export function resolveMacAppBundle(executablePath) {
  let currentPath = path.resolve(executablePath);

  while (currentPath !== path.dirname(currentPath)) {
    if (currentPath.toLowerCase().endsWith('.app')) return currentPath;
    currentPath = path.dirname(currentPath);
  }

  throw new Error(
    `Não foi possível localizar o pacote .app a partir de ${executablePath}.`,
  );
}

export function scheduleMacUpdateRelaunch({
  platform = process.platform,
  executablePath = process.execPath,
  helperPath,
  expectedVersion,
  parentPid = process.pid,
  spawnProcess = spawn,
}) {
  if (platform !== 'darwin') return false;
  if (!helperPath || !expectedVersion) {
    throw new Error('Relançamento da atualização do macOS incompleto.');
  }

  const appBundlePath = resolveMacAppBundle(executablePath);
  const child = spawnProcess(
    executablePath,
    [
      helperPath,
      String(parentPid),
      appBundlePath,
      expectedVersion,
    ],
    {
      detached: true,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
      },
      shell: false,
      stdio: 'ignore',
    },
  );
  child.unref();
  return true;
}
