#!/usr/bin/env npx tsx

import { App } from 'aws-cdk-lib';

import { productionStage } from '../lib/stages/production-stage.js';
import { getEnvironment } from '../lib/utilities/get-environment.js';
import { getTarget } from '../lib/utilities/get-target.js';

function main(): void {
  const app = new App();

  const target = getTarget(app);
  const env = getEnvironment(app, target);

  switch (target) {
    case 'production': {
      productionStage(app, 'production', { env });
      break;
    }
    default:
      throw new Error(`Unsupported target: "${target}"`);
  }

  app.synth();
}

main();
