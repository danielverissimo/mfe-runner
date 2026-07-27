import { randomBytes } from 'node:crypto';
import {
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { supervisorPaths } from './supervisor-protocol.mjs';

const TOKEN_PATTERN = /^[a-f0-9]{64}$/;

export async function ensureSupervisorToken(userDataPath) {
  const { tokenPath } = supervisorPaths(userDataPath);
  await mkdir(userDataPath, { recursive: true, mode: 0o700 });
  try {
    const token = (await readFile(tokenPath, 'utf8')).trim();
    if (TOKEN_PATTERN.test(token)) return token;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const token = randomBytes(32).toString('hex');
  const temporaryPath = `${tokenPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, token, { mode: 0o600, flag: 'wx' });
  await rename(temporaryPath, tokenPath);
  return token;
}

export async function acquireSupervisorLock(userDataPath) {
  const { lockPath } = supervisorPaths(userDataPath);
  await mkdir(path.dirname(lockPath), { recursive: true, mode: 0o700 });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const handle = await open(lockPath, 'wx', 0o600);
      await handle.writeFile(JSON.stringify({
        pid: process.pid,
        startedAt: new Date().toISOString(),
      }));
      await handle.close();
      return async () => {
        try {
          const value = JSON.parse(await readFile(lockPath, 'utf8'));
          if (value.pid === process.pid) await rm(lockPath, { force: true });
        } catch {
          // O lock já foi removido ou substituído.
        }
      };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      let ownerAlive = false;
      try {
        const value = JSON.parse(await readFile(lockPath, 'utf8'));
        if (Number.isInteger(value.pid) && value.pid > 0) {
          process.kill(value.pid, 0);
          ownerAlive = true;
        }
      } catch (ownerError) {
        ownerAlive = ownerError?.code === 'EPERM';
        if (!ownerAlive && ownerError instanceof SyntaxError) {
          try {
            const details = await stat(lockPath);
            if (Date.now() - details.mtimeMs < 5000) {
              await new Promise((resolve) => setTimeout(resolve, 40));
              continue;
            }
          } catch {
            // O lock desapareceu durante a inspeção; a próxima volta tenta criá-lo.
          }
        }
      }
      if (ownerAlive) return null;
      await rm(lockPath, { force: true });
    }
  }
  return null;
}
