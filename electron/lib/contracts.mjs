export const IPC_CHANNELS = Object.freeze({
  getSnapshot: 'runner:get-snapshot',
  listNodeVersions: 'runner:list-node-versions',
  listRuntimeInstallations: 'runner:list-runtime-installations',
  listFlutterDevices: 'runner:list-flutter-devices',
  listAndroidEmulators: 'runner:list-android-emulators',
  launchAndroidEmulator: 'runner:launch-android-emulator',
  getNgrokStatus: 'runner:get-ngrok-status',
  listNgrokDomains: 'runner:list-ngrok-domains',
  createNgrokDomain: 'runner:create-ngrok-domain',
  startNgrokTunnel: 'runner:start-ngrok-tunnel',
  stopNgrokTunnel: 'runner:stop-ngrok-tunnel',
  openNgrokTunnel: 'runner:open-ngrok-tunnel',
  openNgrokResource: 'runner:open-ngrok-resource',
  openNgrokConfig: 'runner:open-ngrok-config',
  chooseNgrokExecutable: 'runner:choose-ngrok-executable',
  discoverExternalServices: 'runner:discover-external-services',
  chooseExternalLogFile: 'runner:choose-external-log-file',
  addExternalService: 'runner:add-external-service',
  removeExternalService: 'runner:remove-external-service',
  terminateExternalService: 'runner:terminate-external-service',
  rebindExternalService: 'runner:rebind-external-service',
  openExternalServiceAddress: 'runner:open-external-service-address',
  chooseRuntimePath: 'runner:choose-runtime-path',
  openRuntimeDownload: 'runner:open-runtime-download',
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
export const EXECUTION_POLICY_MODES = NODE_POLICY_MODES;
export const ECOSYSTEM_IDS = new Set([
  'node',
  'java-maven',
  'java-gradle',
  'dotnet',
  'python',
  'rust',
  'go',
  'flutter',
]);
export const EXECUTION_POLICY_COMPONENTS = new Set([
  'runtime',
  'tool',
  'packageManager',
]);
export const ENVIRONMENTS = new Set(['local', 'des', 'hom', 'prod']);
const NGROK_MANAGED_DOMAIN_SUFFIXES = new Set([
  'ngrok.app',
  'ngrok.dev',
  'ngrok.pizza',
  'ngrok.pro',
  'ngrok-free.app',
  'ngrok-free.dev',
  'ngrok.io',
]);

export function validateRuntimeComponentRequest(value) {
  const request = assertPlainObject(value, 'Seleção de runtime');
  const ecosystem = assertNonEmptyString(
    request.ecosystem,
    'Ecossistema',
    32,
  );
  const component = assertNonEmptyString(
    request.component,
    'Componente',
    32,
  );
  if (!ECOSYSTEM_IDS.has(ecosystem)) {
    throw new TypeError(`Ecossistema não suportado: ${ecosystem}.`);
  }
  if (!EXECUTION_POLICY_COMPONENTS.has(component)) {
    throw new TypeError(`Componente não suportado: ${component}.`);
  }
  return { ecosystem, component };
}

export function validateRuntimePathPickerRequest(value) {
  const request = assertPlainObject(value, 'Seletor de runtime');
  return {
    ...validateRuntimeComponentRequest(request),
    initialPath: assertOptionalString(
      request.initialPath,
      'Path inicial',
      4096,
    ),
  };
}

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

export function validateHealthCheck(value) {
  const healthCheck = assertPlainObject(value, 'Health check');
  const type = assertNonEmptyString(healthCheck.type, 'Tipo do health check', 16);
  if (!new Set(['none', 'process', 'tcp', 'http']).has(type)) {
    throw new TypeError(`Tipo de health check não suportado: ${type}.`);
  }
  const port = healthCheck.port === undefined || healthCheck.port === null
    ? undefined
    : Number(healthCheck.port);
  if (
    port !== undefined &&
    (!Number.isInteger(port) || port < 1 || port > 65_535)
  ) {
    throw new TypeError('Porta do health check inválida.');
  }
  const path = assertOptionalString(
    healthCheck.path,
    'Path HTTP do health check',
    256,
  );
  if (path && (!path.startsWith('/') || path.startsWith('//'))) {
    throw new TypeError('O path HTTP do health check deve começar com "/".');
  }
  if ((type === 'tcp' || type === 'http') && port === undefined) {
    throw new TypeError('Informe a porta do health check.');
  }
  return {
    type,
    ...(port !== undefined ? { port } : {}),
    ...(type === 'http' && path ? { path } : {}),
  };
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

export function validateSelectionPolicy(
  value,
  { allowInherit = true, label = 'Política de execução' } = {},
) {
  const policy = assertPlainObject(value, label);
  const mode = assertNonEmptyString(policy.mode, `${label}: modo`, 16);
  if (
    !EXECUTION_POLICY_MODES.has(mode) ||
    (!allowInherit && mode === 'inherit')
  ) {
    throw new TypeError(`Modo de execução não suportado: ${mode}.`);
  }
  const version = assertOptionalString(
    policy.version,
    `${label}: versão`,
    128,
  );
  const executablePath = assertOptionalString(
    policy.path,
    `${label}: path`,
  );
  if (mode === 'explicit' && !version && !executablePath) {
    throw new TypeError(
      `${label}: informe uma versão ou executável para a seleção explícita.`,
    );
  }
  return {
    mode,
    ...(version ? { version } : {}),
    ...(executablePath ? { path: executablePath } : {}),
  };
}

export function validateExecutionPolicies(
  value,
  { allowInherit = true } = {},
) {
  if (value === undefined || value === null) return {};
  const policies = assertPlainObject(value, 'Políticas de execução');
  return Object.fromEntries(
    Object.entries(policies).map(([ecosystem, components]) => {
      if (!ECOSYSTEM_IDS.has(ecosystem)) {
        throw new TypeError(`Ecossistema não suportado: ${ecosystem}.`);
      }
      const source = assertPlainObject(
        components,
        `Políticas de ${ecosystem}`,
      );
      const validated = Object.fromEntries(
        Object.entries(source).map(([component, policy]) => {
          if (!EXECUTION_POLICY_COMPONENTS.has(component)) {
            throw new TypeError(
              `Componente de execução não suportado: ${component}.`,
            );
          }
          return [
            component,
            validateSelectionPolicy(policy, {
              allowInherit,
              label: `${ecosystem}/${component}`,
            }),
          ];
        }),
      );
      return [ecosystem, validated];
    }),
  );
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
  const validated = {
    name: assertNonEmptyString(workspace.name, 'Nome da workspace', 100),
    projectSources,
    environment: validateEnvironment(workspace.environment ?? 'local'),
    nodePolicy: validateNodePolicy(
      workspace.nodePolicy ?? { mode: 'inherit' },
    ),
  };
  if (workspace.executionPolicies !== undefined) {
    validated.executionPolicies = validateExecutionPolicies(
      workspace.executionPolicies,
    );
  }
  return validated;
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

function validatePort(value, label = 'Porta') {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new TypeError(`${label} inválida.`);
  }
  return port;
}

export function validateExternalServiceHost(value) {
  const host = assertNonEmptyString(value, 'Host do serviço externo', 253)
    .toLowerCase();
  if (
    host.includes('/') ||
    host.includes('\\') ||
    host.includes('@') ||
    host.includes('://') ||
    /\s/.test(host) ||
    (!/^\[[0-9a-f:.]+\]$/i.test(host) &&
      !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host))
  ) {
    throw new TypeError('Host do serviço externo inválido.');
  }
  return host;
}

export function validateExternalServiceConfig(value) {
  const service = assertPlainObject(value, 'Serviço externo');
  const id = assertNonEmptyString(service.id, 'ID do serviço externo', 128);
  if (!id.startsWith('external-service:')) {
    throw new TypeError('ID do serviço externo inválido.');
  }
  const scheme = assertNonEmptyString(service.scheme, 'Protocolo', 8);
  if (!new Set(['http', 'https']).has(scheme)) {
    throw new TypeError(`Protocolo externo não suportado: ${scheme}.`);
  }
  const provider = assertNonEmptyString(service.provider, 'Origem externa', 16);
  if (!new Set(['process', 'docker']).has(provider)) {
    throw new TypeError(`Origem externa não suportada: ${provider}.`);
  }
  const logSourceValue = service.logSource ?? { type: 'none' };
  const logSource = assertPlainObject(logSourceValue, 'Fonte de logs externa');
  const logType = assertNonEmptyString(logSource.type, 'Tipo de log externo', 16);
  if (!new Set(['none', 'file', 'docker']).has(logType)) {
    throw new TypeError(`Tipo de log externo não suportado: ${logType}.`);
  }
  if (provider === 'docker' && logType !== 'docker') {
    throw new TypeError('Containers Docker devem usar a fonte de logs Docker.');
  }
  if (provider !== 'docker' && logType === 'docker') {
    throw new TypeError('Logs Docker exigem um container Docker.');
  }
  const filePath = logType === 'file'
    ? assertNonEmptyString(logSource.filePath, 'Arquivo de log externo', 4096)
    : undefined;
  const identityValue = service.identity ?? {};
  const identity = assertPlainObject(identityValue, 'Identidade externa');
  const pid = identity.pid === undefined || identity.pid === null
    ? undefined
    : Number(identity.pid);
  if (pid !== undefined && (!Number.isInteger(pid) || pid <= 1)) {
    throw new TypeError('PID externo inválido.');
  }
  const containerId = assertOptionalString(
    identity.containerId,
    'Container Docker',
    128,
  );
  if (provider === 'docker' && !containerId) {
    throw new TypeError('Informe a identidade do container Docker.');
  }
  const identityName = assertOptionalString(identity.name, 'Nome da identidade', 200);
  const image = assertOptionalString(identity.image, 'Imagem Docker', 500);
  return {
    id,
    name: assertNonEmptyString(service.name, 'Nome do serviço externo', 100),
    scheme,
    host: validateExternalServiceHost(service.host),
    port: validatePort(service.port, 'Porta do serviço externo'),
    provider,
    identity: {
      ...(pid ? { pid } : {}),
      ...(containerId ? { containerId } : {}),
      ...(identityName ? { name: identityName } : {}),
      ...(image ? { image } : {}),
    },
    logSource: {
      type: logType,
      ...(filePath ? { filePath } : {}),
    },
  };
}

export function validateExternalServiceCreateRequest(value) {
  const request = validateWorkspaceRequest(value);
  const source = assertPlainObject(value, 'Cadastro do serviço externo');
  const scheme = assertNonEmptyString(source.scheme, 'Protocolo', 8);
  if (!new Set(['http', 'https']).has(scheme)) {
    throw new TypeError(`Protocolo externo não suportado: ${scheme}.`);
  }
  const candidateId = assertOptionalString(
    source.candidateId,
    'Candidato externo',
    300,
  );
  if (candidateId && !/^(?:process|docker):[a-z0-9_.:-]+$/i.test(candidateId)) {
    throw new TypeError('Candidato externo inválido.');
  }
  const logFilePath = assertOptionalString(
    source.logFilePath,
    'Arquivo de log externo',
    4096,
  );
  return {
    ...request,
    name: assertNonEmptyString(source.name, 'Nome do serviço externo', 100),
    scheme,
    host: validateExternalServiceHost(source.host),
    port: validatePort(source.port, 'Porta do serviço externo'),
    ...(candidateId ? { candidateId } : {}),
    ...(logFilePath ? { logFilePath } : {}),
  };
}

export function validateExternalServiceRequest(value) {
  const request = validateWorkspaceRequest(value);
  const source = assertPlainObject(value, 'Solicitação do serviço externo');
  const serviceId = assertNonEmptyString(
    source.serviceId,
    'Serviço externo',
    128,
  );
  if (!serviceId.startsWith('external-service:')) {
    throw new TypeError('Serviço externo inválido.');
  }
  return {
    ...request,
    serviceId,
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
  const commandId = assertOptionalString(request.commandId, 'Comando', 160);
  const script = assertOptionalString(request.script, 'Script', 100);
  const flutterTarget = request.flutterTarget === undefined
    ? undefined
    : validateFlutterTarget(request.flutterTarget);
  return {
    workspaceId: assertNonEmptyString(
      request.workspaceId,
      'Workspace',
      100,
    ),
    projectId: assertNonEmptyString(request.projectId, 'Projeto', 1024),
    ...(commandId ? { commandId } : {}),
    ...(script ? { script } : {}),
    ...(flutterTarget ? { flutterTarget } : {}),
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

export function validateNgrokPreference(value) {
  if (value === undefined || value === null) {
    return { executablePath: null };
  }
  const preference = assertPlainObject(value, 'Configuração do ngrok');
  return {
    executablePath: assertOptionalString(
      preference.executablePath,
      'Executável do ngrok',
      4096,
    ) ?? null,
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
  if (value.executionPolicies !== undefined) {
    update.executionPolicies = validateExecutionPolicies(
      value.executionPolicies,
    );
  }
  if (value.healthCheck !== undefined) {
    update.healthCheck = validateHealthCheck(value.healthCheck);
  }
  if (value.flutterTarget !== undefined) {
    update.flutterTarget = validateFlutterTarget(value.flutterTarget);
  }
  if (value.defaultCommandId !== undefined) {
    update.defaultCommandId = assertOptionalString(
      value.defaultCommandId,
      'Comando padrão',
      160,
    );
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

export function validateFlutterTarget(value) {
  if (value === undefined || value === null) return null;
  const target = assertPlainObject(value, 'Alvo Flutter');
  const platform = assertNonEmptyString(target.platform, 'Plataforma Flutter', 16);
  if (!new Set(['web', 'android', 'ios']).has(platform)) {
    throw new TypeError(`Plataforma Flutter não suportada: ${platform}.`);
  }
  const deviceId = assertOptionalString(target.deviceId, 'Device Flutter', 256);
  const deviceName = assertOptionalString(target.deviceName, 'Nome do device Flutter', 256);
  return {
    platform,
    ...(deviceId ? { deviceId } : {}),
    ...(deviceName ? { deviceName } : {}),
  };
}

export function validateAndroidEmulatorRequest(value) {
  const request = validateProjectRequest(value);
  const source = assertPlainObject(value, 'Android Virtual Device');
  return {
    ...request,
    emulatorId: assertNonEmptyString(
      source.emulatorId,
      'Android Virtual Device',
      256,
    ),
  };
}

export function validateNgrokDomainCreateRequest(value) {
  const request = assertPlainObject(value, 'Criação de domínio ngrok');
  const name = assertNonEmptyString(
    request.name,
    'Nome do domínio ngrok',
    63,
  ).toLowerCase();
  const suffix = assertNonEmptyString(
    request.suffix,
    'Opção de domínio ngrok',
    32,
  ).toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(name)) {
    throw new TypeError(
      'Nome do domínio ngrok inválido. Informe somente letras, números ou hífen.',
    );
  }
  if (!NGROK_MANAGED_DOMAIN_SUFFIXES.has(suffix)) {
    throw new TypeError('Opção de domínio ngrok não suportada.');
  }
  return {
    name,
    suffix,
    description: assertOptionalString(
      request.description,
      'Descrição do domínio ngrok',
      255,
    ) ?? '',
  };
}

export function validateNgrokTunnelRequest(value) {
  const request = validateProjectRequest(value);
  const source = assertPlainObject(value, 'Túnel ngrok');
  return {
    ...request,
    domainId: assertNonEmptyString(source.domainId, 'Domínio ngrok', 100),
    domain: assertNonEmptyString(source.domain, 'Hostname ngrok', 253),
  };
}

export function validateNgrokResourceRequest(value) {
  const request = assertPlainObject(value, 'Recurso ngrok');
  const resource = assertNonEmptyString(request.resource, 'Recurso ngrok', 32);
  if (!new Set(['install', 'authtoken', 'apiKey', 'domains']).has(resource)) {
    throw new TypeError(`Recurso ngrok não suportado: ${resource}.`);
  }
  return { resource };
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
