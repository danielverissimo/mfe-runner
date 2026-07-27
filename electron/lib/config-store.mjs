import { randomUUID } from 'node:crypto';
import {
  copyFile,
  mkdir,
  readFile,
  rename,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import {
  validateEnvironment,
  validateIdePreference,
  validateNodePolicy,
  validateWorkspaceInput,
} from './contracts.mjs';

export const DEFAULT_CONFIG = Object.freeze({
  version: 5,
  settings: {
    globalNodePolicy: { mode: 'auto' },
    stopProcessesOnExit: false,
    logLimit: 1500,
    ide: null,
  },
  workspaces: [],
});

function cloneDefaultConfig() {
  return structuredClone(DEFAULT_CONFIG);
}

function sanitizeProjectOverrides(overrides) {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(overrides)
      .filter(([projectId, value]) =>
        projectId && value && typeof value === 'object' && !Array.isArray(value)
      )
      .map(([projectId, value]) => {
        const result = {};
        if (value.nodePolicy) {
          result.nodePolicy = validateNodePolicy(value.nodePolicy);
        }
        if (
          typeof value.defaultScript === 'string' &&
          value.defaultScript.trim()
        ) {
          result.defaultScript = value.defaultScript.trim();
        }
        if (
          value.libraryLinkScripts &&
          typeof value.libraryLinkScripts === 'object' &&
          !Array.isArray(value.libraryLinkScripts)
        ) {
          result.libraryLinkScripts = Object.fromEntries(
            Object.entries(value.libraryLinkScripts)
              .filter(([libraryId, script]) =>
                typeof libraryId === 'string' &&
                libraryId.trim() &&
                typeof script === 'string' &&
                script.startsWith('link:') &&
                script.length <= 100
              )
              .map(([libraryId, script]) => [
                libraryId.trim(),
                script.trim(),
              ]),
          );
        }
        if (
          Number.isInteger(value.startupOrder) &&
          value.startupOrder >= 0 &&
          value.startupOrder <= 999
        ) {
          result.startupOrder = value.startupOrder;
        }
        return [projectId, result];
      }),
  );
}

function sanitizeSourceProject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (!['project', 'library'].includes(value.kind)) return null;
  if (typeof value.relativePath !== 'string' || !value.relativePath.trim()) {
    return null;
  }
  return {
    relativePath: value.relativePath.trim(),
    kind: value.kind,
    kindSource: value.kindSource === 'user' ? 'user' : 'detected',
    ...(value.kind === 'library' &&
        value.localLibraryLink &&
        typeof value.localLibraryLink === 'object'
      ? { localLibraryLink: structuredClone(value.localLibraryLink) }
      : {}),
  };
}

function sanitizeProjectSources(sources) {
  if (!Array.isArray(sources)) return [];
  return sources.flatMap((source) => {
    if (
      !source ||
      typeof source !== 'object' ||
      typeof source.rootPath !== 'string' ||
      !source.rootPath.trim()
    ) return [];
    const id = typeof source.id === 'string' && source.id
      ? source.id
      : randomUUID();
    return [{
      id,
      rootPath: source.rootPath.trim(),
      rootProjectId:
        typeof source.rootProjectId === 'string' && source.rootProjectId
          ? source.rootProjectId
          : id,
      projects: Array.isArray(source.projects)
        ? source.projects.map(sanitizeSourceProject).filter(Boolean)
        : [],
    }];
  });
}

function sanitizeExcludedProjectIds(projectIds) {
  if (!Array.isArray(projectIds)) return [];
  return [...new Set(
    projectIds
      .filter((projectId) =>
        typeof projectId === 'string' &&
        projectId.trim() &&
        projectId.length <= 1024
      )
      .map((projectId) => projectId.trim()),
  )];
}

function sanitizeProjectOrder(projectIds) {
  return sanitizeExcludedProjectIds(projectIds);
}

function sanitizeIdePreference(value) {
  try {
    return validateIdePreference(value);
  } catch {
    return null;
  }
}

function sanitizeWorkspace(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const projectSources = sanitizeProjectSources(value.projectSources);
  if (!projectSources.length) return null;
  try {
    return {
      id: typeof value.id === 'string' && value.id
        ? value.id
        : randomUUID(),
      name: typeof value.name === 'string' && value.name.trim()
        ? value.name.trim().slice(0, 100)
        : 'Workspace',
      projectSources,
      environment: validateEnvironment(value.environment ?? 'local'),
      nodePolicy: validateNodePolicy(
        value.nodePolicy ?? { mode: 'inherit' },
      ),
      projectOverrides: sanitizeProjectOverrides(value.projectOverrides),
      projectOrder: sanitizeProjectOrder(value.projectOrder),
      excludedProjectIds: sanitizeExcludedProjectIds(
        value.excludedProjectIds,
      ),
    };
  } catch {
    return null;
  }
}

function sanitizeConfig(value) {
  const base = cloneDefaultConfig();
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    value.version !== 5
  ) {
    return base;
  }
  const settings = value.settings ?? {};
  base.settings = {
    globalNodePolicy: validateNodePolicy(
      settings.globalNodePolicy ?? base.settings.globalNodePolicy,
      { allowInherit: false },
    ),
    stopProcessesOnExit:
      typeof settings.stopProcessesOnExit === 'boolean'
        ? settings.stopProcessesOnExit
        : true,
    logLimit: Number.isInteger(settings.logLimit)
      ? Math.min(Math.max(settings.logLimit, 200), 10000)
      : base.settings.logLimit,
    ide: sanitizeIdePreference(settings.ide),
  };
  base.workspaces = Array.isArray(value.workspaces)
    ? value.workspaces.map(sanitizeWorkspace).filter(Boolean)
    : [];
  return base;
}

function migrateV4(value) {
  const base = cloneDefaultConfig();
  const settings = value.settings ?? {};
  base.settings = {
    globalNodePolicy: validateNodePolicy(
      settings.globalNodePolicy ?? base.settings.globalNodePolicy,
      { allowInherit: false },
    ),
    stopProcessesOnExit:
      typeof settings.stopProcessesOnExit === 'boolean'
        ? settings.stopProcessesOnExit
        : true,
    logLimit: Number.isInteger(settings.logLimit)
      ? Math.min(Math.max(settings.logLimit, 200), 10000)
      : base.settings.logLimit,
    ide: sanitizeIdePreference(settings.ide),
  };
  base.workspaces = (Array.isArray(value.workspaces) ? value.workspaces : [])
    .flatMap((workspace) => {
      if (!workspace || typeof workspace !== 'object') return [];
      const projectSources = [];
      if (typeof workspace.shellRootPath === 'string' && workspace.shellRootPath) {
        projectSources.push({
          id: randomUUID(),
          rootPath: workspace.shellRootPath,
          rootProjectId: 'shell',
          projects: [{
            relativePath: '.',
            kind: 'project',
            kindSource: 'detected',
          }],
        });
      }
      for (const root of workspace.mfeRoots ?? []) {
        if (!root?.rootPath) continue;
        const rootId = root.id || randomUUID();
        projectSources.push({
          id: rootId,
          rootPath: root.rootPath,
          rootProjectId: `${rootId}/.`,
          projects: [],
        });
      }
      for (const library of workspace.libraries ?? []) {
        if (!library?.rootPath) continue;
        projectSources.push({
          id: randomUUID(),
          rootPath: library.rootPath,
          rootProjectId: `library:${library.id}`,
          projects: [{
            relativePath: '.',
            kind: 'library',
            kindSource: 'user',
            localLibraryLink: {
              enabled: true,
              packageName: '',
              developmentScript: library.developmentScript,
              artifactRelativePath: library.artifactRelativePath,
              preferredLinkScript: library.preferredLinkScript,
            },
          }],
        });
      }
      if (!projectSources.length) return [];
      return [{
        id: workspace.id || randomUUID(),
        name: workspace.name || 'Workspace',
        projectSources,
        environment: workspace.environment ?? 'local',
        nodePolicy: workspace.nodePolicy ?? { mode: 'inherit' },
        projectOverrides: sanitizeProjectOverrides(workspace.projectOverrides),
        projectOrder: sanitizeProjectOrder(workspace.projectOrder),
        excludedProjectIds: sanitizeExcludedProjectIds(
          workspace.excludedProjectIds,
        ),
      }];
    });
  return sanitizeConfig(base);
}

export class ConfigStore {
  #configPath;
  #config;

  constructor(configPath) {
    this.#configPath = configPath;
    this.#config = cloneDefaultConfig();
  }

  get configPath() {
    return this.#configPath;
  }

  get snapshot() {
    return structuredClone(this.#config);
  }

  async load() {
    try {
      const raw = await readFile(this.#configPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed?.version === 4) {
        await this.#backupLegacyConfig('v4');
        this.#config = migrateV4(parsed);
        await this.#save();
      } else if (parsed?.version !== 5) {
        await this.#backupLegacyConfig(`v${parsed?.version ?? 'legacy'}`);
        this.#config = cloneDefaultConfig();
        await this.#save();
      } else {
        this.#config = sanitizeConfig(parsed);
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw new Error(
          `Não foi possível carregar a configuração: ${error.message}`,
        );
      }
      this.#config = cloneDefaultConfig();
    }
    return this.snapshot;
  }

  async addWorkspace(input) {
    const validated = validateWorkspaceInput(input);
    const workspace = {
      id: randomUUID(),
      name: validated.name,
      projectSources: validated.projectSources.map((source) => {
        const id = randomUUID();
        return {
          id,
          rootPath: source.rootPath,
          rootProjectId: id,
          projects: source.projects,
        };
      }),
      environment: validated.environment,
      nodePolicy: validated.nodePolicy,
      projectOverrides: {},
      projectOrder: [],
      excludedProjectIds: [],
    };
    this.#config.workspaces.push(workspace);
    await this.#save();
    return structuredClone(workspace);
  }

  async updateWorkspace(workspaceId, input) {
    const index = this.#config.workspaces.findIndex(
      (workspace) => workspace.id === workspaceId,
    );
    if (index === -1) throw new Error('Workspace não encontrada.');
    const validated = validateWorkspaceInput(input);
    const current = this.#config.workspaces[index];
    const currentSources = new Map(
      current.projectSources.map((source) => [source.rootPath, source]),
    );
    this.#config.workspaces[index] = {
      ...current,
      name: validated.name,
      projectSources: validated.projectSources.map((source) => {
        const existing = currentSources.get(source.rootPath);
        const id = existing?.id ?? randomUUID();
        return {
          id,
          rootPath: source.rootPath,
          rootProjectId: existing?.rootProjectId ?? id,
          projects: source.projects,
        };
      }),
      environment: validated.environment,
      nodePolicy: validated.nodePolicy,
    };
    const validProjectIds = new Set(
      this.#config.workspaces[index].projectSources.flatMap((source) =>
        source.projects.map((project) =>
          project.relativePath === '.'
            ? source.rootProjectId
            : `${source.id}/${project.relativePath}`
        )
      ),
    );
    this.#config.workspaces[index].projectOverrides = Object.fromEntries(
      Object.entries(this.#config.workspaces[index].projectOverrides)
        .filter(([projectId]) => validProjectIds.has(projectId)),
    );
    this.#config.workspaces[index].projectOrder = [
      ...new Set(this.#config.workspaces[index].projectOrder ?? []),
    ].filter((projectId) => validProjectIds.has(projectId));
    const validLibraryIds = new Set(
      this.#config.workspaces[index].projectSources.flatMap((source) =>
        source.projects
          .filter((project) => project.kind === 'library')
          .map((project) =>
            project.relativePath === '.'
              ? source.rootProjectId
              : `${source.id}/${project.relativePath}`
          )
      ),
    );
    for (const override of Object.values(
      this.#config.workspaces[index].projectOverrides,
    )) {
      if (!override.libraryLinkScripts) continue;
      override.libraryLinkScripts = Object.fromEntries(
        Object.entries(override.libraryLinkScripts)
          .filter(([libraryId]) => validLibraryIds.has(libraryId)),
      );
    }
    await this.#save();
    return structuredClone(this.#config.workspaces[index]);
  }

  async removeWorkspace(workspaceId) {
    const before = this.#config.workspaces.length;
    this.#config.workspaces = this.#config.workspaces.filter(
      (workspace) => workspace.id !== workspaceId,
    );
    if (before === this.#config.workspaces.length) {
      throw new Error('Workspace não encontrada.');
    }
    await this.#save();
  }

  async updateSettings(input) {
    const settings = input && typeof input === 'object' ? input : {};
    if (settings.globalNodePolicy !== undefined) {
      this.#config.settings.globalNodePolicy = validateNodePolicy(
        settings.globalNodePolicy,
        { allowInherit: false },
      );
    }
    if (settings.stopProcessesOnExit !== undefined) {
      this.#config.settings.stopProcessesOnExit =
        settings.stopProcessesOnExit !== false;
    }
    if (settings.logLimit !== undefined && Number.isInteger(settings.logLimit)) {
      this.#config.settings.logLimit = Math.min(
        Math.max(settings.logLimit, 200),
        10000,
      );
    }
    if (settings.ide !== undefined) {
      this.#config.settings.ide = validateIdePreference(settings.ide);
    }
    await this.#save();
    return structuredClone(this.#config.settings);
  }

  async updateProject(workspaceId, projectId, input) {
    const workspace = this.#findWorkspace(workspaceId);
    const override = workspace.projectOverrides[projectId] ?? {};
    if (input.nodePolicy !== undefined) {
      override.nodePolicy = validateNodePolicy(input.nodePolicy);
    }
    if (input.defaultScript !== undefined) {
      if (input.defaultScript) {
        override.defaultScript = input.defaultScript;
      } else {
        delete override.defaultScript;
      }
    }
    if (input.libraryLinkScripts !== undefined) {
      override.libraryLinkScripts = { ...input.libraryLinkScripts };
    }
    if (input.startupOrder !== undefined) {
      override.startupOrder = input.startupOrder;
    }
    workspace.projectOverrides[projectId] = override;
    await this.#save();
    return structuredClone(override);
  }

  async updateProjectOrder(workspaceId, projectIds) {
    const workspace = this.#findWorkspace(workspaceId);
    workspace.projectOrder = [...projectIds];
    await this.#save();
    return [...workspace.projectOrder];
  }

  async excludeProject(workspaceId, projectId) {
    const workspace = this.#findWorkspace(workspaceId);
    if (!workspace.excludedProjectIds.includes(projectId)) {
      workspace.excludedProjectIds.push(projectId);
    }
    delete workspace.projectOverrides[projectId];
    workspace.projectOrder = (workspace.projectOrder ?? [])
      .filter((item) => item !== projectId);
    await this.#save();
  }

  async restoreExcludedProjects(workspaceId) {
    const workspace = this.#findWorkspace(workspaceId);
    if (workspace.excludedProjectIds.length === 0) return;
    workspace.excludedProjectIds = [];
    await this.#save();
  }

  #findWorkspace(workspaceId) {
    const workspace = this.#config.workspaces.find(
      (item) => item.id === workspaceId,
    );
    if (!workspace) throw new Error('Workspace não encontrada.');
    return workspace;
  }

  async #backupLegacyConfig(version = 'legacy') {
    const extension = path.extname(this.#configPath);
    const base = this.#configPath.slice(0, -extension.length);
    let backupPath = `${base}.${version}.backup${extension}`;
    try {
      await readFile(backupPath);
      backupPath = `${base}.${version}.backup-${Date.now()}${extension}`;
    } catch {
      // O primeiro nome de backup está disponível.
    }
    await copyFile(this.#configPath, backupPath);
  }

  async #save() {
    const directory = path.dirname(this.#configPath);
    await mkdir(directory, { recursive: true });
    const temporaryPath = `${this.#configPath}.tmp`;
    await writeFile(
      temporaryPath,
      `${JSON.stringify(this.#config, null, 2)}\n`,
      { encoding: 'utf8', mode: 0o600 },
    );
    await rename(temporaryPath, this.#configPath);
  }
}

export const __test__ = { migrateV4, sanitizeConfig };
