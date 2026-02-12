import {
  aws_cloudfront as cloudfront,
  aws_ecr as ecr,
  aws_ecs as ecs,
  aws_iam as iam,
  aws_s3 as s3,
  CfnOutput,
  Duration,
  Stack,
  type StackProps,
} from 'aws-cdk-lib';
import type { Construct } from 'constructs';

interface CicdStackProps extends StackProps {
  homepageBucket: s3.IBucket;
  homepageDistribution: cloudfront.IDistribution;
  appBucket: s3.IBucket;
  appDistribution: cloudfront.IDistribution;
  releasesBucket: s3.IBucket;
  releasesDistribution: cloudfront.IDistribution;
  apiRepository: ecr.IRepository;
  apiService: ecs.IBaseService;
}

const GITHUB_DOMAIN = 'https://token.actions.githubusercontent.com';
const GITHUB_ORG = 'radiks-corp';
const GITHUB_REPO = 'fresnel';

/**
 * CI/CD resources for Fresnel.
 *
 * Creates a GitHub OIDC provider and an IAM role that GitHub Actions
 * can assume for deploying frontends to S3 + CloudFront and the
 * backend API to ECR + ECS Fargate.
 */
export class CicdStack extends Stack {
  constructor(scope: Construct, id: string, props: CicdStackProps) {
    super(scope, id, props);

    const {
      homepageBucket,
      homepageDistribution,
      appBucket,
      appDistribution,
      releasesBucket,
      releasesDistribution,
      apiRepository,
      apiService,
    } = props;

    // ─── GitHub OIDC provider ────────────────────────────────────

    const oidcProvider = new iam.OpenIdConnectProvider(
      this,
      'github-oidc-provider',
      {
        url: GITHUB_DOMAIN,
        clientIds: ['sts.amazonaws.com'],
      },
    );

    // ─── Deploy role ─────────────────────────────────────────────

    const deployRole = new iam.Role(this, 'github-deploy-role', {
      roleName: 'fresnel-github-deploy',
      description:
        'Assumed by GitHub Actions (OIDC) to deploy Fresnel',
      maxSessionDuration: Duration.hours(1),
      assumedBy: new iam.WebIdentityPrincipal(
        oidcProvider.openIdConnectProviderArn,
        {
          StringLike: {
            'token.actions.githubusercontent.com:sub': `repo:${GITHUB_ORG}/${GITHUB_REPO}:*`,
          },
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          },
        },
      ),
    });

    // S3: read/write to frontend + releases buckets
    homepageBucket.grantReadWrite(deployRole);
    appBucket.grantReadWrite(deployRole);
    releasesBucket.grantReadWrite(deployRole);

    // CloudFront: invalidate both distributions
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'cloudfront:CreateInvalidation',
          'cloudfront:GetInvalidation',
        ],
        resources: [
          `arn:aws:cloudfront::${this.account}:distribution/${homepageDistribution.distributionId}`,
          `arn:aws:cloudfront::${this.account}:distribution/${appDistribution.distributionId}`,
          `arn:aws:cloudfront::${this.account}:distribution/${releasesDistribution.distributionId}`,
        ],
      }),
    );

    // SSM: read deployment parameters
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter', 'ssm:GetParameters'],
        resources: [
          `arn:aws:ssm:${this.region}:${this.account}:parameter/prod/fresnel/*`,
        ],
      }),
    );

    // ECR: push backend images
    apiRepository.grantPullPush(deployRole);

    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['ecr:GetAuthorizationToken'],
        resources: ['*'],
      }),
    );

    // ECS: force new deployment of backend service
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['ecs:UpdateService', 'ecs:DescribeServices'],
        resources: [apiService.serviceArn],
      }),
    );

    // ─── Outputs ─────────────────────────────────────────────────

    new CfnOutput(this, 'deploy-role-arn', {
      value: deployRole.roleArn,
      description: 'IAM role ARN for GitHub Actions OIDC deployments',
    });
  }
}
