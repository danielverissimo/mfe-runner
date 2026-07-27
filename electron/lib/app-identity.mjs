export const APP_NAME = 'MFE Runner';

export function applyApplicationIdentity(
  electronApp,
  processReference = process,
) {
  electronApp.setName(APP_NAME);
  processReference.title = APP_NAME;
}
