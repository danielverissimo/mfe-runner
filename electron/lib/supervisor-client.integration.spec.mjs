import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  access,
  mkdtemp,
  readFile,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { ensureSupervisorToken } from './supervisor-auth.mjs';
import { SupervisorClient } from './supervisor-client.mjs';
import { supervisorPaths } from './supervisor-protocol.mjs';

const entryPath = fileURLToPath(
  new URL('./supervisor-entry.mjs', import.meta.url),
);

function waitFor(predicate, timeout = 4000) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - startedAt >= timeout) {
        clearInterval(timer);
        reject(new Error('Timeout aguardando estado do supervisor.'));
      }
    }, 25);
  });
}

async function waitForFile(filePath, timeout = 4000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    try {
      return await readFile(filePath, 'utf8');
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  throw new Error(`Timeout aguardando arquivo: ${filePath}`);
}

test('retires protocol v7 only after requesting a graceful stopAll', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mfe-client-v7-'));
  const paths = supervisorPaths(directory);
  const token = await ensureSupervisorToken(directory);
  const readyPath = path.join(directory, 'legacy-ready');
  const stopAllPath = path.join(directory, 'legacy-stop-all');
  const legacyEntryPath = path.join(directory, 'legacy-supervisor.mjs');
  await writeFile(legacyEntryPath, `
    import net from 'node:net';
    import { rm, writeFile } from 'node:fs/promises';

    const endpoint = ${JSON.stringify(paths.endpoint)};
    const lockPath = ${JSON.stringify(paths.lockPath)};
    const readyPath = ${JSON.stringify(readyPath)};
    const stopAllPath = ${JSON.stringify(stopAllPath)};
    const token = ${JSON.stringify(token)};

    if (process.platform !== 'win32') {
      await rm(endpoint, { force: true });
    }
    await writeFile(lockPath, JSON.stringify({
      pid: process.pid,
      startedAt: new Date().toISOString(),
    }));
    const server = net.createServer((socket) => {
      let authenticated = false;
      let buffer = '';
      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        while (buffer.includes('\\n')) {
          const index = buffer.indexOf('\\n');
          const line = buffer.slice(0, index);
          buffer = buffer.slice(index + 1);
          const frame = JSON.parse(line);
          if (!authenticated) {
            if (
              frame.type !== 'handshake' ||
              frame.protocolVersion !== 7 ||
              frame.token !== token
            ) {
              socket.end(JSON.stringify({
                type: 'error',
                error: {
                  code: 'PROTOCOL_MISMATCH',
                  message: 'legacy protocol mismatch',
                },
              }) + '\\n');
              continue;
            }
            authenticated = true;
            socket.write(JSON.stringify({
              type: 'handshake',
              protocolVersion: 7,
              processes: [],
            }) + '\\n');
            continue;
          }
          if (
            frame.type === 'request' &&
            frame.method === 'stopAll'
          ) {
            void writeFile(stopAllPath, 'stopAll').then(() => {
              socket.write(JSON.stringify({
                type: 'response',
                id: frame.id,
                ok: true,
                result: null,
              }) + '\\n');
            });
          }
        }
      });
    });
    server.listen(endpoint, async () => {
      await writeFile(readyPath, 'ready');
    });
    process.on('SIGTERM', () => server.close(() => process.exit(0)));
  `);

  const legacyProcess = spawn(process.execPath, [legacyEntryPath], {
    stdio: 'ignore',
    shell: false,
  });
  try {
    await waitForFile(readyPath);
    const client = new SupervisorClient({
      userDataPath: directory,
      entryPath,
      executablePath: process.execPath,
      idleTimeout: 250,
    });
    await client.connectOrStart();
    assert.equal(await waitForFile(stopAllPath), 'stopAll');
    assert.equal(client.connected, true);
    client.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 500));
  } finally {
    if (legacyProcess.exitCode === null) {
      legacyProcess.kill('SIGTERM');
    }
  }
});

test('reconnects to the same process and recovers logs after the UI disconnects', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mfe-client-'));
  const projectDirectory = path.join(directory, 'project');
  await import('node:fs/promises').then(({ mkdir }) =>
    mkdir(projectDirectory, { recursive: true })
  );
  await writeFile(path.join(projectDirectory, 'run'), `
    console.log('process-started');
    let sequence = 0;
    setInterval(() => console.log('tick-' + (++sequence)), 40);
  `);

  const options = {
    userDataPath: directory,
    entryPath,
    executablePath: process.execPath,
    idleTimeout: 1000,
  };
  const firstClient = new SupervisorClient(options);
  await firstClient.connectOrStart();
  await firstClient.start({
    workspace: {
      id: 'workspace',
      name: 'Workspace',
      environment: 'local',
    },
    project: {
      id: 'project',
      name: 'Project',
      displayName: 'Project',
      absolutePath: projectDirectory,
      scripts: { start: 'node run' },
      defaultScript: 'start',
      port: null,
      role: 'application',
      registrations: [],
      node: {
        available: true,
        npmExecutable: process.execPath,
        binDirectory: path.dirname(process.execPath),
      },
    },
    script: 'start',
  });
  await waitFor(() => firstClient.snapshot()[0]?.logs.length >= 3);
  const beforeDisconnect = firstClient.snapshot()[0];
  const originalPid = beforeDisconnect.pid;
  const originalLogCount = beforeDisconnect.logs.length;
  firstClient.disconnect();

  await new Promise((resolve) => setTimeout(resolve, 150));
  const secondClient = new SupervisorClient(options);
  await secondClient.connectOrStart();
  const recovered = secondClient.snapshot()[0];
  assert.equal(recovered.pid, originalPid);
  assert.equal(recovered.status, 'running');
  assert.ok(recovered.logs.length > originalLogCount);

  await secondClient.stop('workspace', 'project');
  assert.equal(secondClient.snapshot()[0].status, 'stopped');
  secondClient.disconnect();
  await new Promise((resolve) => setTimeout(resolve, 1200));
  await assert.rejects(
    access(supervisorPaths(directory).lockPath),
    (error) => error.code === 'ENOENT',
  );
});

test('waits for a delayed supervisor startup before reporting a connection failure', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mfe-client-slow-'));
  const delayedEntryPath = path.join(directory, 'delayed-supervisor.mjs');
  await writeFile(delayedEntryPath, `
    await new Promise((resolve) => setTimeout(resolve, 4200));
    await import(${JSON.stringify(new URL('./supervisor-entry.mjs', import.meta.url).href)});
  `);

  const client = new SupervisorClient({
    userDataPath: directory,
    entryPath: delayedEntryPath,
    executablePath: process.execPath,
    idleTimeout: 3000,
  });

  await client.connectOrStart();
  assert.equal(client.connected, true);
  client.disconnect();
  await new Promise((resolve) => setTimeout(resolve, 3200));
  await assert.rejects(
    access(supervisorPaths(directory).lockPath),
    (error) => error.code === 'ENOENT',
  );
});
