import { spawn } from 'node:child_process';

const GIT_TIMEOUT_MS = 4000;
const MAX_GIT_OUTPUT_BYTES = 1024 * 1024;

function runGit(projectPath, args, {
  spawnImpl = spawn,
  timeout = GIT_TIMEOUT_MS,
} = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl('git', ['-C', projectPath, ...args], {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        GIT_OPTIONAL_LOCKS: '0',
        GIT_TERMINAL_PROMPT: '0',
      },
    });
    let stdout = '';
    let stderr = '';
    let outputBytes = 0;
    let settled = false;
    let timer;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(result);
    };
    const append = (current, chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_GIT_OUTPUT_BYTES) {
        child.kill();
        finish(new Error('A saída do Git excedeu o limite permitido.'));
        return current;
      }
      return current + chunk.toString('utf8');
    };
    child.stdout?.on('data', (chunk) => {
      stdout = append(stdout, chunk);
    });
    child.stderr?.on('data', (chunk) => {
      stderr = append(stderr, chunk);
    });
    child.once('error', (error) => finish(error));
    child.once('close', (code) => finish(null, { code, stdout, stderr }));
    timer = setTimeout(() => {
      child.kill();
      const error = new Error('A consulta ao Git excedeu o tempo limite.');
      error.code = 'GIT_TIMEOUT';
      finish(error);
    }, timeout);
  });
}

function emptyGitContext(overrides = {}) {
  return {
    available: true,
    repository: false,
    branch: null,
    detached: false,
    commit: null,
    dirty: false,
    changedFiles: 0,
    upstream: null,
    ahead: null,
    behind: null,
    compatibleWithShell: null,
    message: 'Diretório não versionado pelo Git.',
    ...overrides,
  };
}

export function parseGitStatus(output) {
  const context = emptyGitContext({ repository: true, message: '' });
  const tokens = output.split(/\0|\r?\n/).filter(Boolean);
  for (const token of tokens) {
    if (token.startsWith('# branch.oid ')) {
      const oid = token.slice('# branch.oid '.length).trim();
      context.commit = oid === '(initial)' ? null : oid.slice(0, 12);
    } else if (token.startsWith('# branch.head ')) {
      const branch = token.slice('# branch.head '.length).trim();
      context.detached = branch === '(detached)';
      context.branch = context.detached ? null : branch;
    } else if (token.startsWith('# branch.upstream ')) {
      context.upstream = token.slice('# branch.upstream '.length).trim();
    } else if (token.startsWith('# branch.ab ')) {
      const match = token.match(/\+(\d+)\s+-(\d+)/);
      if (match) {
        context.ahead = Number(match[1]);
        context.behind = Number(match[2]);
      }
    } else if (/^(?:1|2|u|\?)\s/.test(token)) {
      context.changedFiles += 1;
    }
  }
  context.dirty = context.changedFiles > 0;
  if (context.detached) context.message = 'HEAD destacado.';
  return context;
}

export async function collectGitContext(projectPath, options = {}) {
  try {
    const result = await runGit(
      projectPath,
      [
        'status',
        '--porcelain=v2',
        '--branch',
        '--untracked-files=normal',
        '-z',
        '--',
        '.',
      ],
      options,
    );
    if (result.code !== 0) {
      if (/not a git repository/i.test(result.stderr)) {
        return emptyGitContext();
      }
      return emptyGitContext({
        repository: false,
        message: result.stderr.trim() || 'Não foi possível consultar o Git.',
      });
    }
    return parseGitStatus(result.stdout);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return emptyGitContext({
        available: false,
        message: 'Git não está instalado ou não foi encontrado no PATH.',
      });
    }
    return emptyGitContext({
      message: error.message || 'Não foi possível consultar o Git.',
    });
  }
}

export async function enrichProjectsWithGit(projects, { concurrency = 4 } = {}) {
  const queue = [...projects];
  const contexts = new Map();
  const workers = Array.from(
    { length: Math.min(concurrency, queue.length) },
    async () => {
      while (queue.length) {
        const project = queue.shift();
        contexts.set(
          project.id,
          await collectGitContext(project.absolutePath),
        );
      }
    },
  );
  await Promise.all(workers);

  const shell = projects.find((project) => project.role === 'shell');
  const shellContext = shell ? contexts.get(shell.id) : null;
  const shellBranch = shellContext?.branch ?? null;
  return projects.map((project) => {
    const git = contexts.get(project.id) ?? emptyGitContext();
    if (project.role === 'shell') {
      git.compatibleWithShell = git.repository && !git.detached ? true : null;
    } else if (git.repository && git.detached) {
      git.compatibleWithShell = false;
      git.message = 'HEAD destacado; não é possível comparar com o shell.';
    } else if (git.branch && shellBranch) {
      git.compatibleWithShell = git.branch === shellBranch;
      if (!git.compatibleWithShell) {
        git.message =
          `Branch ${git.branch} difere da branch ${shellBranch} do shell.`;
      }
    }
    return { ...project, git };
  });
}

export const gitContextInternals = { runGit };
