import { readFile } from 'node:fs/promises';
import { ProcessSupervisor } from './process-supervisor.mjs';
import { acquireSupervisorLock } from './supervisor-auth.mjs';
import { supervisorPaths } from './supervisor-protocol.mjs';
import { SupervisorServer } from './supervisor-server.mjs';

const userDataPath = process.env.MFE_RUNNER_USER_DATA;

if (userDataPath) {
  const releaseLock = await acquireSupervisorLock(userDataPath);
  if (releaseLock) {
    const token = (await readFile(
      supervisorPaths(userDataPath).tokenPath,
      'utf8',
    )).trim();
    const supervisor = new ProcessSupervisor();
    const configuredIdleTimeout = Number(
      process.env.MFE_RUNNER_SUPERVISOR_IDLE_MS,
    );
    const server = new SupervisorServer({
      userDataPath,
      token,
      supervisor,
      ...(Number.isFinite(configuredIdleTimeout) &&
          configuredIdleTimeout >= 10 &&
          configuredIdleTimeout <= 15_000
        ? { idleTimeout: configuredIdleTimeout }
        : {}),
    });

    server.on('idle', async () => {
      await server.close();
      await releaseLock();
    });
    server.on('error', () => {});
    await server.listen();
  }
}
