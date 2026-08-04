const INSTALLER_DEFINITIONS = [
  {
    pattern: /^MFE-Runner-.+-mac-(arm64|x64)\.dmg$/,
    os: 'mac',
  },
  {
    pattern: /^MFE-Runner-.+-windows-(arm64|ia32|x64)\.exe$/,
    os: 'windows',
  },
  {
    pattern: /^MFE-Runner-.+-linux-(arm64|aarch64|amd64|x64|x86_64)\.(deb|rpm)$/,
    os: 'linux',
  },
];

const ARCHITECTURE_ALIASES = {
  aarch64: 'arm64',
  amd64: 'x64',
  x86_64: 'x64',
};

export function installerFromAsset(asset, version) {
  for (const definition of INSTALLER_DEFINITIONS) {
    const match = asset.name.match(definition.pattern);
    if (!match) continue;

    const arch = ARCHITECTURE_ALIASES[match[1]] || match[1];
    const extension = asset.name.split('.').pop().toLowerCase();
    return {
      os: definition.os,
      arch,
      file: asset.name,
      extension,
      label: `${definition.os}-${arch}-${extension}`,
      size: asset.size,
      url: asset.browser_download_url,
      version,
    };
  }

  return null;
}

export function catalogFromGitHubReleases(releases) {
  return {
    releases: releases
      .filter((release) => !release.draft && !release.prerelease)
      .map((release) => {
        const version = String(release.tag_name || release.name || '').replace(/^v/i, '');
        return {
          version,
          publishedAt: release.published_at,
          downloads: (release.assets || [])
            .map((asset) => installerFromAsset(asset, version))
            .filter(Boolean),
        };
      })
      .filter((release) => release.version && release.downloads.length),
  };
}
