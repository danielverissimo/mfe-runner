import { spawn } from 'node:child_process';
import process from 'node:process';

const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const electronExecutable = process.platform === 'win32'
  ? 'node_modules/.bin/electron.cmd'
  : 'node_modules/.bin/electron';

const angular = spawn(
  npmExecutable,
  ['run', 'ng', '--', 'serve', '--port', '4200'],
  { stdio: 'inherit', shell: false },
);

let electron = null;
let stopping = false;

async function waitForAngular() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch('http://127.0.0.1:4200');
      if (response.ok) return;
    } catch {
      // The dev server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Timeout aguardando o Angular em http://localhost:4200.');
}

async function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  electron?.kill('SIGTERM');
  angular.kill('SIGTERM');
  process.exitCode = exitCode;
}

angular.once('exit', (code) => {
  if (!stopping) void stop(code ?? 1);
});

try {
  await waitForAngular();
  electron = spawn(electronExecutable, ['.'], {
    stdio: 'inherit',
    shell: false,
    env: {
      ...process.env,
      MFE_RUNNER_DEV_URL: 'http://localhost:4200',
    },
  });
  electron.once('exit', (code) => void stop(code ?? 0));
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  await stop(1);
}

process.once('SIGINT', () => void stop(0));
process.once('SIGTERM', () => void stop(0));
