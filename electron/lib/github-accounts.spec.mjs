import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  githubCliCandidates, listGitHubAccounts, normalizeGitHubAccounts, resolveGitHubCli,
} from './github-accounts.mjs';

test('resolves gh from absolute PATH entries and platform-specific installation directories', () => {
  assert.deepEqual(githubCliCandidates({
    platform: 'darwin', environment: { PATH: '.:/custom/bin::/opt/homebrew/bin' }, homeDirectory: '/home/test',
  }), ['/custom/bin/gh', '/opt/homebrew/bin/gh', '/usr/local/bin/gh', '/usr/bin/gh']);
  assert.deepEqual(githubCliCandidates({
    platform: 'win32', homeDirectory: 'C:\\Users\\test',
    environment: { PATH: 'C:\\tools', ProgramFiles: 'C:\\Program Files', LOCALAPPDATA: 'C:\\local' },
  }), ['C:\\tools\\gh.exe', 'C:\\Program Files\\GitHub CLI\\gh.exe', 'C:\\local\\Programs\\GitHub CLI\\gh.exe', 'C:\\Users\\test\\scoop\\shims\\gh.exe']);
  assert.ok(githubCliCandidates({ platform: 'linux', environment: {}, homeDirectory: '/home/test' }).includes('/home/test/.local/bin/gh'));
});

test('requires a regular executable when resolving the installed CLI', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'runner-github-accounts-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = path.join(root, 'gh');
  await mkdir(directory);
  const options = { platform: 'test', environment: { PATH: root } };
  assert.equal(await resolveGitHubCli(options), null);
  await rm(directory, { recursive: true });
  await writeFile(directory, '', { mode: 0o700 });
  assert.equal(await resolveGitHubCli(options), directory);
});

test('returns only public account fields, merges duplicate logins and rejects malformed accounts', () => {
  assert.deepEqual(normalizeGitHubAccounts(JSON.stringify([
    { login: 'work-user', active: false, state: 'success', credentialMetadata: 'must-not-cross' },
    { login: 'WORK-USER', active: true, state: 'error' },
    { login: 'personal-user', state: 'unexpected-state' },
    { login: '--help', state: 'success' },
    { login: 'invalid;command', state: 'success' }, null,
  ])), [
    { login: 'personal-user', active: false, state: 'unknown' },
    { login: 'work-user', active: true, state: 'success' },
  ]);
});

test('lists computer accounts with bounded fixed arguments and no account switch or token request', async () => {
  const calls = [];
  const result = await listGitHubAccounts({
    environment: { PATH: '/tools' },
    resolveExecutable: async () => '/tools/gh',
    execFile: async (...args) => {
      calls.push(args);
      return { stdout: '[{"login":"example-user","active":true,"state":"success","privateField":"must-not-cross"}]' };
    },
  });
  assert.deepEqual(result, {
    available: true, accounts: [{ login: 'example-user', active: true, state: 'success' }], message: null,
  });
  assert.equal(calls.length, 1);
  const [executable, args, options] = calls[0];
  assert.equal(executable, '/tools/gh');
  assert.deepEqual(args.slice(0, 7), ['auth', 'status', '--hostname', 'github.com', '--json', 'hosts', '--jq']);
  assert.equal(args[7], '.hosts["github.com"] // [] | map({login, active, state})');
  assert.equal(options.shell, false);
  assert.equal(options.windowsHide, true);
  assert.equal(options.timeout, 15000);
  assert.equal(options.maxBuffer, 1024 * 1024);
  assert.equal(options.env.GH_PROMPT_DISABLED, '1');
});

test('reports a missing CLI and an empty account list separately without exposing diagnostics', async () => {
  const missing = await listGitHubAccounts({ resolveExecutable: async () => null });
  assert.equal(missing.available, false);
  assert.match(missing.message, /não encontrado/);
  const empty = await listGitHubAccounts({
    resolveExecutable: async () => '/tools/gh', execFile: async () => ({ stdout: '[]' }),
  });
  assert.equal(empty.available, true);
  assert.deepEqual(empty.accounts, []);
  assert.match(empty.message, /gh auth login/);
});

test('normalizes unsupported JSON, malformed output, timeouts and CLI failures without leaking output', async () => {
  for (const execFile of [
    async () => ({ stdout: 'invalid sensitive output' }),
    async () => ({ stdout: '{}' }),
    async () => { throw Object.assign(new Error('private diagnostic'), { stdout: 'private stdout', stderr: 'private stderr', killed: true }); },
  ]) {
    const result = await listGitHubAccounts({ resolveExecutable: async () => '/tools/gh', execFile });
    assert.deepEqual(result, {
      available: false, accounts: [],
      message: 'Não foi possível listar as contas do GitHub CLI. Verifique o gh e tente novamente.',
    });
  }
});
