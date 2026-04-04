import type { SkillDefinition, SkillValueUnit } from "@detonator/config";
import { SkillType } from "@detonator/protocol";
import skillDefinitions from "../../../config/data/skills.json" with { type: "json" };

import type { SkillStackEntry } from "../types.js";

type AggregatedSkillModifiers = {
	movementSpeedBoostRatio: number;
	detonateCooldownReductionSec: number;
	expGainBoostRatio: number;
	comboMultiplierBonus: number;
	erosionCooldownIncreaseRatio: number;
	itemDropRateBoostRatio: number;
	itemPickupRangeBoostCells: number;
	itemSlotIncreaseCount: number;
	cpDetectionRangeBoostCells: number;
	erosionForewarningSec: number;
	deathItemKeepChanceRatio: number;
	wastelandPenaltyReductionRatio: number;
	respawnReductionSec: number;
	chordOwned: boolean;
};

const DEFAULT_SKILL_MODIFIERS: AggregatedSkillModifiers = {
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
};

const SKILL_DEFINITIONS = skillDefinitions as Record<SkillType, SkillDefinition>;

export function aggregateSkillModifiers(
	stacks: SkillStackEntry[],
): AggregatedSkillModifiers {
	const totals = new Map<SkillType, number>();

	for (const stack of stacks) {
		totals.set(stack.skillType, (totals.get(stack.skillType) ?? 0) + stack.effectValue);
	}

	const aggregated: AggregatedSkillModifiers = { ...DEFAULT_SKILL_MODIFIERS };

	for (const [skillType, totalEffectValue] of totals) {
		const definition = SKILL_DEFINITIONS[skillType];

		if (definition === undefined) {
			throw new Error(`Missing skill definition for ${skillType}`);
		}

		switch (skillType) {
			case SkillType.MovementSpeedBoost:
				aggregated.movementSpeedBoostRatio = convertNumericModifier(
					totalEffectValue,
					definition.valueRoll.unit,
				);
				break;
			case SkillType.DetonateCooldownReduction:
				aggregated.detonateCooldownReductionSec = convertNumericModifier(
					totalEffectValue,
					definition.valueRoll.unit,
				);
				break;
			case SkillType.ExpGainBoost:
				aggregated.expGainBoostRatio = convertNumericModifier(
					totalEffectValue,
					definition.valueRoll.unit,
				);
				break;
			case SkillType.ComboMultiplierBoost:
				aggregated.comboMultiplierBonus = convertNumericModifier(
					totalEffectValue,
					definition.valueRoll.unit,
				);
				break;
			case SkillType.ErosionCooldownIncrease:
				aggregated.erosionCooldownIncreaseRatio = convertNumericModifier(
					totalEffectValue,
					definition.valueRoll.unit,
				);
				break;
			case SkillType.ItemDropRateBoost:
				aggregated.itemDropRateBoostRatio = convertNumericModifier(
					totalEffectValue,
					definition.valueRoll.unit,
				);
				break;
			case SkillType.ItemPickupRangeBoost:
				aggregated.itemPickupRangeBoostCells = convertNumericModifier(
					totalEffectValue,
					definition.valueRoll.unit,
				);
				break;
			case SkillType.ItemSlotIncrease:
				aggregated.itemSlotIncreaseCount = convertNumericModifier(
					totalEffectValue,
					definition.valueRoll.unit,
				);
				break;
			case SkillType.CpDetectionRangeBoost:
				aggregated.cpDetectionRangeBoostCells = convertNumericModifier(
					totalEffectValue,
					definition.valueRoll.unit,
				);
				break;
			case SkillType.ErosionForewarning:
				aggregated.erosionForewarningSec = convertNumericModifier(
					totalEffectValue,
					definition.valueRoll.unit,
				);
				break;
			case SkillType.DeathItemKeepChance:
				aggregated.deathItemKeepChanceRatio = convertNumericModifier(
					totalEffectValue,
					definition.valueRoll.unit,
				);
				break;
			case SkillType.WastelandSpeedReduction:
				aggregated.wastelandPenaltyReductionRatio = convertNumericModifier(
					totalEffectValue,
					definition.valueRoll.unit,
				);
				break;
			case SkillType.RespawnTimeReduction:
				aggregated.respawnReductionSec = convertNumericModifier(
					totalEffectValue,
					definition.valueRoll.unit,
				);
				break;
			case SkillType.Chord:
				aggregated.chordOwned = true;
				break;
		}
	}

	return aggregated;
}

function convertNumericModifier(value: number, unit: SkillValueUnit): number {
	switch (unit) {
		case "percent":
			return value / 100;
		case "seconds":
		case "multiplier":
		case "cells":
		case "flat":
			return value;
	}
	}
