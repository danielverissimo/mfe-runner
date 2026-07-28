import assert from 'node:assert/strict';
import test from 'node:test';
import { supervisorRequestTimeout } from './supervisor-client.mjs';

test('keeps standard and one-shot supervisor request timeouts bounded', () => {
  assert.equal(supervisorRequestTimeout('start'), 30_000);
  assert.equal(supervisorRequestTimeout('stop'), 30_000);
  assert.equal(supervisorRequestTimeout('runTask'), 310_000);
});

test('allows a workspace stop enough time for its sequential project shutdowns', () => {
  assert.equal(
    supervisorRequestTimeout('stopWorkspace', {
      projectIds: Array.from({ length: 16 }, (_, index) => `project-${index}`),
    }),
    154_000,
  );
  assert.equal(
    supervisorRequestTimeout('stopWorkspace', { projectIds: [] }),
    30_000,
  );
});
