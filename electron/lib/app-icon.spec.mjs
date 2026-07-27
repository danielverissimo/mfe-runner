import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  APP_ICON_PATH,
  LINUX_ICON_DIRECTORY,
  applyApplicationIcon,
} from './app-icon.mjs';

const linuxIconSizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];

test('ships a PNG application icon for native Electron surfaces', async () => {
  const bytes = await readFile(APP_ICON_PATH);

  assert.equal(path.basename(APP_ICON_PATH), 'app-icon.png');
  assert.deepEqual(
    [...bytes.subarray(0, 8)],
    [137, 80, 78, 71, 13, 10, 26, 10],
  );
});

test('ships the standard Linux icon theme sizes', async () => {
  await Promise.all(linuxIconSizes.map(async (size) => {
    const iconPath = path.join(
      LINUX_ICON_DIRECTORY,
      `${size}x${size}.png`,
    );
    const bytes = await readFile(iconPath);

    assert.deepEqual(
      [...bytes.subarray(0, 8)],
      [137, 80, 78, 71, 13, 10, 26, 10],
    );
    assert.equal(bytes.readUInt32BE(16), size);
    assert.equal(bytes.readUInt32BE(20), size);
  }));
});

test('applies the application icon to the macOS Dock', () => {
  let receivedPath = null;
  applyApplicationIcon({
    dock: {
      setIcon(iconPath) {
        receivedPath = iconPath;
      },
    },
  }, { platform: 'darwin' });

  assert.equal(receivedPath, APP_ICON_PATH);
});

test('does not access Dock APIs on other platforms', () => {
  let called = false;
  applyApplicationIcon({
    dock: {
      setIcon() {
        called = true;
      },
    },
  }, { platform: 'win32' });

  assert.equal(called, false);
});
