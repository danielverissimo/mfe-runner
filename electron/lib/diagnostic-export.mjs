import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { rename, unlink, writeFile } from 'node:fs/promises';
import { strToU8, zipSync } from 'fflate';
import { redactLog } from './process-supervisor.mjs';

const MAX_ARCHIVE_INPUT_BYTES = 50 * 1024 * 1024;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function safeFilename(value) {
  const normalized = value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return normalized || 'projeto';
}

export function createPathSanitizer(workspace, projects) {
  const replacements = [
    [workspace.shellRootPath, '<SHELL_ROOT>'],
    ...workspace.mfeRoots.map((root, index) => [
      root.rootPath,
      `<MFE_ROOT:${index + 1}>`,
    ]),
    ...projects.map((project) => [
      project.absolutePath,
      `<PROJECT:${safeFilename(project.displayName)}>`,
    ]),
    [os.homedir(), '<HOME>'],
  ]
    .filter(([value]) => typeof value === 'string' && value)
    .sort((left, right) => right[0].length - left[0].length);

  return (input) => {
    let output = String(input);
    for (const [source, replacement] of replacements) {
      output = output.replace(
        new RegExp(escapeRegExp(source), 'g'),
        replacement,
      );
    }
    output = output
      .replace(
        /(?:[A-Za-z]:\\|\\\\)[^\s"'<>|]+(?:\\[^\s"'<>|]+)*/g,
        '<ABSOLUTE_PATH>',
      )
      .replace(
        /(^|[\s("'=])\/(?:Users|home|private|var|tmp|opt|mnt|Volumes)\/[^\s"'<>)]*/gm,
        '$1<ABSOLUTE_PATH>',
      );
    return output;
  };
}

function redactValue(value) {
  if (typeof value === 'string') return redactLog(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redactValue(item)]),
    );
  }
  return value;
}

function stringify(value, sanitize) {
  return sanitize(JSON.stringify(redactValue(value), null, 2));
}

function formatLog(entry, sanitize) {
  return sanitize(
    `${entry.timestamp} [${(entry.level ?? 'info').toUpperCase()}] ` +
      `[${entry.projectName}] ${redactLog(entry.message)}`,
  );
}

export function buildDiagnosticArchive({
  workspace,
  catalog,
  processes,
  systemInfo,
  appVersion,
  entryIds,
  includeAbsolutePaths,
}) {
  const sanitize = includeAbsolutePaths
    ? (value) => String(value)
    : createPathSanitizer(workspace, catalog.projects);
  const allowedIds = entryIds ? new Set(entryIds) : null;
  const logsByProject = new Map();
  for (const process of processes) {
    if (process.workspaceId !== workspace.id) continue;
    for (const entry of process.logs) {
      if (allowedIds && !allowedIds.has(entry.id)) continue;
      const entries = logsByProject.get(entry.projectId) ?? [];
      entries.push(entry);
      logsByProject.set(entry.projectId, entries);
    }
  }

  const summary = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    runner: {
      version: appVersion,
      runtime: systemInfo.runtime,
      operatingSystem: systemInfo.operatingSystem,
      hardware: systemInfo.hardware,
    },
    workspace: {
      id: workspace.id,
      name: workspace.name,
      environment: workspace.environment,
      ...(includeAbsolutePaths
        ? {
            shellRootPath: workspace.shellRootPath,
            mfeRootPaths: workspace.mfeRoots.map((root) => root.rootPath),
          }
        : {}),
    },
    projects: catalog.projects.map((project) => {
      const process = processes.find(
        (item) =>
          item.workspaceId === workspace.id &&
          item.projectId === project.id,
      );
      return {
        id: project.id,
        name: project.displayName,
        role: project.role,
        relativePath: project.relativePath,
        ...(includeAbsolutePaths ? { absolutePath: project.absolutePath } : {}),
        port: project.port,
        node: {
          available: project.node.available,
          version: project.node.version,
          source: project.node.source,
        },
        git: project.git,
        process: process
          ? {
              script: process.script,
              status: process.status,
              startedAt: process.startedAt,
              stoppedAt: process.stoppedAt,
              exitCode: process.exitCode,
              message: redactLog(process.message),
            }
          : null,
      };
    }),
  };
  const diagnostics = {
    workspace: catalog.warnings,
    projects: catalog.projects
      .filter((project) => project.warnings.length || project.git?.message)
      .map((project) => ({
        id: project.id,
        name: project.displayName,
        warnings: project.warnings,
        git: project.git?.message || null,
      })),
    processes: processes
      .filter(
        (process) =>
          process.workspaceId === workspace.id &&
          ['failed', 'degraded', 'conflict'].includes(process.status),
      )
      .map((process) => ({
        projectId: process.projectId,
        projectName: process.projectName,
        status: process.status,
        message: redactLog(process.message),
      })),
  };

  const files = {
    'README.txt': strToU8(
      [
        'MFE Runner - pacote de diagnóstico',
        `Gerado em: ${summary.generatedAt}`,
        `Workspace: ${workspace.name}`,
        `Paths absolutos: ${includeAbsolutePaths ? 'incluídos' : 'removidos'}`,
        '',
        'Tokens e campos sensíveis conhecidos foram redigidos.',
      ].join('\n'),
    ),
    'summary.json': strToU8(stringify(summary, sanitize)),
    'diagnostics.json': strToU8(stringify(diagnostics, sanitize)),
  };
  const usedNames = new Set();
  for (const project of catalog.projects) {
    const entries = logsByProject.get(project.id);
    if (!entries?.length) continue;
    let name = safeFilename(project.displayName);
    let suffix = 2;
    while (usedNames.has(name)) name = `${safeFilename(project.displayName)}-${suffix++}`;
    usedNames.add(name);
    files[`logs/${name}.log`] = strToU8(
      entries
        .toSorted(
          (left, right) =>
            new Date(left.timestamp).getTime() -
            new Date(right.timestamp).getTime(),
        )
        .map((entry) => formatLog(entry, sanitize))
        .join('\n'),
    );
  }

  const inputBytes = Object.values(files).reduce(
    (total, value) => total + value.byteLength,
    0,
  );
  if (inputBytes > MAX_ARCHIVE_INPUT_BYTES) {
    throw new Error('O pacote de diagnóstico excede o limite de 50 MB.');
  }
  return zipSync(files, { level: 6 });
}

export async function writeDiagnosticArchive(filePath, archive) {
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, archive, { mode: 0o600 });
    await rename(temporaryPath, filePath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => {});
    throw error;
  }
}

export function defaultDiagnosticFilename(workspaceName) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `mfe-runner-${safeFilename(workspaceName)}-${timestamp}.zip`;
}
