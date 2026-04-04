import type { ItemDefinition, RewardsConfig } from "@detonator/config";
import { CellType, ItemType, SkillType } from "@detonator/protocol";
import { describe, expect, it } from "vitest";

import { rollGroundDrop } from "../../src/drop/roll-drop.js";
import { SeededRng } from "../../src/random/SeededRng.js";

describe("rollGroundDrop", () => {
	it("returns null when the drop rate check fails", () => {
		expect(
			rollGroundDrop({
				rng: new StubRng([0]),
				dropRate: 0,
				rewardsConfig: createRewardsConfig([ItemType.Dash]),
				itemsConfig: createItemsConfig([ItemType.Dash]),
				deadPlayerExists: false,
			}),
		).toBeNull();
	});

	it("always returns a drop when the drop rate is one", () => {
		expect(
			rollGroundDrop({
				rng: new StubRng([0.2, 0.1]),
				dropRate: 1,
				rewardsConfig: createRewardsConfig([ItemType.Dash]),
				itemsConfig: createItemsConfig([ItemType.Dash]),
				deadPlayerExists: true,
			}),
		).toEqual({
			itemType: ItemType.Dash,
			stackCount: 1,
		});
	});

	it("selects items using the configured weights", () => {
		expect(
			rollGroundDrop({
				rng: new StubRng([0, 0.9]),
				dropRate: 1,
				rewardsConfig: {
					...createRewardsConfig([ItemType.Dash, ItemType.Bridge]),
					itemPool: [
						{ kind: "item", id: ItemType.Dash, weight: 1 },
						{ kind: "item", id: ItemType.Bridge, weight: 3 },
					],
				},
				itemsConfig: createItemsConfig([ItemType.Dash, ItemType.Bridge]),
				deadPlayerExists: false,
			}),
		).toEqual({
			itemType: ItemType.Bridge,
			stackCount: 1,
		});
	});
});

class StubRng extends SeededRng {
	readonly #values: number[];
	#cursor = 0;

	public constructor(values: number[]) {
		super(0);
		this.#values = values;
	}

	public override next(): number {
		const value = this.#values[this.#cursor] ?? this.#values[this.#values.length - 1];

		this.#cursor += 1;

		return value ?? 0;
	}

	public override nextFloat(): number {
		return this.next();
	}
}

function createRewardsConfig(itemTypes: ItemType[]): RewardsConfig {
	return {
		levelUp: {
			optionCount: 3,
			allowOfferCarryOver: false,
			filterFullInventoryItems: true,
			filterStackCappedSkills: true,
		},
		itemPool: itemTypes.map((itemType) => ({
			kind: "item" as const,
			id: itemType,
			weight: 1,
		})),
		skillPool: [{ kind: "skill", id: SkillType.Chord, weight: 1 }],
	};
}

function createItemsConfig(
	itemTypes: ItemType[],
): Record<ItemType, ItemDefinition> {
	return Object.fromEntries(
		itemTypes.map((itemType) => [itemType, createItemDefinition(itemType)]),
	) as Record<ItemType, ItemDefinition>;
}

function createItemDefinition(itemType: ItemType): ItemDefinition {
	return {
		itemType,
		displayName: itemType,
		manualUse: true,
		autoTriggerOnDeath: false,
		stackable: true,
		maxStack: 99,
		targeting: {
			mode: "none",
			usesFacingCorrection: false,
			requiresLineOfSight: false,
		},
		allowedTargetCellTypes: [CellType.Safe],
		effectKind: "dash_buff",
		description: itemType,
	};
}
