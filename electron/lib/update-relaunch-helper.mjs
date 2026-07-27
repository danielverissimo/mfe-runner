import { execFile, spawn } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const [, , parentPidValue, appBundlePathValue, expectedVersionValue] =
  process.argv;
const parentPid = Number.parseInt(parentPidValue ?? '', 10);
const appBundlePath = path.resolve(appBundlePathValue ?? '');
const expectedVersion = expectedVersionValue?.trim();

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

async function readInstalledVersion() {
  const infoPlistPath = path.join(appBundlePath, 'Contents', 'Info.plist');
  try {
    const { stdout } = await execFileAsync(
      '/usr/bin/plutil',
      [
        '-extract',
        'CFBundleShortVersionString',
        'raw',
        '-o',
        '-',
        infoPlistPath,
      ],
      {
        encoding: 'utf8',
        timeout: 5_000,
        windowsHide: true,
      },
    );
    return stdout.trim();
  } catch {
    return null;
  }
}

async function waitForParentExit(timeoutMilliseconds = 60_000) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    if (!isProcessRunning(parentPid)) return true;
    await wait(250);
  }
  return false;
}

async function waitForInstalledVersion(timeoutMilliseconds = 30_000) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    if (await readInstalledVersion() === expectedVersion) return true;
    await wait(500);
  }
  return false;
}

async function main() {
  if (
    process.platform !== 'darwin' ||
    !Number.isInteger(parentPid) ||
    parentPid <= 0 ||
    !appBundlePath.toLowerCase().endsWith('.app') ||
    !expectedVersion
  ) {
    return;
  }

  if (!(await waitForParentExit())) return;
  await waitForInstalledVersion();

  const child = spawn('/usr/bin/open', [appBundlePath], {
    detached: true,
    shell: false,
    stdio: 'ignore',
  });
  child.unref();
}

void main();
