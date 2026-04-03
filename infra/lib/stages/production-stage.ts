import type { Environment, StageProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';

import { ApiStack } from '../stacks/api-stack/index.js';
import { AppStack } from '../stacks/app-stack/index.js';
import { CertificatesStack } from '../stacks/certificates-stack/index.js';
import { CicdStack } from '../stacks/cicd-stack/index.js';
import { DnsStack } from '../stacks/dns-stack/index.js';
import { HomepageStack } from '../stacks/homepage-stack/index.js';
import { ReleasesStack } from '../stacks/releases-stack/index.js';

interface ProductionStageProps extends Omit<StageProps, 'env'> {
  env: Required<Environment>;
}

/**
 * Production stage for Fresnel infrastructure.
 *
 * Synthesizes:
 * - Route53 hosted zone + regional cert for reviewgpt.ca
 * - ACM certificate in us-east-1 (for CloudFront)
 * - S3 + CloudFront for reviewgpt.ca (homepage)
 * - S3 + CloudFront for app.reviewgpt.ca (web app)
 * - ECS Fargate + ALB + CloudFront for api.reviewgpt.ca
 */
export function productionStage(
  scope: Construct,
  _id: string,
  props: ProductionStageProps,
): void {
  const { env } = props;

  // DNS + regional certificate (same region as everything else)
  const dnsStack = new DnsStack(scope, 'fresnel-dns-stack', { env });

  // Global certificate in us-east-1 (required by CloudFront)
  const certificatesStack = new CertificatesStack(
    scope,
    'fresnel-certificates-stack',
    {
      env: { ...env, region: 'us-east-1' },
      hostedZone: dnsStack.hostedZone,
      crossRegionReferences: true,
    },
  );

  // Landing page: reviewgpt.ca
  const homepageStack = new HomepageStack(scope, 'fresnel-homepage-stack', {
    env,
    crossRegionReferences: true,
    hostedZone: dnsStack.hostedZone,
    certificate: certificatesStack.certificate,
  });

  // Web app: app.reviewgpt.ca
  const appStack = new AppStack(scope, 'fresnel-app-stack', {
    env,
    crossRegionReferences: true,
    hostedZone: dnsStack.hostedZone,
    certificate: certificatesStack.certificate,
  });

  // Desktop app releases: releases.reviewgpt.ca
  const releasesStack = new ReleasesStack(scope, 'fresnel-releases-stack', {
    env,
    crossRegionReferences: true,
    hostedZone: dnsStack.hostedZone,
    certificate: certificatesStack.certificate,
  });

  // API: api.reviewgpt.ca
  const apiStack = new ApiStack(scope, 'fresnel-api-stack', {
    env,
    crossRegionReferences: true,
    hostedZone: dnsStack.hostedZone,
    regionalCertificate: dnsStack.regionalCertificate,
    globalCertificate: certificatesStack.certificate,
  });

  // CI/CD: deployer IAM role (OIDC)
  new CicdStack(scope, 'fresnel-cicd-stack', {
    env,
    homepageBucket: homepageStack.bucket,
    homepageDistribution: homepageStack.distribution,
    appBucket: appStack.bucket,
    appDistribution: appStack.distribution,
    releasesBucket: releasesStack.bucket,
    releasesDistribution: releasesStack.distribution,
    apiRepository: apiStack.repository,
    apiService: apiStack.ecsService,
  });
}
