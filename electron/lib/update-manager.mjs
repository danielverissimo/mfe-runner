import { EventEmitter } from 'node:events';

function safeVersion(info) {
  return typeof info?.version === 'string' && info.version.trim()
    ? info.version.trim()
    : null;
}

export class UpdateManager extends EventEmitter {
  #updater;
  #packaged;
  #initialized = false;
  #state;

  constructor({ updater, appVersion, packaged }) {
    super();
    this.#updater = updater;
    this.#packaged = packaged;
    this.#state = {
      supported: packaged,
      userInitiated: false,
      status: packaged ? 'idle' : 'disabled',
      currentVersion: appVersion,
      availableVersion: null,
      progress: null,
      checkedAt: null,
      message: packaged
        ? 'Pronto para buscar atualizações.'
        : 'Atualizações são verificadas somente no aplicativo instalado.',
    };
  }

  get snapshot() {
    return structuredClone(this.#state);
  }

  initialize() {
    if (this.#initialized || !this.#packaged) return;
    this.#initialized = true;
    this.#updater.autoDownload = false;
    this.#updater.autoInstallOnAppQuit = false;
    this.#updater.allowPrerelease = false;

    this.#updater.on('checking-for-update', () => {
      this.#setState({
        status: 'checking',
        progress: null,
        message: 'Buscando atualizações…',
      });
    });
    this.#updater.on('update-available', (info) => {
      const version = safeVersion(info);
      this.#setState({
        status: 'available',
        availableVersion: version,
        progress: null,
        checkedAt: new Date().toISOString(),
        message: version
          ? `A versão ${version} está disponível.`
          : 'Uma nova versão está disponível.',
      });
    });
    this.#updater.on('update-not-available', () => {
      this.#setState({
        status: 'not-available',
        availableVersion: null,
        progress: null,
        checkedAt: new Date().toISOString(),
        message: 'Você já está usando a versão mais recente.',
      });
    });
    this.#updater.on('download-progress', (progress) => {
      const percent = Number.isFinite(progress?.percent)
        ? Math.min(Math.max(progress.percent, 0), 100)
        : 0;
      this.#setState({
        status: 'downloading',
        progress: percent,
        message: `Baixando atualização… ${Math.round(percent)}%`,
      });
    });
    this.#updater.on('update-downloaded', (info) => {
      const version = safeVersion(info) ?? this.#state.availableVersion;
      this.#setState({
        status: 'downloaded',
        availableVersion: version,
        progress: 100,
        message: 'Atualização pronta para instalar.',
      });
    });
    this.#updater.on('error', (error) => {
      this.#setState({
        status: 'error',
        progress: null,
        checkedAt: new Date().toISOString(),
        message: error instanceof Error
          ? error.message
          : 'Não foi possível verificar atualizações.',
      });
    });
  }

  async check({ userInitiated = false } = {}) {
    if (!this.#packaged) return this.snapshot;
    this.initialize();
    if (['checking', 'downloading'].includes(this.#state.status)) {
      if (userInitiated && !this.#state.userInitiated) {
        this.#setState({ userInitiated: true });
      }
      return this.snapshot;
    }
    try {
      this.#setState({
        userInitiated,
        status: 'checking',
        progress: null,
        message: 'Buscando atualizações…',
      });
      await this.#updater.checkForUpdates();
    } catch (error) {
      this.#setState({
        status: 'error',
        progress: null,
        checkedAt: new Date().toISOString(),
        message: error instanceof Error
          ? error.message
          : 'Não foi possível verificar atualizações.',
      });
    }
    return this.snapshot;
  }

  async download() {
    if (this.#state.status !== 'available') {
      throw new Error('Nenhuma atualização está disponível para download.');
    }
    try {
      this.#setState({
        status: 'downloading',
        progress: 0,
        message: 'Iniciando o download da atualização…',
      });
      await this.#updater.downloadUpdate();
    } catch (error) {
      this.#setState({
        status: 'error',
        progress: null,
        message: error instanceof Error
          ? error.message
          : 'Não foi possível baixar a atualização.',
      });
      throw error;
    }
    return this.snapshot;
  }

  quitAndInstall() {
    if (this.#state.status !== 'downloaded') {
      throw new Error('A atualização ainda não está pronta para instalar.');
    }
    this.#updater.quitAndInstall(false, true);
  }

  #setState(partial) {
    this.#state = { ...this.#state, ...partial };
    this.emit('state', this.snapshot);
  }
}
