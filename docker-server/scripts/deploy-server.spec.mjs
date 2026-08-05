import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const localScriptUrl = new URL('./deploy-server.sh', import.meta.url);
const remoteScriptUrl = new URL('./remote-deploy.sh', import.meta.url);
const obsoleteComposeUrl = new URL('../compose.yml', import.meta.url);
const caddyFragmentUrl = new URL('../Caddyfile', import.meta.url);
const landingIndexUrl = new URL('../landing-page/index.html', import.meta.url);
const landingAppUrl = new URL('../landing-page/app.js', import.meta.url);

test('deploy updates only the MFE Runner files through the shared reverse proxy', async () => {
  const [localScript, remoteScript, caddyFragment, landingIndex, landingApp] = await Promise.all([
    readFile(localScriptUrl, 'utf8'),
    readFile(remoteScriptUrl, 'utf8'),
    readFile(caddyFragmentUrl, 'utf8'),
    readFile(landingIndexUrl, 'utf8'),
    readFile(landingAppUrl, 'utf8'),
  ]);

  assert.match(localScript, /REMOTE_PROXY_DIR=/);
  assert.match(localScript, /PROXY_CONTAINER=/);
  assert.match(localScript, /mferunner\.caddy/);
  assert.match(remoteScript, /SITE_CONFIG=.*sites\/mferunner\.caddy/);
  assert.match(remoteScript, /docker exec "\$PROXY_CONTAINER"[\s\\]*caddy reload/);
  assert.match(remoteScript, /rsync -a --delete --delay-updates/);
  assert.match(remoteScript, /resolve_served_landing_dir/);
  assert.match(remoteScript, /stat -c '%d:%i' \/srv\/mferunner/);
  assert.match(remoteScript, /served-landing-page/);
  assert.match(caddyFragment, /root \* \/srv\/mferunner/);
  assert.match(caddyFragment, /Cache-Control "no-cache"/);
  assert.doesNotMatch(caddyFragment, /admin off/);
  assert.match(landingIndex, /\/app\.js\?v=20260805-rpm/);
  assert.match(landingApp, /\.\/download-catalog\.js\?v=20260805-rpm/);

  const forbiddenCommands = [
    /docker\s+compose/,
    /docker\s+restart(?:\s|$)/,
    /docker\s+stop(?:\s|$)/,
    /docker\s+rm(?:\s|$)/,
    /docker\s+(?:system|container|image|volume)\s+prune(?:\s|$)/,
  ];

  for (const forbidden of forbiddenCommands) {
    assert.doesNotMatch(remoteScript, forbidden);
  }

  await assert.rejects(access(obsoleteComposeUrl));
});

test('deploy validates the combined Caddy config before live replacement and can roll back', async () => {
  const remoteScript = await readFile(remoteScriptUrl, 'utf8');
  const candidateValidation = remoteScript.indexOf(
    'caddy validate --config /etc/caddy/Caddyfile',
  );
  const liveReplacement = remoteScript.indexOf(
    'rsync -a --delete --delay-updates',
    candidateValidation,
  );

  assert.ok(candidateValidation >= 0);
  assert.ok(liveReplacement > candidateValidation);
  assert.match(remoteScript, /BACKUP_DIR=/);
  assert.match(remoteScript, /restore_previous_files/);
  assert.match(remoteScript, /wait_for_health/);
  assert.match(remoteScript, /test -f \/srv\/mferunner\/download-catalog\.js/);
});
