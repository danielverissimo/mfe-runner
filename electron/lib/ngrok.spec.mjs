import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import path from 'node:path';
import test from 'node:test';
import {
  composeNgrokManagedDomain,
  createNgrokDomain,
  createNgrokLaunchSpecification,
  getNgrokStatus,
  listNgrokDomains,
  ngrokExecutableCandidates,
  resolveNgrokExecutable,
  runNgrokCommand,
  validateNgrokDomainName,
  validateNgrokHostname,
} from './ngrok.mjs';

function fakeSpawn(responder, calls = []) {
  return (executable, args, options) => {
    calls.push({ executable, args, options });
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.pid = 4321;
    child.kill = () => true;
    process.nextTick(() => {
      const response = responder(args, calls.length - 1) ?? {};
      if (response.stdout) child.stdout.write(response.stdout);
      if (response.stderr) child.stderr.write(response.stderr);
      child.stdout.end();
      child.stderr.end();
      child.emit('close', response.code ?? 0, response.signal ?? null);
    });
    return child;
  };
}

function statusResponder(args) {
  if (args[0] === 'version') return { stdout: 'ngrok version 3.22.1\n' };
  if (args[0] === 'config') {
    return { stdout: 'Valid configuration file at /tmp/ngrok.yml\n' };
  }
  return null;
}

const availableOptions = (spawnProcess) => ({
  configuredPath: '/tools/ngrok',
  isExecutable: async (candidate) => candidate === '/tools/ngrok',
  realpath: async (candidate) => candidate,
  spawnProcess,
});

test('resolves ngrok candidates for macOS, Linux and Windows with explicit precedence', async () => {
  assert.equal(ngrokExecutableCandidates({
    configuredPath: '/custom/ngrok',
    platform: 'darwin',
    environment: { PATH: '/bin' },
  })[0].path, '/custom/ngrok');
  assert.equal(ngrokExecutableCandidates({
    platform: 'linux',
    homeDirectory: '/home/dev',
    environment: { PATH: '' },
  }).some((candidate) => candidate.path === '/home/dev/.local/bin/ngrok'), true);
  assert.equal(ngrokExecutableCandidates({
    platform: 'win32',
    environment: {
      LOCALAPPDATA: 'C:\\Users\\dev\\AppData\\Local',
      USERPROFILE: 'C:\\Users\\dev',
      PATH: '',
    },
  }).some((candidate) => candidate.path.endsWith('ngrok.exe')), true);

  const resolved = await resolveNgrokExecutable({
    configuredPath: '/custom/ngrok',
    platform: 'linux',
    environment: { PATH: '/bin' },
    isExecutable: async (candidate) => candidate === '/custom/ngrok',
    realpath: async (candidate) => candidate,
  });
  assert.deepEqual(resolved, {
    executablePath: '/custom/ngrok',
    source: 'configured',
  });
});

test('checks version and resolves the configuration without reading credentials', async () => {
  const calls = [];
  const status = await getNgrokStatus(availableOptions(
    fakeSpawn(statusResponder, calls),
  ));
  assert.equal(status.available, true);
  assert.equal(status.version, '3.22.1');
  assert.equal(status.configPath, '/tmp/ngrok.yml');
  assert.deepEqual(calls.map((call) => call.args), [
    ['version'],
    ['config', 'check'],
  ]);
  assert.equal(calls.every((call) => call.options.shell === false), true);
});

test('reports missing installations and invalid configuration without account access', async () => {
  const missing = await getNgrokStatus({
    platform: 'linux',
    environment: { PATH: '' },
    isExecutable: async () => false,
  });
  assert.equal(missing.installed, false);
  assert.match(missing.message, /não foi encontrado/);

  const invalid = await getNgrokStatus(availableOptions(fakeSpawn((args) => {
    if (args[0] === 'version') return { stdout: 'ngrok version 3.22.1\n' };
    return { code: 1, stderr: 'authtoken=private config invalid' };
  })));
  assert.equal(invalid.installed, true);
  assert.equal(invalid.available, false);
  assert.doesNotMatch(invalid.message, /private/);
  assert.match(invalid.message, /REDACTED/);
});

test('paginates and deduplicates reserved domains with fixed CLI arguments', async () => {
  const calls = [];
  const spawnProcess = fakeSpawn((args) => {
    const status = statusResponder(args);
    if (status) return status;
    if (!args.includes('--before-id')) {
      return { stdout: JSON.stringify({
        reserved_domains: [
          { id: 'rd_2', domain: 'z.example.com', cname_target: 'target.ngrok.io' },
          { id: 'rd_1', domain: '*.example.com' },
        ],
        next_page_uri: '/reserved_domains?before_id=rd_2',
      }) };
    }
    return { stdout: JSON.stringify({
      reserved_domains: [
        { id: 'rd_2', domain: 'z.example.com' },
        { id: 'rd_3', domain: 'a.example.com', status: 'ready' },
      ],
    }) };
  }, calls);

  const result = await listNgrokDomains(availableOptions(spawnProcess));
  assert.deepEqual(result.domains.map((domain) => domain.id), ['rd_1', 'rd_3', 'rd_2']);
  assert.equal(result.domains[0].compatible, false);
  assert.equal(result.domains[2].cnameTarget, 'target.ngrok.io');
  const apiCalls = calls.filter((call) => call.args[0] === 'api');
  assert.deepEqual(apiCalls[0].args, [
    'api', 'reserved-domains', 'list',
    '--limit', '100',
    '--config', '/tmp/ngrok.yml',
  ]);
  assert.deepEqual(apiCalls[1].args, [
    'api', 'reserved-domains', 'list',
    '--limit', '100',
    '--before-id', 'rd_2',
    '--config', '/tmp/ngrok.yml',
  ]);
});

test('creates only an exact hostname and builds a shell-free tunnel command', async () => {
  const calls = [];
  const spawnProcess = fakeSpawn((args) => {
    const status = statusResponder(args);
    if (status) return status;
    return { stdout: JSON.stringify({
      id: 'rd_new',
      domain: 'app.example.com',
      description: 'Runner',
    }) };
  }, calls);
  const created = await createNgrokDomain({
    domain: 'APP.EXAMPLE.COM',
    description: 'Runner',
    ...availableOptions(spawnProcess),
  });
  assert.equal(created.domain, 'app.example.com');
  assert.deepEqual(calls.at(-1).args, [
    'api', 'reserved-domains', 'create',
    '--domain', 'app.example.com',
    '--description', 'Runner',
    '--config', '/tmp/ngrok.yml',
  ]);
  assert.throws(() => validateNgrokHostname('*.example.com'), /sem wildcard/);
  assert.equal(
    composeNgrokManagedDomain('My-App', 'ngrok-free.dev'),
    'my-app.ngrok-free.dev',
  );
  assert.throws(
    () => validateNgrokDomainName('app.example.com'),
    /somente o nome/,
  );
  assert.throws(
    () => composeNgrokManagedDomain('app', 'attacker.example'),
    /não é suportada/,
  );

  assert.deepEqual(createNgrokLaunchSpecification({
    executablePath: path.resolve('/tools/ngrok'),
    configPath: path.resolve('/tmp/ngrok.yml'),
    port: 4200,
    domainId: 'rd_new',
    domain: 'app.example.com',
  }).args, [
    'http', '4200',
    '--url', 'https://app.example.com',
    '--config', path.resolve('/tmp/ngrok.yml'),
    '--log', 'stdout',
    '--log-format', 'json',
    '--log-level', 'info',
  ]);
  assert.deepEqual(createNgrokLaunchSpecification({
    executablePath: path.resolve('/tools/ngrok'),
    configPath: path.resolve('/tmp/ngrok.yml'),
    upstream: 'https://api.internal:8443',
    domainId: 'rd_new',
    domain: 'app.example.com',
  }).args.slice(0, 2), ['http', 'https://api.internal:8443']);
  assert.throws(
    () => createNgrokLaunchSpecification({
      executablePath: path.resolve('/tools/ngrok'),
      configPath: path.resolve('/tmp/ngrok.yml'),
      upstream: 'https://user:secret@api.internal:8443/path',
      domainId: 'rd_new',
      domain: 'app.example.com',
    }),
    /upstream/i,
  );
});

test('bounds output and redacts credential-shaped CLI failures', async () => {
  await assert.rejects(
    runNgrokCommand('/tools/ngrok', ['api'], {
      spawnProcess: fakeSpawn(() => ({
        code: 1,
        stderr: 'api_key=super-secret Authorization: Bearer hidden',
      })),
    }),
    (error) => {
      assert.doesNotMatch(error.message, /super-secret|hidden/);
      assert.match(error.message, /REDACTED/);
      return true;
    },
  );
});

test('normalizes an unavailable domain without exposing ngrok operation details', async () => {
  await assert.rejects(
    runNgrokCommand('/tools/ngrok', ['api'], {
      spawnProcess: fakeSpawn(() => ({
        code: 1,
        stderr: "HTTP 400: This domain is already reserved for another account. [ERR_NGROK_414] Operation ID: op_private",
      })),
    }),
    (error) => {
      assert.equal(
        error.message,
        'Este domínio não está disponível. Escolha outra opção.',
      );
      assert.doesNotMatch(error.message, /ERR_NGROK|op_private|HTTP 400/);
      return true;
    },
  );
});
