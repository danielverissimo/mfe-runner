import { access, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { parse as parseToml } from 'smol-toml';

export const ECOSYSTEMS = Object.freeze([
  'node',
  'java-maven',
  'java-gradle',
  'dotnet',
  'python',
  'rust',
  'go',
]);

export const SUPPORT_LEVELS = Object.freeze({
  node: 'stable',
  'java-maven': 'beta',
  'java-gradle': 'beta',
  dotnet: 'beta',
  python: 'beta',
  rust: 'beta',
  go: 'beta',
});

const MAX_DESCRIPTOR_BYTES = 2 * 1024 * 1024;

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function safeText(filePath) {
  const details = await stat(filePath);
  if (!details.isFile() || details.size > MAX_DESCRIPTOR_BYTES) {
    throw new Error(`Descritor muito grande ou inválido: ${path.basename(filePath)}.`);
  }
  return readFile(filePath, 'utf8');
}

function command(id, label, category, longRunning, task, args = []) {
  return { id, label, category, longRunning, task, args };
}

function normalizeArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function unwrapMavenProject(document) {
  return document?.project ?? document?.['mvn:project'] ?? {};
}

function mavenValue(project, property) {
  return project?.properties?.[property] ??
    project?.build?.plugins?.plugin?.find?.((plugin) =>
      String(plugin?.artifactId ?? '').includes('compiler')
    )?.configuration?.[property] ??
    null;
}

function mavenPlugins(project) {
  return normalizeArray(project?.build?.plugins?.plugin)
    .map((plugin) => String(plugin?.artifactId ?? ''));
}

export class MavenProjectDetector {
  id = 'maven';
  ecosystem = 'java-maven';
  technology = 'Java / Maven';
  markerNames = new Set(['pom.xml']);

  async detect(projectPath) {
    const pomPath = path.join(projectPath, 'pom.xml');
    if (!(await exists(pomPath))) return null;
    const parser = new XMLParser({
      ignoreAttributes: false,
      processEntities: false,
      htmlEntities: false,
      allowBooleanAttributes: false,
      parseTagValue: true,
      trimValues: true,
    });
    const project = unwrapMavenProject(parser.parse(await safeText(pomPath)));
    const artifactId = String(project.artifactId ?? path.basename(projectPath));
    const plugins = mavenPlugins(project);
    const springBoot = plugins.includes('spring-boot-maven-plugin');
    const quarkus = plugins.includes('quarkus-maven-plugin');
    const executable = plugins.includes('exec-maven-plugin');
    const commands = [];
    if (springBoot) {
      commands.push(command(
        'java-maven:spring-boot-run',
        'Maven · Spring Boot',
        'run',
        true,
        'spring-boot:run',
      ));
    }
    if (quarkus) {
      commands.push(command(
        'java-maven:quarkus-dev',
        'Maven · Quarkus Dev',
        'run',
        true,
        'quarkus:dev',
      ));
    }
    if (executable) {
      commands.push(command(
        'java-maven:exec',
        'Maven · Exec',
        'run',
        true,
        'exec:java',
      ));
    }
    commands.push(
      command('java-maven:test', 'Maven · Test', 'test', false, 'test'),
      command('java-maven:package', 'Maven · Package', 'build', false, 'package'),
    );
    const requiredJavaVersion =
      mavenValue(project, 'maven.compiler.release') ??
      mavenValue(project, 'maven.compiler.target') ??
      mavenValue(project, 'maven.compiler.source') ??
      project?.properties?.['java.version'] ??
      null;
    const wrapper = process.platform === 'win32'
      ? path.join(projectPath, 'mvnw.cmd')
      : path.join(projectPath, 'mvnw');
    return {
      detectorId: this.id,
      ecosystem: this.ecosystem,
      technology: this.technology,
      supportLevel: SUPPORT_LEVELS[this.ecosystem],
      name: artifactId,
      suggestedKind: String(project.packaging ?? '') === 'pom'
        ? null
        : 'project',
      evidence: [
        'pom.xml',
        ...(springBoot ? ['Spring Boot Maven Plugin'] : []),
        ...(quarkus ? ['Quarkus Maven Plugin'] : []),
        ...(normalizeArray(project.modules?.module).length
          ? [`${normalizeArray(project.modules?.module).length} módulo(s) Maven`]
          : []),
      ],
      capabilities: [
        'java',
        ...(springBoot || quarkus || executable ? ['application'] : []),
      ],
      commands,
      defaultCommandId: commands.find((item) => item.longRunning)?.id ?? null,
      runtimeRequirements: {
        java: requiredJavaVersion ? String(requiredJavaVersion) : null,
      },
      toolMetadata: {
        buildTool: 'maven',
        wrapperPath: await exists(wrapper) ? wrapper : null,
        modules: normalizeArray(project.modules?.module).map(String),
        coordinates: {
          groupId: String(project.groupId ?? project.parent?.groupId ?? ''),
          artifactId,
          version: String(project.version ?? project.parent?.version ?? ''),
        },
      },
    };
  }
}

function gradleDeclaredProjects(source) {
  const matches = [...source.matchAll(/\binclude\s*(?:\(|\s)\s*([^)\n]+)/g)];
  return matches.flatMap((match) =>
    [...match[1].matchAll(/['"]([^'"]+)['"]/g)].map((item) => item[1])
  );
}

function gradleJavaVersion(source) {
  return source.match(
    /JavaLanguageVersion\.of\s*\(\s*(\d+)\s*\)|languageVersion\s*=\s*JavaLanguageVersion\.of\s*\(\s*(\d+)\s*\)|sourceCompatibility\s*=\s*(?:JavaVersion\.VERSION_)?(\d+(?:_\d+)*)/,
  )?.slice(1).find(Boolean)?.replace('_', '.') ?? null;
}

export class GradleProjectDetector {
  id = 'gradle';
  ecosystem = 'java-gradle';
  technology = 'Java / Gradle';
  markerNames = new Set([
    'build.gradle',
    'build.gradle.kts',
    'settings.gradle',
    'settings.gradle.kts',
  ]);

  async detect(projectPath) {
    const buildPath = (await exists(path.join(projectPath, 'build.gradle.kts')))
      ? path.join(projectPath, 'build.gradle.kts')
      : path.join(projectPath, 'build.gradle');
    const settingsPath =
      (await exists(path.join(projectPath, 'settings.gradle.kts')))
        ? path.join(projectPath, 'settings.gradle.kts')
        : path.join(projectPath, 'settings.gradle');
    if (!(await exists(buildPath)) && !(await exists(settingsPath))) return null;
    const buildSource = await exists(buildPath) ? await safeText(buildPath) : '';
    const settingsSource = await exists(settingsPath)
      ? await safeText(settingsPath)
      : '';
    const springBoot = /org\.springframework\.boot/.test(buildSource);
    const quarkus = /\bio\.quarkus\b/.test(buildSource);
    const application = /\bapplication\b|org\.gradle\.application/.test(buildSource);
    const commands = [];
    if (springBoot) {
      commands.push(command(
        'java-gradle:boot-run',
        'Gradle · Spring Boot',
        'run',
        true,
        'bootRun',
      ));
    }
    if (quarkus) {
      commands.push(command(
        'java-gradle:quarkus-dev',
        'Gradle · Quarkus Dev',
        'run',
        true,
        'quarkusDev',
      ));
    }
    if (application) {
      commands.push(command(
        'java-gradle:run',
        'Gradle · Run',
        'run',
        true,
        'run',
      ));
    }
    commands.push(
      command('java-gradle:test', 'Gradle · Test', 'test', false, 'test'),
      command('java-gradle:build', 'Gradle · Build', 'build', false, 'build'),
    );
    const projectName =
      settingsSource.match(/\brootProject\.name\s*=\s*['"]([^'"]+)['"]/)?.[1] ??
      path.basename(projectPath);
    const wrapper = process.platform === 'win32'
      ? path.join(projectPath, 'gradlew.bat')
      : path.join(projectPath, 'gradlew');
    const modules = gradleDeclaredProjects(settingsSource);
    return {
      detectorId: this.id,
      ecosystem: this.ecosystem,
      technology: this.technology,
      supportLevel: SUPPORT_LEVELS[this.ecosystem],
      name: projectName,
      suggestedKind: 'project',
      evidence: [
        path.basename(await exists(buildPath) ? buildPath : settingsPath),
        ...(springBoot ? ['Spring Boot Gradle Plugin'] : []),
        ...(quarkus ? ['Quarkus Gradle Plugin'] : []),
        ...(modules.length ? [`${modules.length} subprojeto(s) Gradle`] : []),
      ],
      capabilities: [
        'java',
        ...(springBoot || quarkus || application ? ['application'] : []),
      ],
      commands,
      defaultCommandId: commands.find((item) => item.longRunning)?.id ?? null,
      runtimeRequirements: { java: gradleJavaVersion(buildSource) },
      toolMetadata: {
        buildTool: 'gradle',
        wrapperPath: await exists(wrapper) ? wrapper : null,
        modules,
      },
    };
  }
}

export class DotnetProjectDetector {
  id = 'dotnet';
  ecosystem = 'dotnet';
  technology = '.NET';
  markerNames = new Set(['global.json']);

  matches(entries) {
    return entries.some((entry) =>
      entry.isFile() && (
        entry.name.endsWith('.csproj') ||
        entry.name.endsWith('.fsproj') ||
        entry.name.endsWith('.sln') ||
        entry.name === 'global.json'
      )
    );
  }

  async detect(projectPath, _sourceRoot, entries = []) {
    const projectFile = entries.find((entry) =>
      entry.isFile() &&
      (entry.name.endsWith('.csproj') || entry.name.endsWith('.fsproj'))
    )?.name;
    const solution = entries.find((entry) =>
      entry.isFile() && entry.name.endsWith('.sln')
    )?.name;
    if (!projectFile && !solution) return null;
    let sdkVersion = null;
    const globalJson = path.join(projectPath, 'global.json');
    if (await exists(globalJson)) {
      try {
        sdkVersion = JSON.parse(await safeText(globalJson))?.sdk?.version ?? null;
      } catch {
        // Invalid metadata is reported as an unknown requirement.
      }
    }
    const target = projectFile ?? solution;
    return {
      detectorId: this.id,
      ecosystem: this.ecosystem,
      technology: this.technology,
      supportLevel: SUPPORT_LEVELS[this.ecosystem],
      name: path.basename(target, path.extname(target)),
      suggestedKind: 'project',
      evidence: [target, ...(sdkVersion ? [`SDK ${sdkVersion}`] : [])],
      capabilities: ['dotnet', 'application'],
      commands: [
        command('dotnet:run', '.NET · Run', 'run', true, 'run', projectFile
          ? ['--project', projectFile]
          : []),
        command('dotnet:test', '.NET · Test', 'test', false, 'test', [target]),
        command('dotnet:build', '.NET · Build', 'build', false, 'build', [target]),
      ],
      defaultCommandId: projectFile ? 'dotnet:run' : null,
      runtimeRequirements: { dotnet: sdkVersion },
      toolMetadata: { projectFile, solution },
    };
  }
}

function pythonFramework(projectPath, dependencies) {
  if (dependencies.some((item) => item === 'django') ||
      dependencies.some((item) => item.startsWith('django'))) {
    return { id: 'python:django', label: 'Python · Django', args: ['manage.py', 'runserver'] };
  }
  if (dependencies.some((item) => item.startsWith('flask'))) {
    return { id: 'python:flask', label: 'Python · Flask', args: ['-m', 'flask', 'run'] };
  }
  if (dependencies.some((item) => item.startsWith('fastapi'))) {
    return {
      id: 'python:fastapi',
      label: 'Python · FastAPI',
      args: ['-m', 'uvicorn', 'main:app', '--reload'],
    };
  }
  return null;
}

export class PythonProjectDetector {
  id = 'python';
  ecosystem = 'python';
  technology = 'Python';
  markerNames = new Set([
    'pyproject.toml',
    'requirements.txt',
    'Pipfile',
    'poetry.lock',
    'uv.lock',
  ]);

  async detect(projectPath) {
    const pyprojectPath = path.join(projectPath, 'pyproject.toml');
    const requirementsPath = path.join(projectPath, 'requirements.txt');
    if (!(await exists(pyprojectPath)) && !(await exists(requirementsPath)) &&
        !(await exists(path.join(projectPath, 'Pipfile')))) return null;
    let metadata = {};
    if (await exists(pyprojectPath)) {
      try {
        metadata = parseToml(await safeText(pyprojectPath));
      } catch {
        // Keep the project discoverable and expose the malformed descriptor.
      }
    }
    const requirements = await exists(requirementsPath)
      ? (await safeText(requirementsPath)).split(/\r?\n/)
      : [];
    const dependencies = [
      ...Object.keys(metadata?.project?.dependencies ?? {}),
      ...normalizeArray(metadata?.project?.dependencies),
      ...Object.keys(metadata?.tool?.poetry?.dependencies ?? {}),
      ...requirements,
    ].map((item) => String(item).trim().toLowerCase());
    const framework = pythonFramework(projectPath, dependencies);
    const commands = [
      ...(framework
        ? [command(framework.id, framework.label, 'run', true, '', framework.args)]
        : []),
      command('python:test', 'Python · Test', 'test', false, '', ['-m', 'pytest']),
    ];
    return {
      detectorId: this.id,
      ecosystem: this.ecosystem,
      technology: this.technology,
      supportLevel: SUPPORT_LEVELS[this.ecosystem],
      name: metadata?.project?.name ??
        metadata?.tool?.poetry?.name ??
        path.basename(projectPath),
      suggestedKind: 'project',
      evidence: [
        ...(await exists(pyprojectPath) ? ['pyproject.toml'] : []),
        ...(await exists(requirementsPath) ? ['requirements.txt'] : []),
        ...(framework ? [framework.label.replace('Python · ', '')] : []),
      ],
      capabilities: ['python', ...(framework ? ['application'] : [])],
      commands,
      defaultCommandId: framework?.id ?? null,
      runtimeRequirements: {
        python: metadata?.project?.['requires-python'] ?? null,
      },
      toolMetadata: {
        manager: await exists(path.join(projectPath, 'uv.lock'))
          ? 'uv'
          : await exists(path.join(projectPath, 'poetry.lock'))
            ? 'poetry'
            : 'pip',
      },
    };
  }
}

export class RustProjectDetector {
  id = 'rust';
  ecosystem = 'rust';
  technology = 'Rust';
  markerNames = new Set(['Cargo.toml']);

  async detect(projectPath) {
    const manifestPath = path.join(projectPath, 'Cargo.toml');
    if (!(await exists(manifestPath))) return null;
    const manifest = parseToml(await safeText(manifestPath));
    const packageName = manifest?.package?.name;
    const workspaceOnly = !packageName && manifest?.workspace;
    return {
      detectorId: this.id,
      ecosystem: this.ecosystem,
      technology: this.technology,
      supportLevel: SUPPORT_LEVELS[this.ecosystem],
      name: packageName ?? path.basename(projectPath),
      suggestedKind: workspaceOnly ? null : 'project',
      evidence: [
        'Cargo.toml',
        ...(workspaceOnly ? ['Cargo workspace'] : []),
      ],
      capabilities: ['rust', ...(packageName ? ['application'] : [])],
      commands: [
        ...(packageName
          ? [command('rust:run', 'Cargo · Run', 'run', true, 'run')]
          : []),
        command('rust:test', 'Cargo · Test', 'test', false, 'test'),
        command('rust:build', 'Cargo · Build', 'build', false, 'build'),
      ],
      defaultCommandId: packageName ? 'rust:run' : null,
      runtimeRequirements: { rust: null },
      toolMetadata: { workspace: !!manifest?.workspace },
    };
  }
}

export class GoProjectDetector {
  id = 'go';
  ecosystem = 'go';
  technology = 'Go';
  markerNames = new Set(['go.mod', 'go.work']);

  async detect(projectPath) {
    const modulePath = path.join(projectPath, 'go.mod');
    const workPath = path.join(projectPath, 'go.work');
    const descriptor = await exists(modulePath) ? modulePath : workPath;
    if (!(await exists(descriptor))) return null;
    const source = await safeText(descriptor);
    const moduleName = source.match(/^\s*module\s+(\S+)/m)?.[1] ??
      path.basename(projectPath);
    const goVersion = source.match(/^\s*go\s+(\d+(?:\.\d+)+)/m)?.[1] ?? null;
    const toolchain = source.match(/^\s*toolchain\s+(\S+)/m)?.[1] ?? null;
    return {
      detectorId: this.id,
      ecosystem: this.ecosystem,
      technology: this.technology,
      supportLevel: SUPPORT_LEVELS[this.ecosystem],
      name: moduleName,
      suggestedKind: 'project',
      evidence: [path.basename(descriptor)],
      capabilities: ['go', 'application'],
      commands: [
        command('go:run', 'Go · Run', 'run', true, 'run', ['.']),
        command('go:test', 'Go · Test', 'test', false, 'test', ['./...']),
        command('go:build', 'Go · Build', 'build', false, 'build', ['./...']),
      ],
      defaultCommandId: 'go:run',
      runtimeRequirements: { go: toolchain ?? goVersion },
      toolMetadata: { workspace: path.basename(descriptor) === 'go.work' },
    };
  }
}

export const NON_NODE_PROJECT_DETECTORS = [
  new MavenProjectDetector(),
  new GradleProjectDetector(),
  new DotnetProjectDetector(),
  new PythonProjectDetector(),
  new RustProjectDetector(),
  new GoProjectDetector(),
];

export function directoryHasEcosystemMarker(entries) {
  return NON_NODE_PROJECT_DETECTORS.some((detector) =>
    detector.matches
      ? detector.matches(entries)
      : entries.some((entry) =>
          entry.isFile() && detector.markerNames.has(entry.name)
        )
  );
}

export const __test__ = {
  gradleDeclaredProjects,
  gradleJavaVersion,
  mavenPlugins,
};
