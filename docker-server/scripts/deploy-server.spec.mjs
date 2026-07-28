import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const localScriptUrl = new URL('./deploy-server.sh', import.meta.url);
const remoteScriptUrl = new URL('./remote-deploy.sh', import.meta.url);

test('deploy remains scoped to the MFE Runner compose project and service', async () => {
  const [localScript, remoteScript] = await Promise.all([
    readFile(localScriptUrl, 'utf8'),
    readFile(remoteScriptUrl, 'utf8'),
  ]);

  assert.match(localScript, /COMPOSE_PROJECT=/);
  assert.match(remoteScript, /--project-name "\$COMPOSE_PROJECT"/);
  assert.match(
    remoteScript,
    /up -d --pull always --force-recreate --no-deps update-server/,
  );

  const forbiddenCommands = [
    /docker\s+compose(?:.|\n)*\sdown(?:\s|$)/,
    /docker\s+stop(?:\s|$)/,
    /docker\s+rm(?:\s|$)/,
    /docker\s+(?:system|container|image|volume)\s+prune(?:\s|$)/,
  ];

  for (const forbidden of forbiddenCommands) {
    assert.doesNotMatch(remoteScript, forbidden);
  }
});

test('deploy validates Caddy before replacing live files and includes rollback', async () => {
  const remoteScript = await readFile(remoteScriptUrl, 'utf8');
  const caddyValidation = remoteScript.indexOf('caddy validate');
  const liveReplacement = remoteScript.indexOf(
    'mv "$REMOTE_DIR/.Caddyfile.new" "$REMOTE_DIR/Caddyfile"',
  );

  assert.ok(caddyValidation >= 0);
  assert.ok(liveReplacement > caddyValidation);
  assert.match(remoteScript, /BACKUP_DIR=/);
  assert.match(remoteScript, /restore_previous_files/);
  assert.match(remoteScript, /wait_for_health/);
});
