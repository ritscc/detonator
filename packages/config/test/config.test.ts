import { CellType, ItemType, SkillType } from "@detonator/protocol";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  ConfigValidationError,
  type ItemDefinition,
  type LoadConfigInput,
  type RewardPoolEntry,
  type SharedGameConfig,
  type SkillDefinition,
  loadBundledConfig,
  loadConfig,
  loadGameParamsConfig,
  loadItemsConfig,
  loadRewardsConfig,
  loadSkillsConfig,
  loadStagesConfig,
  validateConfig,
} from "../src";

let bundledData: Awaited<ReturnType<typeof loadBundledData>>;

beforeAll(async () => {
  bundledData = await loadBundledData();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("config loading", () => {
  it("loads bundled data files with complete definitions", async () => {
    const [items, skills, stages, rewards] = await Promise.all([
      loadItemsConfig(),
      loadSkillsConfig(),
      loadStagesConfig(),
      loadRewardsConfig(),
    ]);

    expect(Object.keys(items)).toHaveLength(Object.values(ItemType).length);
    expect(Object.keys(skills)).toHaveLength(Object.values(SkillType).length);
    expect(stages.floors).toHaveLength(10);
    expect(Object.keys(stages.stages)).toHaveLength(10);
    expect(rewards.itemPool).toHaveLength(14);
    expect(rewards.skillPool).toHaveLength(14);

    await expect(loadConfig({ items, skills, stages, rewards })).resolves.toBeDefined();
  });

  it("loads the fully bundled config", async () => {
    const config = await loadBundledConfig();

    expect(Object.keys(config.items)).toHaveLength(14);
    expect(Object.keys(config.skills)).toHaveLength(14);
    expect(config.stages.floors).toHaveLength(10);
    expect(() => validateConfig(config as SharedGameConfig)).not.toThrow();
  });

  it("loads bundled game params, normalizes overrides, and deep-freezes the result", async () => {
    const input = createValidConfigInput({
      gameParams: {
        movement: {
          dashDurationMs: 20000,
        },
      },
    });

    const config = await loadConfig(input);

    expect(config.gameParams.board.minWidth).toBe(20);
    expect(config.gameParams.erosion.takeABreathPauseMs).toBe(5000);
    expect(config.gameParams.movement.dashDurationMs).toBe(20000);
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.gameParams)).toBe(true);
    expect(Object.isFrozen(config.gameParams.board)).toBe(true);
    expect(Object.isFrozen(config.stages.floors)).toBe(true);

    input.stages.floors[0]!.displayName = "mutated after load";

    expect(config.stages.floors[0]?.displayName).toBe("Floor 1");
    expect(() => {
      (config.gameParams.board as { minWidth: number }).minWidth = 24;
    }).toThrow(TypeError);
  });
});

describe("config validation", () => {
  it("rejects invalid enum values", () => {
    const config = createValidConfig();

    config.items[ItemType.RelayPoint] = {
      ...config.items[ItemType.RelayPoint],
      allowedTargetCellTypes: [999 as CellType],
    };

    expect(() => validateConfig(config)).toThrow(ConfigValidationError);
    expect(() => validateConfig(config)).toThrow(/valid CellType/);
  });

  it("rejects duplicate stage ids and invalid reward references", () => {
    const config = createValidConfig();

    config.stages.stages = {
      alpha: {
        ...config.stages.stages.alpha,
        stageId: "duplicate-stage",
      },
      beta: {
        ...config.stages.stages.beta,
        stageId: "duplicate-stage",
      },
    };
    config.rewards.itemPool = [
      {
        kind: "item",
        id: "not_an_item" as ItemType,
        weight: 1,
      } satisfies RewardPoolEntry<ItemType>,
    ];

    expect(() => validateConfig(config)).toThrow(/Duplicate stageId detected/);
    expect(() => validateConfig(config)).toThrow(/valid ItemType/);
  });
});

describe("item semantic validation", () => {
  it("covers every ItemType enum value with a bundled item definition", () => {
    expect(new Set(Object.keys(bundledData.items))).toEqual(new Set(Object.values(ItemType)));
  });

  it("ensures every bundled item exposes the required semantic fields", () => {
    for (const [recordKey, item] of Object.entries(bundledData.items)) {
      expect(item.itemType).toBe(recordKey);
      expect(item.displayName).toBeTruthy();
      expect(item.description).toBeTruthy();
      expect(item.targeting).toBeDefined();
      expect(item.effectKind).toBeTruthy();
    }
  });

  it("uses only supported targeting modes across bundled items", () => {
    const validModes = new Set(["self", "none", "grid_coord_required", "grid_coord_optional"]);

    for (const [recordKey, item] of Object.entries(bundledData.items)) {
      expect(validModes.has(item.targeting.mode)).toBe(true);
      expect(item.targeting.mode, `${recordKey} has invalid targeting mode`).toBe(item.targeting.mode);
    }
  });

  it("requires stackable bundled items to have a positive maxStack", () => {
    for (const [recordKey, item] of Object.entries(bundledData.items)) {
      if (item.stackable) {
        expect(item.maxStack, `${recordKey} should have maxStack >= 1`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("keeps shared item effect kinds structurally compatible", () => {
    const definitionsByEffectKind = new Map<string, Array<{ key: string; item: ItemDefinition }>>();

    for (const [recordKey, item] of Object.entries(bundledData.items)) {
      const definitions = definitionsByEffectKind.get(item.effectKind) ?? [];
      definitions.push({ key: recordKey, item });
      definitionsByEffectKind.set(item.effectKind, definitions);
    }

    for (const definitions of definitionsByEffectKind.values()) {
      if (definitions.length < 2) {
        continue;
      }

      const [baseDefinition, ...restDefinitions] = definitions;
      const baseShape = getItemEffectShape(baseDefinition.item);

      for (const definition of restDefinitions) {
        expect(
          getItemEffectShape(definition.item),
          `${definition.key} should match ${baseDefinition.key} structural contract for ${definition.item.effectKind}`,
        ).toEqual(baseShape);
      }
    }
  });
});

describe("skill semantic validation", () => {
  it("covers every SkillType enum value with a bundled skill definition", () => {
    expect(new Set(Object.keys(bundledData.skills))).toEqual(new Set(Object.values(SkillType)));
  });

  it("ensures every bundled skill exposes the required semantic fields", () => {
    for (const [recordKey, skill] of Object.entries(bundledData.skills)) {
      expect(skill.skillType).toBe(recordKey);
      expect(skill.displayName).toBeTruthy();
      expect(skill.description).toBeTruthy();
      expect(skill.rarity).toBeTruthy();
      expect(skill.effectKind).toBeTruthy();
      expect(skill.valueRoll).toBeDefined();
    }
  });

  it("keeps bundled skill value rolls finite, positive, and ordered", () => {
    for (const [recordKey, skill] of Object.entries(bundledData.skills)) {
      expect(skill.stackLimit, `${recordKey} should not use a negative stack limit`).toBeGreaterThanOrEqual(0);
      expect(skill.valueRoll.min, `${recordKey} min roll should be positive`).toBeGreaterThan(0);
      expect(skill.valueRoll.max, `${recordKey} max roll should be positive`).toBeGreaterThan(0);
      expect(Number.isFinite(skill.valueRoll.min)).toBe(true);
      expect(Number.isFinite(skill.valueRoll.max)).toBe(true);
      expect(skill.valueRoll.min, `${recordKey} valueRoll.min should be <= valueRoll.max`).toBeLessThanOrEqual(
        skill.valueRoll.max,
      );
    }
  });
});

describe("cross-file data integrity", () => {
  it("ensures every reward item pool entry references an existing bundled item", () => {
    for (const entry of bundledData.rewards.itemPool) {
      expect(bundledData.items[entry.id]).toBeDefined();
    }
  });

  it("keeps mine remover refs aligned with existing mine remover items", () => {
    for (const [effectRef, itemType] of Object.entries(bundledData.gameParams.itemEffects.mineRemoverRefs)) {
      const item = bundledData.items[itemType as ItemType];

      expect(Object.values(ItemType)).toContain(itemType);
      expect(item).toBeDefined();
      expect(item?.effectKind).toBe("mine_remover");
      expect(item?.effectRef).toBe(effectRef);
    }
  });

  it("keeps bundled stage ids unique across stage definitions and floor references", () => {
    const definedStageIds = Object.values(bundledData.stages.stages).map((stage) => stage.stageId);
    const floorStageIds = bundledData.stages.floors.map((floor) => floor.stageId);

    expect(new Set(definedStageIds).size).toBe(definedStageIds.length);
    expect(new Set(floorStageIds).size).toBe(floorStageIds.length);

    for (const stageId of floorStageIds) {
      expect(bundledData.stages.stages[stageId]?.stageId).toBe(stageId);
    }
  });
});

describe("config loading edge cases", () => {
  it("surfaces the filesystem error when a bundled data file is missing", async () => {
    const missingFileError = Object.assign(new Error("ENOENT: missing config data file"), {
      code: "ENOENT",
    });

    vi.resetModules();
    vi.doMock("node:fs/promises", () => ({
      readFile: vi.fn().mockRejectedValue(missingFileError),
    }));

    const { loadGameParamsConfig: loadGameParamsConfigWithMissingFile } = await import("../src/loadConfig");

    await expect(loadGameParamsConfigWithMissingFile()).rejects.toMatchObject({ code: "ENOENT" });

    vi.doUnmock("node:fs/promises");
    vi.resetModules();
  });

  it("turns empty objects and arrays into validation errors instead of crashing", async () => {
    await expect(
      loadConfig(
        createValidConfigInput({
          stages: {
            floors: [],
            stages: {},
          },
          rewards: {
            levelUp: {
              optionCount: 3,
              allowOfferCarryOver: true,
              filterFullInventoryItems: true,
              filterStackCappedSkills: true,
            },
            itemPool: [],
            skillPool: [],
          },
        }),
      ),
    ).rejects.toThrow(ConfigValidationError);
  });
});

function createValidConfigInput(overrides: Partial<LoadConfigInput> = {}): LoadConfigInput {
  return {
    items: createItemDefinitions(),
    skills: createSkillDefinitions(),
    stages: {
      floors: [
        { floorNumber: 1, stageId: "alpha", displayName: "Floor 1" },
        { floorNumber: 2, stageId: "beta", displayName: "Floor 2" },
      ],
      stages: {
        alpha: createStageDefinition("alpha", "Alpha"),
        beta: createStageDefinition("beta", "Beta"),
      },
    },
    rewards: {
      levelUp: {
        optionCount: 3,
        allowOfferCarryOver: true,
        filterFullInventoryItems: true,
        filterStackCappedSkills: true,
      },
      itemPool: [
        { kind: "item", id: ItemType.RelayPoint, weight: 1 },
        { kind: "item", id: ItemType.Dash, weight: 1, minFloor: 1 },
      ],
      skillPool: [
        { kind: "skill", id: SkillType.Chord, weight: 1, minFloor: 5 },
        { kind: "skill", id: SkillType.MovementSpeedBoost, weight: 1 },
      ],
    },
    ...overrides,
  };
}

function createValidConfig(): SharedGameConfig {
  return {
    gameParams: {
      board: {
        sizeFormula: "f(playerCount)",
        minWidth: 20,
        minHeight: 20,
        maxWidth: 40,
        maxHeight: 40,
        initialSafeZoneWidth: 5,
        initialSafeZoneHeight: 5,
      },
      mines: {
        safeMineRatio: 3,
        dangerousMineRatio: 1,
        mineDensity: 0.2,
        erosionSafeMineRatio: 7,
        erosionDangerousMineRatio: 3,
      },
      erosion: {
        baseIntervalSec: 10,
        basePowerCells: 3,
        warningFixedDurationSec: 3,
        warningIntervalThresholdSec: 4,
        warningShortIntervalMultiplier: 0.75,
        intervalFormula: "shortenByFloorAndMitigateBySkills",
        powerFormula: "increaseByFloor",
        takeABreathPauseMs: 5000,
        shortBreakPauseMs: 15000,
      },
      progression: {
        levelExpBase: 100,
        levelExpGrowth: 1.3,
        comboMultiplierBase: 1,
        comboMultiplierPerChain: 0.1,
      },
      respawn: {
        baseRespawnSec: 40,
        shortenDropWeightRatioWhenDeadExists: 0.9,
        respawnTimeFormula: "baseModifiedByPlayerCountAndSkills",
      },
      detonate: {
        baseCooldownSec: 10,
        fuseMs: 3000,
        chainIntervalMs: 125,
        cooldownFormula: "baseModifiedByPlayerCountAndSkills",
      },
      drop: {
        baseDropRate: 0.1,
        itemLifetimeMs: 15000,
        dropRateFormula: "baseModifiedBySkillsAndRunState",
      },
      checkpoint: {
        detectionRadiusCells: 3,
        countFormula: "stageBasePlusPlayerAdjustment",
      },
      scoring: {
        timeBonusBaseSeconds: 600,
        minimumTimeBonusMultiplier: 1,
        roundingMode: "round",
        formula:
          "round(max(minimumTimeBonusMultiplier, timeBonusBaseSeconds / clearTimeSeconds) * floorExp)",
      },
      movement: {
        baseCellsPerSec: 2,
        wastelandSpeedMultiplier: 0.4,
        dashSpeedMultiplier: 1.5,
        dashDurationMs: 15000,
      },
      room: {
        reconnectGraceSec: 60,
        patchRateHz: 30,
        maxPlayers: 10,
        seatReservationTimeoutSec: 15,
      },
      inventory: {
        baseSlots: 3,
        maxSlots: 10,
      },
      itemEffects: {
        catsEyeDurationMs: 10000,
        disposableLifeDurationMs: 10000,
        mineRemoverRefs: {
          cheap: ItemType.MineRemoverCheap,
          normal: ItemType.MineRemoverNormal,
          high: ItemType.MineRemoverHigh,
        },
        purifyForwardRangeCells: 1,
        bridgeTargetCellType: CellType.Hole,
        relayPointPlacementCellType: CellType.Safe,
      },
    },
    ...createValidConfigInput(),
  };
}

function createItemDefinitions(): Record<ItemType, ItemDefinition> {
  return Object.fromEntries(
    Object.values(ItemType).map((itemType) => [
      itemType,
      {
        itemType,
        displayName: itemType,
        manualUse: true,
        autoTriggerOnDeath: false,
        stackable: true,
        maxStack: 99,
        targeting: {
          mode: "self",
          usesFacingCorrection: false,
          requiresLineOfSight: false,
        },
        allowedTargetCellTypes: [CellType.Safe],
        effectKind: "relay_point_place",
        description: `${itemType} definition`,
      } satisfies ItemDefinition,
    ]),
  ) as Record<ItemType, ItemDefinition>;
}

function createSkillDefinitions(): Record<SkillType, SkillDefinition> {
  return Object.fromEntries(
    Object.values(SkillType).map((skillType) => [
      skillType,
      {
        skillType,
        displayName: skillType,
        rarity: skillType === SkillType.Chord ? "rare" : "common",
        uniquePerRun: skillType === SkillType.Chord,
        stackLimit: skillType === SkillType.Chord ? 1 : 0,
        effectKind: "rare_global_modifier",
        valueRoll: {
          min: 1,
          max: 1,
          unit: "flat",
        },
        description: `${skillType} definition`,
      } satisfies SkillDefinition,
    ]),
  ) as Record<SkillType, SkillDefinition>;
}

function createStageDefinition(stageId: string, displayName: string) {
  return {
    stageId,
    displayName,
    boardProfile: {
      sizeRuleRef: "board.sizeFormula",
      cpCountFormulaRef: "checkpoint.countFormula",
    },
    holeCoords: [],
    cpCandidateCoords: [],
    spawnGroups: [],
  };
}

async function loadBundledData() {
  const [gameParams, items, skills, stages, rewards] = await Promise.all([
    loadGameParamsConfig(),
    loadItemsConfig(),
    loadSkillsConfig(),
    loadStagesConfig(),
    loadRewardsConfig(),
  ]);

  return { gameParams, items, skills, stages, rewards };
}

function getItemEffectShape(item: ItemDefinition) {
  return {
    manualUse: item.manualUse,
    autoTriggerOnDeath: item.autoTriggerOnDeath,
    stackable: item.stackable,
    hasDurationMs: item.durationMs !== undefined,
    hasEffectRef: item.effectRef !== undefined,
    targeting: {
      mode: item.targeting.mode,
      usesFacingCorrection: item.targeting.usesFacingCorrection,
      requiresLineOfSight: item.targeting.requiresLineOfSight,
    },
    allowedTargetCellTypes: [...item.allowedTargetCellTypes].sort((left, right) => left - right),
  };
}
