import {
  type aws_certificatemanager as acm,
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as origins,
  aws_ec2 as ec2,
  aws_ecr as ecr,
  aws_ecs as ecs,
  aws_ecs_patterns as ecsPatterns,
  aws_elasticloadbalancingv2 as elbV2,
  aws_iam as iam,
  aws_route53 as route53,
  aws_route53_targets as route53Targets,
  aws_ssm as ssm,
  Duration,
  Stack,
  type StackProps,
} from 'aws-cdk-lib';
import type { Construct } from 'constructs';

import { CLOUDFRONT_DENY_LIST } from '../../constants/cloudfront.js';
import { ApiSecrets } from './secrets.js';

interface ApiStackProps extends StackProps {
  hostedZone: route53.IHostedZone;
  /** Certificate in same region as stack (for ALB) */
  regionalCertificate: acm.ICertificate;
  /** Certificate in us-east-1 (for CloudFront) */
  globalCertificate: acm.ICertificate;
}

/**
 * Cheap ECS Fargate API behind ALB + CloudFront for api.reviewgpt.ca
 *
 * Bare-bones setup:
 * - 256 CPU / 512 MB (smallest Fargate)
 * - 1 NAT Gateway
 * - No WAF, no Datadog
 * - CloudFront caching disabled (API passthrough)
 */
export class ApiStack extends Stack {
  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { hostedZone, regionalCertificate, globalCertificate } = props;

    const apiSecrets = new ApiSecrets(this);

    // VPC - minimal, 1 NAT gateway to keep costs low
    // No NAT Gateway — tasks get public IPs in public subnets
    const vpc = new ec2.Vpc(this, 'fresnel-api-vpc', {
      vpcName: 'fresnel-api-vpc',
      natGateways: 0,
      maxAzs: 2,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
    });

    // ECS Cluster
    const cluster = new ecs.Cluster(this, 'fresnel-api-cluster', {
      clusterName: 'fresnel-api',
      vpc,
    });

    // ECR Repository for the API container
    const repository = new ecr.Repository(this, 'fresnel-api-repo', {
      repositoryName: 'fresnel-api',
    });

    // ALB + Fargate service - smallest possible
    const service = new ecsPatterns.ApplicationLoadBalancedFargateService(
      this,
      'fresnel-api-service',
      {
        cluster,
        cpu: 256,
        memoryLimitMiB: 512,
        desiredCount: 1,
        taskImageOptions: {
          containerName: 'fresnel-api',
          containerPort: 3001,
          image: ecs.ContainerImage.fromEcrRepository(repository, 'latest'),
          environment: {
            PORT: '3001',
            NODE_ENV: 'production',
            FRONTEND_URL: 'https://app.reviewgpt.ca',
          },
          secrets: apiSecrets.secrets(),
        },
        publicLoadBalancer: true,
        protocol: elbV2.ApplicationProtocol.HTTPS,
        sslPolicy: elbV2.SslPolicy.TLS13_RES,
        certificate: regionalCertificate,
        assignPublicIp: true,
        taskSubnets: {
          subnetType: ec2.SubnetType.PUBLIC,
        },
      },
    );

    // Grant execution role broad access to our secrets prefix.
    // CDK's fromSecretNameV2 stores partial ARNs in the task definition but
    // generates IAM policies with a -?????? suffix, causing a mismatch.
    service.taskDefinition.executionRole?.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['secretsmanager:GetSecretValue', 'secretsmanager:DescribeSecret'],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:prod/fresnel/api/env/*`,
        ],
      }),
    );

    // Health check
    service.targetGroup.configureHealthCheck({
      path: '/health',
      healthyThresholdCount: 2,
      interval: Duration.seconds(30),
    });

    // Auto-scaling (keep it cheap: 1-3 tasks)
    const scaling = service.service.autoScaleTaskCount({
      minCapacity: 1,
      maxCapacity: 3,
    });

    scaling.scaleOnCpuUtilization('cpu-scaling', {
      targetUtilizationPercent: 70,
      scaleInCooldown: Duration.minutes(5),
      scaleOutCooldown: Duration.minutes(2),
    });

    // CloudFront in front of ALB
    const distribution = new cloudfront.Distribution(
      this,
      'api-distribution',
      {
        defaultBehavior: {
          origin: new origins.LoadBalancerV2Origin(service.loadBalancer, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
            originSslProtocols: [cloudfront.OriginSslPolicy.TLS_V1_2],
          }),
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy:
            cloudfront.OriginRequestPolicy.ALL_VIEWER,
        },
        certificate: globalCertificate,
        domainNames: ['api.reviewgpt.ca'],
        minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
        httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
        geoRestriction: CLOUDFRONT_DENY_LIST,
        priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      },
    );

    // DNS
    new route53.ARecord(this, 'api-alias', {
      zone: hostedZone,
      recordName: 'api.reviewgpt.ca',
      target: route53.RecordTarget.fromAlias(
        new route53Targets.CloudFrontTarget(distribution),
      ),
    });

    // SSM params
    new ssm.StringParameter(this, 'api-repo-name', {
      parameterName: '/prod/fresnel/api/ecr-repository-name',
      stringValue: repository.repositoryName,
    });

    new ssm.StringParameter(this, 'api-service-name', {
      parameterName: '/prod/fresnel/api/ecs-service-name',
      stringValue: service.service.serviceName,
    });

    new ssm.StringParameter(this, 'api-cluster-name', {
      parameterName: '/prod/fresnel/api/ecs-cluster-name',
      stringValue: cluster.clusterName,
    });
  }
}
