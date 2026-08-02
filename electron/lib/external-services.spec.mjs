import assert from 'node:assert/strict';
import { chmod, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildExternalServiceDefinition,
  discoverExternalServiceCandidates,
  dockerExecutableCandidates,
  normalizeDockerInspect,
  parseLsofListeners,
  parseSsListeners,
  parseWindowsListeners,
  resolveDockerExecutable,
  resolveDockerLogLaunch,
  stopDockerContainer,
} from './external-services.mjs';

test('parses TCP listeners from macOS, Linux and Windows catalogs', () => {
  assert.deepEqual(parseLsofListeners(
    'p123\ncjava\nLdeveloper\nn*:8080\n',
  ), [{ pid: 123, name: 'java', owner: 'developer', host: 'localhost', port: 8080 }]);
  assert.deepEqual(parseSsListeners(
    'LISTEN 0 128 127.0.0.1:3000 0.0.0.0:* users:(("node",pid=77,fd=20))',
  )[0], {
    host: '127.0.0.1',
    port: 3000,
    pid: 77,
    name: 'node',
    owner: '',
  });
  assert.deepEqual(parseWindowsListeners(JSON.stringify({
    LocalAddress: '0.0.0.0',
    LocalPort: 9090,
    Pid: 91,
    Name: 'java',
  }))[0], {
    host: 'localhost',
    port: 9090,
    pid: 91,
    name: 'java',
    owner: '',
  });
});

test('builds official Docker candidates for each platform and resolves PATH', async () => {
  assert.equal(dockerExecutableCandidates({
    platform: 'darwin',
    environment: { PATH: '' },
  })[0], '/Applications/Docker.app/Contents/Resources/bin/docker');
  assert.equal(dockerExecutableCandidates({
    platform: 'linux',
    environment: { HOME: '/home/dev', PATH: '' },
  }).includes('/home/dev/.docker/bin/docker'), true);
  assert.equal(dockerExecutableCandidates({
    platform: 'win32',
    environment: { LOCALAPPDATA: 'C:\\Users\\dev\\AppData\\Local', PATH: '' },
  })[0], 'C:\\Users\\dev\\AppData\\Local\\Docker\\resources\\bin\\docker.exe');

  const directory = await mkdtemp(path.join(os.tmpdir(), 'mfe-runner-docker-'));
  const executable = path.join(directory, 'docker');
  await writeFile(executable, '#!/bin/sh\n');
  await chmod(executable, 0o755);
  assert.equal(await resolveDockerExecutable({
    platform: 'linux',
    environment: { HOME: directory, PATH: directory },
    isExecutable: async (candidate) => candidate === executable,
  }), executable);
});

test('normalizes published TCP ports and deduplicates Docker from OS listeners', async () => {
  const inspected = normalizeDockerInspect({
    Id: 'container-1',
    Name: '/api',
    State: { Running: true },
    Config: { Image: 'api:latest' },
    NetworkSettings: {
      Ports: { '8080/tcp': [{ HostIp: '0.0.0.0', HostPort: '4310' }] },
    },
  });
  assert.equal(inspected.ports[0].port, 4310);

  const directory = await mkdtemp(path.join(os.tmpdir(), 'mfe-runner-docker-'));
  const executable = path.join(directory, 'docker');
  await writeFile(executable, '#!/bin/sh\n');
  await chmod(executable, 0o755);
  const result = await discoverExternalServiceCandidates({
    platform: 'linux',
    environment: { HOME: directory, PATH: directory },
    excludedPorts: [4200],
    runCommand: async (command, args) => {
      if (command === 'ss') {
        return [
          'LISTEN 0 128 127.0.0.1:4200 0.0.0.0:* users:(("node",pid=10,fd=1))',
          'LISTEN 0 128 127.0.0.1:4310 0.0.0.0:* users:(("docker",pid=20,fd=1))',
          'LISTEN 0 128 127.0.0.1:9090 0.0.0.0:* users:(("java",pid=30,fd=1))',
        ].join('\n');
      }
      if (args.includes('ls')) return 'container-1\n';
      if (args.includes('inspect')) return JSON.stringify([{
        Id: 'container-1',
        Name: '/api',
        State: { Running: true },
        Config: { Image: 'api:latest' },
        NetworkSettings: {
          Ports: { '8080/tcp': [{ HostIp: '0.0.0.0', HostPort: '4310' }] },
        },
      }]);
      throw new Error('unexpected command');
    },
  });
  assert.deepEqual(result.candidates.map((item) => [item.provider, item.port]), [
    ['docker', 4310],
    ['process', 9090],
  ]);
});

test('builds manual and Docker definitions without accepting stale candidates', async () => {
  const manual = await buildExternalServiceDefinition({
    name: 'Remote API',
    scheme: 'https',
    host: 'api.internal',
    port: 8443,
  }, { candidates: [] });
  assert.deepEqual(manual.logSource, { type: 'none' });
  assert.equal(manual.provider, 'process');

  await assert.rejects(
    buildExternalServiceDefinition({
      candidateId: 'missing',
      name: 'Missing',
      scheme: 'http',
      host: 'localhost',
      port: 3000,
    }, { candidates: [] }),
    /mudou antes da confirmação/,
  );
});

test('revalidates a Docker container and stops it with exact shell-free arguments', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mfe-runner-docker-'));
  const executable = path.join(directory, 'docker');
  await writeFile(executable, '#!/bin/sh\n');
  await chmod(executable, 0o755);
  const calls = [];
  const service = {
    port: 4310,
    identity: { containerId: 'container-1' },
  };
  await stopDockerContainer(service, {
    platform: 'linux',
    environment: { HOME: directory, PATH: directory },
    runCommand: async (_command, args) => {
      calls.push(args);
      if (args[1] === 'inspect') return JSON.stringify([{
        Id: 'container-1',
        Name: '/api',
        State: { Running: true },
        NetworkSettings: {
          Ports: { '8080/tcp': [{ HostIp: '0.0.0.0', HostPort: '4310' }] },
        },
      }]);
      return '';
    },
  });
  assert.deepEqual(calls, [
    ['container', 'inspect', 'container-1'],
    ['container', 'stop', '--time', '7', 'container-1'],
  ]);
});

test('builds the fixed Docker log follower without renderer arguments', async () => {
  const executablePath = path.resolve('/tools/docker');
  const launch = await resolveDockerLogLaunch({
    identity: { containerId: 'container-1' },
  }, {
    platform: 'linux',
    environment: { HOME: '/tmp/runner', PATH: '/tools' },
    isExecutable: async (candidate) => candidate === executablePath,
  });

  assert.equal(launch.executablePath, executablePath);
  assert.deepEqual(launch.args, [
    'container', 'logs', '--follow', '--tail', '200', '--timestamps',
    'container-1',
  ]);
});
