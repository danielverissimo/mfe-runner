import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultProjectRoot = path.resolve(scriptDirectory, '..');

async function pathExists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function readJson(target) {
  return JSON.parse(await readFile(target, 'utf8'));
}

async function findPackagedApplications(releaseRoot) {
  const applications = [];

  async function visit(directory, depth) {
    if (depth > 7) {
      return;
    }

    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }

    if (
      path.basename(directory).toLowerCase() === 'app' &&
      (await pathExists(path.join(directory, 'package.json'))) &&
      (await pathExists(path.join(directory, 'node_modules')))
    ) {
      applications.push(directory);
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === 'node_modules') {
        continue;
      }
      await visit(path.join(directory, entry.name), depth + 1);
    }
  }

  await visit(releaseRoot, 0);
  return applications.sort();
}

async function listPackageDirectories(nodeModulesDirectory) {
  const packages = [];
  let entries;

  try {
    entries = await readdir(nodeModulesDirectory, { withFileTypes: true });
  } catch {
    return packages;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const entryPath = path.join(nodeModulesDirectory, entry.name);
    if (!entry.name.startsWith('@')) {
      if (await pathExists(path.join(entryPath, 'package.json'))) {
        packages.push(entryPath);
      }
      continue;
    }

    const scopedEntries = await readdir(entryPath, { withFileTypes: true });
    for (const scopedEntry of scopedEntries) {
      const scopedPath = path.join(entryPath, scopedEntry.name);
      if (
        scopedEntry.isDirectory() &&
        (await pathExists(path.join(scopedPath, 'package.json')))
      ) {
        packages.push(scopedPath);
      }
    }
  }

  return packages;
}

async function resolveDependency(fromDirectory, dependencyName, applicationRoot) {
  let currentDirectory = fromDirectory;

  while (currentDirectory.startsWith(applicationRoot)) {
    const candidate = path.join(
      currentDirectory,
      'node_modules',
      dependencyName,
      'package.json',
    );
    if (await pathExists(candidate)) {
      return candidate;
    }

    if (currentDirectory === applicationRoot) {
      break;
    }
    currentDirectory = path.dirname(currentDirectory);
  }

  return null;
}

export async function verifyPackagedApplication(applicationRoot) {
  const packageDirectories = [];
  const pendingNodeModules = [path.join(applicationRoot, 'node_modules')];
  const visitedNodeModules = new Set();

  while (pendingNodeModules.length > 0) {
    const nodeModulesDirectory = pendingNodeModules.pop();
    if (visitedNodeModules.has(nodeModulesDirectory)) {
      continue;
    }
    visitedNodeModules.add(nodeModulesDirectory);

    const directories = await listPackageDirectories(nodeModulesDirectory);
    packageDirectories.push(...directories);
    for (const directory of directories) {
      const nestedNodeModules = path.join(directory, 'node_modules');
      if (await pathExists(nestedNodeModules)) {
        pendingNodeModules.push(nestedNodeModules);
      }
    }
  }

  const missing = [];
  for (const packageDirectory of packageDirectories) {
    const packageJson = await readJson(path.join(packageDirectory, 'package.json'));
    for (const dependencyName of Object.keys(packageJson.dependencies ?? {})) {
      const resolved = await resolveDependency(
        packageDirectory,
        dependencyName,
        applicationRoot,
      );
      if (!resolved) {
        missing.push({
          dependency: dependencyName,
          requiredBy: `${packageJson.name}@${packageJson.version}`,
        });
      }
    }
  }

  if (missing.length > 0) {
    const details = missing
      .sort((left, right) =>
        `${left.requiredBy}/${left.dependency}`.localeCompare(
          `${right.requiredBy}/${right.dependency}`,
        ),
      )
      .map(
        ({ dependency, requiredBy }) =>
          `- ${dependency} (obrigatória para ${requiredBy})`,
      )
      .join('\n');
    throw new Error(
      `Aplicativo empacotado com dependências ausentes em ${applicationRoot}:\n${details}`,
    );
  }

  return {
    applicationRoot,
    packageCount: packageDirectories.length,
  };
}

export async function verifyPackagedDependencies(
  projectRoot = defaultProjectRoot,
) {
  const releaseRoot = path.join(projectRoot, 'release');
  const applications = await findPackagedApplications(releaseRoot);

  if (applications.length === 0) {
    throw new Error(
      `Nenhum aplicativo desempacotado foi encontrado em ${releaseRoot}.`,
    );
  }

  const results = [];
  for (const applicationRoot of applications) {
    results.push(await verifyPackagedApplication(applicationRoot));
  }
  return results;
}

const executedFile = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (executedFile === fileURLToPath(import.meta.url)) {
  const results = await verifyPackagedDependencies();
  for (const result of results) {
    console.log(
      `Dependências verificadas: ${path.relative(defaultProjectRoot, result.applicationRoot)} (${result.packageCount} pacotes).`,
    );
  }
}
