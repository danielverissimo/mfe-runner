import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

export const APP_ICON_PATH = path.resolve(
  currentDirectory,
  '..',
  'assets',
  'app-icon.png',
);

export const LINUX_ICON_DIRECTORY = path.resolve(
  currentDirectory,
  '..',
  'assets',
  'linux-icons',
);

export function applyApplicationIcon(
  electronApp,
  { platform = process.platform } = {},
) {
  if (platform === 'darwin' && electronApp.dock) {
    electronApp.dock.setIcon(APP_ICON_PATH);
  }
}
