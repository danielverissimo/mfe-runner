const { contextBridge, ipcRenderer } = require('electron');

const channels = Object.freeze({
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

function subscribe(channel, callback) {
  if (typeof callback !== 'function') {
    throw new TypeError('O callback do evento deve ser uma função.');
  }
  const listener = (_event, value) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('runnerApi', Object.freeze({
  getSnapshot: () => ipcRenderer.invoke(channels.getSnapshot),
  listNodeVersions: () => ipcRenderer.invoke(channels.listNodeVersions),
  listRuntimeInstallations: (input) =>
    ipcRenderer.invoke(channels.listRuntimeInstallations, input),
  listFlutterDevices: (input) =>
    ipcRenderer.invoke(channels.listFlutterDevices, input),
  listAndroidEmulators: (input) =>
    ipcRenderer.invoke(channels.listAndroidEmulators, input),
  launchAndroidEmulator: (input) =>
    ipcRenderer.invoke(channels.launchAndroidEmulator, input),
  getNgrokStatus: () => ipcRenderer.invoke(channels.getNgrokStatus),
  listNgrokDomains: () => ipcRenderer.invoke(channels.listNgrokDomains),
  createNgrokDomain: (input) =>
    ipcRenderer.invoke(channels.createNgrokDomain, input),
  startNgrokTunnel: (input) =>
    ipcRenderer.invoke(channels.startNgrokTunnel, input),
  stopNgrokTunnel: (input) =>
    ipcRenderer.invoke(channels.stopNgrokTunnel, input),
  openNgrokTunnel: (input) =>
    ipcRenderer.invoke(channels.openNgrokTunnel, input),
  openNgrokResource: (input) =>
    ipcRenderer.invoke(channels.openNgrokResource, input),
  openNgrokConfig: () => ipcRenderer.invoke(channels.openNgrokConfig),
  chooseNgrokExecutable: (input) =>
    ipcRenderer.invoke(channels.chooseNgrokExecutable, input),
  discoverExternalServices: (input) =>
    ipcRenderer.invoke(channels.discoverExternalServices, input),
  chooseExternalLogFile: () =>
    ipcRenderer.invoke(channels.chooseExternalLogFile),
  addExternalService: (input) =>
    ipcRenderer.invoke(channels.addExternalService, input),
  removeExternalService: (input) =>
    ipcRenderer.invoke(channels.removeExternalService, input),
  terminateExternalService: (input) =>
    ipcRenderer.invoke(channels.terminateExternalService, input),
  rebindExternalService: (input) =>
    ipcRenderer.invoke(channels.rebindExternalService, input),
  openExternalServiceAddress: (input) =>
    ipcRenderer.invoke(channels.openExternalServiceAddress, input),
  chooseRuntimePath: (input) =>
    ipcRenderer.invoke(channels.chooseRuntimePath, input),
  openRuntimeDownload: (input) =>
    ipcRenderer.invoke(channels.openRuntimeDownload, input),
  chooseProjectDirectory: (input) =>
    ipcRenderer.invoke(channels.chooseProjectDirectory, input),
  inspectProjectSource: (input) =>
    ipcRenderer.invoke(channels.inspectProjectSource, input),
  reviewWorkspace: (input) =>
    ipcRenderer.invoke(channels.reviewWorkspace, input),
  addWorkspace: (input) => ipcRenderer.invoke(channels.addWorkspace, input),
  updateWorkspace: (input) =>
    ipcRenderer.invoke(channels.updateWorkspace, input),
  removeWorkspace: (input) =>
    ipcRenderer.invoke(channels.removeWorkspace, input),
  startWorkspace: (input) =>
    ipcRenderer.invoke(channels.startWorkspace, input),
  stopWorkspace: (input) =>
    ipcRenderer.invoke(channels.stopWorkspace, input),
  restartWorkspace: (input) =>
    ipcRenderer.invoke(channels.restartWorkspace, input),
  linkLibraries: (input) =>
    ipcRenderer.invoke(channels.linkLibraries, input),
  openLocalAddress: (input) =>
    ipcRenderer.invoke(channels.openLocalAddress, input),
  copyText: (input) => ipcRenderer.invoke(channels.copyText, input),
  listDeveloperTools: () => ipcRenderer.invoke(channels.listDeveloperTools),
  chooseIdeExecutable: (input) =>
    ipcRenderer.invoke(channels.chooseIdeExecutable, input),
  openProjectInIde: (input) =>
    ipcRenderer.invoke(channels.openProjectInIde, input),
  openProjectFolder: (input) =>
    ipcRenderer.invoke(channels.openProjectFolder, input),
  openProjectTerminal: (input) =>
    ipcRenderer.invoke(channels.openProjectTerminal, input),
  refreshWorkspaceGit: (input) =>
    ipcRenderer.invoke(channels.refreshWorkspaceGit, input),
  exportDiagnostics: (input) =>
    ipcRenderer.invoke(channels.exportDiagnostics, input),
  updateSettings: (input) =>
    ipcRenderer.invoke(channels.updateSettings, input),
  updateProject: (input) =>
    ipcRenderer.invoke(channels.updateProject, input),
  updateProjectOrder: (input) =>
    ipcRenderer.invoke(channels.updateProjectOrder, input),
  excludeProject: (input) =>
    ipcRenderer.invoke(channels.excludeProject, input),
  startProject: (input) =>
    ipcRenderer.invoke(channels.startProject, input),
  stopProject: (input) =>
    ipcRenderer.invoke(channels.stopProject, input),
  restartProject: (input) =>
    ipcRenderer.invoke(channels.restartProject, input),
  terminateExternalProcess: (input) =>
    ipcRenderer.invoke(channels.terminateExternalProcess, input),
  clearLogs: (input) => ipcRenderer.invoke(channels.clearLogs, input),
  getUpdateState: () => ipcRenderer.invoke(channels.getUpdateState),
  checkForUpdates: () => ipcRenderer.invoke(channels.checkForUpdates),
  downloadUpdate: () => ipcRenderer.invoke(channels.downloadUpdate),
  installUpdate: () => ipcRenderer.invoke(channels.installUpdate),
  onSnapshot: (callback) => subscribe(channels.snapshotChanged, callback),
  onLog: (callback) => subscribe(channels.logReceived, callback),
  onProjectSourceInspectionProgress: (callback) =>
    subscribe(channels.projectSourceInspectionProgress, callback),
  onUpdateState: (callback) =>
    subscribe(channels.updateStateChanged, callback),
}));
