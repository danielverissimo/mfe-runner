import { execFile } from 'node:child_process';
import { access, readFile, readdir, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { resolveNodeRuntime } from './node-resolver.mjs';
import { SUPPORT_LEVELS } from './ecosystem-adapters.mjs';

const execFileAsync = promisify(execFile);
const VERSION_TIMEOUT_MS = 2500;

async function isExecutable(filePath) {
  if (!filePath) return false;
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function pathCandidates(name, environment = process.env) {
  const extensions = process.platform === 'win32'
    ? (environment.PATHEXT ?? '.EXE;.CMD;.BAT').split(';')
    : [''];
  return (environment.PATH ?? '').split(path.delimiter).flatMap((directory) =>
    extensions.map((extension) =>
      path.join(directory, `${name}${extension.toLowerCase()}`)
    )
  );
}

async function findExecutable(names, environment = process.env) {
  for (const name of names) {
    if (path.isAbsolute(name) && await isExecutable(name)) return realpath(name);
    for (const candidate of pathCandidates(name, environment)) {
      if (await isExecutable(candidate)) return realpath(candidate);
    }
  }
  return null;
}

async function commandVersion(executable, args = ['--version']) {
  if (!executable) return null;
  try {
    const result = await execFileAsync(executable, args, {
      timeout: VERSION_TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: 256 * 1024,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
      },
    });
    return `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
  } catch (error) {
    const output = `${error?.stdout ?? ''}\n${error?.stderr ?? ''}`.trim();
    return output || null;
  }
}

function firstVersion(value) {
  return String(value ?? '').match(/\d+(?:\.\d+){0,3}/)?.[0] ?? null;
}

function normalizeJavaVersion(value) {
  const version = firstVersion(value);
  if (!version) return null;
  const parts = version.split('.');
  return parts[0] === '1' && parts[1] ? parts[1] : version;
}

function versionParts(value) {
  return firstVersion(value)?.split('.').map(Number) ?? [];
}

function minimumRequiredVersion(requirement) {
  if (requirement == null) return null;
  return firstVersion(
    Array.isArray(requirement) ? requirement.find(Boolean) : requirement,
  );
}

function compareVersions(actual, required) {
  const actualParts = versionParts(actual);
  const requiredParts = versionParts(required);
  if (!actualParts.length || !requiredParts.length) return null;
  const length = Math.max(actualParts.length, requiredParts.length);
  for (let index = 0; index < length; index += 1) {
    const difference =
      (actualParts[index] ?? 0) - (requiredParts[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

function compatibilityFor(actual, requirement) {
  const required = minimumRequiredVersion(requirement);
  if (!required) return { status: 'ready', required: null };
  const comparison = compareVersions(actual, required);
  if (comparison == null) {
    return {
      status: 'unknown',
      required,
      reason: `Não foi possível confirmar compatibilidade com ${required}.`,
    };
  }
  if (comparison < 0) {
    return {
      status: 'incompatible',
      required,
      reason: `Versão ${actual} incompatível; o projeto requer ${required} ou superior.`,
    };
  }
  return { status: 'ready', required };
}

function policyFor(executionPolicies, ecosystem, component) {
  return executionPolicies?.[ecosystem]?.[component] ??
    executionPolicies?.[ecosystem]?.runtime ??
    { mode: 'auto' };
}

async function explicitOrDetected(policy, detectedPath, versionArgs) {
  const explicitPath = policy?.mode === 'explicit' ? policy.path : null;
  const executable = explicitPath
    ? await isExecutable(explicitPath) ? await realpath(explicitPath) : null
    : detectedPath;
  const rawVersion = executable
    ? await commandVersion(executable, versionArgs)
    : null;
  return {
    available: !!executable,
    path: executable,
    version: firstVersion(rawVersion),
    rawVersion,
    source: explicitPath ? 'explicit' : 'path',
    ...(explicitPath && !executable
      ? { reason: `Executável configurado não encontrado: ${explicitPath}.` }
      : {}),
  };
}

async function javaHomes() {
  const homes = new Set();
  if (process.env.JAVA_HOME) homes.add(process.env.JAVA_HOME);
  if (process.platform === 'darwin') {
    try {
      const result = await execFileAsync('/usr/libexec/java_home', ['-V'], {
        timeout: VERSION_TIMEOUT_MS,
        maxBuffer: 256 * 1024,
      });
      for (const match of `${result.stdout}\n${result.stderr}`
        .matchAll(/(\/[^\n]+\/Contents\/Home)/g)) {
        homes.add(match[1].trim());
      }
    } catch {
      // JAVA_HOME and PATH remain available.
    }
  }
  if (process.platform === 'linux') {
    try {
      for (const entry of await readdir('/usr/lib/jvm')) {
        homes.add(path.join('/usr/lib/jvm', entry));
      }
    } catch {
      // Optional conventional location.
    }
  }
  const home = os.homedir();
  for (const root of [
    path.join(home, '.sdkman', 'candidates', 'java'),
    path.join(home, '.jenv', 'versions'),
    path.join(home, '.asdf', 'installs', 'java'),
    path.join(home, '.local', 'share', 'mise', 'installs', 'java'),
  ]) {
    try {
      for (const entry of await readdir(root)) homes.add(path.join(root, entry));
    } catch {
      // Optional version manager.
    }
  }
  if (process.platform === 'win32') {
    for (const registryKey of [
      'HKLM\\SOFTWARE\\JavaSoft\\JDK',
      'HKLM\\SOFTWARE\\Eclipse Adoptium\\JDK',
      'HKLM\\SOFTWARE\\WOW6432Node\\JavaSoft\\JDK',
    ]) {
      try {
        const result = await execFileAsync('reg.exe', [
          'query',
          registryKey,
          '/s',
          '/v',
          'JavaHome',
        ], {
          timeout: VERSION_TIMEOUT_MS,
          windowsHide: true,
          maxBuffer: 256 * 1024,
        });
        for (const match of result.stdout.matchAll(
          /JavaHome\s+REG_SZ\s+(.+)$/gim,
        )) {
          homes.add(match[1].trim());
        }
      } catch {
        // Registry keys vary by vendor and are optional.
      }
    }
    for (const root of [
      process.env['ProgramFiles'] && path.join(process.env['ProgramFiles'], 'Java'),
      process.env['ProgramFiles'] && path.join(process.env['ProgramFiles'], 'Eclipse Adoptium'),
    ].filter(Boolean)) {
      try {
        for (const entry of await readdir(root)) homes.add(path.join(root, entry));
      } catch {
        // Optional conventional location.
      }
    }
  }
  return [...homes];
}

async function childDirectories(root) {
  try {
    return (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
      .slice(0, 100)
      .map((entry) => path.join(root, entry.name));
  } catch {
    return [];
  }
}

async function executableCandidates(names, extraPaths = []) {
  const candidates = new Set(extraPaths.filter(Boolean));
  for (const name of names) {
    const found = await findExecutable([name]);
    if (found) candidates.add(found);
  }
  const result = [];
  for (const candidate of candidates) {
    if (!(await isExecutable(candidate))) continue;
    try {
      result.push(await realpath(candidate));
    } catch {
      // Ignore installations that disappeared during the scan.
    }
  }
  return [...new Set(result)];
}

async function managedExecutablePaths(tool, executableName) {
  const home = os.homedir();
  const windowsName = process.platform === 'win32'
    ? `${executableName}.exe`
    : executableName;
  const cmdName = process.platform === 'win32'
    ? `${executableName}.cmd`
    : executableName;
  const roots = [
    path.join(home, '.asdf', 'installs', tool),
    path.join(home, '.local', 'share', 'mise', 'installs', tool),
  ];
  if (tool === 'python') roots.push(path.join(home, '.pyenv', 'versions'));
  if (tool === 'go') roots.push(path.join(home, 'sdk'));
  const paths = [];
  for (const root of roots) {
    for (const directory of await childDirectories(root)) {
      paths.push(path.join(directory, 'bin', windowsName));
    }
  }
  if (tool === 'maven' || tool === 'gradle') {
    const sdkmanRoot = path.join(home, '.sdkman', 'candidates', tool);
    for (const directory of await childDirectories(sdkmanRoot)) {
      paths.push(path.join(directory, 'bin', cmdName));
    }
  }
  if (tool === 'rust') {
    paths.push(path.join(home, '.cargo', 'bin', windowsName));
    for (const directory of await childDirectories(
      path.join(home, '.rustup', 'toolchains'),
    )) {
      paths.push(path.join(directory, 'bin', process.platform === 'win32'
        ? 'cargo.exe'
        : 'cargo'));
    }
  }
  return paths;
}

async function conventionalExecutablePaths(ecosystem, component) {
  const home = os.homedir();
  const paths = [];
  if (ecosystem === 'java-maven' && component === 'tool') {
    const mavenHome = process.env.MAVEN_HOME ?? process.env.M2_HOME;
    if (mavenHome) {
      paths.push(path.join(mavenHome, 'bin',
        process.platform === 'win32' ? 'mvn.cmd' : 'mvn'));
    }
  }
  if (ecosystem === 'java-gradle' && component === 'tool' &&
      process.env.GRADLE_HOME) {
    paths.push(path.join(process.env.GRADLE_HOME, 'bin',
      process.platform === 'win32' ? 'gradle.cmd' : 'gradle'));
  }
  if (ecosystem === 'dotnet') {
    paths.push(
      path.join(home, '.dotnet', process.platform === 'win32'
        ? 'dotnet.exe'
        : 'dotnet'),
    );
    if (process.platform === 'win32' && process.env.ProgramFiles) {
      paths.push(path.join(process.env.ProgramFiles, 'dotnet', 'dotnet.exe'));
    }
  }
  if (ecosystem === 'python' && component === 'runtime') {
    if (process.platform === 'darwin') {
      for (const directory of await childDirectories(
        '/Library/Frameworks/Python.framework/Versions',
      )) {
        paths.push(path.join(directory, 'bin', 'python3'));
      }
    }
    if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
      for (const directory of await childDirectories(
        path.join(process.env.LOCALAPPDATA, 'Programs', 'Python'),
      )) {
        paths.push(path.join(directory, 'python.exe'));
      }
    }
  }
  if (ecosystem === 'go') {
    const goRoot = process.env.GOROOT;
    if (goRoot) {
      paths.push(path.join(goRoot, 'bin',
        process.platform === 'win32' ? 'go.exe' : 'go'));
    }
    if (process.platform !== 'win32') paths.push('/usr/local/go/bin/go');
  }
  return paths;
}

async function installationFromExecutable({
  ecosystem,
  component,
  executable,
  label,
  source,
  versionArgs = ['--version'],
  normalizeVersion = firstVersion,
  selectedPath = executable,
}) {
  const rawVersion = await commandVersion(executable, versionArgs);
  return {
    id: `${ecosystem}:${component}:${executable}`,
    label,
    version: normalizeVersion(rawVersion),
    rawVersion,
    path: selectedPath,
    source,
  };
}

const INSTALLATION_DESCRIPTORS = Object.freeze({
  'node:packageManager': {
    names: ['npm', 'pnpm', 'yarn'],
    managed: [],
    label: 'Gerenciador de pacotes Node',
  },
  'java-maven:tool': {
    names: ['mvn'],
    managed: ['maven'],
    label: 'Apache Maven',
  },
  'java-gradle:tool': {
    names: ['gradle'],
    managed: ['gradle'],
    label: 'Gradle',
  },
  'dotnet:runtime': {
    names: ['dotnet'],
    managed: ['dotnet'],
    label: '.NET SDK',
  },
  'python:runtime': {
    names: process.platform === 'win32'
      ? ['python', 'python3', 'py']
      : ['python3', 'python'],
    managed: ['python'],
    label: 'Python',
  },
  'python:tool': {
    names: ['pip', 'pip3', 'poetry', 'uv'],
    managed: [],
    label: 'Ferramenta Python',
  },
  'rust:runtime': {
    names: ['cargo'],
    managed: ['rust'],
    label: 'Rust / Cargo',
  },
  'rust:tool': {
    names: ['rustup', 'cargo'],
    managed: [],
    label: 'Rustup / Cargo',
  },
  'go:runtime': {
    names: ['go'],
    managed: ['go'],
    label: 'Go toolchain',
    versionArgs: ['version'],
  },
});

export async function listRuntimeInstallations({ ecosystem, component }) {
  if (
    (ecosystem === 'java-maven' || ecosystem === 'java-gradle') &&
    component === 'runtime'
  ) {
    const installations = [];
    for (const home of await javaHomes()) {
      try {
        const executable = path.join(
          home,
          'bin',
          process.platform === 'win32' ? 'java.exe' : 'java',
        );
        if (!(await isExecutable(executable))) continue;
        installations.push(await installationFromExecutable({
          ecosystem,
          component,
          executable,
          selectedPath: await realpath(home),
          label: 'JDK',
          source: 'jdk',
          versionArgs: ['-version'],
          normalizeVersion: normalizeJavaVersion,
        }));
      } catch {
        // Ignore stale version-manager links.
      }
    }
    return {
      ecosystem,
      component,
      installations: deduplicateInstallations(installations),
    };
  }
  const descriptor = INSTALLATION_DESCRIPTORS[`${ecosystem}:${component}`];
  if (!descriptor) {
    return { ecosystem, component, installations: [] };
  }
  const extraPaths = [];
  extraPaths.push(...await conventionalExecutablePaths(ecosystem, component));
  for (const manager of descriptor.managed) {
    extraPaths.push(...await managedExecutablePaths(
      manager,
      descriptor.names[0],
    ));
  }
  const executables = await executableCandidates(
    descriptor.names,
    extraPaths,
  );
  const installations = [];
  for (const executable of executables) {
    installations.push(await installationFromExecutable({
      ecosystem,
      component,
      executable,
      label: path.basename(executable),
      source: 'installed',
      versionArgs: descriptor.versionArgs,
    }));
  }
  return {
    ecosystem,
    component,
    installations: deduplicateInstallations(installations),
  };
}

function deduplicateInstallations(installations) {
  const unique = new Map();
  for (const installation of installations) {
    unique.set(installation.path, installation);
  }
  return [...unique.values()].sort((left, right) =>
    (right.version ?? '').localeCompare(left.version ?? '', undefined, {
      numeric: true,
    })
  );
}

async function javaVersionHint(projectRoot) {
  try {
    const value = await readFile(path.join(projectRoot, '.java-version'), 'utf8');
    const version = normalizeJavaVersion(value.trim());
    if (version) return version;
  } catch {
    // Optional project hint.
  }
  try {
    const value = await readFile(path.join(projectRoot, '.sdkmanrc'), 'utf8');
    const java = value.match(/^\s*java\s*=\s*(.+?)\s*$/m)?.[1];
    const version = normalizeJavaVersion(java);
    if (version) return version;
  } catch {
    // Optional SDKMAN project hint.
  }
  return null;
}

async function resolveJava(project, policies) {
  const policy = policyFor(policies, project.ecosystem, 'runtime');
  let javaExecutable = null;
  let javaHome = policy?.mode === 'explicit' ? policy.path ?? null : null;
  let rawVersion = null;
  if (javaHome) {
    javaExecutable = path.join(javaHome, 'bin', process.platform === 'win32'
      ? 'java.exe'
      : 'java');
    if (!(await isExecutable(javaExecutable)) && await isExecutable(javaHome)) {
      javaExecutable = javaHome;
      javaHome = path.dirname(path.dirname(javaHome));
    }
  } else {
    let fallback = null;
    const requiredJava = project.runtimeRequirements?.java ??
      await javaVersionHint(project.absolutePath);
    for (const home of await javaHomes()) {
      const candidate = path.join(home, 'bin', process.platform === 'win32'
        ? 'java.exe'
        : 'java');
      if (await isExecutable(candidate)) {
        const candidateRawVersion = await commandVersion(candidate, ['-version']);
        const candidateVersion = normalizeJavaVersion(candidateRawVersion);
        fallback ??= {
          javaHome: home,
          javaExecutable: candidate,
          rawVersion: candidateRawVersion,
        };
        if (compatibilityFor(candidateVersion, requiredJava).status === 'ready') {
          javaHome = home;
          javaExecutable = candidate;
          rawVersion = candidateRawVersion;
          break;
        }
      }
    }
    if (!javaExecutable && fallback) {
      ({ javaHome, javaExecutable, rawVersion } = fallback);
    }
    javaExecutable ??= await findExecutable(['java']);
    if (javaExecutable) javaHome ??= path.dirname(path.dirname(javaExecutable));
  }
  rawVersion ??= await commandVersion(javaExecutable, ['-version']);
  const requiredJava = project.runtimeRequirements?.java ??
    await javaVersionHint(project.absolutePath);
  const javaVersion = normalizeJavaVersion(rawVersion);
  const compatibility = javaExecutable
    ? compatibilityFor(javaVersion, requiredJava)
    : { status: 'unavailable', reason: 'JDK não encontrado.' };
  const java = {
    available: !!javaExecutable,
    path: javaExecutable,
    home: javaHome,
    version: javaVersion,
    rawVersion,
    source: policy?.mode === 'explicit' ? 'explicit' : 'auto',
    compatibility: compatibility.status,
    requiredVersion: compatibility.required ?? null,
    ...(!javaExecutable ? { reason: 'JDK não encontrado.' } : {}),
  };
  const buildTool = project.toolMetadata?.buildTool;
  const toolPolicy = policyFor(policies, project.ecosystem, 'tool');
  const wrapper = project.toolMetadata?.wrapperPath;
  const toolNames = buildTool === 'maven'
    ? ['mvn']
    : ['gradle'];
  const toolHome = buildTool === 'maven'
    ? process.env.MAVEN_HOME ?? process.env.M2_HOME
    : process.env.GRADLE_HOME;
  const toolHomeExecutable = toolHome
    ? path.join(
        toolHome,
        'bin',
        process.platform === 'win32'
          ? `${toolNames[0]}.cmd`
          : toolNames[0],
      )
    : null;
  const detectedTool = wrapper && await isExecutable(wrapper)
    ? wrapper
    : toolHomeExecutable && await isExecutable(toolHomeExecutable)
      ? toolHomeExecutable
      : await findExecutable(toolNames);
  const tool = await explicitOrDetected(toolPolicy, detectedTool, ['--version']);
  const available = java.available && tool.available;
  const resolvedCompatibility = !available
    ? 'unavailable'
    : compatibility.status;
  return {
    ecosystem: project.ecosystem,
    supportLevel: SUPPORT_LEVELS[project.ecosystem],
    available,
    compatibility: resolvedCompatibility,
    reason: !java.available
      ? java.reason
      : !tool.available
        ? `${buildTool === 'maven' ? 'Maven' : 'Gradle'} não encontrado.`
        : compatibility.reason ?? null,
    requirements: {
      ...(project.runtimeRequirements ?? {}),
      ...(requiredJava ? { java: requiredJava } : {}),
    },
    components: {
      runtime: java,
      tool: { ...tool, id: buildTool },
    },
    environment: {
      ...(javaHome ? { JAVA_HOME: javaHome } : {}),
      PATH: [
        javaHome ? path.join(javaHome, 'bin') : null,
        process.env.PATH,
      ].filter(Boolean).join(path.delimiter),
    },
  };
}

async function resolveSimple(project, policies, descriptor) {
  const policy = policyFor(policies, project.ecosystem, 'runtime');
  let detected = null;
  if (project.ecosystem === 'python') {
    for (const candidate of [
      path.join(project.absolutePath, '.venv', process.platform === 'win32'
        ? 'Scripts/python.exe'
        : 'bin/python'),
      path.join(project.absolutePath, 'venv', process.platform === 'win32'
        ? 'Scripts/python.exe'
        : 'bin/python'),
    ]) {
      if (await isExecutable(candidate)) {
        detected = candidate;
        break;
      }
    }
  }
  detected ??= await findExecutable(descriptor.names);
  const runtime = await explicitOrDetected(
    policy,
    detected,
    descriptor.versionArgs,
  );
  const requirement = project.runtimeRequirements?.[project.ecosystem];
  const compatibility = runtime.available
    ? compatibilityFor(runtime.version, requirement)
    : { status: 'unavailable' };
  return {
    ecosystem: project.ecosystem,
    supportLevel: SUPPORT_LEVELS[project.ecosystem],
    available: runtime.available,
    compatibility: compatibility.status,
    reason: runtime.reason ?? compatibility.reason ??
      (!runtime.available ? `${descriptor.label} não encontrado.` : null),
    requirements: project.runtimeRequirements ?? {},
    components: { runtime },
    environment: {
      PATH: [
        runtime.path ? path.dirname(runtime.path) : null,
        process.env.PATH,
      ].filter(Boolean).join(path.delimiter),
      ...(project.ecosystem === 'python' &&
          runtime.path?.includes(`${path.sep}.venv${path.sep}`)
        ? {
            VIRTUAL_ENV: path.dirname(path.dirname(runtime.path)),
          }
        : {}),
      ...(project.ecosystem === 'rust' && policy?.version
        ? { RUSTUP_TOOLCHAIN: policy.version }
        : {}),
      ...(project.ecosystem === 'go'
        ? { GOTOOLCHAIN: 'path' }
        : {}),
    },
  };
}

export async function resolveEcosystemRuntime({
  project,
  projectPolicies,
  workspacePolicies,
  globalPolicies,
  legacyNodePolicies,
}) {
  if (project.ecosystem === 'node') {
    const projectPolicy = projectPolicies?.node?.runtime ??
      legacyNodePolicies?.projectPolicy;
    const workspacePolicy = workspacePolicies?.node?.runtime ??
      legacyNodePolicies?.workspacePolicy;
    const globalPolicy = globalPolicies?.node?.runtime ??
      legacyNodePolicies?.globalPolicy ??
      { mode: 'auto' };
    const node = await resolveNodeRuntime({
      projectPath: project.absolutePath,
      workspaceRoot: project.sourceRoot,
      projectPolicy,
      workspacePolicy,
      globalPolicy,
    });
    return {
      ecosystem: 'node',
      supportLevel: 'stable',
      available: node.available,
      compatibility: node.available ? 'ready' : 'unavailable',
      reason: node.reason ?? null,
      requirements: project.runtimeRequirements ?? {},
      components: { runtime: node },
      environment: {
        PATH: [
          node.binDirectory,
          process.env.PATH,
        ].filter(Boolean).join(path.delimiter),
        ...(node.binDirectory
          ? {
              NVM_BIN: node.binDirectory,
              ...(process.platform !== 'win32'
                ? {
                    NVM_INC: path.resolve(
                      node.binDirectory,
                      '..',
                      'include',
                      'node',
                    ),
                  }
                : {}),
            }
          : {}),
      },
      legacyNode: node,
    };
  }
  const policies = {
    ...globalPolicies,
    ...workspacePolicies,
    ...projectPolicies,
    [project.ecosystem]: {
      ...(globalPolicies?.[project.ecosystem] ?? {}),
      ...(workspacePolicies?.[project.ecosystem] ?? {}),
      ...(projectPolicies?.[project.ecosystem] ?? {}),
    },
  };
  if (project.ecosystem.startsWith('java-')) {
    return resolveJava(project, policies);
  }
  const descriptors = {
    dotnet: { names: ['dotnet'], versionArgs: ['--version'], label: '.NET SDK' },
    python: {
      names: process.platform === 'win32'
        ? ['python', 'python3', 'py']
        : ['python3', 'python'],
      versionArgs: ['--version'],
      label: 'Python',
    },
    rust: { names: ['cargo'], versionArgs: ['--version'], label: 'Cargo' },
    go: { names: ['go'], versionArgs: ['version'], label: 'Go' },
  };
  return resolveSimple(project, policies, descriptors[project.ecosystem]);
}

export const __test__ = {
  compareVersions,
  compatibilityFor,
  firstVersion,
  normalizeJavaVersion,
  pathCandidates,
  policyFor,
};
