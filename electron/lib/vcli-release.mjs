import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';

export const VCLI_RELEASE_COMMAND = 'node:script:release:publish';
export const VCLI_RELEASE_TARGETS = Object.freeze([
  'all', 'macos-arm64', 'macos-x64', 'windows-arm64', 'windows-x64',
  'linux-arm64', 'linux-x64',
]);

export async function supportsVcliRelease(projectPath, manifest) {
  if (manifest.name !== 'vcli' ||
      manifest.scripts?.['release:publish'] !== 'node scripts/release-orchestrator.mjs') return false;
  try {
    return (await Promise.all([
      'scripts/release-orchestrator.mjs', 'distribution.config.json', 'src-tauri/tauri.conf.json',
    ].map(async (file) => (await stat(path.join(projectPath, file))).isFile()))).every(Boolean);
  } catch {
    return false;
  }
}

// This contract deliberately has no executable, raw arguments, or credential fields.
export function validateVcliRelease(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Opções de release inválidas.');
  }
  const allowed = new Set([
    'version', 'target', 'mode', 'dryRun', 'includeUntracked', 'ghUser', 'publicKeyFile', 'notesFile',
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key)) ||
      typeof value.version !== 'string' ||
      !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value.version) ||
      value.version.length > 40 ||
      !VCLI_RELEASE_TARGETS.includes(value.target) ||
      !['local', 'actions'].includes(value.mode) ||
      typeof value.dryRun !== 'boolean' ||
      typeof value.includeUntracked !== 'boolean') {
    throw new TypeError('Informe versão X.Y.Z, destino e operação de release válidos.');
  }
  const result = {
    version: value.version, target: value.target, mode: value.mode,
    dryRun: value.dryRun, includeUntracked: value.includeUntracked,
  };
  if (value.ghUser !== undefined && value.ghUser !== '') {
    if (typeof value.ghUser !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(value.ghUser)) {
      throw new TypeError('Conta GitHub CLI inválida.');
    }
    result.ghUser = value.ghUser;
  }
  for (const key of ['publicKeyFile', 'notesFile']) {
    if (value[key] === undefined || value[key] === '') continue;
    if (typeof value[key] !== 'string' || value[key].length > 4096 ||
        /[\x00-\x1f]/.test(value[key]) || !path.isAbsolute(value[key])) {
      throw new TypeError('Use um caminho absoluto para o arquivo de release.');
    }
    result[key] = value[key];
  }
  return result;
}

export function vcliReleaseArgs(value, platform = process.platform) {
  const options = validateVcliRelease(value);
  if (platform !== 'darwin' &&
      (options.mode === 'local' || options.target === 'all' || options.target.startsWith('macos-'))) {
    throw new Error('O build local e a publicação de pacotes macOS exigem um Mac.');
  }
  return [
    '--version', options.version,
    ...(options.target === 'all' ? ['--all'] : ['--target', options.target]),
    ...(options.mode === 'local' ? ['--local'] : []),
    ...(options.dryRun ? ['--dry-run'] : []),
    ...(options.includeUntracked ? ['--include-untracked'] : []),
    ...(options.ghUser ? ['--gh-user', options.ghUser] : []),
    ...(options.publicKeyFile ? ['--public-key-file', options.publicKeyFile] : []),
    ...(options.notesFile ? ['--notes', options.notesFile] : []),
  ];
}

export async function applyRequestedVcliRelease(project, request) {
  const selected = request.commandId ?? request.script ?? project.defaultCommandId ?? project.defaultScript;
  const profile = project.commands?.find((command) => command.id === selected || command.task === selected);
  if (!request.release && !profile?.releaseKind) return project;
  if (project.ecosystem !== 'node' || profile?.releaseKind !== 'vcli' ||
      profile.id !== VCLI_RELEASE_COMMAND) {
    throw new Error('Release VCLI não disponível para este comando.');
  }
  // Re-read the project-owned entry point before accepting a launch intent.
  const file = path.join(project.absolutePath, 'package.json');
  if ((await stat(file)).size > 2 * 1024 * 1024 ||
      !await supportsVcliRelease(project.absolutePath, JSON.parse(await readFile(file, 'utf8')))) {
    throw new Error('O fluxo de release mudou. Redescubra o projeto.');
  }
  const release = validateVcliRelease(request.release);
  vcliReleaseArgs(release);
  return { ...project, release };
}

// Finder-launched apps need the conventional local tool directories as fallbacks.
// Keep the resolved Node and inherited PATH ahead of them.
export function vcliReleaseEnvironment(environment, platform = process.platform, home = homedir()) {
  if (platform !== 'darwin') return environment;
  return {
    ...environment,
    PATH: [...new Set([
      ...(environment.PATH || '').split(path.delimiter).filter(Boolean),
      path.join(home, '.cargo/bin'), path.join(home, '.docker/bin'),
      '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin',
      '/Applications/Docker.app/Contents/Resources/bin',
    ])].join(path.delimiter),
  };
}
