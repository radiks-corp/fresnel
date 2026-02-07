import type { Environment } from 'aws-cdk-lib';
import type { Construct } from 'constructs';

import type { Target } from './get-target.js';
import { FRESNEL_PROD_ENV } from '../constants/environments.js';

export function getEnvironment(
  _scope: Construct,
  target: Target,
): Required<Environment> {
  switch (target) {
    case 'production': {
      return FRESNEL_PROD_ENV;
    }
    default:
      throw new Error(`unable to get environment - invalid target "${target}"`);
  }
}
