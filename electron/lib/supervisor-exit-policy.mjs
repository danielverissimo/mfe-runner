export async function prepareSupervisorForExit({
  stopProcessesOnExit,
  supervisor,
}) {
  if (stopProcessesOnExit) await supervisor.stopAll();
  supervisor.disconnect();
}

export async function prepareSupervisorForUpdate({
  supervisor,
  wait = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
}) {
  await supervisor.stopAll();
  supervisor.disconnect();
  await wait(16_000);
}
