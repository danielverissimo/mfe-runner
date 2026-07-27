import assert from 'node:assert/strict';
import test from 'node:test';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  developerToolsInternals,
  listDeveloperTools,
} from './developer-tools.mjs';

test('keeps a configured executable without accepting command templates', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mfe-runner-ide-'));
  const executablePath = path.join(directory, 'custom-ide');
  try {
    await writeFile(executablePath, '#!/bin/sh\nexit 0\n');
    await chmod(executablePath, 0o700);
    const catalog = await listDeveloperTools({
      ide: {
        id: 'custom',
        name: 'Custom IDE',
        executablePath,
        command: 'ignored',
      },
    });
    const custom = catalog.ideApplications.find((item) => item.id === 'custom');
    assert.equal(custom?.executablePath, executablePath);
    assert.equal(catalog.selectedIdeId, 'custom');
    assert.equal('command' in custom, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('uses a fixed argument adapter for the macOS terminal', async () => {
  const terminal = await developerToolsInternals.terminalForPlatform('darwin');
  assert.equal(terminal.executablePath, '/usr/bin/open');
  assert.deepEqual(terminal.argsFor('/workspace/project'), [
    '-a',
    'Terminal',
    '/workspace/project',
  ]);
});
