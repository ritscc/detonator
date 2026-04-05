import { loadItemsConfig } from "@detonator/config";
import { type InventorySlot, ItemType } from "@detonator/protocol";
import { describe, expect, it } from "vitest";

import {
  addItemToInventory,
  canAddItemToInventory,
  consumeInventorySlot,
  discardInventorySlot,
} from "../../src/reward/inventory-mutation.js";
import type { RulesInventory } from "../../src/types.js";

describe("docs/plans/api.md § インベントリ操作詳細", () => {
  describe("スロット選択ポリシー", () => {
    it("1. 第一優先: 同一 itemType に積めるなら先頭側の既存スロットへ加算する", async () => {
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
      expect(result.inventory.slots).not.toBe(inventory.slots);
      expect(inventory.slots[0]).toEqual({
        slotIndex: 0,
        itemType: ItemType.Dash,
        stackCount: 5,
      });
    });

    it("1. 第二優先: 積める既存スロットがなければ先頭の空スロットへ新規格納する", async () => {
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
      expect(result.inventory.slots[1]).toEqual(inventory.slots[1]);
      expect(result.inventory.slots).not.toBe(inventory.slots);
      expect(inventory.slots[0]).toEqual({
        slotIndex: 0,
        itemType: null,
        stackCount: 0,
      });
    });

    it("1. どちらも見つからない場合は追加できず、状態を変えない", async () => {
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

      const result = addItemToInventory({
        inventory,
        itemType: ItemType.Dash,
        stackCount: 1,
        items,
      });

      expect(result.usedNewSlot).toBe(false);
      expect(result.inventory.slots).toEqual(inventory.slots);
      expect(result.inventory.slots).not.toBe(inventory.slots);
    });
  });

  describe("スタック不可アイテム", () => {
    it("2. 同一 itemType があっても既存スタックへ加算せず新規スロットを消費する", async () => {
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
  });

  describe("maxStack 超過時の扱い", () => {
    it("スロット加算で上限を超える場合は空スロットへ退避する", async () => {
      const items = await loadItemsConfig();
      const inventory = createInventory([
        {
          slotIndex: 0,
          itemType: ItemType.Dash,
          stackCount: items[ItemType.Dash].maxStack,
        },
        { slotIndex: 1, itemType: null, stackCount: 0 },
      ]);

      const result = addItemToInventory({
        inventory,
        itemType: ItemType.Dash,
        stackCount: 1,
        items,
      });

      expect(result.usedNewSlot).toBe(true);
      expect(result.inventory.slots[0]).toEqual(inventory.slots[0]);
      expect(result.inventory.slots[1]).toEqual({
        slotIndex: 1,
        itemType: ItemType.Dash,
        stackCount: 1,
      });
    });
  });

  describe("consumeInventorySlot", () => {
    it("消費 count が stackCount 未満なら残数だけ減らす", () => {
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
      expect(result.slots).not.toBe(inventory.slots);
      expect(inventory.slots[0]).toEqual({
        slotIndex: 0,
        itemType: ItemType.Bridge,
        stackCount: 4,
      });
    });

    it("消費 count が stackCount 以上ならスロットをクリアする", () => {
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

    it("count 省略ならスロット全体をクリアする", () => {
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
  });

  describe("discardInventorySlot", () => {
    it("破棄したアイテム情報を返し、対象スロットをクリアし、元の slots 配列を変更しない", () => {
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
      expect(result.inventory.slots).not.toBe(inventory.slots);
      expect(inventory.slots[0]).toEqual({
        slotIndex: 0,
        itemType: ItemType.Purify,
        stackCount: 2,
      });
    });
  });

  describe("3. canAddItemToInventory", () => {
    it("同一 itemType の既存スタックに空きがあれば true を返す", async () => {
      const items = await loadItemsConfig();
      const inventory = createInventory([
        {
          slotIndex: 0,
          itemType: ItemType.Dash,
          stackCount: items[ItemType.Dash].maxStack - 1,
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
      ).toBe(true);
    });

    it("既存スタックにも空スロットにも余地がなければ false を返す", async () => {
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
  });
});

function createInventory(slots: InventorySlot[]): RulesInventory {
  return {
    slots: slots.map((slot) => ({ ...slot })),
    maxSlots: slots.length,
  };
}
