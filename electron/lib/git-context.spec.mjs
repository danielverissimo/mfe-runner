import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  collectGitContext,
  enrichProjectsWithGit,
  parseGitStatus,
} from './git-context.mjs';

const execFileAsync = promisify(execFile);

test('parses porcelain v2 branch, upstream and changed files', () => {
  const context = parseGitStatus(
    '# branch.oid abcdef1234567890\0' +
    '# branch.head feature/logs\0' +
    '# branch.upstream origin/feature/logs\0' +
    '# branch.ab +2 -3\0' +
    '1 .M N... 100644 100644 100644 abc def file.ts\0' +
    '? new.ts\0',
  );
  assert.equal(context.branch, 'feature/logs');
  assert.equal(context.commit, 'abcdef123456');
  assert.equal(context.changedFiles, 2);
  assert.equal(context.dirty, true);
  assert.equal(context.ahead, 2);
  assert.equal(context.behind, 3);
});

test('reads local Git state without changing the repository', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mfe-runner-git-'));
  try {
    await execFileAsync('git', ['init', '-b', 'feature/logs'], { cwd: directory });
    await execFileAsync('git', ['config', 'user.name', 'MFE Runner Test'], {
      cwd: directory,
    });
    await execFileAsync('git', ['config', 'user.email', 'runner@example.invalid'], {
      cwd: directory,
    });
    await writeFile(path.join(directory, 'file.txt'), 'initial\n');
    await execFileAsync('git', ['add', 'file.txt'], { cwd: directory });
    await execFileAsync('git', ['commit', '-m', 'initial'], { cwd: directory });
    await writeFile(path.join(directory, 'file.txt'), 'changed\n');

    const context = await collectGitContext(directory);

    assert.equal(context.repository, true);
    assert.equal(context.branch, 'feature/logs');
    assert.equal(context.dirty, true);
    assert.equal(context.changedFiles, 1);
    assert.match(context.commit, /^[a-f0-9]{12}$/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('keeps branch compatibility unavailable without a shell repository', async () => {
  const enriched = await enrichProjectsWithGit([
    { id: 'shell', role: 'shell', absolutePath: '/missing/shell' },
    { id: 'mfe', role: 'mfe', absolutePath: '/missing/mfe' },
  ]);
  assert.equal(enriched[0].git.repository, false);
  assert.equal(enriched[1].git.compatibleWithShell, null);
});
