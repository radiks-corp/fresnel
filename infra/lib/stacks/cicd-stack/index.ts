import {
  aws_cloudfront as cloudfront,
  aws_iam as iam,
  aws_s3 as s3,
  CfnOutput,
  Stack,
  type StackProps,
} from 'aws-cdk-lib';
import type { Construct } from 'constructs';

interface CicdStackProps extends StackProps {
  homepageBucket: s3.IBucket;
  homepageDistribution: cloudfront.IDistribution;
  appBucket: s3.IBucket;
  appDistribution: cloudfront.IDistribution;
}

/**
 * CI/CD resources for Fresnel.
 *
 * Creates IAM deployer users with scoped permissions for:
 * - S3 sync (deploy React builds)
 * - CloudFront invalidation (bust cache after deploy)
 * - SSM parameter reads (resolve bucket names & distribution IDs)
 */
export class CicdStack extends Stack {
  constructor(scope: Construct, id: string, props: CicdStackProps) {
    super(scope, id, props);

    const {
      homepageBucket,
      homepageDistribution,
      appBucket,
      appDistribution,
    } = props;

    // ─── Deployer user ───────────────────────────────────────────

    const deployer = new iam.User(this, 'fresnel-deployer', {
      userName: 'fresnel-deployer',
    });

    // S3: read/write to both frontend buckets
    homepageBucket.grantReadWrite(deployer);
    appBucket.grantReadWrite(deployer);

    // S3: list buckets (needed for aws s3 sync --delete)
    homepageBucket.grantRead(deployer);
    appBucket.grantRead(deployer);

    // CloudFront: invalidate both distributions
    deployer.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'cloudfront:CreateInvalidation',
          'cloudfront:GetInvalidation',
        ],
        resources: [
          `arn:aws:cloudfront::${this.account}:distribution/${homepageDistribution.distributionId}`,
          `arn:aws:cloudfront::${this.account}:distribution/${appDistribution.distributionId}`,
        ],
      }),
    );

    // SSM: read deployment parameters
    deployer.addToPolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter', 'ssm:GetParameters'],
        resources: [
          `arn:aws:ssm:${this.region}:${this.account}:parameter/prod/fresnel/*`,
        ],
      }),
    );

    // ─── Outputs ─────────────────────────────────────────────────

    new CfnOutput(this, 'deployer-user-name', {
      value: deployer.userName,
      description: 'IAM user name for CI/CD deployments',
    });
  }
}
