import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  inspectProjectSource,
  publicSourceInspection,
} from './project-detectors.mjs';

async function packageProject(directory, {
  name = path.basename(directory),
  scripts = {},
  angularType,
  ngPackage = false,
  nestedPackageName,
} = {}) {
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, 'package.json'),
    JSON.stringify({ name, scripts }),
  );
  if (angularType) {
    const projectRoot = nestedPackageName ? 'projects/shared-ui' : '';
    await writeFile(
      path.join(directory, 'angular.json'),
      JSON.stringify({
        projects: {
          [name]: {
            root: projectRoot,
            projectType: angularType,
            architect: ngPackage
              ? {
                  build: {
                    options: {
                      project: projectRoot
                        ? `${projectRoot}/ng-package.json`
                        : 'ng-package.json',
                    },
                  },
                }
              : {},
          },
        },
      }),
    );
    if (nestedPackageName) {
      await mkdir(path.join(directory, projectRoot), { recursive: true });
      await writeFile(
        path.join(directory, projectRoot, 'package.json'),
        JSON.stringify({ name: nestedPackageName }),
      );
    }
  }
  if (ngPackage) {
    const ngPackageDirectory = nestedPackageName
      ? path.join(directory, 'projects', 'shared-ui')
      : directory;
    await writeFile(
      path.join(ngPackageDirectory, 'ng-package.json'),
      JSON.stringify({
        dest: nestedPackageName
          ? '../../dist/shared-ui'
          : `dist/${name}`,
      }),
    );
  }
}

test('classifies an exact executable package as a project source', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'runner-detector-project-'));
  await packageProject(root, {
    name: 'api-gateway',
    scripts: { start: 'node server.js' },
  });
  const inspection = publicSourceInspection(await inspectProjectSource(root));
  assert.equal(inspection.sourceType, 'project');
  assert.equal(inspection.projects[0].suggestedKind, 'project');
  assert.match(inspection.projects[0].evidence.join(' '), /Script executável/);
});

test('reports bounded scan and analysis progress without exposing control', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'runner-detector-progress-'));
  await packageProject(root, {
    name: 'app',
    scripts: { start: 'node app.js' },
  });
  const progress = [];

  await inspectProjectSource(root, (value) => progress.push(value));

  assert.equal(progress[0].phase, 'preparing');
  assert.equal(progress.at(-1).phase, 'complete');
  assert.equal(progress.at(-1).percent, 100);
  assert.ok(progress.some((value) => value.phase === 'scanning'));
  assert.ok(progress.some((value) => value.phase === 'analyzing'));
  assert.ok(progress.every((value) =>
    Number.isInteger(value.percent) &&
    value.percent >= 0 &&
    value.percent <= 100
  ));
});

test('classifies nested packages as a root and preserves uncertain projects', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'runner-detector-root-'));
  await packageProject(path.join(root, 'apps', 'known'), {
    scripts: { dev: 'vite' },
  });
  await packageProject(path.join(root, 'tools', 'uncertain'));
  const inspection = publicSourceInspection(await inspectProjectSource(root));
  assert.equal(inspection.sourceType, 'root');
  assert.equal(inspection.projects.length, 2);
  assert.equal(
    inspection.projects.find((item) => item.name === 'uncertain')
      ?.suggestedKind,
    null,
  );
});

test('classifies root plus nested packages as a monorepo', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'runner-detector-monorepo-'));
  await packageProject(root, {
    name: 'workspace-root',
    scripts: { start: 'node index.js' },
  });
  await packageProject(path.join(root, 'packages', 'web'), {
    scripts: { start: 'vite' },
  });
  const inspection = await inspectProjectSource(root);
  assert.equal(inspection.sourceType, 'monorepo');
  assert.deepEqual(
    inspection.projects.map((item) => item.relativePath).sort(),
    ['.', 'packages/web'],
  );
});

test('suggests library only from reliable Angular library evidence', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'runner-detector-library-'));
  await packageProject(root, {
    name: 'shared-ui',
    scripts: {
      start: 'ng build shared-ui',
      watch: 'ng build shared-ui --watch',
    },
    angularType: 'library',
    ngPackage: true,
    nestedPackageName: '@example/shared-ui',
  });
  const inspection = publicSourceInspection(await inspectProjectSource(root));
  assert.equal(inspection.projects[0].suggestedKind, 'library');
  assert.equal(inspection.projects[0].defaultCommandId, 'node:script:watch');
  assert.deepEqual(inspection.projects[0].capabilities, ['angular']);
  assert.equal(
    inspection.projects[0].localLinkSuggestion?.packageName,
    '@example/shared-ui',
  );
  assert.equal(
    inspection.projects[0].localLinkSuggestion?.artifactRelativePath,
    'dist/shared-ui',
  );
});

test('represents each nested Angular library once when inspecting an ancestor directory', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'runner-detector-nested-libraries-'));
  for (const directory of ['libs/first', 'libs/second']) {
    await packageProject(path.join(root, directory), {
      scripts: { build: 'ng build', watch: 'ng build --watch' },
      angularType: 'library',
      ngPackage: true,
      nestedPackageName: '@example/shared-ui',
    });
  }
  // An unrelated project with the same package name must remain visible.
  await packageProject(path.join(root, 'independent'), {
    name: '@example/shared-ui', scripts: { start: 'node index.js' },
  });
  const inspection = publicSourceInspection(await inspectProjectSource(root));
  assert.deepEqual(inspection.projects.map((item) => item.relativePath).sort(), [
    'independent', 'libs/first', 'libs/second',
  ]);
  for (const library of inspection.projects.filter((item) => item.suggestedKind === 'library')) {
    assert.deepEqual(library.scripts, ['build', 'watch']);
    assert.equal(library.localLinkSuggestion.developmentScript, 'watch');
    assert.equal(library.localLinkSuggestion.artifactRelativePath, 'dist/shared-ui');
  }
  const exact = await inspectProjectSource(path.join(root, 'libs/first'));
  assert.deepEqual(exact.projects.map((item) => item.relativePath), ['.']);
});

test('keeps distinct libraries in an Angular workspace with multiple projects', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'runner-detector-multiple-libraries-'));
  await packageProject(root, { scripts: { build: 'ng build' } });
  await writeFile(path.join(root, 'angular.json'), JSON.stringify({ projects: {
    first: { root: 'projects/first', projectType: 'library' },
    second: { root: 'projects/second', projectType: 'library' },
  } }));
  for (const name of ['first', 'second']) {
    await packageProject(path.join(root, 'projects', name), { ngPackage: true });
  }
  const inspection = await inspectProjectSource(root);
  assert.deepEqual(inspection.projects.map((item) => item.relativePath).sort(), [
    '.', 'projects/first', 'projects/second',
  ]);
});

test('ignores dependency and output directories while scanning', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'runner-detector-ignore-'));
  await packageProject(path.join(root, 'app'), {
    scripts: { start: 'node app.js' },
  });
  await packageProject(path.join(root, 'node_modules', 'dependency'), {
    scripts: { start: 'node dependency.js' },
  });
  await packageProject(path.join(root, 'dist', 'generated'), {
    scripts: { start: 'node generated.js' },
  });
  const inspection = await inspectProjectSource(root);
  assert.deepEqual(
    inspection.projects.map((item) => item.relativePath),
    ['app'],
  );
});

test('detects a Spring Boot Maven project and its Java requirement', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'runner-detector-maven-'));
  await writeFile(path.join(root, 'pom.xml'), `<?xml version="1.0"?>
    <project>
      <modelVersion>4.0.0</modelVersion>
      <groupId>com.example</groupId>
      <artifactId>orders-api</artifactId>
      <version>1.0.0</version>
      <properties><java.version>21</java.version></properties>
      <build><plugins><plugin>
        <artifactId>spring-boot-maven-plugin</artifactId>
      </plugin></plugins></build>
    </project>`);
  await writeFile(path.join(root, 'mvnw'), '#!/bin/sh\n');

  const inspection = publicSourceInspection(await inspectProjectSource(root));
  const project = inspection.projects[0];

  assert.equal(project.ecosystem, 'java-maven');
  assert.equal(project.supportLevel, 'beta');
  assert.equal(project.name, 'orders-api');
  assert.equal(project.defaultCommandId, 'java-maven:spring-boot-run');
  assert.equal(project.runtimeRequirements.java, '21');
  assert.ok(project.commands.some((item) => item.id === 'java-maven:test'));
  assert.match(project.evidence.join(' '), /Spring Boot/);
});

test('detects a multi-project Gradle Kotlin build without running Gradle', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'runner-detector-gradle-'));
  await writeFile(
    path.join(root, 'settings.gradle.kts'),
    `rootProject.name = "billing"\ninclude("api", "domain")\n`,
  );
  await writeFile(
    path.join(root, 'build.gradle.kts'),
    `plugins { id("org.springframework.boot") version "3.5.0" }
     java { toolchain { languageVersion = JavaLanguageVersion.of(21) } }`,
  );
  await writeFile(path.join(root, 'gradlew'), '#!/bin/sh\n');

  const inspection = publicSourceInspection(await inspectProjectSource(root));
  const project = inspection.projects[0];

  assert.equal(project.ecosystem, 'java-gradle');
  assert.equal(project.supportLevel, 'beta');
  assert.equal(project.name, 'billing');
  assert.equal(project.defaultCommandId, 'java-gradle:boot-run');
  assert.equal(project.runtimeRequirements.java, '21');
  assert.deepEqual(project.toolMetadata.modules, ['api', 'domain']);
});

test('detects .NET, Python, Rust and Go projects as beta ecosystems', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'runner-detector-mixed-'));
  const dotnet = path.join(root, 'dotnet-api');
  const python = path.join(root, 'python-api');
  const rust = path.join(root, 'rust-cli');
  const go = path.join(root, 'go-api');
  await Promise.all([dotnet, python, rust, go].map((directory) =>
    mkdir(directory, { recursive: true })
  ));
  await writeFile(path.join(dotnet, 'Api.csproj'), '<Project />');
  await writeFile(
    path.join(dotnet, 'global.json'),
    JSON.stringify({ sdk: { version: '9.0.100' } }),
  );
  await writeFile(
    path.join(python, 'pyproject.toml'),
    `[project]\nname = "python-api"\nrequires-python = ">=3.12"\ndependencies = ["fastapi"]\n`,
  );
  await writeFile(
    path.join(rust, 'Cargo.toml'),
    `[package]\nname = "rust-cli"\nversion = "0.1.0"\n`,
  );
  await writeFile(
    path.join(go, 'go.mod'),
    'module example.com/go-api\ngo 1.24\n',
  );

  const inspection = publicSourceInspection(await inspectProjectSource(root));
  const projects = new Map(inspection.projects.map((item) => [
    item.ecosystem,
    item,
  ]));

  assert.deepEqual(
    [...projects.keys()].sort(),
    ['dotnet', 'go', 'python', 'rust'],
  );
  assert.ok([...projects.values()].every(
    (project) => project.supportLevel === 'beta',
  ));
  assert.equal(projects.get('dotnet').runtimeRequirements.dotnet, '9.0.100');
  assert.equal(projects.get('python').defaultCommandId, 'python:fastapi');
  assert.equal(projects.get('rust').defaultCommandId, 'rust:run');
  assert.equal(projects.get('go').defaultCommandId, 'go:run');
});

test('detects Flutter projects and structured web, Android, iOS, test and build commands', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'runner-detector-flutter-'));
  await writeFile(path.join(root, 'pubspec.yaml'), `name: mobile_shell
environment:
  sdk: ">=3.3.0 <4.0.0"
dependencies:
  flutter:
    sdk: flutter
dev_dependencies:
  flutter_test:
    sdk: flutter
`);

  const inspection = publicSourceInspection(await inspectProjectSource(root));
  const project = inspection.projects[0];
  assert.equal(project.ecosystem, 'flutter');
  assert.equal(project.supportLevel, 'beta');
  assert.equal(project.runtimeRequirements.flutter, '>=3.3.0 <4.0.0');
  assert.equal(project.defaultCommandId, 'flutter:run:web');
  assert.deepEqual(
    project.commands.map((item) => item.id),
    [
      'flutter:run:web',
      'flutter:run:android',
      'flutter:run:ios',
      'flutter:test',
      'flutter:build:web',
      'flutter:build:android',
      'flutter:build:ios',
    ],
  );
});

test('does not warn about missing package.json or expose Flutter Android modules', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'runner-detector-flutter-mixed-'));
  const api = path.join(root, 'server-api');
  const flutter = path.join(root, 'mobile-app');
  const android = path.join(flutter, 'android');
  const androidApp = path.join(android, 'app');
  await Promise.all([api, androidApp].map((directory) =>
    mkdir(directory, { recursive: true })
  ));
  await writeFile(path.join(api, 'pom.xml'), `<?xml version="1.0"?>
    <project>
      <modelVersion>4.0.0</modelVersion>
      <artifactId>server-api</artifactId>
      <version>1.0.0</version>
    </project>`);
  await writeFile(path.join(flutter, 'pubspec.yaml'), `name: mobile_app
environment:
  sdk: ">=3.3.0 <4.0.0"
dependencies:
  flutter:
    sdk: flutter
`);
  await writeFile(
    path.join(android, 'settings.gradle'),
    `rootProject.name = 'mobile_app_android'\ninclude ':app'\n`,
  );
  await writeFile(
    path.join(androidApp, 'build.gradle'),
    `plugins { id 'com.android.application' }\n`,
  );

  const inspection = publicSourceInspection(await inspectProjectSource(root));

  assert.deepEqual(inspection.warnings, []);
  assert.deepEqual(
    inspection.projects.map((project) => [
      project.relativePath,
      project.ecosystem,
    ]).sort((left, right) => left[0].localeCompare(right[0])),
    [
      ['mobile-app', 'flutter'],
      ['server-api', 'java-maven'],
    ],
  );
});

test('does not rediscover generated release worktrees or Rust target caches', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'runner-release-output-'));
  try {
    await packageProject(root, { name: 'vcli', scripts: { dev: 'vite' } });
    await packageProject(path.join(root, 'staging', 'release-worktrees', 'candidate'), { name: 'release-copy' });
    await packageProject(path.join(root, 'src-tauri', 'target', 'generated'), { name: 'build-output' });
    const inspection = publicSourceInspection(await inspectProjectSource(root));
    assert.deepEqual(inspection.projects.map((project) => project.name), ['vcli']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('represents VCLI once from its root or an ancestor, preserving its release command', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'runner-vcli-discovery-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const app = path.join(root, 'vcli');
  const release = path.join(app, 'staging', 'release-worktrees', '1.2.3-example');
  const manifest = {
    name: 'vcli',
    scripts: { dev: 'vite', 'release:publish': 'node scripts/release-orchestrator.mjs' },
    devDependencies: { '@tauri-apps/cli': '^2.0.0' },
  };
  for (const directory of [app, release]) {
    await mkdir(path.join(directory, 'src-tauri'), { recursive: true });
    await mkdir(path.join(directory, 'scripts'), { recursive: true });
    await writeFile(path.join(directory, 'package.json'), JSON.stringify(manifest));
    await writeFile(path.join(directory, 'src-tauri', 'tauri.conf.json'), '{}');
    await writeFile(path.join(directory, 'src-tauri', 'Cargo.toml'), '[package]\nname = "vcli"\nversion = "1.2.3"\n');
    await writeFile(path.join(directory, 'scripts', 'release-orchestrator.mjs'), 'throw new Error("must not execute");');
    await writeFile(path.join(directory, 'distribution.config.json'), '{}');
  }
  await packageProject(path.join(app, 'src-tauri', 'target', 'generated'), { name: 'build-output' });

  for (const [scanRoot, relativePath, sourceType] of [
    [app, '.', 'project'],
    [root, 'vcli', 'root'],
  ]) {
    const inspection = publicSourceInspection(await inspectProjectSource(scanRoot));
    assert.equal(inspection.sourceType, sourceType);
    assert.deepEqual(inspection.warnings, []);
    assert.deepEqual(inspection.projects.map((project) => [project.relativePath, project.ecosystem]), [[relativePath, 'node']]);
    const project = inspection.projects[0];
    assert.equal(project.defaultCommandId, 'node:script:dev');
    assert.equal(project.commands.find((command) => command.id === 'node:script:release:publish').releaseKind, 'vcli');
  }
});

test('folds only the native Tauri Cargo project and keeps independent Rust projects discoverable', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'runner-tauri-discovery-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await packageProject(root, { name: 'desktop-app', scripts: { dev: 'vite' } });
  await writeFile(path.join(root, 'package.json'), JSON.stringify({
    name: 'desktop-app', scripts: { dev: 'vite' }, dependencies: { '@tauri-apps/api': '^2.0.0' },
  }));
  for (const relative of ['src-tauri', 'tools/native-service']) {
    await mkdir(path.join(root, relative), { recursive: true });
    await writeFile(path.join(root, relative, 'Cargo.toml'), '[package]\nname = "native-app"\nversion = "1.0.0"\n');
  }
  await writeFile(path.join(root, 'src-tauri', 'tauri.conf.json'), '{}');

  const inspection = await inspectProjectSource(root);
  assert.deepEqual(inspection.projects.map((project) => [project.relativePath, project.ecosystem]), [
    ['.', 'node'], ['tools/native-service', 'rust'],
  ]);
  const nativeInspection = await inspectProjectSource(path.join(root, 'src-tauri'));
  assert.equal(nativeInspection.sourceType, 'project');
  assert.deepEqual(nativeInspection.projects.map((project) => [project.relativePath, project.ecosystem]), [['.', 'rust']]);
});

test('keeps nested Cargo projects when Tauri ownership markers are incomplete', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'runner-tauri-markers-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'src-tauri'), { recursive: true });
  await writeFile(path.join(root, 'src-tauri', 'Cargo.toml'), '[package]\nname = "native-app"\nversion = "1.0.0"\n');
  await packageProject(root, { name: 'mixed-workspace', scripts: { dev: 'vite' } });
  await writeFile(path.join(root, 'src-tauri', 'tauri.conf.json'), '{}');
  assert.equal((await inspectProjectSource(root)).projects.length, 2);

  await rm(path.join(root, 'src-tauri', 'tauri.conf.json'));
  await writeFile(path.join(root, 'package.json'), JSON.stringify({
    name: 'mixed-workspace', scripts: { dev: 'vite' }, devDependencies: { '@tauri-apps/cli': '^2.0.0' },
  }));
  assert.equal((await inspectProjectSource(root)).projects.length, 2);
});
