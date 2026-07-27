import { stat } from 'node:fs/promises';
import path from 'node:path';
import { effectiveLinkScript } from './library-inspector.mjs';

const ACTIVE_STATUSES = new Set([
  'starting',
  'linking',
  'running',
  'healthy',
  'degraded',
  'stopping',
]);

async function fileExists(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function waitForLibraryArtifact({
  libraryProject,
  supervisor,
  timeout = 120000,
  pollInterval = 250,
}) {
  const packagePath = path.join(
    libraryProject.library.artifactPath,
    'package.json',
  );
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await fileExists(packagePath)) return;
    const process = supervisor.snapshot().find((item) =>
      item.workspaceId === libraryProject.workspaceId &&
      item.projectId === libraryProject.id
    );
    if (process?.status === 'failed') {
      throw new Error(
        `A preparação de ${libraryProject.displayName} falhou: ${process.message}`,
      );
    }
    await delay(pollInterval);
  }
  throw new Error(
    `O artefato de ${libraryProject.displayName} não ficou pronto em 120 segundos.`,
  );
}

function selectedProjects(catalog, request) {
  const requestedProjectIds = request.projectIds
    ? new Set(request.projectIds)
    : null;
  return catalog.projects.filter((project) =>
    ['shell', 'mfe', 'application'].includes(project.role) &&
    (!requestedProjectIds || requestedProjectIds.has(project.id))
  );
}

function selectedLibraries(catalog, request) {
  const requestedLibraryIds = request.libraryIds
    ? new Set(request.libraryIds)
    : null;
  return catalog.projects.filter((project) =>
    project.role === 'library' &&
    project.library &&
    (!requestedLibraryIds ||
      requestedLibraryIds.has(project.library.libraryId))
  );
}

export function buildLibraryLinkPlan(catalog, request) {
  const consumers = selectedProjects(catalog, request);
  const libraries = selectedLibraries(catalog, request);
  if (!libraries.length) throw new Error('Nenhuma biblioteca foi selecionada.');
  if (!consumers.length) throw new Error('Nenhum consumidor foi selecionado.');

  const pairs = [];
  for (const library of libraries) {
    for (const consumer of consumers) {
      pairs.push({
        library,
        consumer,
        script: effectiveLinkScript(consumer, library.library),
      });
    }
  }
  return { consumers, libraries, pairs };
}

export async function executeLibraryLinks({
  catalog,
  request,
  supervisor,
  artifactTimeout = 120000,
}) {
  const plan = buildLibraryLinkPlan(catalog, request);
  const results = [];
  const runnablePairs = plan.pairs.filter((pair) => {
    if (pair.script) return true;
    results.push({
      libraryId: pair.library.library.libraryId,
      projectId: pair.consumer.id,
      status: 'skipped',
      message: 'Nenhum script link:* compatível foi encontrado.',
    });
    return false;
  });

  const runnableConsumerIds = new Set(
    runnablePairs.map((pair) => pair.consumer.id),
  );
  const runningBefore = supervisor.snapshot().filter((process) =>
    process.workspaceId === catalog.workspace.id &&
    runnableConsumerIds.has(process.projectId) &&
    ACTIVE_STATUSES.has(process.status)
  );

  const stoppedBefore = [];
  const unavailableConsumers = new Map();
  for (const process of runningBefore) {
    try {
      await supervisor.stop(process.workspaceId, process.projectId);
      stoppedBefore.push(process);
    } catch (error) {
      unavailableConsumers.set(
        process.projectId,
        `Não foi possível parar o consumidor: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  const unavailableLibraries = new Map();
  for (const library of plan.libraries) {
    try {
      const packagePath = path.join(
        library.library.artifactPath,
        'package.json',
      );
      if (!(await fileExists(packagePath))) {
        const active = supervisor.snapshot().some((process) =>
          process.workspaceId === catalog.workspace.id &&
          process.projectId === library.id &&
          ACTIVE_STATUSES.has(process.status)
        );
        if (!active) {
          await supervisor.start({
            workspace: catalog.workspace,
            project: library,
            script: library.library.developmentScript,
          });
        }
        await waitForLibraryArtifact({
          libraryProject: {
            ...library,
            workspaceId: catalog.workspace.id,
          },
          supervisor,
          timeout: artifactTimeout,
        });
      }
    } catch (error) {
      unavailableLibraries.set(
        library.library.libraryId,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  for (const pair of runnablePairs) {
    const libraryId = pair.library.library.libraryId;
    const consumerError = unavailableConsumers.get(pair.consumer.id);
    if (consumerError) {
      results.push({
        libraryId,
        projectId: pair.consumer.id,
        status: 'failed',
        message: consumerError,
      });
      continue;
    }
    const preparationError = unavailableLibraries.get(libraryId);
    if (preparationError) {
      results.push({
        libraryId,
        projectId: pair.consumer.id,
        status: 'failed',
        message: preparationError,
      });
      continue;
    }
    try {
      await supervisor.runTask({
        workspace: catalog.workspace,
        project: pair.consumer,
        script: pair.script,
        label: `Vínculo com ${pair.library.displayName}`,
      });
      results.push({
        libraryId,
        projectId: pair.consumer.id,
        status: 'linked',
        message: `npm run ${pair.script} concluído.`,
      });
    } catch (error) {
      results.push({
        libraryId,
        projectId: pair.consumer.id,
        status: 'failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  for (const previous of stoppedBefore) {
    const project = plan.consumers.find((item) =>
      item.id === previous.projectId
    );
    if (!project) continue;
    try {
      await supervisor.start({
        workspace: catalog.workspace,
        project,
        script: previous.script,
      });
    } catch (error) {
      for (const result of results.filter(
        (item) => item.projectId === previous.projectId,
      )) {
        result.status = 'failed';
        result.message += ` Reinício falhou: ${
          error instanceof Error ? error.message : String(error)
        }`;
      }
    }
  }

  return results;
}

export const __test__ = {
  ACTIVE_STATUSES,
  fileExists,
  selectedLibraries,
  selectedProjects,
};
