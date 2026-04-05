import type { GameParamsConfig } from "@detonator/config";
import { SkillType } from "@detonator/protocol";
import { describe, expect, it } from "vitest";

import { calculateMovementSpeed } from "../../src/movement/speed.js";
import { aggregateSkillModifiers } from "../../src/progression/skill-modifiers.js";
import type { SkillStackEntry } from "../../src/types.js";

describe("movement speed", () => {
  const config = createConfig();

  it("uses the base movement speed when no modifiers apply", () => {
    const expectedSpeed = expectedMovementSpeed({
      config,
      onWasteland: false,
      dashActive: false,
      movementSpeedBoostRatio: 0,
      wastelandPenaltyReductionRatio: 0,
    });

    expect(
      calculateMovementSpeed({
        config,
        onWasteland: false,
        dashActive: false,
        movementSpeedBoostRatio: 0,
        wastelandPenaltyReductionRatio: 0,
      }),
    ).toBe(expectedSpeed);
  });

  it("applies the wasteland penalty", () => {
    const expectedSpeed = expectedMovementSpeed({
      config,
      onWasteland: true,
      dashActive: false,
      movementSpeedBoostRatio: 0,
      wastelandPenaltyReductionRatio: 0,
    });

    expect(
      calculateMovementSpeed({
        config,
        onWasteland: true,
        dashActive: false,
        movementSpeedBoostRatio: 0,
        wastelandPenaltyReductionRatio: 0,
      }),
    ).toBeCloseTo(expectedSpeed);
  });

  it("applies dash and skill modifiers together", () => {
    const expectedSpeed = expectedMovementSpeed({
      config,
      onWasteland: true,
      dashActive: true,
      movementSpeedBoostRatio: 0.5,
      wastelandPenaltyReductionRatio: 0.5,
    });

    expect(
      calculateMovementSpeed({
        config,
        onWasteland: true,
        dashActive: true,
        movementSpeedBoostRatio: 0.5,
        wastelandPenaltyReductionRatio: 0.5,
      }),
    ).toBeCloseTo(expectedSpeed);
  });

  it("fully negates the wasteland penalty when reduction is maxed", () => {
    const expectedSpeed = expectedMovementSpeed({
      config,
      onWasteland: true,
      dashActive: false,
      movementSpeedBoostRatio: 0.25,
      wastelandPenaltyReductionRatio: 1,
    });

    expect(
      calculateMovementSpeed({
        config,
        onWasteland: true,
        dashActive: false,
        movementSpeedBoostRatio: 0.25,
        wastelandPenaltyReductionRatio: 1,
      }),
    ).toBeCloseTo(expectedSpeed);
  });

  it("returns the base movement speed when no skill stacks are present", () => {
    const expectedSpeed = expectedMovementSpeed({
      config,
      onWasteland: false,
      dashActive: false,
      movementSpeedBoostRatio: 0,
      wastelandPenaltyReductionRatio: 0,
    });

    expect(calculateSpeedFromSkills({ config, stacks: [], onWasteland: false, dashActive: false })).toBe(
      expectedSpeed,
    );
  });

  it("increases movement speed when MovementSpeedBoost is applied", () => {
    const expectedSpeed = expectedMovementSpeed({
      config,
      onWasteland: false,
      dashActive: false,
      movementSpeedBoostRatio: percentToRatio(6),
      wastelandPenaltyReductionRatio: 0,
    });

    expect(
      calculateSpeedFromSkills({
        config,
        stacks: [{ skillType: SkillType.MovementSpeedBoost, effectValue: 6 }],
        onWasteland: false,
        dashActive: false,
      }),
    ).toBeCloseTo(expectedSpeed);
  });

  it("applies wasteland reduction after the skill boost", () => {
    const expectedSpeed = expectedMovementSpeed({
      config,
      onWasteland: true,
      dashActive: false,
      movementSpeedBoostRatio: percentToRatio(6),
      wastelandPenaltyReductionRatio: percentToRatio(5),
    });

    expect(
      calculateSpeedFromSkills({
        config,
        stacks: [
          { skillType: SkillType.MovementSpeedBoost, effectValue: 6 },
          { skillType: SkillType.WastelandSpeedReduction, effectValue: 5 },
        ],
        onWasteland: true,
        dashActive: false,
      }),
    ).toBeCloseTo(expectedSpeed);
  });

  it("applies the dash multiplier after skill and wasteland modifiers", () => {
    const expectedSpeed = expectedMovementSpeed({
      config,
      onWasteland: true,
      dashActive: true,
      movementSpeedBoostRatio: percentToRatio(6),
      wastelandPenaltyReductionRatio: percentToRatio(5),
    });

    expect(
      calculateSpeedFromSkills({
        config,
        stacks: [
          { skillType: SkillType.MovementSpeedBoost, effectValue: 6 },
          { skillType: SkillType.WastelandSpeedReduction, effectValue: 5 },
        ],
        onWasteland: true,
        dashActive: true,
      }),
    ).toBeCloseTo(expectedSpeed);
  });

  it("adds multiple movement speed boosts before applying other multipliers", () => {
    const expectedSpeed = expectedMovementSpeed({
      config,
      onWasteland: true,
      dashActive: true,
      movementSpeedBoostRatio: percentToRatio(2 + 6),
      wastelandPenaltyReductionRatio: percentToRatio(5),
    });

    expect(
      calculateSpeedFromSkills({
        config,
        stacks: [
          { skillType: SkillType.MovementSpeedBoost, effectValue: 2 },
          { skillType: SkillType.MovementSpeedBoost, effectValue: 6 },
          { skillType: SkillType.WastelandSpeedReduction, effectValue: 5 },
        ],
        onWasteland: true,
        dashActive: true,
      }),
    ).toBeCloseTo(expectedSpeed);
  });
});

function expectedMovementSpeed(input: {
  config: GameParamsConfig;
  onWasteland: boolean;
  dashActive: boolean;
  movementSpeedBoostRatio: number;
  wastelandPenaltyReductionRatio: number;
}): number {
  let speed = input.config.movement.baseCellsPerSec * (1 + input.movementSpeedBoostRatio);

  if (input.onWasteland) {
    speed *=
      input.config.movement.wastelandSpeedMultiplier +
      (1 - input.config.movement.wastelandSpeedMultiplier) * input.wastelandPenaltyReductionRatio;
  }

  if (input.dashActive) {
    speed *= input.config.movement.dashSpeedMultiplier;
  }

  return speed;
}

function percentToRatio(value: number): number {
  return value / 100;
}

function calculateSpeedFromSkills(input: {
  config: GameParamsConfig;
  stacks: SkillStackEntry[];
  onWasteland: boolean;
  dashActive: boolean;
}): number {
  const modifiers = aggregateSkillModifiers(input.stacks);

  return calculateMovementSpeed({
    config: input.config,
    onWasteland: input.onWasteland,
    dashActive: input.dashActive,
    movementSpeedBoostRatio: modifiers.movementSpeedBoostRatio,
    wastelandPenaltyReductionRatio: modifiers.wastelandPenaltyReductionRatio,
  });
}

function createConfig(): GameParamsConfig {
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
      levelExpBase: 100,
      levelExpGrowth: 1.3,
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
      bridgeTargetCellType: 4,
      relayPointPlacementCellType: 0,
    },
  };
}
