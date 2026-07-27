import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultProjectRoot = path.resolve(scriptDirectory, '..');
const generatedDirectories = ['dist', 'release'];

function assertSafeTarget(projectRoot, directoryName) {
  const target = path.resolve(projectRoot, directoryName);
  const relativeTarget = path.relative(projectRoot, target);

  if (
    path.basename(target) !== directoryName ||
    relativeTarget.startsWith('..') ||
    path.isAbsolute(relativeTarget)
  ) {
    throw new Error(`Diretório de limpeza inválido: ${target}`);
  }

  return target;
}

export async function cleanArtifacts(projectRoot = defaultProjectRoot) {
  const normalizedRoot = path.resolve(projectRoot);

  for (const directoryName of generatedDirectories) {
    const target = assertSafeTarget(normalizedRoot, directoryName);
    await rm(target, { recursive: true, force: true });
    console.log(`Removido: ${path.relative(normalizedRoot, target)}/`);
  }
}

const executedFile = process.argv[1] ? path.resolve(process.argv[1]) : '';

if (executedFile === fileURLToPath(import.meta.url)) {
  await cleanArtifacts();
}
