import { aws_cloudfront as cloudfront } from 'aws-cdk-lib';

export const COUNTRY_CODE_DENY_LIST = ['SY', 'CU', 'IR', 'KP', 'RU'];

export const CLOUDFRONT_DENY_LIST = cloudfront.GeoRestriction.denylist(
  ...COUNTRY_CODE_DENY_LIST,
);
