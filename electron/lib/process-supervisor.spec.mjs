import assert from 'node:assert/strict';
import { spawn as spawnChild } from 'node:child_process';
import { appendFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
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

test('assigns a controlled loopback port to Flutter Web launches', async () => {
  const launch = await __test__.prepareLaunchSpecification({
    executable: '/opt/flutter/bin/flutter',
    args: ['run', '-d', 'chrome'],
    port: null,
    healthCheck: { type: 'process' },
    portStrategy: 'flutter-web',
  }, async () => 49321);

  assert.equal(launch.port, 49321);
  assert.deepEqual(launch.args, [
    'run',
    '-d',
    'chrome',
    '--web-hostname',
    '127.0.0.1',
    '--web-port',
    '49321',
  ]);
  assert.deepEqual(launch.healthCheck, {
    type: 'tcp',
    host: '127.0.0.1',
    port: 49321,
  });
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

test('accepts only the fixed ngrok HTTP launch shape', () => {
  const launch = {
    executablePath: path.resolve('/tools/ngrok'),
    args: [
      'http', '4200',
      '--url', 'https://app.example.com',
      '--config', path.resolve('/tmp/ngrok.yml'),
      '--log', 'stdout',
      '--log-format', 'json',
      '--log-level', 'info',
    ],
    upstream: '4200',
    domainId: 'rd_123',
    domain: 'app.example.com',
    publicUrl: 'https://app.example.com',
    cwd: path.resolve('/tmp/project'),
    env: { PATH: process.env.PATH },
  };
  assert.deepEqual(__test__.validateNgrokLaunchSpecification(launch).args, launch.args);
  assert.throws(
    () => __test__.validateNgrokLaunchSpecification({
      ...launch,
      args: ['tcp', '22', '--url', launch.publicUrl, ...launch.args.slice(4)],
    }),
    /Destino do ngrok inválido/,
  );
  assert.throws(
    () => __test__.validateNgrokLaunchSpecification({
      ...launch,
      args: [...launch.args, '--authtoken', 'secret'],
    }),
    /limite permitido|não autorizados/,
  );
});

test('supervises ngrok with the project, restores it on restart and not after manual start', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mfe-runner-ngrok-'));
  const probe = net.createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  await writeFile(path.join(directory, 'package.json'), JSON.stringify({
    name: 'ngrok-project',
    scripts: {
      serve: `node -e "require('http').createServer((_,r)=>r.end('ok')).listen(${port},'127.0.0.1')"`,
    },
  }));

  const sidecarCalls = [];
  const supervisor = new ProcessSupervisor({
    logLimit: 100,
    spawnProcess: (_executable, args, options) => {
      sidecarCalls.push({ args, options });
      const url = args[args.indexOf('--url') + 1];
      return spawnChild(process.execPath, [
        '-e',
        `console.log(JSON.stringify({msg:'online token=super-secret',url:${JSON.stringify(url)}}));setInterval(()=>{},1000)`,
      ], options);
    },
  });
  const input = {
    workspace: { id: 'workspace', name: 'Workspace', environment: 'local' },
    project: {
      id: 'project',
      name: 'ngrok-project',
      absolutePath: directory,
      role: 'application',
      scripts: { serve: 'http server' },
      defaultScript: 'serve',
      port,
      registrations: [],
      healthCheck: { type: 'tcp', port },
      node: {
        available: true,
        npmExecutable: process.platform === 'win32' ? 'npm.cmd' : 'npm',
        binDirectory: path.dirname(process.execPath),
      },
    },
    script: 'serve',
  };
  const launch = {
    executablePath: path.resolve('/tools/ngrok'),
    args: [
      'http', String(port),
      '--url', 'https://app.example.com',
      '--config', path.resolve('/tmp/ngrok.yml'),
      '--log', 'stdout',
      '--log-format', 'json',
      '--log-level', 'info',
    ],
    upstream: String(port),
    domainId: 'rd_123',
    domain: 'app.example.com',
    publicUrl: 'https://app.example.com',
    cwd: directory,
    env: process.env,
  };
  const waitFor = async (predicate, timeout = 8000) => {
    const started = Date.now();
    while (!predicate()) {
      if (Date.now() - started > timeout) throw new Error('Timed out waiting for supervisor state.');
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  };

  try {
    await supervisor.start(input);
    await waitFor(() => ['healthy', 'degraded'].includes(supervisor.snapshot()[0]?.status));
    await supervisor.startNgrok('workspace', 'project', launch);
    await waitFor(() => supervisor.snapshot()[0]?.ngrok?.status === 'online');
    assert.equal(sidecarCalls[0].options.shell, false);
    assert.equal(sidecarCalls[0].args[0], 'http');
    assert.equal(
      supervisor.snapshot()[0].logs.some((entry) => entry.message.includes('super-secret')),
      false,
    );

    await supervisor.restart('workspace', 'project');
    await waitFor(() => supervisor.snapshot()[0]?.ngrok?.status === 'online');
    assert.equal(sidecarCalls.length, 2);

    await supervisor.stop('workspace', 'project');
    await waitFor(() => supervisor.snapshot()[0]?.status === 'stopped');
    assert.equal(supervisor.snapshot()[0].ngrok, null);
    await supervisor.start(input);
    await waitFor(() => ['healthy', 'degraded'].includes(supervisor.snapshot()[0]?.status));
    assert.equal(supervisor.snapshot()[0].ngrok, null);
  } finally {
    await supervisor.stopAll();
  }
});

test('monitors an external process, follows a log file and detaches without terminating it', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mfe-runner-external-'));
  const logFile = path.join(directory, 'application.log');
  await writeFile(logFile, 'initial line\n');
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const supervisor = new ProcessSupervisor({
    inspectExternal: async () => ({ pid: 4321, name: 'java' }),
  });
  const service = {
    id: 'external-service:process',
    name: 'External API',
    scheme: 'http',
    host: '127.0.0.1',
    port,
    provider: 'process',
    identity: { pid: 4321, name: 'java' },
    logSource: { type: 'file', filePath: logFile },
  };
  try {
    await supervisor.attachExternal({
      workspace: { id: 'workspace', name: 'Workspace' },
      service,
    });
    assert.equal(supervisor.snapshot()[0].source, 'external');
    assert.equal(supervisor.snapshot()[0].status, 'online');
    assert.equal(
      supervisor.snapshot()[0].logs.some((entry) => entry.message === 'initial line'),
      true,
    );

    await appendFile(logFile, 'next line\n');
    await new Promise((resolve) => setTimeout(resolve, 1150));
    assert.equal(
      supervisor.snapshot()[0].logs.some((entry) => entry.message === 'next line'),
      true,
    );

    await writeFile(logFile, 'rotated line\n');
    await new Promise((resolve) => setTimeout(resolve, 1150));
    assert.equal(
      supervisor.snapshot()[0].logs.some((entry) =>
        entry.message.includes('rotacionado ou truncado')
      ),
      true,
    );

    await supervisor.detachExternal('workspace', service.id);
    assert.equal(supervisor.snapshot().length, 0);
    assert.equal(await __test__.isPortOpen(port, '127.0.0.1'), true);
  } finally {
    await supervisor.stopAll();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('marks a reused local port as an external identity mismatch', async () => {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const supervisor = new ProcessSupervisor({
    inspectExternal: async () => ({ pid: 9999, name: 'other-process' }),
  });
  try {
    await supervisor.attachExternal({
      workspace: { id: 'workspace', name: 'Workspace' },
      service: {
        id: 'external-service:mismatch',
        name: 'Expected API',
        scheme: 'http',
        host: '127.0.0.1',
        port,
        provider: 'process',
        identity: { pid: 4321, name: 'java' },
        logSource: { type: 'none' },
      },
    });
    assert.equal(supervisor.snapshot()[0].status, 'identity-mismatch');
    assert.match(supervisor.snapshot()[0].message, /PID 9999/);
  } finally {
    await supervisor.stopAll();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('one-shot Node tasks replace stale daemon NVM variables with the resolved runtime', () => {
  const selectedBin = path.join(
    os.homedir(),
    '.nvm',
    'versions',
    'node',
    'v24.15.0',
    'bin',
  );
  const environment = __test__.nodeTaskEnvironment(
    {
      node: { binDirectory: selectedBin },
      runtime: {
        environment: {
          PATH: `${selectedBin}${path.delimiter}/usr/bin`,
        },
      },
    },
    {
      PATH: `/stale/node/bin${path.delimiter}/usr/bin`,
      NVM_BIN: '/stale/node/bin',
      NVM_INC: '/stale/node/include/node',
    },
  );

  assert.equal(environment.NVM_BIN, selectedBin);
  if (process.platform !== 'win32') {
    assert.equal(
      environment.NVM_INC,
      path.resolve(selectedBin, '..', 'include', 'node'),
    );
  }
  assert.equal(environment.PATH.split(path.delimiter)[0], selectedBin);
  assert.equal(environment.npm_config_audit, 'false');
  assert.equal(environment.npm_config_fund, 'false');
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
  const selectedBin = path.dirname(process.execPath);
  await writeFile(
    path.join(directory, 'package.json'),
    JSON.stringify({
      name: 'link-consumer',
      scripts: {
        'link:verify':
          'node -e "setTimeout(() => console.log(process.env.NVM_BIN), 100)"',
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
          'node -e "setTimeout(() => console.log(process.env.NVM_BIN), 100)"',
      },
      node: {
        available: true,
        npmExecutable: process.platform === 'win32' ? 'npm.cmd' : 'npm',
        binDirectory: selectedBin,
      },
      runtime: {
        environment: {
          PATH: `/stale/node/bin${path.delimiter}/usr/bin`,
          NVM_BIN: '/stale/node/bin',
          NVM_INC: '/stale/node/include/node',
        },
      },
    },
    script: 'link:verify',
    label: 'Vínculo com biblioteca',
  });

  assert.equal(statuses.includes('linking'), true);
  const [record] = supervisor.snapshot();
  assert.equal(record.status, 'stopped');
  assert.equal(
    record.logs.some((entry) => entry.message === selectedBin),
    true,
  );
});

test(
  'one-shot link tasks can be retried after termination by signal',
  { skip: process.platform === 'win32' },
  async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), 'mfe-runner-link-retry-'),
    );
    await writeFile(
      path.join(directory, 'package.json'),
      JSON.stringify({
        name: 'link-retry-consumer',
        scripts: {
          'link:terminate':
            'node -e "process.kill(process.pid, \'SIGTERM\')"',
          'link:verify':
            'node -e "console.log(\'link-retry-ready\')"',
        },
      }),
    );
    const supervisor = new ProcessSupervisor({ logLimit: 50 });
    const project = {
      id: 'consumer',
      name: 'link-retry-consumer',
      absolutePath: directory,
      port: null,
      scripts: {
        'link:terminate':
          'node -e "process.kill(process.pid, \'SIGTERM\')"',
        'link:verify':
          'node -e "console.log(\'link-retry-ready\')"',
      },
      node: {
        available: true,
        npmExecutable: process.platform === 'win32' ? 'npm.cmd' : 'npm',
        binDirectory: path.dirname(process.execPath),
      },
    };
    const workspace = {
      id: 'workspace',
      name: 'Workspace',
      environment: 'local',
    };

    await assert.rejects(
      supervisor.runTask({
        workspace,
        project,
        script: 'link:terminate',
        label: 'Vínculo interrompido',
      }),
      /SIGTERM/,
    );
    await supervisor.runTask({
      workspace,
      project,
      script: 'link:verify',
      label: 'Nova tentativa',
    });

    const [record] = supervisor.snapshot();
    assert.equal(record.status, 'stopped');
    assert.equal(
      record.logs.some((entry) => entry.message === 'link-retry-ready'),
      true,
    );
  },
);
