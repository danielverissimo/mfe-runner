import { constants as fsConstants } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const IDE_DEFINITIONS = [
  {
    id: 'vscode',
    name: 'Visual Studio Code',
    commands: ['code', 'code.exe', 'Code.exe'],
    darwinPaths: [
      '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code',
      path.join(
        os.homedir(),
        'Applications/Visual Studio Code.app/Contents/Resources/app/bin/code',
      ),
    ],
    windowsPaths: [
      process.env.LOCALAPPDATA &&
        path.join(
          process.env.LOCALAPPDATA,
          'Programs',
          'Microsoft VS Code',
          'Code.exe',
        ),
      process.env.PROGRAMFILES &&
        path.join(process.env.PROGRAMFILES, 'Microsoft VS Code', 'Code.exe'),
    ].filter(Boolean),
  },
  {
    id: 'cursor',
    name: 'Cursor',
    commands: ['cursor', 'cursor.exe', 'Cursor.exe'],
    darwinPaths: [
      '/Applications/Cursor.app/Contents/Resources/app/bin/cursor',
      path.join(
        os.homedir(),
        'Applications/Cursor.app/Contents/Resources/app/bin/cursor',
      ),
    ],
    windowsPaths: [
      process.env.LOCALAPPDATA &&
        path.join(
          process.env.LOCALAPPDATA,
          'Programs',
          'cursor',
          'Cursor.exe',
        ),
    ].filter(Boolean),
  },
  {
    id: 'webstorm',
    name: 'WebStorm',
    commands: ['webstorm', 'webstorm.exe', 'webstorm64.exe'],
    darwinPaths: [
      '/Applications/WebStorm.app/Contents/MacOS/webstorm',
      path.join(
        os.homedir(),
        'Applications/WebStorm.app/Contents/MacOS/webstorm',
      ),
    ],
    windowsPaths: [],
  },
];

export async function isDeveloperExecutable(candidate) {
  if (!candidate) return false;
  try {
    const details = await stat(candidate);
    if (!details.isFile()) return false;
    if (process.platform === 'win32') return true;
    await access(candidate, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function findOnPath(commands, environmentPath = process.env.PATH ?? '') {
  const directories = environmentPath.split(path.delimiter).filter(Boolean);
  for (const directory of directories) {
    for (const command of commands) {
      const candidate = path.join(directory, command);
      if (await isDeveloperExecutable(candidate)) return candidate;
    }
  }
  return null;
}

async function resolveDefinition(definition, platform = process.platform) {
  const candidates = platform === 'darwin'
    ? definition.darwinPaths
    : platform === 'win32'
      ? definition.windowsPaths
      : [];
  for (const candidate of candidates) {
    if (await isDeveloperExecutable(candidate)) return candidate;
  }
  return findOnPath(definition.commands);
}

async function terminalForPlatform(platform = process.platform) {
  if (platform === 'darwin') {
    return {
      id: 'terminal-app',
      name: 'Terminal',
      executablePath: '/usr/bin/open',
      argsFor: (projectPath) => ['-a', 'Terminal', projectPath],
    };
  }
  if (platform === 'win32') {
    const windowsTerminal = await findOnPath(['wt.exe']);
    if (windowsTerminal) {
      return {
        id: 'windows-terminal',
        name: 'Windows Terminal',
        executablePath: windowsTerminal,
        argsFor: (projectPath) => ['-d', projectPath],
      };
    }
    const powershell = await findOnPath(['powershell.exe']);
    if (powershell) {
      return {
        id: 'powershell',
        name: 'PowerShell',
        executablePath: powershell,
        argsFor: () => [
          '-NoExit',
          '-NoProfile',
          '-Command',
          'Set-Location -LiteralPath $env:MFE_RUNNER_PROJECT_PATH',
        ],
        environmentFor: (projectPath) => ({
          ...process.env,
          MFE_RUNNER_PROJECT_PATH: projectPath,
        }),
      };
    }
    return null;
  }

  const definitions = [
    {
      commands: ['x-terminal-emulator'],
      name: 'Terminal',
      argsFor: (projectPath) => ['--working-directory', projectPath],
    },
    {
      commands: ['gnome-terminal'],
      name: 'GNOME Terminal',
      argsFor: (projectPath) => [`--working-directory=${projectPath}`],
    },
    {
      commands: ['konsole'],
      name: 'Konsole',
      argsFor: (projectPath) => ['--workdir', projectPath],
    },
    {
      commands: ['xfce4-terminal'],
      name: 'Xfce Terminal',
      argsFor: (projectPath) => ['--working-directory', projectPath],
    },
  ];
  for (const definition of definitions) {
    const executablePath = await findOnPath(definition.commands);
    if (executablePath) {
      return {
        id: definition.commands[0],
        name: definition.name,
        executablePath,
        argsFor: definition.argsFor,
      };
    }
  }
  return null;
}

export async function listDeveloperTools(settings = {}) {
  const ideApplications = [];
  for (const definition of IDE_DEFINITIONS) {
    const executablePath = await resolveDefinition(definition);
    if (executablePath) {
      ideApplications.push({
        id: definition.id,
        name: definition.name,
        executablePath,
        custom: false,
      });
    }
  }

  const configured = settings.ide;
  if (
    configured?.executablePath &&
    await isDeveloperExecutable(configured.executablePath)
  ) {
    const configuredApplication = {
      id: configured.id,
      name: configured.name || path.basename(configured.executablePath),
      executablePath: configured.executablePath,
      custom: configured.id === 'custom',
    };
    const existingIndex = ideApplications.findIndex(
      (item) => item.id === configured.id,
    );
    if (existingIndex >= 0) ideApplications[existingIndex] = configuredApplication;
    else ideApplications.push(configuredApplication);
  }
  const terminal = await terminalForPlatform();
  return {
    ideApplications,
    selectedIdeId:
      ideApplications.some((item) => item.id === configured?.id)
        ? configured.id
        : ideApplications[0]?.id ?? null,
    terminal: terminal
      ? { id: terminal.id, name: terminal.name, available: true }
      : { id: null, name: 'Terminal não encontrado', available: false },
  };
}

function launchDetached(executablePath, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executablePath, args, {
      shell: false,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      ...options,
    });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

export async function openPathInIde(
  targetPath,
  settings = {},
  dependencies = {},
) {
  const catalog = await (dependencies.listTools ?? listDeveloperTools)(settings);
  const ide = catalog.ideApplications.find(
    (item) => item.id === catalog.selectedIdeId,
  );
  if (!ide) {
    throw new Error(
      'Nenhuma IDE configurada está disponível. Escolha uma em Configurações.',
    );
  }
  await (dependencies.launch ?? launchDetached)(ide.executablePath, [targetPath]);
}

export async function openProjectInIde(projectPath, settings = {}) {
  await openPathInIde(projectPath, settings);
}

export async function openProjectTerminal(projectPath) {
  const terminal = await terminalForPlatform();
  if (!terminal) {
    throw new Error('Nenhum terminal compatível foi encontrado.');
  }
  await launchDetached(
    terminal.executablePath,
    terminal.argsFor(projectPath),
    terminal.environmentFor
      ? { env: terminal.environmentFor(projectPath) }
      : {},
  );
}

export const developerToolsInternals = {
  findOnPath,
  isExecutable: isDeveloperExecutable,
  terminalForPlatform,
};
