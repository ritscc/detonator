import type { ItemDefinition, RewardsConfig } from "@detonator/config";
import { CellType, ItemType, SkillType } from "@detonator/protocol";
import { describe, expect, it } from "vitest";

import { rollGroundDrop } from "../../src/drop/roll-drop.js";
import { SeededRng } from "../../src/random/SeededRng.js";

describe("rollGroundDrop", () => {
  it("returns null when phase 1 drop check roll is greater than or equal to dropRate", () => {
    const rng = new StubRng([0.5, 0.1]);

    expect(
      rollGroundDrop({
        rng,
        dropRate: 0.5,
        rewardsConfig: createRewardsConfig([ItemType.Dash]),
        itemsConfig: createItemsConfig([ItemType.Dash]),
        deadPlayerExists: false,
      }),
    ).toBeNull();

    expect(rng.calls).toBe(1);
  });

  it("always returns null when dropRate is 0 because phase 1 always fails", () => {
    for (const roll of [0, 0.4, 0.999999]) {
      expect(
        rollGroundDrop({
          rng: new StubRng([roll]),
          dropRate: 0,
          rewardsConfig: createRewardsConfig([ItemType.Dash]),
          itemsConfig: createItemsConfig([ItemType.Dash]),
          deadPlayerExists: false,
        }),
      ).toBeNull();
    }
  });

  it("always passes phase 1 when dropRate is 1 and consumes a second rng roll for selection", () => {
    const rng = new StubRng([0.999999, 0.1]);

    expect(
      rollGroundDrop({
        rng,
        dropRate: 1,
        rewardsConfig: createRewardsConfig([ItemType.Dash]),
        itemsConfig: createItemsConfig([ItemType.Dash]),
        deadPlayerExists: false,
      }),
    ).toEqual({
      itemType: ItemType.Dash,
      stackCount: 1,
    });

    expect(rng.calls).toBe(2);
  });

  it("selects an item from cumulative positive weights using the phase 2 rng roll", () => {
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

  it("ignores non-positive-weight entries before weighted selection", () => {
    expect(
      rollGroundDrop({
        rng: new StubRng([0, 0.5]),
        dropRate: 1,
        rewardsConfig: {
          ...createRewardsConfig([ItemType.Dash, ItemType.Bridge]),
          itemPool: [
            { kind: "item", id: ItemType.Dash, weight: 0 },
            { kind: "item", id: ItemType.Bridge, weight: 2 },
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

  it("returns null when phase 1 passes but the item pool is empty", () => {
    expect(
      rollGroundDrop({
        rng: new StubRng([0]),
        dropRate: 1,
        rewardsConfig: {
          ...createRewardsConfig([ItemType.Dash]),
          itemPool: [],
        },
        itemsConfig: createItemsConfig([ItemType.Dash]),
        deadPlayerExists: false,
      }),
    ).toBeNull();
  });

  it("returns null when phase 1 passes but every pool entry has zero weight", () => {
    expect(
      rollGroundDrop({
        rng: new StubRng([0]),
        dropRate: 1,
        rewardsConfig: {
          ...createRewardsConfig([ItemType.Dash, ItemType.Bridge]),
          itemPool: [
            { kind: "item", id: ItemType.Dash, weight: 0 },
            { kind: "item", id: ItemType.Bridge, weight: 0 },
          ],
        },
        itemsConfig: createItemsConfig([ItemType.Dash, ItemType.Bridge]),
        deadPlayerExists: false,
      }),
    ).toBeNull();
  });

  it("always returns the only weighted item in a single-item weighted pool", () => {
    expect(
      rollGroundDrop({
        rng: new StubRng([0, 0.999999]),
        dropRate: 1,
        rewardsConfig: {
          ...createRewardsConfig([ItemType.Dash]),
          itemPool: [{ kind: "item", id: ItemType.Dash, weight: 5 }],
        },
        itemsConfig: createItemsConfig([ItemType.Dash]),
        deadPlayerExists: false,
      }),
    ).toEqual({
      itemType: ItemType.Dash,
      stackCount: 1,
    });
  });

  it("throws when the spec-selected item is missing from itemsConfig", () => {
    expect(() =>
      rollGroundDrop({
        rng: new StubRng([0, 0]),
        dropRate: 1,
        rewardsConfig: createRewardsConfig([ItemType.Dash]),
        itemsConfig: createItemsConfig([ItemType.Bridge]),
        deadPlayerExists: false,
      }),
    ).toThrowError(`Missing item definition for ${ItemType.Dash}`);
  });

  it("currently ignores deadPlayerExists during drop resolution", () => {
    const input = {
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
    };

    expect(
      rollGroundDrop({
        ...input,
        rng: new StubRng([0, 0.9]),
        deadPlayerExists: false,
      }),
    ).toEqual(
      rollGroundDrop({
        ...input,
        rng: new StubRng([0, 0.9]),
        deadPlayerExists: true,
      }),
    );
  });
});

class StubRng extends SeededRng {
  readonly #values: number[];
  #cursor = 0;

  public constructor(values: number[]) {
    super(0);
    this.#values = values;
  }

  public get calls(): number {
    return this.#cursor;
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

function createItemsConfig(itemTypes: ItemType[]): Record<ItemType, ItemDefinition> {
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
