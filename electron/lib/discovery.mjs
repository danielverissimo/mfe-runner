import {
  readFile,
  readdir,
  realpath,
  stat,
} from 'node:fs/promises';
import path from 'node:path';
import { resolveNodeRuntime } from './node-resolver.mjs';
import { enrichProjectsWithGit } from './git-context.mjs';
import {
  enrichProjectsWithLibraryLinks,
  inspectLibraryDirectory,
} from './library-inspector.mjs';

const IGNORED_DIRECTORIES = new Set([
  '.angular',
  '.git',
  '.idea',
  '.nx',
  '.vscode',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'tmp',
]);

const MAX_DEPTH = 8;
const MAX_DIRECTORIES = 10000;

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function fileExists(filePath) {
  try {
    const info = await stat(filePath);
    return info.isFile();
  } catch {
    return false;
  }
}

function normalizeRelativePath(value) {
  return value.split(path.sep).join('/');
}

function findPortInAngularConfig(angularConfig) {
  for (const project of Object.values(angularConfig.projects ?? {})) {
    const targets = project.architect ?? project.targets ?? {};
    const preferredTargets = [
      targets['serve-original'],
      targets.serve,
    ].filter(Boolean);

    for (const target of preferredTargets) {
      const directPort = Number(target.options?.port);
      if (Number.isInteger(directPort) && directPort > 0) return directPort;

      for (const configuration of Object.values(target.configurations ?? {})) {
        const port = Number(configuration?.port);
        if (Number.isInteger(port) && port > 0) return port;
      }
    }
  }
  return null;
}

function findPortInScript(script) {
  if (!script) return null;
  const match = script.match(/(?:^|\s)--port(?:=|\s+)(\d{2,5})(?:\s|$)/);
  return match ? Number(match[1]) : null;
}

function parseFederationConfig(source) {
  const nameMatch = source.match(/\bname\s*:\s*['"]([^'"]+)['"]/);
  const exposesBlock = source.match(/\bexposes\s*:\s*\{([\s\S]*?)\}/);
  const exposes = exposesBlock
    ? [...exposesBlock[1].matchAll(/['"](\.\/[^'"]+)['"]\s*:/g)]
        .map((match) => match[1])
    : [];
  return {
    name: nameMatch?.[1] ?? null,
    exposes,
  };
}

function classifyProject({
  projectPath,
  angularConfig,
  federation,
  hasTenantRegistry = false,
}) {
  if (hasTenantRegistry) {
    return 'shell';
  }
  if (path.basename(projectPath) === 'plataforma-template') {
    return 'template';
  }
  if (
    federation?.exposes.length
  ) {
    return 'mfe';
  }
  if (
    Object.values(angularConfig.projects ?? {}).some(
      (project) => project.projectType === 'library',
    )
  ) {
    return 'library';
  }
  if (
    projectPath.endsWith(`${path.sep}plataforma`) ||
    projectPath.endsWith(`${path.sep}shell`)
  ) {
    return 'shell';
  }
  return 'application';
}

function selectDefaultScript(role, scripts, override) {
  if (role === 'template') return null;
  if (override && scripts[override]) return override;
  if (scripts.start) return 'start';
  if (role === 'library' && scripts.watch) return 'watch';
  if (scripts.watch) return 'watch';
  return Object.keys(scripts).find((script) => !script.startsWith('pre')) ?? null;
}

function buildManifestAssociations(manifests, project) {
  const matches = [];
  for (const manifest of manifests) {
    for (const remote of manifest.microFrontends ?? []) {
      const matchesFederation =
        project.federation?.name &&
        remote.remoteName === project.federation.name;
      const normalizedProjectName = project.name
        .replace(/^plataforma-/, '')
        .toLowerCase();
      const matchesName =
        remote.id?.toLowerCase() === normalizedProjectName ||
        remote.name?.toLowerCase() === project.name.toLowerCase();

      if (!matchesFederation && !matchesName) continue;
      let localPort = null;
      try {
        const localUrl = remote.environments?.local ?? remote.baseUrl;
        if (localUrl?.startsWith('http')) {
          const parsed = new URL(localUrl);
          localPort = parsed.port ? Number(parsed.port) : null;
        }
      } catch {
        localPort = null;
      }
      matches.push({
        tenantId: manifest.tenantId,
        tenantName: manifest.tenantName,
        remoteId: remote.id,
        remoteName: remote.remoteName,
        routePath: remote.routePath,
        type: remote.type,
        enabled: remote.enabled !== false,
        localPort,
      });
    }
  }
  return matches;
}

async function scanRoot(rootPath) {
  const packageDirectories = [];
  const manifestPaths = [];
  const warnings = [];
  let directoryCount = 0;

  async function visit(directory, depth) {
    directoryCount += 1;
    if (directoryCount > MAX_DIRECTORIES) {
      throw new Error(
        `A descoberta excedeu o limite de ${MAX_DIRECTORIES} diretórios.`,
      );
    }
    if (depth > MAX_DEPTH) return;

    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      warnings.push(`Sem acesso a ${directory}: ${error.message}`);
      return;
    }

    const names = new Set(entries.map((entry) => entry.name));
    if (names.has('package.json') && names.has('angular.json')) {
      packageDirectories.push(directory);
    }
    if (
      names.has('manifest.json') &&
      normalizeRelativePath(directory).includes('/src/assets/tenants/')
    ) {
      manifestPaths.push(path.join(directory, 'manifest.json'));
    }

    for (const entry of entries) {
      if (
        !entry.isDirectory() ||
        entry.isSymbolicLink() ||
        IGNORED_DIRECTORIES.has(entry.name)
      ) {
        continue;
      }
      await visit(path.join(directory, entry.name), depth + 1);
    }
  }

  await visit(rootPath, 0);
  return { packageDirectories, manifestPaths, warnings };
}

async function loadManifests(manifestPaths, warnings) {
  const manifests = [];
  for (const manifestPath of manifestPaths) {
    try {
      const manifest = await readJson(manifestPath);
      if (manifest.tenantId && Array.isArray(manifest.microFrontends)) {
        manifests.push(manifest);
      }
    } catch (error) {
      warnings.push(`Manifest inválido em ${manifestPath}: ${error.message}`);
    }
  }
  return manifests;
}

async function inspectProject({
  projectPath,
  workspace,
  boundaryRoot,
  projectId,
  relativePath,
  globalNodePolicy,
  manifests,
  warnings,
}) {
  try {
    const packageJson = await readJson(path.join(projectPath, 'package.json'));
    if (
      packageJson.name === 'mfe-runner' &&
      packageJson.main === 'electron/main.mjs'
    ) {
      return null;
    }
    const angularConfig = await readJson(path.join(projectPath, 'angular.json'));
    const federationPath = path.join(projectPath, 'federation.config.mjs');
    const federation = await fileExists(federationPath)
      ? parseFederationConfig(await readFile(federationPath, 'utf8'))
      : null;
    const scripts = packageJson.scripts ?? {};
    const override = workspace.projectOverrides?.[projectId] ?? {};
    const hasTenantRegistry = await fileExists(
      path.join(projectPath, 'src', 'assets', 'tenants', 'registry.json'),
    );
    const role = classifyProject({
      projectPath,
      angularConfig,
      federation,
      hasTenantRegistry,
    });
    const scriptPort =
      findPortInScript(scripts.start) ??
      findPortInScript(scripts.watch);
    const angularPort = findPortInAngularConfig(angularConfig);

    const preliminary = {
      id: projectId,
      name: packageJson.name ?? path.basename(projectPath),
      displayName: packageJson.name ?? path.basename(projectPath),
      relativePath,
      absolutePath: projectPath,
      role,
      scripts,
      scriptNames: Object.keys(scripts),
      defaultScript: selectDefaultScript(role, scripts, override.defaultScript),
      port: scriptPort ?? angularPort,
      federation,
      packageEngines: packageJson.engines ?? {},
      libraryLinkScriptOverrides: override.libraryLinkScripts ?? {},
      libraryLinks: [],
    };

    const registrations = buildManifestAssociations(manifests, preliminary);
    const manifestPort = registrations.find((item) => item.localPort)?.localPort;
    const port = preliminary.port ?? manifestPort ?? null;
    const projectWarnings = [];

    if (
      preliminary.port &&
      manifestPort &&
      preliminary.port !== manifestPort
    ) {
      projectWarnings.push(
        `Porta do projeto (${preliminary.port}) diverge do manifest (${manifestPort}).`,
      );
    }
    if (role === 'mfe' && registrations.length === 0) {
      projectWarnings.push('MFE físico não associado a um manifest descoberto.');
    }
    if (role === 'template') {
      projectWarnings.push(
        'Template de scaffold; não será iniciado pelas ações globais.',
      );
    }

    const node = await resolveNodeRuntime({
      projectPath,
      workspaceRoot: boundaryRoot,
      projectPolicy: override.nodePolicy,
      workspacePolicy: workspace.nodePolicy,
      globalPolicy: globalNodePolicy,
    });

    return {
      ...preliminary,
      port,
      registrations,
      node,
      warnings: projectWarnings,
    };
  } catch (error) {
    warnings.push(`Projeto ignorado em ${projectPath}: ${error.message}`);
    return null;
  }
}

function orderProjects(projects) {
  const weights = {
    shell: 0,
    library: 1,
    mfe: 2,
    application: 3,
    template: 4,
  };
  return [...projects].sort(
    (left, right) =>
      (weights[left.role] ?? 2) - (weights[right.role] ?? 2) ||
      left.name.localeCompare(right.name),
  );
}

export async function discoverWorkspace(workspace, globalNodePolicy) {
  const warnings = [];
  const canonicalShellRoot = await realpath(workspace.shellRootPath);
  if (
    !(await fileExists(path.join(canonicalShellRoot, 'package.json'))) ||
    !(await fileExists(path.join(canonicalShellRoot, 'angular.json')))
  ) {
    throw new Error(
      'O path do shell deve conter package.json e angular.json.',
    );
  }

  const normalizedRoots = [];
  for (const root of workspace.mfeRoots) {
    normalizedRoots.push({
      ...root,
      rootPath: await realpath(root.rootPath),
    });
  }
  const normalizedWorkspace = {
    ...workspace,
    shellRootPath: canonicalShellRoot,
    mfeRoots: normalizedRoots,
    libraries: [],
  };

  const configuredLibraries = [];
  for (const library of workspace.libraries ?? []) {
    const metadata = await inspectLibraryDirectory(
      library.rootPath,
      library,
    );
    configuredLibraries.push({
      ...library,
      rootPath: metadata.rootPath,
      metadata,
    });
  }
  normalizedWorkspace.libraries = configuredLibraries.map(
    ({ metadata: _metadata, ...library }) => library,
  );

  const shellScan = await scanRoot(canonicalShellRoot);
  warnings.push(...shellScan.warnings);
  const manifests = await loadManifests(shellScan.manifestPaths, warnings);
  const shellProject = await inspectProject({
    projectPath: canonicalShellRoot,
    workspace: normalizedWorkspace,
    boundaryRoot: canonicalShellRoot,
    projectId: 'shell',
    relativePath: '.',
    globalNodePolicy,
    manifests,
    warnings,
  });
  if (!shellProject) {
    throw new Error('Não foi possível descobrir o projeto do shell.');
  }

  const discoveredPaths = new Set([canonicalShellRoot]);
  const libraryProjects = [];
  for (const library of configuredLibraries) {
    if (discoveredPaths.has(library.rootPath)) {
      throw new Error(
        `A biblioteca ${library.rootPath} também está configurada como shell.`,
      );
    }
    discoveredPaths.add(library.rootPath);
    const project = await inspectProject({
      projectPath: library.rootPath,
      workspace: normalizedWorkspace,
      boundaryRoot: library.rootPath,
      projectId: `library:${library.id}`,
      relativePath: '.',
      globalNodePolicy,
      manifests,
      warnings,
    });
    if (!project || project.role !== 'library') {
      throw new Error(
        `Não foi possível descobrir a biblioteca em ${library.rootPath}.`,
      );
    }
    libraryProjects.push({
      ...project,
      defaultScript: library.developmentScript,
      library: {
        libraryId: library.id,
        packageName: library.metadata.packageName,
        artifactPath: library.metadata.artifactPath,
        artifactRelativePath: library.metadata.artifactRelativePath,
        artifactAvailable: await fileExists(
          path.join(library.metadata.artifactPath, 'package.json'),
        ),
        developmentScript: library.developmentScript,
        preferredLinkScript: library.preferredLinkScript,
      },
    });
  }
  const mfeProjects = [];
  for (const root of normalizedRoots) {
    const scan = await scanRoot(root.rootPath);
    warnings.push(...scan.warnings);
    for (const projectPath of scan.packageDirectories) {
      const canonicalProjectPath = await realpath(projectPath);
      if (discoveredPaths.has(canonicalProjectPath)) {
        if (canonicalProjectPath !== canonicalShellRoot) {
          warnings.push(
            `Projeto duplicado ignorado em ${canonicalProjectPath}.`,
          );
        }
        continue;
      }
      discoveredPaths.add(canonicalProjectPath);
      const relativePath = normalizeRelativePath(
        path.relative(root.rootPath, canonicalProjectPath) || '.',
      );
      const projectId = `${root.id}/${relativePath}`;
      const project = await inspectProject({
        projectPath: canonicalProjectPath,
        workspace: normalizedWorkspace,
        boundaryRoot: root.rootPath,
        projectId,
        relativePath,
        globalNodePolicy,
        manifests,
        warnings,
      });
      if (
        project &&
        project.role !== 'shell' &&
        !normalizedWorkspace.excludedProjectIds?.includes(project.id)
      ) {
        mfeProjects.push(project);
      }
    }
  }
  const projects = [
    { ...shellProject, role: 'shell' },
    ...libraryProjects,
    ...mfeProjects,
  ];

  const portOwners = new Map();
  for (const project of projects) {
    if (!project.port) continue;
    const owners = portOwners.get(project.port) ?? [];
    owners.push(project.id);
    portOwners.set(project.port, owners);
  }
  for (const [port, owners] of portOwners) {
    if (owners.length < 2) continue;
    for (const project of projects.filter((item) => owners.includes(item.id))) {
      project.warnings.push(
        `Porta ${port} também é usada por: ${owners
          .filter((owner) => owner !== project.id)
          .join(', ')}.`,
      );
    }
  }

  const projectsWithGit = await enrichProjectsWithGit(orderProjects(projects));
  const enrichedProjects = await enrichProjectsWithLibraryLinks(
    projectsWithGit,
  );
  return {
    workspace: normalizedWorkspace,
    projects: enrichedProjects,
    manifests: manifests.map((manifest) => ({
      tenantId: manifest.tenantId,
      tenantName: manifest.tenantName,
      remoteCount: manifest.microFrontends.length,
    })),
    warnings,
    discoveredAt: new Date().toISOString(),
    gitUpdatedAt: new Date().toISOString(),
  };
}

export const __test__ = {
  classifyProject,
  findPortInAngularConfig,
  findPortInScript,
  normalizeRelativePath,
  parseFederationConfig,
  selectDefaultScript,
};
