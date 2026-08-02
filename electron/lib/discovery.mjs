import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { resolveEcosystemRuntime } from './runtime-resolver.mjs';
import { enrichProjectsWithGit } from './git-context.mjs';
import { enrichProjectsWithLibraryLinks } from './library-inspector.mjs';
import { inspectProjectSource } from './project-detectors.mjs';

async function fileExists(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

function findPortInAngularConfig(angularConfig) {
  for (const project of Object.values(angularConfig?.projects ?? {})) {
    const targets = project.architect ?? project.targets ?? {};
    for (const target of [targets['serve-original'], targets.serve].filter(Boolean)) {
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

function selectDefaultScript(kind, scripts, override) {
  if (override && scripts[override]) return override;
  if (kind === 'library' && scripts.watch) return 'watch';
  if (scripts.start) return 'start';
  if (scripts.dev) return 'dev';
  if (scripts.serve) return 'serve';
  if (scripts.watch) return 'watch';
  return Object.keys(scripts).find((script) => !script.startsWith('pre')) ?? null;
}

function projectId(source, relativePath) {
  return relativePath === '.'
    ? source.rootProjectId
    : `${source.id}/${relativePath}`;
}

function effectiveKind(source, candidate) {
  const stored = source.projects?.find(
    (project) => project.relativePath === candidate.relativePath,
  );
  return {
    kind: stored?.kind ?? candidate.suggestedKind ?? 'project',
    kindSource: stored?.kindSource ??
      (candidate.suggestedKind ? 'detected' : 'user'),
    localLibraryLink: stored?.localLibraryLink,
  };
}

function roleFor(kind, capabilities) {
  if (kind === 'library') return 'library';
  if (capabilities.includes('host')) return 'shell';
  if (capabilities.includes('mfe')) return 'mfe';
  return 'application';
}

function inferredLocalLibraryLink(candidate, kindConfig) {
  if (kindConfig.kind !== 'library') return null;
  if (kindConfig.localLibraryLink) {
    return kindConfig.localLibraryLink.enabled
      ? kindConfig.localLibraryLink
      : null;
  }
  if (
    (candidate.ecosystem ?? 'node') !== 'node' ||
    candidate.suggestedKind !== 'library' ||
    !candidate.libraryArtifactRelativePath
  ) {
    return null;
  }
  const scripts = candidate.scripts ?? {};
  const developmentScript = scripts.watch
    ? 'watch'
    : scripts.build
      ? 'build'
      : null;
  const packageName =
    candidate.libraryPackageName ??
    candidate.packageJson?.name ??
    null;
  if (!developmentScript || !packageName) return null;
  const unscopedName = packageName.replace(/^@[^/]+\//, '');
  return {
    enabled: true,
    packageName,
    developmentScript,
    artifactRelativePath: candidate.libraryArtifactRelativePath,
    preferredLinkScript: `link:${unscopedName.replace(/-lib$/, '')}`,
  };
}

async function manifestFiles(projects) {
  const manifests = [];
  for (const project of projects) {
    const registryPath = path.join(
      project.absolutePath,
      'src',
      'assets',
      'tenants',
      'registry.json',
    );
    if (!(await fileExists(registryPath))) continue;
    try {
      const registry = JSON.parse(await readFile(registryPath, 'utf8'));
      for (const item of registry.tenants ?? []) {
        const manifestPath = path.resolve(
          path.dirname(registryPath),
          item.manifestPath ?? item.path ?? '',
        );
        if (!(await fileExists(manifestPath))) continue;
        const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
        if (manifest.tenantId && Array.isArray(manifest.microFrontends)) {
          manifests.push(manifest);
        }
      }
    } catch {
      // Manifests remain optional metadata.
    }
  }
  return manifests;
}

function registrationsFor(manifests, project) {
  const registrations = [];
  for (const manifest of manifests) {
    for (const remote of manifest.microFrontends ?? []) {
      const normalizedName = project.name.replace(/^plataforma-/, '').toLowerCase();
      if (
        remote.remoteName !== project.federation?.name &&
        remote.id?.toLowerCase() !== normalizedName &&
        remote.name?.toLowerCase() !== project.name.toLowerCase()
      ) continue;
      let localPort = null;
      try {
        const url = new URL(remote.environments?.local ?? remote.baseUrl);
        localPort = url.port ? Number(url.port) : null;
      } catch {
        // URL is optional metadata.
      }
      registrations.push({
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
  return registrations;
}

async function libraryMetadata(candidate, id, configured) {
  if (!configured) return undefined;
  const packageName =
    configured.packageName ||
    candidate.libraryPackageName ||
    candidate.packageJson.name ||
    candidate.name;
  const artifactPath = path.resolve(
    candidate.absolutePath,
    configured.artifactRelativePath,
  );
  return {
    libraryId: id,
    packageName,
    artifactPath,
    artifactRelativePath: configured.artifactRelativePath,
    artifactAvailable: await fileExists(path.join(artifactPath, 'package.json')),
    developmentScript: configured.developmentScript,
    preferredLinkScript: configured.preferredLinkScript,
  };
}

function orderProjects(projects, projectOrder = []) {
  const positions = new Map(
    projectOrder.map((projectId, index) => [projectId, index]),
  );
  return [...projects].sort((left, right) =>
    (positions.has(left.id) ? positions.get(left.id) : Number.MAX_SAFE_INTEGER) -
      (positions.has(right.id) ? positions.get(right.id) : Number.MAX_SAFE_INTEGER) ||
    left.startupOrder - right.startupOrder ||
    left.name.localeCompare(right.name)
  );
}

export async function discoverWorkspace(workspace, globalExecutionPolicies = {}) {
  const warnings = [];
  const discoveredPaths = new Set();
  const preliminary = [];
  const normalizedSources = [];

  for (const source of workspace.projectSources) {
    const inspection = await inspectProjectSource(source.rootPath);
    normalizedSources.push({ ...source, rootPath: inspection.rootPath });
    warnings.push(...inspection.warnings);
    for (const candidate of inspection.projects) {
      const canonicalPath = await realpath(candidate.absolutePath);
      if (discoveredPaths.has(canonicalPath)) {
        warnings.push(`Projeto duplicado ignorado em ${canonicalPath}.`);
        continue;
      }
      discoveredPaths.add(canonicalPath);
      const id = projectId(source, candidate.relativePath);
      if (workspace.excludedProjectIds?.includes(id)) continue;
      const override = workspace.projectOverrides?.[id] ?? {};
      const kindConfig = effectiveKind(source, candidate);
      const localLibraryLink = inferredLocalLibraryLink(candidate, kindConfig);
      const capabilities = [...candidate.capabilities];
      const role = roleFor(kindConfig.kind, capabilities);
      const scripts = candidate.scripts ?? {};
      const legacyDefaultScript = selectDefaultScript(
        kindConfig.kind,
        scripts,
        override.defaultScript ??
          localLibraryLink?.developmentScript,
      );
      const commands = candidate.commands ?? [];
      const libraryWatchCommandId =
        kindConfig.kind === 'library' && scripts.watch
          ? commands.find((item) => item.task === 'watch')?.id ??
            'node:script:watch'
          : null;
      const defaultCommandId =
        override.defaultCommandId ??
        (override.defaultScript
          ? commands.find((item) => item.task === override.defaultScript)?.id
          : null) ??
        libraryWatchCommandId ??
        candidate.defaultCommandId ??
        (legacyDefaultScript ? `node:script:${legacyDefaultScript}` : null);
      const runtimeProject = {
        ...candidate,
        absolutePath: canonicalPath,
        sourceRoot: inspection.rootPath,
      };
      const legacyGlobalNodePolicy =
        globalExecutionPolicies?.mode
          ? globalExecutionPolicies
          : globalExecutionPolicies?.node?.runtime;
      const runtime = await resolveEcosystemRuntime({
        project: runtimeProject,
        projectPolicies: override.executionPolicies,
        workspacePolicies: workspace.executionPolicies,
        globalPolicies: globalExecutionPolicies?.mode
          ? {}
          : globalExecutionPolicies,
        legacyNodePolicies: {
          projectPolicy: override.nodePolicy,
          workspacePolicy: workspace.nodePolicy,
          globalPolicy: legacyGlobalNodePolicy,
        },
      });
      preliminary.push({
        id,
        sourceId: source.id,
        sourceRoot: inspection.rootPath,
        name: candidate.name,
        displayName: candidate.name,
        relativePath: candidate.relativePath,
        absolutePath: canonicalPath,
        role,
        ecosystem: candidate.ecosystem ?? 'node',
        technology: candidate.technology ?? 'Node.js',
        supportLevel: candidate.supportLevel ?? 'stable',
        kind: kindConfig.kind,
        kindSource: kindConfig.kindSource,
        capabilities,
        startupOrder: override.startupOrder ??
          (kindConfig.kind === 'library' ? 100 : capabilities.includes('host') ? 900 : 500),
        scripts,
        scriptNames: Object.keys(scripts),
        commands,
        commandIds: commands.map((item) => item.id),
        defaultCommandId,
        defaultScript:
          commands.find((item) => item.id === defaultCommandId)?.task ??
          legacyDefaultScript,
        port:
          findPortInScript(
            scripts[
              commands.find((item) => item.id === defaultCommandId)?.task ??
              legacyDefaultScript
            ],
          ) ??
          findPortInAngularConfig(candidate.angularConfig),
        healthCheck: override.healthCheck ?? null,
        flutterTarget: override.flutterTarget ?? null,
        federation: candidate.federation
          ? { name: candidate.federation.name, exposes: candidate.federation.exposes }
          : null,
        packageEngines: candidate.packageJson?.engines ?? {},
        runtimeRequirements: candidate.runtimeRequirements ?? {},
        toolMetadata: candidate.toolMetadata ?? {},
        registrations: [],
        runtime,
        node: runtime.legacyNode ?? {
          available: runtime.available,
          version: runtime.components?.runtime?.version ?? null,
          source: runtime.components?.runtime?.source ?? 'path',
          reason: runtime.reason ?? undefined,
        },
        library: await libraryMetadata(candidate, id, localLibraryLink),
        libraryLinkScriptOverrides: override.libraryLinkScripts ?? {},
        libraryLinks: [],
        warnings: [
          ...(candidate.supportLevel === 'beta'
            ? [`${candidate.technology} está em suporte Beta.`]
            : []),
          ...(candidate.suggestedKind === null &&
          !source.projects?.some((item) => item.relativePath === candidate.relativePath)
            ? ['Classificação assumida como Projeto; revise a workspace.']
            : []),
          ...(!runtime.available && runtime.reason ? [runtime.reason] : []),
        ],
      });
    }
  }

  const manifests = await manifestFiles(preliminary);
  for (const project of preliminary) {
    project.registrations = registrationsFor(manifests, project);
    const manifestPort = project.registrations.find((item) => item.localPort)?.localPort;
    project.port ??= manifestPort ?? null;
    if (project.capabilities.includes('mfe') && !project.registrations.length) {
      project.warnings.push('Remote físico não associado a um manifest descoberto.');
    }
  }
  const portOwners = new Map();
  for (const project of preliminary) {
    if (!project.port) continue;
    portOwners.set(project.port, [...(portOwners.get(project.port) ?? []), project.id]);
  }
  for (const [port, owners] of portOwners) {
    if (owners.length < 2) continue;
    for (const project of preliminary.filter((item) => owners.includes(item.id))) {
      project.warnings.push(`Porta ${port} também é usada por outro projeto.`);
    }
  }

  const withGit = await enrichProjectsWithGit(
    orderProjects(preliminary, workspace.projectOrder),
  );
  const projects = await enrichProjectsWithLibraryLinks(withGit);
  return {
    workspace: { ...workspace, projectSources: normalizedSources },
    projects,
    manifests: manifests.map((manifest) => ({
      tenantId: manifest.tenantId,
      tenantName: manifest.tenantName,
      remoteCount: manifest.microFrontends.length,
    })),
    warnings,
    betaEcosystems: [...new Map(
      projects
        .filter((project) => project.supportLevel === 'beta')
        .map((project) => [project.ecosystem, {
          ecosystem: project.ecosystem,
          technology: project.technology,
        }]),
    ).values()],
    discoveredAt: new Date().toISOString(),
    gitUpdatedAt: new Date().toISOString(),
  };
}

export const __test__ = {
  findPortInAngularConfig,
  findPortInScript,
  projectId,
  roleFor,
  selectDefaultScript,
};
