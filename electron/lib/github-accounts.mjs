import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ACCOUNT_QUERY = '.hosts["github.com"] // [] | map({login, active, state})';

export function githubCliCandidates({
  platform = process.platform,
  environment = process.env,
  homeDirectory = os.homedir(),
} = {}) {
  const pathApi = platform === 'win32' ? path.win32 : path.posix;
  const executable = platform === 'win32' ? 'gh.exe' : 'gh';
  const directories = String(environment.PATH ?? '')
    .split(platform === 'win32' ? ';' : ':')
    .filter((directory) => pathApi.isAbsolute(directory));
  if (platform === 'darwin') directories.push('/opt/homebrew/bin', '/usr/local/bin', '/usr/bin');
  if (platform === 'linux') directories.push('/usr/local/bin', '/usr/bin', pathApi.join(homeDirectory, '.local', 'bin'));
  if (platform === 'win32') {
    if (environment.ProgramFiles) directories.push(pathApi.join(environment.ProgramFiles, 'GitHub CLI'));
    if (environment.LOCALAPPDATA) directories.push(pathApi.join(environment.LOCALAPPDATA, 'Programs', 'GitHub CLI'));
    directories.push(pathApi.join(environment.USERPROFILE ?? homeDirectory, 'scoop', 'shims'));
  }
  return [...new Set(directories.map((directory) => pathApi.join(directory, executable)))];
}

export async function resolveGitHubCli(options = {}) {
  for (const candidate of githubCliCandidates(options)) {
    try {
      if (!(await stat(candidate)).isFile()) continue;
      await access(candidate, (options.platform ?? process.platform) === 'win32' ? constants.F_OK : constants.X_OK);
      return candidate;
    } catch {
      // Continue through installed executable candidates without exposing paths.
    }
  }
  return null;
}

export function normalizeGitHubAccounts(output) {
  const parsed = JSON.parse(output);
  if (!Array.isArray(parsed)) throw new TypeError('Invalid account catalog.');
  const accounts = new Map();
  for (const item of parsed) {
    if (typeof item?.login !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(item.login)) continue;
    const key = item.login.toLowerCase();
    const state = ['success', 'error'].includes(item.state) ? item.state : 'unknown';
    const existing = accounts.get(key);
    accounts.set(key, {
      login: existing?.login ?? item.login,
      active: existing?.active === true || item.active === true,
      state: existing?.state === 'success' ? 'success' : state,
    });
  }
  return [...accounts.values()].sort((left, right) => left.login.localeCompare(right.login));
}

export async function listGitHubAccounts(options = {}) {
  try {
    const executable = await (options.resolveExecutable ?? resolveGitHubCli)(options);
    if (!executable) {
      return {
        available: false, accounts: [],
        message: 'GitHub CLI não encontrado. Instale o gh e autentique suas contas.',
      };
    }
    // Never request tokens or change the active account. Project only the
    // public account fields inside gh before receiving its command output.
    const { stdout } = await (options.execFile ?? execFileAsync)(executable, [
      'auth', 'status', '--hostname', 'github.com', '--json', 'hosts', '--jq', ACCOUNT_QUERY,
    ], {
      timeout: 15_000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
      shell: false,
      env: {
        ...(options.environment ?? process.env),
        GH_PROMPT_DISABLED: '1',
        GH_NO_UPDATE_NOTIFIER: '1',
      },
    });
    const accounts = normalizeGitHubAccounts(stdout);
    return {
      available: true, accounts,
      message: accounts.length ? null : 'Nenhuma conta encontrada. Autentique suas contas com gh auth login e atualize a lista.',
    };
  } catch {
    // CLI output and errors can contain credential metadata. Never return them.
    return {
      available: false, accounts: [],
      message: 'Não foi possível listar as contas do GitHub CLI. Verifique o gh e tente novamente.',
    };
  }
}
