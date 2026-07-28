const RESTARTABLE_PROCESS_STATES = new Set([
  'starting',
  'running',
  'healthy',
  'degraded',
]);

const defaultWait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function restartActiveWorkspaceProjects({
  workspaceId,
  projects,
  supervisor,
  wait = defaultWait,
}) {
  const activeProjectIds = new Set(
    supervisor.snapshot()
      .filter((process) =>
        process.workspaceId === workspaceId &&
        RESTARTABLE_PROCESS_STATES.has(process.status))
      .map((process) => process.projectId),
  );
  const failures = [];
  const activeProjects = projects.filter(
    (project) => activeProjectIds.has(project.id),
  );

  for (const [index, project] of activeProjects.entries()) {
    try {
      await supervisor.restart(workspaceId, project.id);
      if (index < activeProjects.length - 1) {
        await wait(350);
      }
    } catch (error) {
      failures.push({
        projectId: project.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { failures };
}
