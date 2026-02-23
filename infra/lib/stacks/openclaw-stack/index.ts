import {
  aws_ec2 as ec2,
  aws_iam as iam,
  aws_secretsmanager as secretsmanager,
  aws_ssm as ssm,
  CfnOutput,
  RemovalPolicy,
  Stack,
  type StackProps,
} from 'aws-cdk-lib';
import type { Construct } from 'constructs';

/**
 * EC2 instance running OpenClaw via the official Ansible installer.
 *
 * - Ubuntu 24.04 LTS on t3.medium (~$30/month)
 * - 30 GB EBS root volume (persistent across reboots)
 * - ReadOnlyAccess IAM role for AWS resource visibility
 * - SSM Session Manager for shell access (no SSH needed)
 * - User data bootstraps tools; Ansible run separately
 *
 * IMPORTANT: The instance has RemovalPolicy.RETAIN and update-replace
 * protection. Manual `cdk deploy` is required for changes that would
 * trigger replacement.
 */
export class OpenClawStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const vpc = ec2.Vpc.fromLookup(this, 'default-vpc', { isDefault: true });

    const sg = new ec2.SecurityGroup(this, 'openclaw-sg', {
      vpc,
      description: 'OpenClaw EC2 - SSH + all outbound',
      allowAllOutbound: true,
    });

    const keyPair = new ec2.KeyPair(this, 'openclaw-keypair', {
      keyPairName: 'fresnel-openclaw',
      type: ec2.KeyPairType.RSA,
    });

    const role = new iam.Role(this, 'openclaw-role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('ReadOnlyAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      ],
    });

    const githubPat = secretsmanager.Secret.fromSecretCompleteArn(
      this,
      'github-pat',
      'arn:aws:secretsmanager:us-east-1:REDACTED_ACCOUNT_ID:secret:prod/fresnel/openclaw/env/github-pat-OtY0vC',
    );
    const telegramBotToken = secretsmanager.Secret.fromSecretCompleteArn(
      this,
      'telegram-bot-token',
      'arn:aws:secretsmanager:us-east-1:REDACTED_ACCOUNT_ID:secret:prod/fresnel/openclaw/env/telegram-bot-token-E6lCUq',
    );
    githubPat.grantRead(role);
    telegramBotToken.grantRead(role);

    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      'set -euxo pipefail',
      'export DEBIAN_FRONTEND=noninteractive',

      'apt-get update',
      'apt-get install -y ansible git curl jq unzip',

      'curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-$(uname -m).zip" -o /tmp/awscli2.zip',
      'unzip -q /tmp/awscli2.zip -d /tmp',
      '/tmp/aws/install --update',
      'rm -rf /tmp/aws /tmp/awscli2.zip',

      'curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /usr/share/keyrings/githubcli-archive-keyring.gpg',
      'echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list',
      'apt-get update && apt-get install -y gh',

      'REGION=$(ec2metadata --availability-zone | sed "s/.$//")',
      'GH_PAT=$(aws secretsmanager get-secret-value --secret-id prod/fresnel/openclaw/env/github-pat --region $REGION --query SecretString --output text)',
      'TG_TOKEN=$(aws secretsmanager get-secret-value --secret-id prod/fresnel/openclaw/env/telegram-bot-token --region $REGION --query SecretString --output text)',

      'mkdir -p /opt/openclaw',
      'cat > /opt/openclaw/.env << ENVEOF',
      'export GITHUB_TOKEN="$GH_PAT"',
      'export TELEGRAM_BOT_TOKEN="$TG_TOKEN"',
      'ENVEOF',
      'chmod 600 /opt/openclaw/.env',

      'echo "OPENCLAW_BOOTSTRAP_COMPLETE" > /var/log/openclaw-bootstrap.log',
    );

    const instance = new ec2.Instance(this, 'openclaw-instance', {
      vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM),
      machineImage: ec2.MachineImage.lookup({
        name: 'ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*',
        owners: ['099720109477'],
      }),
      keyPair,
      role,
      securityGroup: sg,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      associatePublicIpAddress: true,
      userData,
      blockDevices: [
        {
          deviceName: '/dev/sda1',
          volume: ec2.BlockDeviceVolume.ebs(30, {
            volumeType: ec2.EbsDeviceVolumeType.GP3,
            encrypted: true,
          }),
        },
      ],
      ssmSessionPermissions: true,
    });

    instance.applyRemovalPolicy(RemovalPolicy.RETAIN);

    const cfnInstance = instance.node.defaultChild as ec2.CfnInstance;
    cfnInstance.addOverride('UpdateReplacePolicy', 'Retain');

    new ssm.StringParameter(this, 'openclaw-instance-id', {
      parameterName: '/prod/fresnel/openclaw/ec2-instance-id',
      stringValue: instance.instanceId,
    });

    new CfnOutput(this, 'InstancePublicIp', {
      value: instance.instancePublicIp,
      description: 'OpenClaw EC2 public IP',
    });

    new CfnOutput(this, 'KeyPairParameterArn', {
      value: keyPair.privateKey.parameterArn,
      description: 'SSH private key in SSM Parameter Store',
    });
  }
}
