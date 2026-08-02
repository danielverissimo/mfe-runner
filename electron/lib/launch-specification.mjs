import path from 'node:path';

function windowsNodeInvocation(node, args) {
  if (process.platform === 'win32' &&
      path.extname(node.npmExecutable).toLowerCase() === '.cmd') {
    return {
      executable: node.nodeExecutable,
      args: [
        path.join(
          path.dirname(node.npmExecutable),
          'node_modules',
          'npm',
          'bin',
          'npm-cli.js',
        ),
        ...args,
      ],
    };
  }
  return { executable: node.npmExecutable, args };
}

function controlledWindowsWrapper(executable, args) {
  if (
    process.platform !== 'win32' ||
    !['.cmd', '.bat'].includes(path.extname(executable).toLowerCase())
  ) {
    return { executable, args };
  }
  return {
    executable: process.env.ComSpec ?? 'C:\\Windows\\System32\\cmd.exe',
    args: ['/d', '/s', '/c', executable, ...args],
  };
}

function commandById(project, commandId) {
  const configured = project.commands?.find(
    (command) => command.id === commandId,
  );
  if (configured) return configured;
  const legacyTask =
    commandId && project.scripts?.[commandId]
      ? commandId
      : project.defaultScript;
  if (!legacyTask || !project.scripts?.[legacyTask]) return null;
  return {
    id: `node:${legacyTask}`,
    label: `npm run ${legacyTask}`,
    category: 'run',
    longRunning: true,
    task: legacyTask,
    args: [],
  };
}

export function createLaunchSpecification({
  workspace,
  project,
  commandId,
}) {
  const selectedId = commandId || project.defaultCommandId;
  const profile = commandById(project, selectedId);
  if (!profile) {
    throw new Error(`Comando não disponível para ${project.name}.`);
  }
  const ecosystem = project.ecosystem ?? 'node';
  const runtimeAvailable =
    project.runtime?.available ?? project.node?.available;
  const compatibility = project.runtime?.compatibility;
  if (
    !runtimeAvailable ||
    compatibility === 'unavailable' ||
    compatibility === 'incompatible'
  ) {
    throw new Error(
      project.runtime?.reason || `Runtime indisponível para ${project.name}.`,
    );
  }
  const environment = {
    ...process.env,
    ...(project.runtime?.environment ?? {}),
    MFE_RUNNER_WORKSPACE: workspace.name,
    MFE_RUNNER_ENVIRONMENT: workspace.environment,
  };
  let invocation;
  let portStrategy;
  switch (ecosystem) {
    case 'node':
      invocation = windowsNodeInvocation(
        project.node,
        ['run', profile.task],
      );
      break;
    case 'java-maven':
    case 'java-gradle': {
      const tool = project.runtime.components?.tool;
      invocation = controlledWindowsWrapper(tool?.path, [
        ...profile.args,
        profile.task,
      ].filter(Boolean));
      break;
    }
    case 'dotnet':
      invocation = {
        executable: project.runtime.components?.runtime?.path,
        args: [profile.task, ...profile.args].filter(Boolean),
      };
      break;
    case 'python':
      invocation = {
        executable: project.runtime.components?.runtime?.path,
        args: profile.args,
      };
      break;
    case 'rust':
    case 'go':
      invocation = {
        executable: project.runtime.components?.runtime?.path,
        args: [profile.task, ...profile.args].filter(Boolean),
      };
      break;
    case 'flutter': {
      const target = profile.flutterTarget;
      if (target === 'test') {
        const selectedPlatform = project.flutterTarget?.platform;
        const deviceId = project.flutterTarget?.deviceId ??
          (selectedPlatform === 'web' ? 'chrome' : undefined);
        invocation = {
          executable: project.runtime.components?.runtime?.path,
          args: ['test', ...(deviceId ? ['-d', deviceId] : [])],
        };
      } else if (target === 'build-web' || target === 'build-android' || target === 'build-ios') {
        invocation = {
          executable: project.runtime.components?.runtime?.path,
          args: ['build', target === 'build-android' ? 'apk' : target.replace('build-', '')],
        };
      } else {
        if (!['web', 'android', 'ios'].includes(target)) {
          throw new Error(`Alvo Flutter inválido para ${project.name}.`);
        }
        const selectedPlatform = project.flutterTarget?.platform ?? target;
        const deviceId = project.flutterTarget?.deviceId ??
          (selectedPlatform === 'web' ? 'chrome' : undefined);
        invocation = {
          executable: project.runtime.components?.runtime?.path,
          args: ['run', '-d', deviceId ?? selectedPlatform],
        };
        if (selectedPlatform === 'web') portStrategy = 'flutter-web';
      }
      break;
    }
    default:
      throw new Error(`Ecossistema não suportado: ${ecosystem}.`);
  }
  if (!invocation.executable) {
    throw new Error(`Executável não resolvido para ${project.name}.`);
  }
  return {
    commandId: profile.id,
    label: profile.label,
    executable: invocation.executable,
    args: invocation.args,
    cwd: project.absolutePath,
    env: environment,
    port: project.port,
    healthCheck: project.healthCheck ?? {
      type: project.port ? 'tcp' : 'process',
      ...(project.port ? { port: project.port } : {}),
    },
    ...(portStrategy ? { portStrategy } : {}),
    longRunning: profile.longRunning,
  };
}

export const __test__ = {
  controlledWindowsWrapper,
};
