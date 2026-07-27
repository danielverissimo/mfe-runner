import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  classifyLogLevel,
  ProcessSupervisor,
  __test__,
} from './process-supervisor.mjs';

test('redacts common secret formats before logs reach the renderer', () => {
  assert.equal(
    __test__.redactLog(
      'Authorization: Bearer abc.def token=my-token password:super-secret',
    ),
    'Authorization: Bearer [REDACTED] token=[REDACTED] password:[REDACTED]',
  );
});

test('classifies log levels independently from their output stream', () => {
  assert.equal(classifyLogLevel('stdout', 'INFO ready'), 'info');
  assert.equal(classifyLogLevel('stderr', 'WARN deprecated option'), 'warning');
  assert.equal(classifyLogLevel('stdout', 'Fatal error while building'), 'error');
});

test('buffers partial stdout chunks without losing line boundaries', () => {
  const first = __test__.splitBufferedLines('', Buffer.from('first\npart'));
  assert.deepEqual(first.lines, ['first']);
  assert.equal(first.remainder, 'part');

  const second = __test__.splitBufferedLines(
    first.remainder,
    Buffer.from('ial\nlast\n'),
  );
  assert.deepEqual(second.lines, ['partial', 'last']);
  assert.equal(second.remainder, '');
});

test('uses the correct health endpoint for native and classic remotes', () => {
  assert.equal(
    __test__.healthPathFor({ role: 'mfe', registrations: [] }),
    '/remoteEntry.json',
  );
  assert.equal(
    __test__.healthPathFor({
      role: 'mfe',
      registrations: [{ type: 'module-federation' }],
    }),
    '/remoteEntry.js',
  );
  assert.equal(__test__.healthPathFor({ role: 'shell' }), '/');
});

test('invokes npm.cmd through Node on Windows without enabling a shell', () => {
  const nodeDirectory = path.join('C:', 'nvm', 'v24.15.0');
  const invocation = __test__.npmInvocation(
    {
      nodeExecutable: path.join(nodeDirectory, 'node.exe'),
      npmExecutable: path.join(nodeDirectory, 'npm.cmd'),
    },
    ['run', 'start'],
    'win32',
  );

  assert.equal(invocation.command, path.join(nodeDirectory, 'node.exe'));
  assert.deepEqual(invocation.args, [
    path.join(nodeDirectory, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    'run',
    'start',
  ]);
});

test('starts only a declared package script and captures its output', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mfe-runner-process-'));
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, 'package.json'),
    JSON.stringify({
      name: 'safe-process',
      scripts: {
        verify: 'node -e "console.log(\'runner-ready\')"',
      },
    }),
  );
  const supervisor = new ProcessSupervisor({ logLimit: 50 });
  await supervisor.start({
    workspace: { id: 'workspace', name: 'Workspace', environment: 'local' },
    project: {
      id: 'project',
      name: 'safe-process',
      absolutePath: directory,
      role: 'application',
      scripts: {
        verify: 'node -e "console.log(\'runner-ready\')"',
      },
      defaultScript: 'verify',
      port: null,
      registrations: [],
      node: {
        available: true,
        npmExecutable: process.platform === 'win32' ? 'npm.cmd' : 'npm',
        binDirectory: path.dirname(process.execPath),
      },
    },
    script: 'verify',
  });

  await new Promise((resolve) => setTimeout(resolve, 900));
  const [record] = supervisor.snapshot();
  assert.equal(record.workspaceId, 'workspace');
  assert.equal(record.status, 'stopped');
  assert.equal(
    record.logs.some((entry) => entry.message.includes('runner-ready')),
    true,
  );
});

test('marks a confirmed external conflict as resolved', async () => {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const supervisor = new ProcessSupervisor({ logLimit: 50 });
  try {
    await assert.rejects(
      supervisor.start({
        workspace: { id: 'workspace', name: 'Workspace', environment: 'local' },
        project: {
          id: 'project',
          name: 'conflicted-project',
          absolutePath: process.cwd(),
          role: 'mfe',
          scripts: { start: 'node server.js' },
          defaultScript: 'start',
          port,
          registrations: [],
          node: {
            available: true,
            npmExecutable: 'npm',
            binDirectory: path.dirname(process.execPath),
          },
        },
        script: 'start',
      }),
      /ocupada por um processo externo/,
    );

    supervisor.resolveExternalConflict(
      'workspace',
      'project',
      `Processo externo encerrado; porta ${port} liberada.`,
    );
    const [record] = supervisor.snapshot();
    assert.equal(record.status, 'stopped');
    assert.match(record.message, /porta .* liberada/);
    assert.equal(record.logs.at(-1).stream, 'system');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('one-shot tasks reject every command outside declared link scripts', async () => {
  const supervisor = new ProcessSupervisor({ logLimit: 50 });
  await assert.rejects(
    supervisor.runTask({
      workspace: { id: 'workspace', name: 'Workspace', environment: 'local' },
      project: {
        id: 'project',
        name: 'consumer',
        absolutePath: process.cwd(),
        scripts: { postinstall: 'node unsafe.js' },
        node: {
          available: true,
          npmExecutable: 'npm',
          binDirectory: path.dirname(process.execPath),
        },
      },
      script: 'postinstall',
    }),
    /Script de vínculo não disponível/,
  );
});

test('one-shot link tasks expose a dedicated linking state until completion', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mfe-runner-link-task-'));
  await writeFile(
    path.join(directory, 'package.json'),
    JSON.stringify({
      name: 'link-consumer',
      scripts: {
        'link:verify':
          'node -e "setTimeout(() => console.log(\'linked\'), 100)"',
      },
    }),
  );
  const supervisor = new ProcessSupervisor({ logLimit: 50 });
  const statuses = [];
  supervisor.on('snapshot', (records) => {
    if (records[0]) statuses.push(records[0].status);
  });

  await supervisor.runTask({
    workspace: {
      id: 'workspace',
      name: 'Workspace',
      environment: 'local',
    },
    project: {
      id: 'consumer',
      name: 'link-consumer',
      absolutePath: directory,
      port: null,
      scripts: {
        'link:verify':
          'node -e "setTimeout(() => console.log(\'linked\'), 100)"',
      },
      node: {
        available: true,
        npmExecutable: process.platform === 'win32' ? 'npm.cmd' : 'npm',
        binDirectory: path.dirname(process.execPath),
      },
    },
    script: 'link:verify',
    label: 'Vínculo com biblioteca',
  });

  assert.equal(statuses.includes('linking'), true);
  assert.equal(supervisor.snapshot()[0].status, 'stopped');
});
