import type { GameParamsConfig } from "@detonator/config";
import { CellType } from "@detonator/protocol";
import { describe, expect, it } from "vitest";

import {
	requiredExpForLevel,
	resolveLevelProgression,
} from "../../src/progression/leveling.js";

describe("level progression", () => {
	it("returns the base exp requirement for level one", () => {
		expect(requiredExpForLevel(1, createConfig(100, 1.5))).toBe(100);
	});

	it("grows exp requirements exponentially by level", () => {
		expect(requiredExpForLevel(3, createConfig(100, 1.5))).toBe(225);
	});

	it("keeps the current level when not enough exp is gained", () => {
		expect(
			resolveLevelProgression({
				currentLevel: 1,
				currentExp: 20,
				gainedExp: 70,
				config: createConfig(100, 2),
			}),
		).toEqual({
			newLevel: 1,
			totalExp: 90,
			leveledUpCount: 0,
		});
	});

	it("applies a single level-up and carries remaining exp", () => {
		expect(
			resolveLevelProgression({
				currentLevel: 1,
				currentExp: 150,
				gainedExp: 60,
				config: createConfig(100, 2),
			}),
		).toEqual({
			newLevel: 2,
			totalExp: 10,
			leveledUpCount: 1,
		});
	});

	it("applies multiple level-ups in sequence", () => {
		expect(
			resolveLevelProgression({
				currentLevel: 1,
				currentExp: 150,
				gainedExp: 300,
				config: createConfig(100, 1.5),
			}),
		).toEqual({
			newLevel: 3,
			totalExp: 75,
			leveledUpCount: 2,
		});
	});
});

function createConfig(
	levelExpBase: number,
	levelExpGrowth: number,
): GameParamsConfig {
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
