import assert from 'node:assert/strict';
import test from 'node:test';
import { createLaunchSpecification } from './launch-specification.mjs';

const workspace = {
  name: 'Java workspace',
  environment: 'local',
};

test('reconstructs a Java Maven launch only from an authoritative command profile', () => {
  const project = {
    name: 'orders',
    absolutePath: '/workspace/orders',
    ecosystem: 'java-maven',
    defaultCommandId: 'java-maven:spring-boot-run',
    commands: [{
      id: 'java-maven:spring-boot-run',
      label: 'Spring Boot',
      task: 'spring-boot:run',
      args: [],
      longRunning: true,
    }],
    runtime: {
      available: true,
      compatibility: 'ready',
      environment: {
        JAVA_HOME: '/runtime/jdk-21',
        PATH: '/runtime/jdk-21/bin',
      },
      components: {
        tool: { path: '/workspace/orders/mvnw' },
      },
    },
    port: 8080,
    healthCheck: {
      type: 'http',
      port: 8080,
      path: '/actuator/health',
    },
  };

  const launch = createLaunchSpecification({
    workspace,
    project,
    commandId: 'java-maven:spring-boot-run',
  });

  assert.equal(launch.executable, '/workspace/orders/mvnw');
  assert.deepEqual(launch.args, ['spring-boot:run']);
  assert.equal(launch.cwd, '/workspace/orders');
  assert.equal(launch.env.JAVA_HOME, '/runtime/jdk-21');
  assert.deepEqual(launch.healthCheck, project.healthCheck);
});

test('blocks unavailable and incompatible runtimes before process creation', () => {
  for (const compatibility of ['unavailable', 'incompatible']) {
    assert.throws(() => createLaunchSpecification({
      workspace,
      project: {
        name: 'orders',
        absolutePath: '/workspace/orders',
        ecosystem: 'java-gradle',
        defaultCommandId: 'java-gradle:boot-run',
        commands: [{
          id: 'java-gradle:boot-run',
          label: 'Spring Boot',
          task: 'bootRun',
          args: [],
          longRunning: true,
        }],
        runtime: {
          available: compatibility !== 'unavailable',
          compatibility,
          reason: 'JDK incompatível.',
        },
      },
    }), /JDK incompatível/);
  }
});

test('reconstructs Flutter run and build launches from structured targets', () => {
  const project = {
    name: 'mobile-shell',
    absolutePath: '/workspace/mobile-shell',
    ecosystem: 'flutter',
    defaultCommandId: 'flutter:run:android',
    flutterTarget: { platform: 'android', deviceId: 'emulator-5554' },
    commands: [{
      id: 'flutter:run:android',
      label: 'Flutter Android',
      task: 'run',
      args: [],
      flutterTarget: 'android',
      longRunning: true,
    }, {
      id: 'flutter:run:web',
      label: 'Flutter Web',
      task: 'run',
      args: [],
      flutterTarget: 'web',
      longRunning: true,
    }, {
      id: 'flutter:test',
      label: 'Flutter Test',
      task: 'test',
      args: [],
      flutterTarget: 'test',
      longRunning: false,
    }],
    runtime: {
      available: true,
      compatibility: 'ready',
      components: { runtime: { path: '/opt/flutter/bin/flutter' } },
    },
  };
  const launch = createLaunchSpecification({
    workspace,
    project,
    commandId: 'flutter:run:android',
  });
  assert.equal(launch.executable, '/opt/flutter/bin/flutter');
  assert.deepEqual(launch.args, ['run', '-d', 'emulator-5554']);
  assert.equal(launch.portStrategy, undefined);

  const webLaunch = createLaunchSpecification({
    workspace,
    project: {
      ...project,
      flutterTarget: { platform: 'web' },
    },
    commandId: 'flutter:run:web',
  });
  assert.deepEqual(webLaunch.args, ['run', '-d', 'chrome']);
  assert.equal(webLaunch.portStrategy, 'flutter-web');

  const testLaunch = createLaunchSpecification({
    workspace,
    project,
    commandId: 'flutter:test',
  });
  assert.deepEqual(testLaunch.args, ['test', '-d', 'emulator-5554']);
});
