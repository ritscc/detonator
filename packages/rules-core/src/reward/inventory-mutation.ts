import type { ItemDefinition } from "@detonator/config";
import type { ItemType } from "@detonator/protocol";

import type { RulesInventory } from "../types.js";

export function canAddItemToInventory(input: {
	inventory: RulesInventory;
	itemType: ItemType;
	stackCount: number;
	items: Record<ItemType, ItemDefinition>;
}): boolean {
	const definition = input.items[input.itemType];

	if (definition === undefined) {
		throw new Error(`Missing item definition for ${input.itemType}`);
	}

	if (definition.stackable) {
		for (const slot of input.inventory.slots) {
			if (
				slot.itemType === input.itemType &&
				slot.stackCount + input.stackCount <= definition.maxStack
			) {
				return true;
			}
		}
	}

	return input.inventory.slots.some((slot) => slot.itemType === null);
}

export function addItemToInventory(input: {
	inventory: RulesInventory;
	itemType: ItemType;
	stackCount: number;
	items: Record<ItemType, ItemDefinition>;
}): {
	inventory: RulesInventory;
	usedNewSlot: boolean;
} {
	const definition = input.items[input.itemType];

	if (definition === undefined) {
		throw new Error(`Missing item definition for ${input.itemType}`);
	}

	const nextSlots = input.inventory.slots.map((slot) => ({ ...slot }));

	if (definition.stackable) {
		for (const [index, slot] of nextSlots.entries()) {
			if (
				slot.itemType === input.itemType &&
				slot.stackCount + input.stackCount <= definition.maxStack
			) {
				nextSlots[index] = {
					...slot,
					stackCount: slot.stackCount + input.stackCount,
				};

				return {
					inventory: {
						...input.inventory,
						slots: nextSlots,
					},
					usedNewSlot: false,
				};
			}
		}
	}

	for (const [index, slot] of nextSlots.entries()) {
		if (slot.itemType === null) {
			nextSlots[index] = {
				...slot,
				itemType: input.itemType,
				stackCount: input.stackCount,
			};

			return {
				inventory: {
					...input.inventory,
					slots: nextSlots,
				},
				usedNewSlot: true,
			};
		}
	}

	return {
		inventory: {
			...input.inventory,
			slots: nextSlots,
		},
		usedNewSlot: false,
	};
}

export function consumeInventorySlot(input: {
	inventory: RulesInventory;
	slotIndex: number;
	count?: number;
}): RulesInventory {
	const nextSlots = input.inventory.slots.map((slot) => ({ ...slot }));
	const targetSlot = nextSlots[input.slotIndex];

	if (targetSlot === undefined) {
		throw new Error(`Inventory slot ${input.slotIndex} does not exist`);
	}

	if (input.count === undefined) {
		nextSlots[input.slotIndex] = clearSlot(targetSlot);
	} else {
		const remaining = targetSlot.stackCount - input.count;

		nextSlots[input.slotIndex] =
			remaining <= 0
				? clearSlot(targetSlot)
				: {
					...targetSlot,
					stackCount: remaining,
				};
	}

	return {
		...input.inventory,
		slots: nextSlots,
	};
}

export function discardInventorySlot(input: {
	inventory: RulesInventory;
	slotIndex: number;
}): {
	inventory: RulesInventory;
	droppedItem: { itemType: ItemType; stackCount: number };
} {
	const nextSlots = input.inventory.slots.map((slot) => ({ ...slot }));
	const targetSlot = nextSlots[input.slotIndex];

	if (targetSlot === undefined) {
		throw new Error(`Inventory slot ${input.slotIndex} does not exist`);
	}

	if (targetSlot.itemType === null) {
		throw new Error(`Inventory slot ${input.slotIndex} is empty`);
	}

	nextSlots[input.slotIndex] = clearSlot(targetSlot);

	return {
		inventory: {
			...input.inventory,
			slots: nextSlots,
		},
		droppedItem: {
			itemType: targetSlot.itemType,
			stackCount: targetSlot.stackCount,
		},
	};
}

function clearSlot<T extends { slotIndex: number }>(slot: T) {
	return {
		...slot,
		itemType: null,
		stackCount: 0,
	};
}
