import {
  aws_ecs as ecs,
  aws_secretsmanager as secretsmanager,
  Stack,
} from 'aws-cdk-lib';

import * as secretNames from '../../constants/secret-names.js';

/**
 * Fresnel API secrets managed in AWS Secrets Manager.
 * Create these secrets manually in the console before first deploy:
 *
 *   prod/fresnel/api/env/anthropic/api-key
 *   prod/fresnel/api/env/mongo/uri
 *   prod/fresnel/api/env/github/client-id
 *   prod/fresnel/api/env/github/client-secret
 */
export class ApiSecrets {
  private readonly anthropicApiKey: secretsmanager.ISecret;
  private readonly mongodbUri: secretsmanager.ISecret;
  private readonly githubClientId: secretsmanager.ISecret;
  private readonly githubClientSecret: secretsmanager.ISecret;

  constructor(stack: Stack) {
    this.anthropicApiKey = secretsmanager.Secret.fromSecretNameV2(
      stack,
      'anthropic-api-key',
      secretNames.ANTHROPIC_API_KEY,
    );

    this.mongodbUri = secretsmanager.Secret.fromSecretNameV2(
      stack,
      'mongodb-uri',
      secretNames.MONGODB_URI,
    );

    this.githubClientId = secretsmanager.Secret.fromSecretNameV2(
      stack,
      'github-client-id',
      secretNames.GITHUB_CLIENT_ID,
    );

    this.githubClientSecret = secretsmanager.Secret.fromSecretNameV2(
      stack,
      'github-client-secret',
      secretNames.GITHUB_CLIENT_SECRET,
    );
  }

  /** Return ECS-compatible secrets map */
  secrets(): Record<string, ecs.Secret> {
    return {
      ANTHROPIC_API_KEY: ecs.Secret.fromSecretsManager(this.anthropicApiKey),
      MONGODB_URI: ecs.Secret.fromSecretsManager(this.mongodbUri),
      GITHUB_CLIENT_ID: ecs.Secret.fromSecretsManager(this.githubClientId),
      GITHUB_CLIENT_SECRET: ecs.Secret.fromSecretsManager(this.githubClientSecret),
    };
  }
}
