import assert from 'node:assert/strict';
import test from 'node:test';

import {
  catalogFromGitHubReleases,
  installerFromAsset,
} from './download-catalog.js';

function asset(name) {
  return {
    name,
    size: 1024,
    browser_download_url: `https://example.test/${name}`,
  };
}

test('recognizes Debian and RPM Linux artifacts and normalizes their architectures', () => {
  const cases = [
    ['MFE-Runner-0.2.0-linux-amd64.deb', 'x64', 'deb'],
    ['MFE-Runner-0.2.0-linux-arm64.deb', 'arm64', 'deb'],
    ['MFE-Runner-0.2.0-linux-x86_64.rpm', 'x64', 'rpm'],
    ['MFE-Runner-0.2.0-linux-aarch64.rpm', 'arm64', 'rpm'],
  ];

  for (const [name, arch, extension] of cases) {
    assert.deepEqual(
      installerFromAsset(asset(name), '0.2.0'),
      {
        os: 'linux',
        arch,
        file: name,
        extension,
        label: `linux-${arch}-${extension}`,
        size: 1024,
        url: `https://example.test/${name}`,
        version: '0.2.0',
      },
    );
  }
});

test('keeps supported installers from published stable releases only', () => {
  const releases = catalogFromGitHubReleases([
    {
      tag_name: 'v0.2.0',
      published_at: '2026-08-04T00:00:00Z',
      draft: false,
      prerelease: false,
      assets: [
        asset('MFE-Runner-0.2.0-linux-x86_64.rpm'),
        asset('MFE-Runner-0.2.0-linux-amd64.deb'),
        asset('latest-linux.yml'),
      ],
    },
    {
      tag_name: 'v0.2.1',
      draft: true,
      prerelease: false,
      assets: [asset('MFE-Runner-0.2.1-linux-x86_64.rpm')],
    },
  ]);

  assert.equal(releases.releases.length, 1);
  assert.equal(releases.releases[0].version, '0.2.0');
  assert.deepEqual(
    releases.releases[0].downloads.map(({ extension }) => extension),
    ['rpm', 'deb'],
  );
});
