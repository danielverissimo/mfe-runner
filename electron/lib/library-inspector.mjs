import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';

async function fileExists(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
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
