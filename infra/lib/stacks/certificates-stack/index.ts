import {
  aws_certificatemanager as acm,
  type aws_route53 as route53,
  Stack,
  type StackProps,
} from 'aws-cdk-lib';
import type { Construct } from 'constructs';

interface CertificatesStackProps extends StackProps {
  hostedZone: route53.IHostedZone;
}

/**
 * CloudFront requires certificates in us-east-1.
 * This stack creates a certificate in us-east-1 for CloudFront distributions.
 */
export class CertificatesStack extends Stack {
  public readonly certificate: acm.ICertificate;

  constructor(scope: Construct, id: string, props: CertificatesStackProps) {
    super(scope, id, props);

    const { hostedZone } = props;

    this.certificate = new acm.Certificate(this, 'fresnel-global-certificate', {
      domainName: 'reviewgpt.ca',
      subjectAlternativeNames: ['*.reviewgpt.ca'],
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });
  }
}
