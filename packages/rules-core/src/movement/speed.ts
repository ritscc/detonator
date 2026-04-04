import type { GameParamsConfig } from "@detonator/config";

export function calculateMovementSpeed(input: {
	config: GameParamsConfig;
	onWasteland: boolean;
	dashActive: boolean;
	movementSpeedBoostRatio: number;
	wastelandPenaltyReductionRatio: number;
}): number {
	let speed =
		input.config.movement.baseCellsPerSec *
		(1 + input.movementSpeedBoostRatio);

	if (input.onWasteland) {
		speed *=
			input.config.movement.wastelandSpeedMultiplier +
			(1 - input.config.movement.wastelandSpeedMultiplier) *
				input.wastelandPenaltyReductionRatio;
	}

	if (input.dashActive) {
		speed *= input.config.movement.dashSpeedMultiplier;
	}

	return speed;
}
