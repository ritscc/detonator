import { type MapSchema } from "@colyseus/schema";

import { CheckpointState } from "../CheckpointState.js";

export function createCheckpointState(
	cpId: string,
	x: number,
	y: number,
): CheckpointState {
	const checkpoint = new CheckpointState();
	checkpoint.cpId = cpId;
	checkpoint.x = x;
	checkpoint.y = y;
	return checkpoint;
}

export function markCheckpointCollected(
	cp: CheckpointState,
	sessionId: string,
): void {
	cp.collected = true;
	cp.collectedBySessionId = sessionId;
}

export function listRemainingCheckpointIds(
	checkpoints: MapSchema<CheckpointState>,
): string[] {
	const remainingIds: string[] = [];

	for (const checkpoint of checkpoints.values()) {
		if (!checkpoint.collected) {
			remainingIds.push(checkpoint.cpId);
		}
	}

	return remainingIds;
}
