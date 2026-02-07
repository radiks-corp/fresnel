import type { Construct } from 'constructs';

export type Target = 'production';

const TARGETS: Set<string> = new Set<Target>(['production']);

function isTarget(value: unknown): value is Target {
  if (typeof value !== 'string') {
    return false;
  }
  return TARGETS.has(value);
}

export function getTarget(scope: Construct): Target {
  const target = scope.node.tryGetContext('target') ?? 'production';
  if (!isTarget(target)) {
    throw new Error(
      `unable to get target environment - invalid target "${target}"`,
    );
  }
  return target;
}
