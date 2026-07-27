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
