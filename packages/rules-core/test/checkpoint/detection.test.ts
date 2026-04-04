import { describe, expect, it } from "vitest";

import {
	collectCheckpointOnOverlap,
	detectCheckpointsInRange,
} from "../../src/checkpoint/detection.js";
import type { CheckpointModel } from "../../src/types.js";

describe("checkpoint detection", () => {
	it("returns only uncollected checkpoints within the detection radius", () => {
		expect(
			detectCheckpointsInRange({
				playerCoord: { x: 0, y: 0 },
				checkpoints: [
					createCheckpoint("in-range", { x: 1, y: 1 }, false),
					createCheckpoint("out-of-range", { x: 2, y: 0 }, false),
					createCheckpoint("already-collected", { x: 0, y: 1 }, true),
				],
				detectionRadius: 1.5,
			}),
		).toEqual(["in-range"]);
	});

	it("collects the first uncollected checkpoint that exactly overlaps the player", () => {
		const target = createCheckpoint("cp-2", { x: 3, y: 4 }, false);

		expect(
			collectCheckpointOnOverlap({
				playerCoord: { x: 3, y: 4 },
				checkpoints: [
					createCheckpoint("cp-1", { x: 3, y: 4 }, true),
					target,
				],
			}),
		).toBe(target);
	});

	it("returns null when no checkpoint overlaps the player", () => {
		expect(
			collectCheckpointOnOverlap({
				playerCoord: { x: 5, y: 5 },
				checkpoints: [createCheckpoint("cp-1", { x: 5, y: 4 }, false)],
			}),
		).toBeNull();
	});
});

function createCheckpoint(
	cpId: string,
	coord: { x: number; y: number },
	collected: boolean,
): CheckpointModel {
	return {
		cpId,
		coord,
		collected,
	};
}
