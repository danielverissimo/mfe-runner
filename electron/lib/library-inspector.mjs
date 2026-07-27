import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

const PACKAGE_NAME_PATTERN =
  /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i;

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function fileExists(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

function resolveWithin(rootPath, relativePath, label) {
  if (
    typeof relativePath !== 'string' ||
    !relativePath.trim() ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(`${label} deve ser um path relativo.`);
  }
  const resolved = path.resolve(rootPath, relativePath);
  const relative = path.relative(rootPath, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} deve permanecer dentro da biblioteca.`);
  }
  return resolved;
}

function ensureWithin(rootPath, absolutePath, label) {
  const resolved = path.resolve(absolutePath);
  const relative = path.relative(rootPath, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} deve permanecer dentro da biblioteca.`);
  }
  return resolved;
}

function normalizeRelative(rootPath, absolutePath) {
  return path.relative(rootPath, absolutePath).split(path.sep).join('/');
}

function angularTargets(project) {
  return project.architect ?? project.targets ?? {};
}

function defaultDevelopmentScript(scripts) {
  if (scripts.watch) return 'watch';
  if (scripts.build) return 'build';
  return Object.keys(scripts)[0] ?? '';
}

function inferArtifactPath(rootPath, angularProjectName, angularProject) {
  const build = angularTargets(angularProject).build;
  const ngPackagePath = build?.options?.project;
  if (typeof ngPackagePath === 'string' && ngPackagePath.trim()) {
    const absoluteNgPackage = resolveWithin(
      rootPath,
      ngPackagePath,
      'Configuração ng-package',
    );
    return readJson(absoluteNgPackage).then((ngPackage) => {
      if (typeof ngPackage.dest === 'string' && ngPackage.dest.trim()) {
        return ensureWithin(
          rootPath,
          path.resolve(path.dirname(absoluteNgPackage), ngPackage.dest),
          'Destino do ng-package',
        );
      }
      return path.join(rootPath, 'dist', angularProjectName);
    });
  }
  return Promise.resolve(path.join(rootPath, 'dist', angularProjectName));
}

export async function inspectLibraryDirectory(
  rootPath,
  configured = {},
) {
  const canonicalRoot = await realpath(rootPath);
  const packagePath = path.join(canonicalRoot, 'package.json');
  const angularPath = path.join(canonicalRoot, 'angular.json');
  if (!(await fileExists(packagePath)) || !(await fileExists(angularPath))) {
    throw new Error(
      'A biblioteca deve conter package.json e angular.json na raiz.',
    );
  }

  const [workspacePackage, angularConfig] = await Promise.all([
    readJson(packagePath),
    readJson(angularPath),
  ]);
  const libraryProjects = Object.entries(angularConfig.projects ?? {})
    .filter(([, project]) => project?.projectType === 'library');
  if (libraryProjects.length !== 1) {
    throw new Error(
      'O path da biblioteca deve conter exatamente um projeto Angular do tipo library.',
    );
  }
  const [angularProjectName, angularProject] = libraryProjects[0];
  const projectRoot = typeof angularProject.root === 'string'
    ? ensureWithin(
        canonicalRoot,
        path.resolve(canonicalRoot, angularProject.root),
        'Raiz do projeto Angular',
      )
    : canonicalRoot;
  const projectPackagePath = path.join(projectRoot, 'package.json');
  const projectPackage = await fileExists(projectPackagePath)
    ? await readJson(projectPackagePath)
    : workspacePackage;
  const packageName = projectPackage.name ?? workspacePackage.name;
  if (
    typeof packageName !== 'string' ||
    !PACKAGE_NAME_PATTERN.test(packageName)
  ) {
    throw new Error('O package name da biblioteca é inválido.');
  }

  const scripts = workspacePackage.scripts ?? {};
  const developmentScript =
    configured.developmentScript || defaultDevelopmentScript(scripts);
  if (!developmentScript || !scripts[developmentScript]) {
    throw new Error(
      'Selecione um script de desenvolvimento existente na biblioteca.',
    );
  }

  const inferredArtifact = await inferArtifactPath(
    canonicalRoot,
    angularProjectName,
    angularProject,
  );
  const artifactPath = configured.artifactRelativePath
    ? resolveWithin(
        canonicalRoot,
        configured.artifactRelativePath,
        'Path do artefato',
      )
    : inferredArtifact;
  const artifactRelativePath = normalizeRelative(canonicalRoot, artifactPath);

  return {
    rootPath: canonicalRoot,
    packageName,
    angularProject: angularProjectName,
    scripts: Object.keys(scripts),
    developmentScript,
    artifactPath,
    artifactRelativePath,
    preferredLinkScript:
      configured.preferredLinkScript?.trim() || 'link:web-common',
  };
}

export function effectiveLinkScript(project, library) {
  const override =
    project.libraryLinkScriptOverrides?.[library.libraryId];
  if (override && project.scripts[override] && override.startsWith('link:')) {
    return override;
  }
  if (
    library.preferredLinkScript &&
    project.scripts[library.preferredLinkScript] &&
    library.preferredLinkScript.startsWith('link:')
  ) {
    return library.preferredLinkScript;
  }
  if (project.scripts['link:web-common']) return 'link:web-common';
  const linkScripts = project.scriptNames.filter((script) =>
    script.startsWith('link:')
  );
  return linkScripts.length === 1 ? linkScripts[0] : null;
}

export async function inspectConsumerLink(project, library) {
  const script = effectiveLinkScript(project, library);
  const artifactPackagePath = path.join(library.artifactPath, 'package.json');
  if (!(await fileExists(artifactPackagePath))) {
    return {
      libraryId: library.libraryId,
      libraryName: library.displayName,
      packageName: library.packageName,
      state: 'unavailable',
      script,
      message: `Artefato ausente em ${library.artifactRelativePath}.`,
    };
  }
  if (!script) {
    return {
      libraryId: library.libraryId,
      libraryName: library.displayName,
      packageName: library.packageName,
      state: 'unavailable',
      script: null,
      message: 'Nenhum script link:* compatível foi encontrado.',
    };
  }

  const installedPath = path.join(
    project.absolutePath,
    'node_modules',
    ...library.packageName.split('/'),
  );
  try {
    const [installedTarget, artifactTarget] = await Promise.all([
      realpath(installedPath),
      realpath(library.artifactPath),
    ]);
    if (installedTarget === artifactTarget) {
      return {
        libraryId: library.libraryId,
        libraryName: library.displayName,
        packageName: library.packageName,
        state: 'linked',
        script,
        message: 'Vinculada ao artefato local configurado.',
      };
    }
    return {
      libraryId: library.libraryId,
      libraryName: library.displayName,
      packageName: library.packageName,
      state: 'stale',
      script,
      message: `O pacote aponta para outro destino: ${installedTarget}.`,
    };
  } catch {
    return {
      libraryId: library.libraryId,
      libraryName: library.displayName,
      packageName: library.packageName,
      state: 'not-linked',
      script,
      message: 'O pacote local ainda não está vinculado.',
    };
  }
}

export async function enrichProjectsWithLibraryLinks(projects) {
  const libraries = projects
    .filter((project) => project.role === 'library' && project.library)
    .map((project) => ({
      ...project.library,
      displayName: project.displayName,
    }));
  return Promise.all(projects.map(async (project) => {
    if (!['shell', 'mfe', 'application'].includes(project.role)) {
      return { ...project, libraryLinks: [] };
    }
    return {
      ...project,
      libraryLinks: await Promise.all(
        libraries.map((library) => inspectConsumerLink(project, library)),
      ),
    };
  }));
}

export const __test__ = {
  defaultDevelopmentScript,
  inferArtifactPath,
  ensureWithin,
  resolveWithin,
};
