import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
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
