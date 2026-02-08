import {
  type aws_certificatemanager as acm,
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as origins,
  aws_route53 as route53,
  aws_route53_targets as route53Targets,
  aws_s3 as s3,
  aws_ssm as ssm,
  RemovalPolicy,
  Stack,
  type StackProps,
} from 'aws-cdk-lib';
import type { Construct } from 'constructs';

import { CLOUDFRONT_DENY_LIST } from '../../constants/cloudfront.js';

interface ReleasesStackProps extends StackProps {
  hostedZone: route53.IHostedZone;
  certificate: acm.ICertificate;
}

/**
 * S3 + CloudFront for hosting Fresnel desktop app releases at releases.reviewgpt.ca.
 *
 * Expected bucket layout:
 *   latest/Fresnel.dmg        ← always points to the most recent macOS build
 *   v1.0.0/Fresnel.dmg        ← versioned archives
 */
export class ReleasesStack extends Stack {
  public readonly bucket: s3.IBucket;
  public readonly distribution: cloudfront.IDistribution;

  constructor(scope: Construct, id: string, props: ReleasesStackProps) {
    super(scope, id, props);

    const { hostedZone, certificate } = props;

    const bucket = new s3.Bucket(this, 'fresnel-releases-bucket', {
      bucketName: 'fresnel-releases',
      removalPolicy: RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    const originAccessIdentity = new cloudfront.OriginAccessIdentity(
      this,
      'releases-oai',
      {
        comment: 'OAI for fresnel releases S3 bucket',
      },
    );
    bucket.grantRead(originAccessIdentity.grantPrincipal);

    const distribution = new cloudfront.Distribution(
      this,
      'releases-distribution',
      {
        defaultBehavior: {
          origin: origins.S3BucketOrigin.withOriginAccessIdentity(bucket, {
            originAccessIdentity,
          }),
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          responseHeadersPolicy:
            cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
        },
        certificate,
        domainNames: ['releases.reviewgpt.ca'],
        minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
        httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
        geoRestriction: CLOUDFRONT_DENY_LIST,
        priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      },
    );

    this.bucket = bucket;
    this.distribution = distribution;

    new route53.ARecord(this, 'releases-alias', {
      zone: hostedZone,
      recordName: 'releases.reviewgpt.ca',
      target: route53.RecordTarget.fromAlias(
        new route53Targets.CloudFrontTarget(distribution),
      ),
    });

    // SSM params for CI/CD deployments
    new ssm.StringParameter(this, 'releases-distribution-id', {
      parameterName: '/prod/fresnel/releases/cloudfront-distribution-id',
      stringValue: distribution.distributionId,
    });

    new ssm.StringParameter(this, 'releases-bucket-name', {
      parameterName: '/prod/fresnel/releases/bucket-name',
      stringValue: bucket.bucketName,
    });
  }
}
