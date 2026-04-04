import type { GridCoord, Vec2 } from "@detonator/protocol";

import { euclideanDistanceSquared } from "../grid/coords.js";
import type { CheckpointModel } from "../types.js";

export function detectCheckpointsInRange(input: {
	playerCoord: Vec2;
	checkpoints: CheckpointModel[];
	detectionRadius: number;
}): string[] {
	const maxDistanceSquared = input.detectionRadius * input.detectionRadius;

	return input.checkpoints.flatMap((checkpoint) => {
		if (checkpoint.collected) {
			return [];
		}

		return euclideanDistanceSquared(
			toGridCoord(input.playerCoord),
			checkpoint.coord,
		) <= maxDistanceSquared
			? [checkpoint.cpId]
			: [];
	});
}

export function collectCheckpointOnOverlap(input: {
	playerCoord: Vec2;
	checkpoints: CheckpointModel[];
}): CheckpointModel | null {
	for (const checkpoint of input.checkpoints) {
		if (
			!checkpoint.collected &&
			checkpoint.coord.x === input.playerCoord.x &&
			checkpoint.coord.y === input.playerCoord.y
		) {
			return checkpoint;
		}
	}

	return null;
}

function toGridCoord(coord: Vec2): GridCoord {
	return {
		x: coord.x,
		y: coord.y,
	};
}
