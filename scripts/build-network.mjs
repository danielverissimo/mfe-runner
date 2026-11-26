import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function isTransientNetworkError(error) {
  const detail = [error?.code, error?.name, error?.message, error?.output, error?.cause?.code, error?.cause?.message].join(' ');
  return /\b(EAI_AGAIN|ENOTFOUND|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EPIPE|UND_ERR_CONNECT_TIMEOUT)\b|TimeoutError|AbortError|socket hang up|temporary failure in name resolution|HTTP (429|502|503|504)\b/i.test(detail);
}

export async function retryNetwork(action, {
  attempts = 3,
  sleep = delay,
  log = console.error,
  label = 'Download',
} = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await action();
    } catch (error) {
      if (attempt === attempts || !isTransientNetworkError(error)) throw error;
      log(`${label}: falha temporária de rede. Nova tentativa ${attempt + 1}/${attempts} em ${attempt * 3}s.`);
      await sleep(attempt * 3000);
    }
  }
}

export function runBuildCommand(executable, args, {
  timeoutMs = 0,
  stdout = process.stdout,
  stderr = process.stderr,
  cwd,
  env = process.env,
} = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'], cwd, env });
    let output = '';
    let timedOut = false;
    let forceKill;
    const capture = (destination) => (chunk) => {
      output = (output + chunk.toString()).slice(-32768);
      destination.write(chunk);
    };
    child.stdout.on('data', capture(stdout));
    child.stderr.on('data', capture(stderr));
    const timeout = timeoutMs > 0 ? setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      forceKill = setTimeout(() => child.kill('SIGKILL'), 1000);
    }, timeoutMs) : undefined;
    const cleanUp = () => { clearTimeout(timeout); clearTimeout(forceKill); };
    child.once('error', (error) => { cleanUp(); reject(error); });
    child.once('close', (code, signal) => {
      cleanUp();
      if (timedOut) return reject(new Error(`${path.basename(executable)} não respondeu em ${timeoutMs / 1000}s.`));
      if (code === 0) return resolve();
      reject(Object.assign(new Error(`${path.basename(executable)} falhou (código ${code ?? signal}).`), { output, exitCode: code }));
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    let timeoutMs = 0;
    let attempts = 1;
    while (args[0] !== '--' && args.length) {
      const flag = args.shift();
      const value = Number(args.shift());
      if (!Number.isSafeInteger(value) || value < 1) throw new Error('Limite de execução inválido.');
      if (flag === '--timeout-ms') timeoutMs = value;
      else if (flag === '--attempts') attempts = value;
      else throw new Error('Opção de execução inválida.');
    }
    if (args.shift() !== '--' || !args.length) throw new Error('Informe o comando após --.');
    const executable = args.shift();
    await retryNetwork(() => runBuildCommand(executable, args, { timeoutMs }), { attempts, label: path.basename(executable) });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
