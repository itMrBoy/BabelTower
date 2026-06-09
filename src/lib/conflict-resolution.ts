import type { ConflictResolution } from "@prisma/client";

export type ResolvedConflictInput = {
  key: string;
  resolution: ConflictResolution;
};

export function groupResolvedConflictsByResolution(items: ResolvedConflictInput[]) {
  const lastResolutionByKey = new Map<string, ConflictResolution>();
  for (const item of items) {
    lastResolutionByKey.set(item.key, item.resolution);
  }

  const keysByResolution = new Map<ConflictResolution, string[]>();
  for (const [key, resolution] of lastResolutionByKey) {
    const keys = keysByResolution.get(resolution) ?? [];
    keys.push(key);
    keysByResolution.set(resolution, keys);
  }
  return keysByResolution;
}
