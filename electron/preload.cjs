const { contextBridge, ipcRenderer } = require('electron');

const channels = Object.freeze({
  getSnapshot: 'runner:get-snapshot',
  listNodeVersions: 'runner:list-node-versions',
  chooseShellDirectory: 'runner:choose-shell-directory',
  chooseMfeDirectory: 'runner:choose-mfe-directory',
  chooseLibraryDirectory: 'runner:choose-library-directory',
  inspectLibraryDirectory: 'runner:inspect-library-directory',
  addWorkspace: 'runner:add-workspace',
  updateWorkspace: 'runner:update-workspace',
  removeWorkspace: 'runner:remove-workspace',
  refreshWorkspace: 'runner:refresh-workspace',
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
  chooseShellDirectory: (input) =>
    ipcRenderer.invoke(channels.chooseShellDirectory, input),
  chooseMfeDirectory: (input) =>
    ipcRenderer.invoke(channels.chooseMfeDirectory, input),
  chooseLibraryDirectory: (input) =>
    ipcRenderer.invoke(channels.chooseLibraryDirectory, input),
  inspectLibraryDirectory: (input) =>
    ipcRenderer.invoke(channels.inspectLibraryDirectory, input),
  addWorkspace: (input) => ipcRenderer.invoke(channels.addWorkspace, input),
  updateWorkspace: (input) =>
    ipcRenderer.invoke(channels.updateWorkspace, input),
  removeWorkspace: (input) =>
    ipcRenderer.invoke(channels.removeWorkspace, input),
  refreshWorkspace: (input) =>
    ipcRenderer.invoke(channels.refreshWorkspace, input),
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
  onUpdateState: (callback) =>
    subscribe(channels.updateStateChanged, callback),
}));
