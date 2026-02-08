import {
  aws_ecs as ecs,
  aws_secretsmanager as secretsmanager,
  Stack,
} from 'aws-cdk-lib';

/**
 * Fresnel API secrets managed in AWS Secrets Manager.
 *
 * Uses full ARNs (with the random suffix) because ECS requires them.
 * CDK's fromSecretNameV2 generates partial ARNs that Secrets Manager
 * rejects, and plain names get treated as SSM Parameter Store references.
 *
 * If a secret is deleted and recreated, update the ARN here.
 */
export class ApiSecrets {
  private readonly anthropicApiKey: secretsmanager.ISecret;
  private readonly mongodbUri: secretsmanager.ISecret;
  private readonly githubClientId: secretsmanager.ISecret;
  private readonly githubClientSecret: secretsmanager.ISecret;

  constructor(stack: Stack) {
    this.anthropicApiKey = secretsmanager.Secret.fromSecretCompleteArn(
      stack,
      'anthropic-api-key',
      'arn:aws:secretsmanager:us-east-1:821814520706:secret:prod/fresnel/api/env/anthropic/api-key-67A6N0',
    );

    this.mongodbUri = secretsmanager.Secret.fromSecretCompleteArn(
      stack,
      'mongodb-uri',
      'arn:aws:secretsmanager:us-east-1:821814520706:secret:prod/fresnel/api/env/mongo/uri-ZvuUmD',
    );

    this.githubClientId = secretsmanager.Secret.fromSecretCompleteArn(
      stack,
      'github-client-id',
      'arn:aws:secretsmanager:us-east-1:821814520706:secret:prod/fresnel/api/env/github/client-id-jcWWmp',
    );

    this.githubClientSecret = secretsmanager.Secret.fromSecretCompleteArn(
      stack,
      'github-client-secret',
      'arn:aws:secretsmanager:us-east-1:821814520706:secret:prod/fresnel/api/env/github/client-secret-YPUFnR',
    );
  }

  /** Return ECS-compatible secrets map */
  secrets(): Record<string, ecs.Secret> {
    return {
      ANTHROPIC_API_KEY: ecs.Secret.fromSecretsManager(this.anthropicApiKey),
      MONGODB_URI: ecs.Secret.fromSecretsManager(this.mongodbUri),
      GITHUB_CLIENT_ID: ecs.Secret.fromSecretsManager(this.githubClientId),
      GITHUB_CLIENT_SECRET: ecs.Secret.fromSecretsManager(
        this.githubClientSecret,
      ),
    };
  }
}
