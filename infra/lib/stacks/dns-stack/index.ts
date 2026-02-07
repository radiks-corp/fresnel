import {
  aws_certificatemanager as acm,
  aws_route53 as route53,
  Stack,
  type StackProps,
} from 'aws-cdk-lib';
import type { Construct } from 'constructs';

export class DnsStack extends Stack {
  public readonly hostedZone: route53.IHostedZone;

  /** Regional certificate (same region as the stack, for ALB) */
  public readonly regionalCertificate: acm.ICertificate;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    this.hostedZone = new route53.HostedZone(this, 'fresnel-hosted-zone', {
      zoneName: 'reviewgpt.ca',
    });

    // Regional certificate for ALB (must be in the same region as ECS)
    this.regionalCertificate = new acm.Certificate(
      this,
      'fresnel-regional-certificate',
      {
        domainName: 'reviewgpt.ca',
        subjectAlternativeNames: ['*.reviewgpt.ca'],
        validation: acm.CertificateValidation.fromDns(this.hostedZone),
      },
    );
  }
}
