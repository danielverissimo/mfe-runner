import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

const IGNORED_DIRECTORIES = new Set([
  '.angular',
  '.git',
  '.idea',
  '.nx',
  '.vscode',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'tmp',
]);
const MAX_DEPTH = 8;
const MAX_DIRECTORIES = 10000;

async function fileExists(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function normalizeRelative(value) {
  return value.split(path.sep).join('/');
}

async function optionalJson(filePath) {
  try {
    return await readJson(filePath);
  } catch {
    return null;
  }
}

async function federationMetadata(projectPath) {
  for (const fileName of [
    'federation.config.mjs',
    'federation.config.js',
    'module-federation.config.js',
    'module-federation.config.ts',
  ]) {
    const filePath = path.join(projectPath, fileName);
    if (!(await fileExists(filePath))) continue;
    const source = await readFile(filePath, 'utf8');
    const exposesBlock = source.match(/\bexposes\s*:\s*\{([\s\S]*?)\}/);
    const exposes = exposesBlock
      ? [...exposesBlock[1].matchAll(/['"](\.\/[^'"]+)['"]\s*:/g)]
          .map((match) => match[1])
      : [];
    const name = source.match(/\bname\s*:\s*['"]([^'"]+)['"]/)?.[1] ?? null;
    const remotes = /\bremotes\s*:\s*\{/.test(source);
    return { name, exposes, remotes, fileName };
  }
  return null;
}

function angularProjectsForPath(angularConfig, projectPath, sourceRoot) {
  if (!angularConfig) return [];
  const relative = normalizeRelative(path.relative(sourceRoot, projectPath) || '.');
  return Object.entries(angularConfig.projects ?? {}).filter(([, project]) => {
    const root = normalizeRelative(project?.root || '.');
    return root === relative || (relative === '.' && root === '.');
  });
}

export class PackageJsonProjectDetector {
  id = 'package-json';
  technology = 'Node.js';

  async detect(projectPath, sourceRoot) {
    const packageJson = await readJson(path.join(projectPath, 'package.json'));
    if (
      packageJson.name === 'mfe-runner' &&
      packageJson.main === 'electron/main.mjs'
    ) {
      return null;
    }
    const rootAngular = await optionalJson(path.join(sourceRoot, 'angular.json'));
    const ownAngular = projectPath === sourceRoot
      ? rootAngular
      : await optionalJson(path.join(projectPath, 'angular.json'));
    const angularConfig = ownAngular ?? rootAngular;
    const ownAngularProjects = Object.entries(ownAngular?.projects ?? {});
    const angularProjects = ownAngular
      ? ownAngularProjects.length === 1
        ? ownAngularProjects
        : angularProjectsForPath(ownAngular, projectPath, projectPath)
      : angularProjectsForPath(rootAngular, projectPath, sourceRoot);
    const federation = await federationMetadata(projectPath);
    const evidence = ['package.json'];
    const capabilities = [];
    let suggestedKind = null;

    const angularLibrary = angularProjects.some(
      ([, project]) => project?.projectType === 'library',
    );
    const angularLibraryProject = angularProjects.find(
      ([, project]) => project?.projectType === 'library',
    )?.[1];
    const nestedLibraryPackage = angularLibraryProject?.root
      ? await optionalJson(
          path.resolve(
            projectPath,
            angularLibraryProject.root,
            'package.json',
          ),
        )
      : null;
    const libraryPackageName =
      nestedLibraryPackage?.name ?? packageJson.name ?? path.basename(projectPath);
    const configuredNgPackage = angularProjects
      .map(([, project]) =>
        (project?.architect ?? project?.targets)?.build?.options?.project
      )
      .find((value) => typeof value === 'string');
    const ngPackagePath = await fileExists(path.join(projectPath, 'ng-package.json'))
      ? path.join(projectPath, 'ng-package.json')
      : configuredNgPackage
        ? path.resolve(projectPath, configuredNgPackage)
        : null;
    const ngPackageConfig = ngPackagePath
      ? await optionalJson(ngPackagePath)
      : null;
    const hasNgPackage = !!ngPackagePath;
    const ngPackageDestination =
      typeof ngPackageConfig?.dest === 'string'
        ? normalizeRelative(
            path.relative(
              projectPath,
              path.resolve(path.dirname(ngPackagePath), ngPackageConfig.dest),
            ),
          )
        : null;
    if (angularLibrary) evidence.push('Angular projectType: library');
    if (hasNgPackage) evidence.push('ng-package');
    if (angularLibrary || hasNgPackage) {
      suggestedKind = 'library';
    }

    if (federation?.exposes.length) {
      capabilities.push('mfe');
      evidence.push(`Federação com ${federation.exposes.length} expose(s)`);
    } else if (federation) {
      capabilities.push('host');
      evidence.push('Host de federação');
    }
    if (angularConfig) {
      capabilities.push('angular');
      evidence.push('Angular');
    }
    const scripts = packageJson.scripts ?? {};
    if (
      suggestedKind === null &&
      ['start', 'dev', 'serve'].some((script) => typeof scripts[script] === 'string')
    ) {
      suggestedKind = 'project';
      evidence.push('Script executável');
    }

    return {
      detectorId: this.id,
      technology: this.technology,
      name: angularLibrary
        ? libraryPackageName
        : packageJson.name ?? path.basename(projectPath),
      libraryPackageName,
      packageJson,
      angularConfig,
      angularProjects,
      federation,
      libraryArtifactRelativePath:
        ngPackageDestination &&
        ngPackageDestination !== '..' &&
        !ngPackageDestination.startsWith('../')
          ? ngPackageDestination
          : null,
      scripts,
      suggestedKind,
      evidence,
      capabilities,
    };
  }
}

export const PROJECT_DETECTORS = [new PackageJsonProjectDetector()];

export async function inspectProjectSource(rootPath, onProgress = () => undefined) {
  const canonicalRoot = await realpath(rootPath);
  const directories = [];
  const warnings = [];
  let visited = 0;
  let lastReportedVisited = 0;

  function report(progress) {
    try {
      onProgress(progress);
    } catch {
      // Progress is observational and must never interrupt discovery.
    }
  }

  report({
    phase: 'preparing',
    percent: 3,
    directoriesScanned: 0,
    projectsFound: 0,
    currentPath: '.',
  });

  async function visit(directory, depth) {
    if (++visited > MAX_DIRECTORIES) {
      throw new Error(
        `A inspeção excedeu o limite de ${MAX_DIRECTORIES} diretórios.`,
      );
    }
    if (depth > MAX_DEPTH) return;
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      warnings.push(`Sem acesso a ${directory}: ${error.message}`);
      return;
    }
    if (entries.some((entry) => entry.name === 'package.json' && entry.isFile())) {
      directories.push(directory);
    }
    if (
      visited === 1 ||
      visited - lastReportedVisited >= 20 ||
      directories.length > 0 && directories.length !== projectsFoundAtLastReport
    ) {
      lastReportedVisited = visited;
      projectsFoundAtLastReport = directories.length;
      report({
        phase: 'scanning',
        percent: Math.min(
          70,
          8 + Math.floor(62 * (1 - Math.exp(-visited / 150))),
        ),
        directoriesScanned: visited,
        projectsFound: directories.length,
        currentPath: normalizeRelative(
          path.relative(canonicalRoot, directory) || '.',
        ),
      });
    }
    for (const entry of entries) {
      if (
        !entry.isDirectory() ||
        entry.isSymbolicLink() ||
        IGNORED_DIRECTORIES.has(entry.name)
      ) {
        continue;
      }
      await visit(path.join(directory, entry.name), depth + 1);
    }
  }

  let projectsFoundAtLastReport = 0;
  await visit(canonicalRoot, 0);
  report({
    phase: 'analyzing',
    percent: 72,
    directoriesScanned: visited,
    projectsFound: directories.length,
    processedProjects: 0,
    totalProjects: directories.length,
    currentPath: '.',
  });
  let projects = [];
  for (const [directoryIndex, directory] of directories.entries()) {
    report({
      phase: 'analyzing',
      percent: 72 + Math.floor(
        25 * directoryIndex / Math.max(directories.length, 1),
      ),
      directoriesScanned: visited,
      projectsFound: directories.length,
      processedProjects: directoryIndex,
      totalProjects: directories.length,
      currentPath: normalizeRelative(
        path.relative(canonicalRoot, directory) || '.',
      ),
    });
    for (const detector of PROJECT_DETECTORS) {
      try {
        const detected = await detector.detect(directory, canonicalRoot);
        if (!detected) break;
        projects.push({
          ...detected,
          absolutePath: directory,
          relativePath: normalizeRelative(
            path.relative(canonicalRoot, directory) || '.',
          ),
        });
        break;
      } catch (error) {
        warnings.push(`Projeto ignorado em ${directory}: ${error.message}`);
        break;
      }
    }
    report({
      phase: 'analyzing',
      percent: 72 + Math.floor(
        25 * (directoryIndex + 1) / Math.max(directories.length, 1),
      ),
      directoriesScanned: visited,
      projectsFound: directories.length,
      processedProjects: directoryIndex + 1,
      totalProjects: directories.length,
      currentPath: normalizeRelative(
        path.relative(canonicalRoot, directory) || '.',
      ),
    });
  }
  const rootCandidate = projects.find(
    (project) => project.relativePath === '.',
  );
  const representedLibraryRoot = rootCandidate?.angularProjects?.length === 1 &&
      rootCandidate.angularProjects[0][1]?.projectType === 'library'
    ? normalizeRelative(rootCandidate.angularProjects[0][1]?.root ?? '.')
    : null;
  if (representedLibraryRoot && representedLibraryRoot !== '.') {
    projects = projects.filter(
      (project) =>
        project === rootCandidate ||
        project.relativePath !== representedLibraryRoot,
    );
  }
  if (!projects.length) {
    throw new Error('Nenhum projeto com package.json foi encontrado neste path.');
  }
  const rootProject = projects.some((project) => project.relativePath === '.');
  const inspection = {
    rootPath: canonicalRoot,
    sourceType: rootProject
      ? projects.length === 1 ? 'project' : 'monorepo'
      : 'root',
    projects,
    warnings,
  };
  report({
    phase: 'complete',
    percent: 100,
    directoriesScanned: visited,
    projectsFound: projects.length,
    processedProjects: projects.length,
    totalProjects: projects.length,
    currentPath: '.',
  });
  return inspection;
}

export function publicSourceInspection(inspection) {
  return {
    rootPath: inspection.rootPath,
    sourceType: inspection.sourceType,
    warnings: inspection.warnings,
    projects: inspection.projects.map((project) => ({
      name: project.name,
      relativePath: project.relativePath,
      technology: project.technology,
      suggestedKind: project.suggestedKind,
      evidence: project.evidence,
      capabilities: project.capabilities,
      scripts: Object.keys(project.scripts),
      localLinkSuggestion: {
        packageName: project.libraryPackageName ?? project.packageJson.name ?? project.name,
        developmentScript: project.scripts.watch
          ? 'watch'
          : project.scripts.build ? 'build' : Object.keys(project.scripts)[0] ?? '',
        artifactRelativePath:
          project.libraryArtifactRelativePath ??
          `dist/${project.name.replace(/^@[^/]+\//, '')}`,
        preferredLinkScript:
          `link:${project.name.replace(/^@[^/]+\//, '').replace(/-lib$/, '')}`,
      },
    })),
  };
}

export const __test__ = {
  angularProjectsForPath,
  normalizeRelative,
};
