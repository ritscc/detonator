import type { ItemDefinition, RewardsConfig } from "@detonator/config";
import type { ItemType } from "@detonator/protocol";

import type { SeededRng } from "../random/SeededRng.js";

export function rollGroundDrop(input: {
  rng: SeededRng;
  dropRate: number;
  rewardsConfig: RewardsConfig;
  itemsConfig: Record<ItemType, ItemDefinition>;
  deadPlayerExists: boolean;
}): { itemType: ItemType; stackCount: number } | null {
  if (input.rng.nextFloat() >= input.dropRate) {
    return null;
  }

  const weightedEntries = input.rewardsConfig.itemPool.filter((entry) => entry.weight > 0);

  if (weightedEntries.length === 0) {
    return null;
  }

  let totalWeight = 0;

  for (const entry of weightedEntries) {
    totalWeight += entry.weight;
  }

  if (totalWeight <= 0) {
    return null;
  }

  const roll = input.rng.nextFloat() * totalWeight;
  let cumulativeWeight = 0;
  let selectedEntry = weightedEntries[weightedEntries.length - 1] ?? null;

  for (const entry of weightedEntries) {
    cumulativeWeight += entry.weight;

    if (roll < cumulativeWeight) {
      selectedEntry = entry;
      break;
    }
  }

  if (selectedEntry === null) {
    return null;
  }

  if (input.itemsConfig[selectedEntry.id] === undefined) {
    throw new Error(`Missing item definition for ${selectedEntry.id}`);
  }

  // TODO(Phase-B): Implement dead-player drop bonus rule.
  // When deadPlayerExists=true, increase drop rate or add special item pool
  // per game economy design. Currently ignored — deferred to TDD implementation
  // in Phase B where the full drop economy will be designed and tested together.
  // See: docs/reports/test-phase-a/master/2026-04-05-gap-analysis.md Decision #6
  void input.deadPlayerExists;

  return {
    itemType: selectedEntry.id,
    stackCount: 1,
  };
}
