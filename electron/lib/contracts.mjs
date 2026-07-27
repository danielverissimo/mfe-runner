export const IPC_CHANNELS = Object.freeze({
  getSnapshot: 'runner:get-snapshot',
  listNodeVersions: 'runner:list-node-versions',
  chooseProjectDirectory: 'runner:choose-project-directory',
  inspectProjectSource: 'runner:inspect-project-source',
  projectSourceInspectionProgress: 'runner:project-source-inspection-progress',
  reviewWorkspace: 'runner:review-workspace',
  addWorkspace: 'runner:add-workspace',
  updateWorkspace: 'runner:update-workspace',
  removeWorkspace: 'runner:remove-workspace',
  startWorkspace: 'runner:start-workspace',
  stopWorkspace: 'runner:stop-workspace',
  restartWorkspace: 'runner:restart-workspace',
  linkLibraries: 'runner:link-libraries',
  openLocalAddress: 'runner:open-local-address',
  copyText: 'runner:copy-text',
  listDeveloperTools: 'runner:list-developer-tools',
  chooseIdeExecutable: 'runner:choose-ide-executable',
  openProjectInIde: 'runner:open-project-in-ide',
  openProjectFolder: 'runner:open-project-folder',
  openProjectTerminal: 'runner:open-project-terminal',
  refreshWorkspaceGit: 'runner:refresh-workspace-git',
  exportDiagnostics: 'runner:export-diagnostics',
  updateSettings: 'runner:update-settings',
  updateProject: 'runner:update-project',
  updateProjectOrder: 'runner:update-project-order',
  excludeProject: 'runner:exclude-project',
  startProject: 'runner:start-project',
  stopProject: 'runner:stop-project',
  restartProject: 'runner:restart-project',
  terminateExternalProcess: 'runner:terminate-external-process',
  clearLogs: 'runner:clear-logs',
  getUpdateState: 'runner:get-update-state',
  checkForUpdates: 'runner:check-for-updates',
  downloadUpdate: 'runner:download-update',
  installUpdate: 'runner:install-update',
  snapshotChanged: 'runner:snapshot-changed',
  logReceived: 'runner:log-received',
  updateStateChanged: 'runner:update-state-changed',
});

export const NODE_POLICY_MODES = new Set(['inherit', 'auto', 'explicit']);
export const ENVIRONMENTS = new Set(['local', 'des', 'hom', 'prod']);

export function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} deve ser um objeto.`);
  }
  return value;
}

export function assertNonEmptyString(value, label, maxLength = 2048) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw new TypeError(`${label} inválido.`);
  }
  return value.trim();
}

export function assertOptionalString(value, label, maxLength = 2048) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  return assertNonEmptyString(value, label, maxLength);
}

export function validateNodePolicy(value, { allowInherit = true } = {}) {
  const policy = assertPlainObject(value, 'Política de Node');
  const mode = assertNonEmptyString(policy.mode, 'Modo da política', 16);
  if (!NODE_POLICY_MODES.has(mode) || (!allowInherit && mode === 'inherit')) {
    throw new TypeError(`Modo de Node não suportado: ${mode}.`);
  }
  const version = assertOptionalString(policy.version, 'Versão do Node', 64);
  if (mode === 'explicit' && !version) {
    throw new TypeError('Informe a versão para a política explícita.');
  }
  return { mode, ...(version ? { version } : {}) };
}

export function validateEnvironment(value) {
  const environment = assertNonEmptyString(value, 'Ambiente', 16);
  if (!ENVIRONMENTS.has(environment)) {
    throw new TypeError(`Ambiente não suportado: ${environment}.`);
  }
  return environment;
}

export function validateWorkspaceInput(value) {
  const workspace = assertPlainObject(value, 'Workspace');
  if (!Array.isArray(workspace.projectSources) || !workspace.projectSources.length) {
    throw new TypeError('Informe ao menos um path de projeto.');
  }
  if (workspace.projectSources.length > 100) {
    throw new TypeError('A workspace excede o limite de 100 paths.');
  }
  const projectSources = workspace.projectSources.map((source, index) =>
    validateProjectSourceInput(source, index)
  );
  const sourcePaths = projectSources.map((source) => source.rootPath);
  if (new Set(sourcePaths).size !== sourcePaths.length) {
    throw new TypeError('Não repita o mesmo path de projeto.');
  }
  return {
    name: assertNonEmptyString(workspace.name, 'Nome da workspace', 100),
    projectSources,
    environment: validateEnvironment(workspace.environment ?? 'local'),
    nodePolicy: validateNodePolicy(
      workspace.nodePolicy ?? { mode: 'inherit' },
    ),
  };
}

function validateLinkScript(value, label) {
  const script = assertNonEmptyString(value, label, 100);
  if (!script.startsWith('link:')) {
    throw new TypeError(`${label} deve começar com link:.`);
  }
  return script;
}

function validateLocalLibraryLink(value, label) {
  if (value === undefined || value === null) return undefined;
  const library = assertPlainObject(value, label);
  const artifactRelativePath = assertNonEmptyString(
    library.artifactRelativePath,
    `${label}: artefato`,
  );
  if (
    artifactRelativePath.startsWith('/') ||
    /^[a-z]:[\\/]/i.test(artifactRelativePath) ||
    artifactRelativePath.split(/[\\/]/).includes('..')
  ) {
    throw new TypeError(`${label}: o artefato deve ser relativo e seguro.`);
  }
  return {
    enabled: library.enabled === true,
    packageName: assertNonEmptyString(library.packageName, `${label}: pacote`, 214),
    developmentScript: assertNonEmptyString(
      library.developmentScript,
      `${label}: script de desenvolvimento`,
      100,
    ),
    artifactRelativePath,
    preferredLinkScript: validateLinkScript(
      library.preferredLinkScript,
      `${label}: script de vínculo`,
    ),
  };
}

function validateProjectSourceInput(value, index) {
  const source = assertPlainObject(value, `Fonte ${index + 1}`);
  if (!Array.isArray(source.projects) || source.projects.length > 1000) {
    throw new TypeError(`Projetos da fonte ${index + 1} inválidos.`);
  }
  const projects = source.projects.map((project, projectIndex) => {
    const item = assertPlainObject(
      project,
      `Projeto ${projectIndex + 1} da fonte ${index + 1}`,
    );
    const kind = assertNonEmptyString(item.kind, 'Tipo do projeto', 16);
    if (!['project', 'library'].includes(kind)) {
      throw new TypeError('Tipo de projeto inválido.');
    }
    if (kind !== 'library' && item.localLibraryLink) {
      throw new TypeError(
        'Vínculo local só pode ser configurado para uma biblioteca.',
      );
    }
    const kindSource = item.kindSource === 'user' ? 'user' : 'detected';
    return {
      relativePath: assertNonEmptyString(
        item.relativePath,
        'Path relativo do projeto',
        1024,
      ),
      kind,
      kindSource,
      ...(item.localLibraryLink
        ? {
            localLibraryLink: validateLocalLibraryLink(
              item.localLibraryLink,
              'Vínculo local',
            ),
          }
        : {}),
    };
  });
  const relativePaths = projects.map((project) => project.relativePath);
  if (new Set(relativePaths).size !== relativePaths.length) {
    throw new TypeError('Não repita projetos na mesma fonte.');
  }
  return {
    ...(source.id
      ? { id: assertNonEmptyString(source.id, 'ID da fonte', 100) }
      : {}),
    rootPath: assertNonEmptyString(source.rootPath, `Path ${index + 1}`),
    projects,
  };
}

export function validateWorkspaceRequest(value) {
  const request = assertPlainObject(value, 'Solicitação da workspace');
  return {
    workspaceId: assertNonEmptyString(
      request.workspaceId,
      'Workspace',
      100,
    ),
  };
}

export function validateDirectoryPickerRequest(value) {
  if (value === undefined || value === null) return {};
  const request = assertPlainObject(value, 'Seleção de diretório');
  const initialPath = assertOptionalString(
    request.initialPath,
    'Path inicial',
  );
  return initialPath ? { initialPath } : {};
}

export function validateProcessRequest(value) {
  const request = assertPlainObject(value, 'Solicitação de processo');
  return {
    workspaceId: assertNonEmptyString(
      request.workspaceId,
      'Workspace',
      100,
    ),
    projectId: assertNonEmptyString(request.projectId, 'Projeto', 1024),
    script: assertOptionalString(request.script, 'Script', 100),
  };
}

export function validateProjectRequest(value) {
  const request = assertPlainObject(value, 'Solicitação do projeto');
  return {
    workspaceId: assertNonEmptyString(
      request.workspaceId,
      'Workspace',
      100,
    ),
    projectId: assertNonEmptyString(request.projectId, 'Projeto', 1024),
  };
}

export function validateProjectSourceInspectionRequest(value) {
  const request = assertPlainObject(value, 'Inspeção da fonte');
  return {
    rootPath: assertNonEmptyString(
      request.rootPath,
      'Path do projeto',
    ),
    requestId: assertNonEmptyString(
      request.requestId,
      'Identificador da inspeção',
      100,
    ),
  };
}

function validateIdArray(value, label, maxItems) {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new TypeError(`${label} inválidos.`);
  }
  return [...new Set(value.map((item, index) =>
    assertNonEmptyString(item, `${label} ${index + 1}`, 1024)
  ))];
}

export function validateLibraryLinkRequest(value) {
  const request = validateWorkspaceRequest(value);
  const source = assertPlainObject(value, 'Vínculo de bibliotecas');
  const libraryIds = validateIdArray(source.libraryIds, 'Bibliotecas', 25);
  const projectIds = validateIdArray(source.projectIds, 'Projetos', 500);
  return {
    ...request,
    ...(libraryIds ? { libraryIds } : {}),
    ...(projectIds ? { projectIds } : {}),
  };
}

export function validateLocalAddressRequest(value) {
  const request = assertPlainObject(value, 'Endereço local');
  if (
    !Number.isInteger(request.port) ||
    request.port < 1 ||
    request.port > 65535
  ) {
    throw new TypeError('Porta local inválida.');
  }
  return { port: request.port };
}

export function validateClipboardWriteRequest(value) {
  const request = assertPlainObject(value, 'Conteúdo da área de transferência');
  return {
    text: assertNonEmptyString(
      request.text,
      'Texto para copiar',
      5_000_000,
    ),
  };
}

export function validateIdePreference(value) {
  if (value === undefined || value === null) return null;
  const preference = assertPlainObject(value, 'Preferência de IDE');
  return {
    id: assertNonEmptyString(preference.id, 'IDE', 50),
    name: assertNonEmptyString(preference.name, 'Nome da IDE', 100),
    executablePath: assertNonEmptyString(
      preference.executablePath,
      'Executável da IDE',
    ),
  };
}

export function validateDiagnosticExportRequest(value) {
  const request = validateWorkspaceRequest(value);
  const source = assertPlainObject(value, 'Exportação de diagnóstico');
  let entryIds;
  if (source.entryIds !== undefined && source.entryIds !== null) {
    if (!Array.isArray(source.entryIds) || source.entryIds.length > 100000) {
      throw new TypeError('Seleção de logs inválida.');
    }
    entryIds = [...new Set(
      source.entryIds.map((entryId, index) =>
        assertNonEmptyString(entryId, `Log ${index + 1}`, 2048)
      ),
    )];
  }
  return {
    ...request,
    ...(entryIds ? { entryIds } : {}),
    includeAbsolutePaths: source.includeAbsolutePaths === true,
  };
}

export function validateProjectUpdate(value) {
  const update = validateProjectRequest(value);
  if (value.nodePolicy !== undefined) {
    update.nodePolicy = validateNodePolicy(value.nodePolicy);
  }
  if (value.defaultScript !== undefined) {
    update.defaultScript = assertOptionalString(
      value.defaultScript,
      'Script padrão',
      100,
    );
  }
  if (value.libraryLinkScripts !== undefined) {
    const scripts = assertPlainObject(
      value.libraryLinkScripts,
      'Scripts de vínculo',
    );
    update.libraryLinkScripts = Object.fromEntries(
      Object.entries(scripts).map(([libraryId, script]) => [
        assertNonEmptyString(libraryId, 'Biblioteca', 100),
        validateLinkScript(script, 'Script de vínculo'),
      ]),
    );
  }
  if (value.startupOrder !== undefined) {
    if (
      !Number.isInteger(value.startupOrder) ||
      value.startupOrder < 0 ||
      value.startupOrder > 999
    ) {
      throw new TypeError('Ordem de inicialização inválida.');
    }
    update.startupOrder = value.startupOrder;
  }
  return update;
}

export function validateProjectOrderUpdate(value) {
  const request = validateWorkspaceRequest(value);
  const source = assertPlainObject(value, 'Ordenação dos projetos');
  if (!Array.isArray(source.projectIds) || source.projectIds.length > 5000) {
    throw new TypeError('Ordenação dos projetos inválida.');
  }
  const projectIds = source.projectIds.map((projectId, index) =>
    assertNonEmptyString(projectId, `Projeto ${index + 1}`, 1024)
  );
  if (new Set(projectIds).size !== projectIds.length) {
    throw new TypeError('A ordenação contém projetos repetidos.');
  }
  return { ...request, projectIds };
}
