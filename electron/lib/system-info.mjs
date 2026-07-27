import os from 'node:os';

export function platformName(platform) {
  return {
    darwin: 'macOS',
    linux: 'Linux',
    win32: 'Windows',
  }[platform] ?? platform;
}

export function collectSystemInfo({ appVersion, versions = process.versions }) {
  const processors = os.cpus();
  return {
    platform: process.platform,
    platformName: platformName(process.platform),
    operatingSystem: {
      type: os.type(),
      release: os.release(),
      version: os.version(),
      architecture: os.arch(),
    },
    hardware: {
      cpuModel: processors[0]?.model?.trim() || 'Não identificado',
      logicalCores: processors.length,
      totalMemoryBytes: os.totalmem(),
    },
    runtime: {
      app: appVersion,
      node: versions.node,
      electron: versions.electron ?? null,
      chrome: versions.chrome ?? null,
      v8: versions.v8,
    },
  };
}
