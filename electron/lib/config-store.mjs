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
  version: 4,
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
        return [projectId, result];
      }),
  );
}

function sanitizeLibraries(libraries) {
  if (!Array.isArray(libraries)) return [];
  return libraries.flatMap((library) => {
    if (!library || typeof library !== 'object' || Array.isArray(library)) {
      return [];
    }
    try {
      const rootPath = typeof library.rootPath === 'string'
        ? library.rootPath.trim()
        : '';
      const developmentScript =
        typeof library.developmentScript === 'string'
          ? library.developmentScript.trim()
          : '';
      const artifactRelativePath =
        typeof library.artifactRelativePath === 'string'
          ? library.artifactRelativePath.trim()
          : '';
      const preferredLinkScript =
        typeof library.preferredLinkScript === 'string'
          ? library.preferredLinkScript.trim()
          : '';
      if (
        !rootPath ||
        !developmentScript ||
        !artifactRelativePath ||
        !preferredLinkScript.startsWith('link:')
      ) {
        return [];
      }
      return [{
        id: typeof library.id === 'string' && library.id
          ? library.id
          : randomUUID(),
        rootPath,
        developmentScript,
        artifactRelativePath,
        preferredLinkScript,
      }];
    } catch {
      return [];
    }
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

function sanitizeIdePreference(value) {
  try {
    return validateIdePreference(value);
  } catch {
    return null;
  }
}

function sanitizeWorkspace(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (
    typeof value.shellRootPath !== 'string' ||
    !value.shellRootPath.trim()
  ) {
    return null;
  }
  const roots = Array.isArray(value.mfeRoots)
    ? value.mfeRoots.flatMap((root) => {
        if (!root || typeof root !== 'object' || Array.isArray(root)) return [];
        if (typeof root.rootPath !== 'string' || !root.rootPath.trim()) return [];
        return [{
          id: typeof root.id === 'string' && root.id
            ? root.id
            : randomUUID(),
          rootPath: root.rootPath.trim(),
        }];
      })
    : [];
  if (!roots.length) return null;
  try {
    return {
      id: typeof value.id === 'string' && value.id
        ? value.id
        : randomUUID(),
      name: typeof value.name === 'string' && value.name.trim()
        ? value.name.trim().slice(0, 100)
        : 'Workspace',
      shellRootPath: value.shellRootPath.trim(),
      mfeRoots: roots,
      libraries: sanitizeLibraries(value.libraries),
      environment: validateEnvironment(value.environment ?? 'local'),
      nodePolicy: validateNodePolicy(
        value.nodePolicy ?? { mode: 'inherit' },
      ),
      projectOverrides: sanitizeProjectOverrides(value.projectOverrides),
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
    value.version !== 4
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
      if (parsed?.version !== 4) {
        await this.#backupLegacyConfig();
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
    this.#assertUniqueShellPath(validated.shellRootPath);
    const workspace = {
      id: randomUUID(),
      name: validated.name,
      shellRootPath: validated.shellRootPath,
      mfeRoots: validated.mfeRootPaths.map((rootPath) => ({
        id: randomUUID(),
        rootPath,
      })),
      libraries: validated.libraries.map((library) => ({
        id: randomUUID(),
        ...library,
      })),
      environment: validated.environment,
      nodePolicy: validated.nodePolicy,
      projectOverrides: {},
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
    this.#assertUniqueShellPath(validated.shellRootPath, workspaceId);
    const current = this.#config.workspaces[index];
    const currentRoots = new Map(
      current.mfeRoots.map((root) => [root.rootPath, root]),
    );
    const currentLibraries = new Map(
      (current.libraries ?? []).map((library) => [
        library.rootPath,
        library,
      ]),
    );
    this.#config.workspaces[index] = {
      ...current,
      name: validated.name,
      shellRootPath: validated.shellRootPath,
      mfeRoots: validated.mfeRootPaths.map((rootPath) =>
        currentRoots.get(rootPath) ?? { id: randomUUID(), rootPath }
      ),
      libraries: validated.libraries.map((library) => ({
        ...(currentLibraries.get(library.rootPath) ?? { id: randomUUID() }),
        ...library,
      })),
      environment: validated.environment,
      nodePolicy: validated.nodePolicy,
    };
    const validLibraryIds = new Set(
      this.#config.workspaces[index].libraries.map((library) => library.id),
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
    workspace.projectOverrides[projectId] = override;
    await this.#save();
    return structuredClone(override);
  }

  async excludeProject(workspaceId, projectId) {
    const workspace = this.#findWorkspace(workspaceId);
    if (!workspace.excludedProjectIds.includes(projectId)) {
      workspace.excludedProjectIds.push(projectId);
    }
    delete workspace.projectOverrides[projectId];
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

  #assertUniqueShellPath(shellRootPath, ignoredWorkspaceId) {
    const duplicate = this.#config.workspaces.some(
      (workspace) =>
        workspace.id !== ignoredWorkspaceId &&
        workspace.shellRootPath === shellRootPath,
    );
    if (duplicate) {
      throw new Error('Este shell já pertence a outra workspace.');
    }
  }

  async #backupLegacyConfig() {
    const extension = path.extname(this.#configPath);
    const base = this.#configPath.slice(0, -extension.length);
    let backupPath = `${base}.v3.backup${extension}`;
    try {
      await readFile(backupPath);
      backupPath = `${base}.v3.backup-${Date.now()}${extension}`;
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

export const __test__ = { sanitizeConfig };
