import type { GameParamsConfig } from "@detonator/config";
import { describe, expect, it } from "vitest";

import { calculateMovementSpeed } from "../../src/movement/speed.js";

describe("movement speed", () => {
	const config = createConfig();

	it("uses the base movement speed when no modifiers apply", () => {
		expect(
			calculateMovementSpeed({
				config,
				onWasteland: false,
				dashActive: false,
				movementSpeedBoostRatio: 0,
				wastelandPenaltyReductionRatio: 0,
			}),
		).toBe(2);
	});

	it("applies the wasteland penalty", () => {
		expect(
			calculateMovementSpeed({
				config,
				onWasteland: true,
				dashActive: false,
				movementSpeedBoostRatio: 0,
				wastelandPenaltyReductionRatio: 0,
			}),
		).toBeCloseTo(0.8);
	});

	it("applies dash and skill modifiers together", () => {
		expect(
			calculateMovementSpeed({
				config,
				onWasteland: true,
				dashActive: true,
				movementSpeedBoostRatio: 0.5,
				wastelandPenaltyReductionRatio: 0.5,
			}),
		).toBeCloseTo(3.15);
	});

	it("fully negates the wasteland penalty when reduction is maxed", () => {
		expect(
			calculateMovementSpeed({
				config,
				onWasteland: true,
				dashActive: false,
				movementSpeedBoostRatio: 0.25,
				wastelandPenaltyReductionRatio: 1,
			}),
		).toBeCloseTo(2.5);
	});
});

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
