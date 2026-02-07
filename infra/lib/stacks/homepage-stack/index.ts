import {
  type aws_certificatemanager as acm,
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as origins,
  aws_route53 as route53,
  aws_route53_targets as route53Targets,
  aws_s3 as s3,
  aws_ssm as ssm,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from 'aws-cdk-lib';
import type { Construct } from 'constructs';

import { CLOUDFRONT_DENY_LIST } from '../../constants/cloudfront.js';

interface HomepageStackProps extends StackProps {
  hostedZone: route53.IHostedZone;
  certificate: acm.ICertificate;
}

/**
 * S3 + CloudFront static site for the landing page at reviewgpt.ca
 */
export class HomepageStack extends Stack {
  public readonly bucket: s3.IBucket;
  public readonly distribution: cloudfront.IDistribution;

  constructor(scope: Construct, id: string, props: HomepageStackProps) {
    super(scope, id, props);

    const { hostedZone, certificate } = props;

    const bucket = new s3.Bucket(this, 'fresnel-homepage-bucket', {
      bucketName: 'fresnel-homepage',
      removalPolicy: RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    const originAccessIdentity = new cloudfront.OriginAccessIdentity(
      this,
      'homepage-oai',
      {
        comment: 'OAI for fresnel homepage S3 bucket',
      },
    );
    bucket.grantRead(originAccessIdentity.grantPrincipal);

    const distribution = new cloudfront.Distribution(
      this,
      'homepage-distribution',
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
        domainNames: ['reviewgpt.ca'],
        defaultRootObject: 'index.html',
        minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
        httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
        errorResponses: [
          {
            httpStatus: 404,
            responseHttpStatus: 200,
            responsePagePath: '/index.html',
            ttl: Duration.minutes(5),
          },
        ],
        geoRestriction: CLOUDFRONT_DENY_LIST,
        priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      },
    );

    this.bucket = bucket;
    this.distribution = distribution;

    new route53.ARecord(this, 'homepage-alias', {
      zone: hostedZone,
      recordName: 'reviewgpt.ca',
      target: route53.RecordTarget.fromAlias(
        new route53Targets.CloudFrontTarget(distribution),
      ),
    });

    // SSM params for CI/CD deployments
    new ssm.StringParameter(this, 'homepage-distribution-id', {
      parameterName: '/prod/fresnel/homepage/cloudfront-distribution-id',
      stringValue: distribution.distributionId,
    });

    new ssm.StringParameter(this, 'homepage-bucket-name', {
      parameterName: '/prod/fresnel/homepage/bucket-name',
      stringValue: bucket.bucketName,
    });
  }
}
