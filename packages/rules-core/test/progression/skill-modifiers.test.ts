import { loadSkillsConfig } from "@detonator/config";
import { type ItemType, SkillType } from "@detonator/protocol";
import { describe, expect, it } from "vitest";

import { aggregateSkillModifiers } from "../../src/progression/skill-modifiers.js";
import type { SkillStackEntry } from "../../src/types.js";

describe("aggregateSkillModifiers", () => {
  it("returns zeroed defaults for empty stacks", () => {
    expect(aggregateSkillModifiers([])).toEqual({
      movementSpeedBoostRatio: 0,
      detonateCooldownReductionSec: 0,
      expGainBoostRatio: 0,
      comboMultiplierBonus: 0,
      erosionCooldownIncreaseRatio: 0,
      itemDropRateBoostRatio: 0,
      itemPickupRangeBoostCells: 0,
      itemSlotIncreaseCount: 0,
      cpDetectionRangeBoostCells: 0,
      erosionForewarningSec: 0,
      deathItemKeepChanceRatio: 0,
      wastelandPenaltyReductionRatio: 0,
      respawnReductionSec: 0,
      chordOwned: false,
    });
  });

  it("converts a single percent-based stack into a ratio", () => {
    expect(
      aggregateSkillModifiers([
        {
          skillType: SkillType.MovementSpeedBoost,
          effectValue: 6,
        },
      ]),
    ).toMatchObject({
      movementSpeedBoostRatio: 0.06,
      chordOwned: false,
    });
  });

  it("sums multiple stacks of the same skill before converting", () => {
    expect(
      aggregateSkillModifiers([
        {
          skillType: SkillType.ExpGainBoost,
          effectValue: 5,
        },
        {
          skillType: SkillType.ExpGainBoost,
          effectValue: 15,
        },
        {
          skillType: SkillType.ItemSlotIncrease,
          effectValue: 1,
        },
        {
          skillType: SkillType.Chord,
          effectValue: 1,
        },
      ]),
    ).toMatchObject({
      expGainBoostRatio: 0.2,
      itemSlotIncreaseCount: 1,
      chordOwned: true,
    });
  });

  it("maps all skill definitions into the expected aggregated fields", async () => {
    const skills = await loadSkillsConfig();
    const stacks = Object.values(SkillType).map(
      (skillType) =>
        ({
          skillType,
          effectValue: skills[skillType].valueRoll.max,
        }) satisfies SkillStackEntry,
    );

    expect(aggregateSkillModifiers(stacks)).toEqual({
      movementSpeedBoostRatio: skills[SkillType.MovementSpeedBoost].valueRoll.max / 100,
      detonateCooldownReductionSec: skills[SkillType.DetonateCooldownReduction].valueRoll.max,
      expGainBoostRatio: skills[SkillType.ExpGainBoost].valueRoll.max / 100,
      comboMultiplierBonus: skills[SkillType.ComboMultiplierBoost].valueRoll.max,
      erosionCooldownIncreaseRatio: skills[SkillType.ErosionCooldownIncrease].valueRoll.max / 100,
      itemDropRateBoostRatio: skills[SkillType.ItemDropRateBoost].valueRoll.max / 100,
      itemPickupRangeBoostCells: skills[SkillType.ItemPickupRangeBoost].valueRoll.max,
      itemSlotIncreaseCount: skills[SkillType.ItemSlotIncrease].valueRoll.max,
      cpDetectionRangeBoostCells: skills[SkillType.CpDetectionRangeBoost].valueRoll.max,
      erosionForewarningSec: skills[SkillType.ErosionForewarning].valueRoll.max,
      deathItemKeepChanceRatio: skills[SkillType.DeathItemKeepChance].valueRoll.max / 100,
      wastelandPenaltyReductionRatio: skills[SkillType.WastelandSpeedReduction].valueRoll.max / 100,
      respawnReductionSec: skills[SkillType.RespawnTimeReduction].valueRoll.max,
      chordOwned: true,
    });
  });
});
