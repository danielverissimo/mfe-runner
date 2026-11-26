import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readFile, rename, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { retryNetwork } from './build-network.mjs';

const require = createRequire(import.meta.url);

export function parseElectronChecksums(text) {
  return Object.fromEntries([...text.matchAll(/^([a-f0-9]{64})\s+\*?([^\s]+)\s*$/gm)]
    .map((match) => [match[2], match[1]]));
}

export async function verifyElectronArchive(file, checksum) {
  if (!/^[a-f0-9]{64}$/.test(checksum ?? '')) throw new Error('Checksum oficial do Electron ausente ou inválido.');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  if (hash.digest('hex') !== checksum) throw new Error(`Checksum do Electron não confere: ${path.basename(file)}.`);
}

export async function prepareLinuxElectron({
  cacheRoot,
  version = require('electron/package.json').version,
  downloadArtifact,
  log = console.log,
  retry = retryNetwork,
} = {}) {
  if (!cacheRoot || !path.isAbsolute(cacheRoot)) throw new Error('Informe um diretório de cache absoluto.');
  if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)) throw new Error('Versão do Electron inválida.');
  // @electron/get is already supplied by the installed Electron build toolchain.
  downloadArtifact ??= (await import('@electron/get')).downloadArtifact;
  const preparedDirectory = path.join(cacheRoot, 'mfe-runner-linux');
  await mkdir(preparedDirectory, { recursive: true });
  const download = (details, label) => retry(() => downloadArtifact({
    cacheRoot, version, ...details,
    downloadOptions: { quiet: true, fetchOptions: { signal: AbortSignal.timeout(180000) } },
  }), { label, log });
  log(`Preparando Electron ${version} para Linux no host (x64 e arm64)...`);
  const checksumPath = await download({ artifactName: 'SHASUMS256.txt', isGeneric: true }, 'Checksums do Electron');
  const checksums = parseElectronChecksums(await readFile(checksumPath, 'utf8'));
  for (const arch of ['x64', 'arm64']) {
    const fileName = `electron-v${version}-linux-${arch}.zip`;
    if (!checksums[fileName]) throw new Error(`Checksum oficial ausente para ${fileName}.`);
    const target = path.join(preparedDirectory, fileName);
    try {
      await verifyElectronArchive(target, checksums[fileName]);
      log(`Electron Linux ${arch}: cache verificado.`);
      continue;
    } catch {
      // Missing or corrupted prepared output must be replaced with a verified download.
    }
    log(`Electron Linux ${arch}: preparando download verificado...`);
    const downloaded = await download({ artifactName: 'electron', platform: 'linux', arch, checksums }, `Electron Linux ${arch}`);
    await verifyElectronArchive(downloaded, checksums[fileName]);
    const temporary = `${target}.${process.pid}.tmp`;
    try {
      await copyFile(downloaded, temporary);
      await verifyElectronArchive(temporary, checksums[fileName]);
      await rename(temporary, target);
    } finally {
      await rm(temporary, { force: true });
    }
    log(`Electron Linux ${arch}: pronto.`);
  }
  return preparedDirectory;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw new Error('Uso: prepare-linux-electron.mjs <cache-absoluto>');
    await prepareLinuxElectron({ cacheRoot: process.argv[2] });
  } catch (error) {
    console.error(`Falha ao preparar Electron Linux: ${error.message}`);
    process.exitCode = 1;
  }
}
