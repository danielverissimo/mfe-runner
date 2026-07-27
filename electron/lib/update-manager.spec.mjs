import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { UpdateManager } from './update-manager.mjs';

class FakeUpdater extends EventEmitter {
  autoDownload = true;
  autoInstallOnAppQuit = true;
  allowPrerelease = true;
  checks = 0;
  downloads = 0;
  installs = 0;

  async checkForUpdates() {
    this.checks += 1;
  }

  async downloadUpdate() {
    this.downloads += 1;
  }

  quitAndInstall() {
    this.installs += 1;
  }
}

test('keeps updates disabled outside an installed application', async () => {
  const updater = new FakeUpdater();
  const manager = new UpdateManager({
    updater,
    appVersion: '0.1.0',
    packaged: false,
  });

  await manager.check();

  assert.equal(manager.snapshot.supported, false);
  assert.equal(manager.snapshot.status, 'disabled');
  assert.equal(updater.checks, 0);
});

test('checks without downloading until the user confirms', async () => {
  const updater = new FakeUpdater();
  const manager = new UpdateManager({
    updater,
    appVersion: '0.1.0',
    packaged: true,
  });
  manager.initialize();

  await manager.check();
  updater.emit('update-available', { version: '0.2.0' });

  assert.equal(updater.autoDownload, false);
  assert.equal(updater.autoInstallOnAppQuit, false);
  assert.equal(updater.checks, 1);
  assert.equal(updater.downloads, 0);
  assert.equal(manager.snapshot.status, 'available');
  assert.equal(manager.snapshot.availableVersion, '0.2.0');
});

test('marks a manual check and reports when no update is available', async () => {
  const updater = new FakeUpdater();
  const manager = new UpdateManager({
    updater,
    appVersion: '0.1.0',
    packaged: true,
  });
  manager.initialize();

  await manager.check({ userInitiated: true });
  assert.equal(manager.snapshot.status, 'checking');
  assert.equal(manager.snapshot.userInitiated, true);
  assert.equal(manager.snapshot.message, 'Buscando atualizações…');

  updater.emit('update-not-available');
  assert.equal(manager.snapshot.status, 'not-available');
  assert.equal(
    manager.snapshot.message,
    'Você já está usando a versão mais recente.',
  );
  assert.ok(manager.snapshot.checkedAt);
});

test('reports progress and installs only after download completion', async () => {
  const updater = new FakeUpdater();
  const manager = new UpdateManager({
    updater,
    appVersion: '0.1.0',
    packaged: true,
  });
  manager.initialize();
  updater.emit('update-available', { version: '0.2.0' });

  await manager.download();
  updater.emit('download-progress', { percent: 54.6 });
  assert.equal(manager.snapshot.status, 'downloading');
  assert.equal(manager.snapshot.progress, 54.6);
  assert.throws(() => manager.quitAndInstall());

  updater.emit('update-downloaded', { version: '0.2.0' });
  manager.quitAndInstall();
  assert.equal(manager.snapshot.status, 'downloaded');
  assert.equal(updater.installs, 1);
});
