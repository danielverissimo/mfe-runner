import assert from 'node:assert/strict';
import test from 'node:test';
import {
  APP_NAME,
  applyApplicationIdentity,
} from './app-identity.mjs';

test('uses the MFE Runner identity for Electron and the native process', () => {
  let applicationName = '';
  const processReference = { title: 'Electron' };

  applyApplicationIdentity({
    setName(value) {
      applicationName = value;
    },
  }, processReference);

  assert.equal(APP_NAME, 'MFE Runner');
  assert.equal(applicationName, 'MFE Runner');
  assert.equal(processReference.title, 'MFE Runner');
});
