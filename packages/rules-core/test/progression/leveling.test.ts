import type { GameParamsConfig } from "@detonator/config";
import { CellType } from "@detonator/protocol";
import { describe, expect, it } from "vitest";

import { requiredExpForLevel, resolveLevelProgression } from "../../src/progression/leveling.js";

describe("level progression", () => {
  /**
   * EXP is cumulative across floor transitions (Decision #2, 2026-04-05).
   * resolveLevelProgression receives currentExp which carries over from previous floors.
   * resetPlayersForNewFloor() no longer zeroes exp — see schema reset.ts.
   */
  it("returns the base exp requirement for level one", () => {
    const config = createConfig(100, 1.5);
    const expectedExp = expectedRequiredExpForLevel(1, config);

    expect(requiredExpForLevel(1, config)).toBe(expectedExp);
  });

  it("grows exp requirements exponentially by level", () => {
    const config = createConfig(100, 1.5);
    const expectedExp = expectedRequiredExpForLevel(3, config);

    expect(requiredExpForLevel(3, config)).toBe(expectedExp);
  });

  it("keeps the current level when not enough exp is gained", () => {
    const config = createConfig(100, 2);
    const expectedProgression = expectedLevelProgression({
      currentLevel: 1,
      currentExp: 20,
      gainedExp: 70,
      config,
    });

    expect(
      resolveLevelProgression({
        currentLevel: 1,
        currentExp: 20,
        gainedExp: 70,
        config,
      }),
    ).toEqual(expectedProgression);
  });

  it("applies a single level-up and carries remaining exp", () => {
    const config = createConfig(100, 2);
    const expectedProgression = expectedLevelProgression({
      currentLevel: 1,
      currentExp: 150,
      gainedExp: 60,
      config,
    });

    expect(
      resolveLevelProgression({
        currentLevel: 1,
        currentExp: 150,
        gainedExp: 60,
        config,
      }),
    ).toEqual(expectedProgression);
  });

  it("applies multiple level-ups in sequence", () => {
    const config = createConfig(100, 1.5);
    const expectedProgression = expectedLevelProgression({
      currentLevel: 1,
      currentExp: 150,
      gainedExp: 300,
      config,
    });

    expect(
      resolveLevelProgression({
        currentLevel: 1,
        currentExp: 150,
        gainedExp: 300,
        config,
      }),
    ).toEqual(expectedProgression);
  });

  it("carries over remaining exp after floor transition (cumulative model)", () => {
    const config = createConfig(100, 2);
    const expectedProgression = expectedLevelProgression({
      currentLevel: 1,
      currentExp: 90,
      gainedExp: 20,
      config,
    });

    const result = resolveLevelProgression({
      currentLevel: 1,
      currentExp: 90,
      gainedExp: 20,
      config,
    });

    expect(result).toEqual(expectedProgression);
  });

  it("handles multi-level carry across floor boundary", () => {
    const config = createConfig(100, 1.5);
    const expectedProgression = expectedLevelProgression({
      currentLevel: 1,
      currentExp: 250,
      gainedExp: 150,
      config,
    });

    const result = resolveLevelProgression({
      currentLevel: 1,
      currentExp: 250,
      gainedExp: 150,
      config,
    });

    expect(result).toEqual(expectedProgression);
  });
});

function expectedRequiredExpForLevel(level: number, config: GameParamsConfig): number {
  return Math.floor(
    config.progression.levelExpBase * Math.pow(config.progression.levelExpGrowth, level - 1),
  );
}

function expectedLevelProgression(input: {
  currentLevel: number;
  currentExp: number;
  gainedExp: number;
  config: GameParamsConfig;
}): { newLevel: number; totalExp: number; leveledUpCount: number } {
  let newLevel = input.currentLevel;
  let totalExp = input.currentExp + input.gainedExp;
  let leveledUpCount = 0;

  while (totalExp >= expectedRequiredExpForLevel(newLevel + 1, input.config)) {
    totalExp -= expectedRequiredExpForLevel(newLevel + 1, input.config);
    newLevel += 1;
    leveledUpCount += 1;
  }

  return { newLevel, totalExp, leveledUpCount };
}

function createConfig(levelExpBase: number, levelExpGrowth: number): GameParamsConfig {
  return {
    board: {
      sizeFormula: "",
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
      intervalFormula: "",
      powerFormula: "",
      takeABreathPauseMs: 5000,
      shortBreakPauseMs: 15000,
    },
    progression: {
      levelExpBase,
      levelExpGrowth,
      comboMultiplierBase: 1,
      comboMultiplierPerChain: 0.1,
    },
    respawn: {
      baseRespawnSec: 40,
      shortenDropWeightRatioWhenDeadExists: 0.9,
      respawnTimeFormula: "",
    },
    detonate: {
      baseCooldownSec: 10,
      fuseMs: 3000,
      chainIntervalMs: 125,
      cooldownFormula: "",
    },
    drop: {
      baseDropRate: 0.1,
      itemLifetimeMs: 15000,
      dropRateFormula: "",
    },
    checkpoint: {
      detectionRadiusCells: 3,
      countFormula: "",
    },
    scoring: {
      timeBonusBaseSeconds: 600,
      minimumTimeBonusMultiplier: 1,
      roundingMode: "round",
      formula: "",
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
        cheap: "mine_remover_cheap",
        normal: "mine_remover_normal",
        high: "mine_remover_high",
      },
      purifyForwardRangeCells: 1,
      bridgeTargetCellType: CellType.Hole,
      relayPointPlacementCellType: CellType.Safe,
    },
  };
}
