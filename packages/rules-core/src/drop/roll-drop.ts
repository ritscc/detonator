import type { ItemDefinition, RewardsConfig } from "@detonator/config";
import { type ItemType } from "@detonator/protocol";

import { SeededRng } from "../random/SeededRng.js";

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

	const weightedEntries = input.rewardsConfig.itemPool.filter(
		(entry) => entry.weight > 0,
	);

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

	void input.deadPlayerExists;

	return {
		itemType: selectedEntry.id,
		stackCount: 1,
	};
}
