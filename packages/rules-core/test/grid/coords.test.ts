import { describe, expect, it } from "vitest";

import {
	chebyshevDistance,
	coordOf,
	euclideanDistanceSquared,
	linearIndexOf,
	manhattanDistance,
} from "../../src/grid/coords.js";

describe("grid coords", () => {
	it("round-trips coordinates through linear indexes", () => {
		const width = 7;
		const coords = [
			{ x: 0, y: 0 },
			{ x: 6, y: 0 },
			{ x: 3, y: 2 },
			{ x: 6, y: 5 },
		];

		for (const coord of coords) {
			const index = linearIndexOf(coord, width);

			expect(coordOf(index, width)).toEqual(coord);
		}
	});

	it("handles zero and boundary indexes", () => {
		expect(linearIndexOf({ x: 0, y: 0 }, 10)).toBe(0);
		expect(coordOf(0, 10)).toEqual({ x: 0, y: 0 });
		expect(coordOf(39, 10)).toEqual({ x: 9, y: 3 });
	});

	it("calculates grid distances", () => {
		const origin = { x: 0, y: 0 };
		const target = { x: 3, y: 4 };

		expect(chebyshevDistance(origin, target)).toBe(4);
		expect(manhattanDistance(origin, target)).toBe(7);
		expect(euclideanDistanceSquared(origin, target)).toBe(25);
	});
});
