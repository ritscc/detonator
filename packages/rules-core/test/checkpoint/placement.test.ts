import { describe, expect, it } from "vitest";

import { selectCheckpointCoords } from "../../src/checkpoint/placement.js";
import { SeededRng } from "../../src/random/SeededRng.js";

describe("selectCheckpointCoords", () => {
	it("excludes holes and initial safe-zone cells from checkpoint placement", () => {
		const result = selectCheckpointCoords({
			candidateCoords: [
				{ x: 0, y: 0 },
				{ x: 1, y: 0 },
				{ x: 2, y: 0 },
				{ x: 3, y: 0 },
			],
			holeCoords: [{ x: 1, y: 0 }],
			initialSafeZoneCoords: [{ x: 2, y: 0 }],
			cpCount: 3,
			rng: new SeededRng(1),
		});

		expect(result).toHaveLength(2);
		expect(result).toEqual(
			expect.arrayContaining([
				{ x: 0, y: 0 },
				{ x: 3, y: 0 },
			]),
		);
		expect(result).not.toEqual(
			expect.arrayContaining([
				{ x: 1, y: 0 },
				{ x: 2, y: 0 },
			]),
		);
	});

	it("returns every remaining candidate when fewer coords exist than requested", () => {
		const result = selectCheckpointCoords({
			candidateCoords: [
				{ x: 4, y: 4 },
				{ x: 5, y: 5 },
			],
			holeCoords: [],
			initialSafeZoneCoords: [],
			cpCount: 5,
			rng: new SeededRng(2),
		});

		expect(result).toHaveLength(2);
		expect(result).toEqual(
			expect.arrayContaining([
				{ x: 4, y: 4 },
				{ x: 5, y: 5 },
			]),
		);
	});
});
