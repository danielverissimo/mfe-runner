import { RunnerBridge } from '../app/core/models/runner.models';

declare global {
  interface Window {
    runnerApi?: RunnerBridge;
  }
}

export {};
