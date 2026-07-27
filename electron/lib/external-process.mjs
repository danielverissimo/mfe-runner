import { execFile } from 'node:child_process';
import net from 'node:net';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const PORT_CLOSE_TIMEOUT_MS = 6000;

function validatePort(port) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new TypeError('Porta local inválida.');
  }
  return port;
}

function validatePid(pid) {
  if (!Number.isInteger(pid) || pid <= 1) {
    throw new TypeError('PID externo inválido.');
  }
  return pid;
}

async function execute(command, args) {
  const { stdout } = await execFileAsync(command, args, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    timeout: 5000,
    windowsHide: true,
  });
  return stdout;
}

function parseLsof(output) {
  const processes = [];
  let current = null;
  for (const line of output.split(/\r?\n/)) {
    if (line.startsWith('p')) {
      const pid = Number(line.slice(1));
      if (Number.isInteger(pid) && pid > 1) {
        current = { pid, name: '', owner: '', command: '' };
        processes.push(current);
      }
    } else if (current && line.startsWith('c')) {
      current.name = line.slice(1).trim();
    } else if (current && line.startsWith('L')) {
      current.owner = line.slice(1).trim();
    }
  }
  return processes;
}

function parsePsDetails(output) {
  const value = output.trim();
  if (!value) return { owner: '', command: '' };
  const separator = value.search(/\s/);
  return separator === -1
    ? { owner: value, command: '' }
    : {
        owner: value.slice(0, separator),
        command: value.slice(separator).trim(),
      };
}

async function inspectPosixPort(port, platform, runCommand) {
  let output;
  try {
    output = await runCommand(
      platform === 'darwin' ? '/usr/sbin/lsof' : 'lsof',
      ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-FpLc'],
    );
  } catch (error) {
    if (error?.code === 1) return null;
    if (error?.code === 'ENOENT') {
      throw new Error(
        'Não foi possível identificar o processo: utilitário lsof indisponível.',
      );
    }
    throw error;
  }

  const candidates = parseLsof(output);
  if (!candidates.length) return null;
  const unique = [...new Map(candidates.map((item) => [item.pid, item])).values()];
  if (unique.length > 1) {
    throw new Error(
      `A porta ${port} possui mais de um processo ouvinte; encerramento recusado.`,
    );
  }

  const candidate = unique[0];
  try {
    const details = parsePsDetails(
      await runCommand('ps', [
        '-p',
        String(candidate.pid),
        '-o',
        'user=',
        '-o',
        'command=',
      ]),
    );
    candidate.owner = details.owner || candidate.owner;
    candidate.command = details.command || candidate.name;
  } catch {
    candidate.command = candidate.name;
  }
  return candidate;
}

async function inspectWindowsPort(port, runCommand) {
  const pidOutput = await runCommand('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    `(Get-NetTCPConnection -State Listen -LocalPort ${port} ` +
      '-ErrorAction SilentlyContinue | Select-Object -ExpandProperty ' +
      'OwningProcess -Unique) -join "`n"',
  ]);
  const pids = pidOutput
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(Number)
    .filter((pid) => Number.isInteger(pid) && pid > 1);
  const uniquePids = [...new Set(pids)];
  if (!uniquePids.length) return null;
  if (uniquePids.length > 1) {
    throw new Error(
      `A porta ${port} possui mais de um processo ouvinte; encerramento recusado.`,
    );
  }

  const pid = uniquePids[0];
  const detailsOutput = await runCommand('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    `$p = Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}"; ` +
      'if ($p) { "$($p.Name)`n$($p.CommandLine)" }',
  ]);
  const [name = '', ...commandParts] = detailsOutput.trim().split(/\r?\n/);
  return {
    pid,
    name: name.trim(),
    owner: '',
    command: commandParts.join(' ').trim() || name.trim(),
  };
}

export async function inspectExternalProcess(
  port,
  {
    platform = process.platform,
    runCommand = execute,
  } = {},
) {
  validatePort(port);
  const result = platform === 'win32'
    ? await inspectWindowsPort(port, runCommand)
    : await inspectPosixPort(port, platform, runCommand);
  if (!result) return null;
  return {
    pid: validatePid(result.pid),
    name: result.name || 'Processo desconhecido',
    owner: result.owner || 'Não identificado',
    command: result.command || result.name || 'Não identificado',
  };
}

async function isPortOpen(port, timeout = 500) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host: '127.0.0.1' });
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

async function waitUntilPortCloses(
  port,
  {
    portIsOpen = isPortOpen,
    timeout = PORT_CLOSE_TIMEOUT_MS,
  } = {},
) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (!await portIsOpen(port)) return true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return !await portIsOpen(port);
}

async function elevateTermination(pid, platform, runCommand) {
  const value = String(validatePid(pid));
  if (platform === 'darwin') {
    const script =
      `/bin/kill -TERM ${value}; /bin/sleep 2; ` +
      `/bin/kill -0 ${value} 2>/dev/null && /bin/kill -KILL ${value} || true`;
    await runCommand('/usr/bin/osascript', [
      '-e',
      `do shell script "${script}" with administrator privileges`,
    ]);
    return;
  }
  if (platform === 'linux') {
    await runCommand('pkexec', [
      '/bin/sh',
      '-c',
      'kill -TERM "$1"; sleep 2; kill -0 "$1" 2>/dev/null && ' +
        'kill -KILL "$1" || true',
      'mfe-runner-kill',
      value,
    ]);
    return;
  }
  if (platform === 'win32') {
    await runCommand('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Start-Process taskkill -Verb RunAs -Wait ` +
        `-ArgumentList '/PID','${value}','/T','/F'`,
    ]);
    return;
  }
  throw new Error(`Elevação não suportada na plataforma ${platform}.`);
}

export async function terminateExternalProcess(
  port,
  expectedPid,
  {
    platform = process.platform,
    inspect = inspectExternalProcess,
    killProcess = process.kill,
    portIsOpen = isPortOpen,
    runCommand = execute,
  } = {},
) {
  validatePort(port);
  validatePid(expectedPid);
  const current = await inspect(port, { platform, runCommand });
  if (!current) {
    return { terminated: false, elevated: false, alreadyClosed: true };
  }
  if (current.pid !== expectedPid) {
    throw new Error(
      `O processo da porta ${port} mudou antes da confirmação; operação cancelada.`,
    );
  }
  if (current.pid === process.pid) {
    throw new Error('O Runner recusou encerrar o próprio processo.');
  }

  let elevated = false;
  try {
    killProcess(current.pid, 'SIGTERM');
    if (await waitUntilPortCloses(port, { portIsOpen, timeout: 2500 })) {
      return { terminated: true, elevated, alreadyClosed: false };
    }
    killProcess(current.pid, 'SIGKILL');
  } catch (error) {
    if (error?.code === 'ESRCH') {
      return { terminated: false, elevated, alreadyClosed: true };
    }
    if (error?.code !== 'EPERM' && error?.code !== 'EACCES') throw error;
    elevated = true;
    try {
      await elevateTermination(current.pid, platform, runCommand);
    } catch (elevationError) {
      throw new Error(
        `Não foi possível obter autorização para encerrar o PID ${current.pid}: ` +
          `${elevationError?.message ?? elevationError}`,
      );
    }
  }

  if (!await waitUntilPortCloses(port, { portIsOpen })) {
    throw new Error(
      `O PID ${current.pid} foi sinalizado, mas a porta ${port} continua ocupada.`,
    );
  }
  return { terminated: true, elevated, alreadyClosed: false };
}

export const __test__ = {
  elevateTermination,
  parseLsof,
  parsePsDetails,
  validatePid,
  validatePort,
  waitUntilPortCloses,
};
