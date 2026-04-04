import { loadItemsConfig } from "@detonator/config";
import { ItemType, type InventorySlot } from "@detonator/protocol";
import { describe, expect, it } from "vitest";

import {
	addItemToInventory,
	canAddItemToInventory,
	consumeInventorySlot,
	discardInventorySlot,
} from "../../src/reward/inventory-mutation.js";
import type { RulesInventory } from "../../src/types.js";

describe("inventory mutation", () => {
	it("adds an item into the first empty slot", async () => {
		const items = await loadItemsConfig();
		const inventory = createInventory([
			{ slotIndex: 0, itemType: null, stackCount: 0 },
			{ slotIndex: 1, itemType: ItemType.Dash, stackCount: 2 },
		]);

		expect(
			canAddItemToInventory({
				inventory,
				itemType: ItemType.RelayPoint,
				stackCount: 1,
				items,
			}),
		).toBe(true);

		const result = addItemToInventory({
			inventory,
			itemType: ItemType.RelayPoint,
			stackCount: 3,
			items,
		});

		expect(result.usedNewSlot).toBe(true);
		expect(result.inventory.slots[0]).toEqual({
			slotIndex: 0,
			itemType: ItemType.RelayPoint,
			stackCount: 3,
		});
		expect(inventory.slots[0]).toEqual({
			slotIndex: 0,
			itemType: null,
			stackCount: 0,
		});
		expect(result.inventory.slots).not.toBe(inventory.slots);
	});

	it("stacks onto an existing slot without consuming a new slot", async () => {
		const items = await loadItemsConfig();
		const inventory = createInventory([
			{ slotIndex: 0, itemType: ItemType.Dash, stackCount: 5 },
			{ slotIndex: 1, itemType: null, stackCount: 0 },
		]);

		expect(
			canAddItemToInventory({
				inventory,
				itemType: ItemType.Dash,
				stackCount: 2,
				items,
			}),
		).toBe(true);

		const result = addItemToInventory({
			inventory,
			itemType: ItemType.Dash,
			stackCount: 2,
			items,
		});

		expect(result.usedNewSlot).toBe(false);
		expect(result.inventory.slots[0]).toEqual({
			slotIndex: 0,
			itemType: ItemType.Dash,
			stackCount: 7,
		});
		expect(result.inventory.slots[1]).toEqual(inventory.slots[1]);
		expect(inventory.slots[0]).toEqual({
			slotIndex: 0,
			itemType: ItemType.Dash,
			stackCount: 5,
		});
	});

	it("rejects additions when the inventory is full and matching stacks are capped", async () => {
		const items = await loadItemsConfig();
		const inventory = createInventory([
			{
				slotIndex: 0,
				itemType: ItemType.Dash,
				stackCount: items[ItemType.Dash].maxStack,
			},
			{
				slotIndex: 1,
				itemType: ItemType.RelayPoint,
				stackCount: items[ItemType.RelayPoint].maxStack,
			},
		]);

		expect(
			canAddItemToInventory({
				inventory,
				itemType: ItemType.Dash,
				stackCount: 1,
				items,
			}),
		).toBe(false);
	});

	it("uses a new slot when stacking would exceed maxStack", async () => {
		const items = await loadItemsConfig();
		const inventory = createInventory([
			{
				slotIndex: 0,
				itemType: ItemType.Dash,
				stackCount: items[ItemType.Dash].maxStack,
			},
			{
				slotIndex: 1,
				itemType: null,
				stackCount: 0,
			},
		]);

		const result = addItemToInventory({
			inventory,
			itemType: ItemType.Dash,
			stackCount: 1,
			items,
		});

		expect(result.usedNewSlot).toBe(true);
		expect(result.inventory.slots[0]?.stackCount).toBe(items[ItemType.Dash].maxStack);
		expect(result.inventory.slots[1]).toEqual({
			slotIndex: 1,
			itemType: ItemType.Dash,
			stackCount: 1,
		});
	});

	it("treats non-stackable items as requiring a fresh slot", async () => {
		const loadedItems = await loadItemsConfig();
		const items = {
			...loadedItems,
			[ItemType.Purify]: {
				...loadedItems[ItemType.Purify],
				stackable: false,
			},
		};
		const inventory = createInventory([
			{ slotIndex: 0, itemType: ItemType.Purify, stackCount: 1 },
			{ slotIndex: 1, itemType: null, stackCount: 0 },
		]);

		const result = addItemToInventory({
			inventory,
			itemType: ItemType.Purify,
			stackCount: 1,
			items,
		});

		expect(result.usedNewSlot).toBe(true);
		expect(result.inventory.slots[0]).toEqual(inventory.slots[0]);
		expect(result.inventory.slots[1]).toEqual({
			slotIndex: 1,
			itemType: ItemType.Purify,
			stackCount: 1,
		});
	});

	it("consumes only part of a stack when a count is provided", () => {
		const inventory = createInventory([
			{ slotIndex: 0, itemType: ItemType.Bridge, stackCount: 4 },
		]);

		const result = consumeInventorySlot({
			inventory,
			slotIndex: 0,
			count: 3,
		});

		expect(result.slots[0]).toEqual({
			slotIndex: 0,
			itemType: ItemType.Bridge,
			stackCount: 1,
		});
		expect(inventory.slots[0]).toEqual({
			slotIndex: 0,
			itemType: ItemType.Bridge,
			stackCount: 4,
		});
	});

	it("clears the slot when a consume fully depletes the stack", () => {
		const inventory = createInventory([
			{ slotIndex: 0, itemType: ItemType.Bridge, stackCount: 2 },
		]);

		const result = consumeInventorySlot({
			inventory,
			slotIndex: 0,
			count: 2,
		});

		expect(result.slots[0]).toEqual({
			slotIndex: 0,
			itemType: null,
			stackCount: 0,
		});
	});

	it("clears the entire slot when count is omitted", () => {
		const inventory = createInventory([
			{ slotIndex: 0, itemType: ItemType.Bridge, stackCount: 2 },
		]);

		const result = consumeInventorySlot({
			inventory,
			slotIndex: 0,
		});

		expect(result.slots[0]).toEqual({
			slotIndex: 0,
			itemType: null,
			stackCount: 0,
		});
	});

	it("discards a slot and returns the dropped item data", () => {
		const inventory = createInventory([
			{ slotIndex: 0, itemType: ItemType.Purify, stackCount: 2 },
			{ slotIndex: 1, itemType: null, stackCount: 0 },
		]);

		const result = discardInventorySlot({
			inventory,
			slotIndex: 0,
		});

		expect(result.droppedItem).toEqual({
			itemType: ItemType.Purify,
			stackCount: 2,
		});
		expect(result.inventory.slots[0]).toEqual({
			slotIndex: 0,
			itemType: null,
			stackCount: 0,
		});
		expect(inventory.slots[0]).toEqual({
			slotIndex: 0,
			itemType: ItemType.Purify,
			stackCount: 2,
		});
	});
});

function createInventory(slots: InventorySlot[]): RulesInventory {
	return {
		slots: slots.map((slot) => ({ ...slot })),
		maxSlots: slots.length,
	};
}
