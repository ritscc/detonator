import { CellType, type GridCoord } from "@detonator/protocol";
import { describe, expect, it } from "vitest";

import { bfs, getNeighbors4, getNeighbors8 } from "../../src/grid/neighbors.js";
import type { RulesGrid } from "../../src/types.js";

describe("grid neighbors", () => {
	const grid = createGrid(3, 3);

	it("returns orthogonal neighbors in N/E/S/W order", () => {
		expect(getNeighbors4({ x: 0, y: 0 }, grid)).toEqual([
			{ x: 1, y: 0 },
			{ x: 0, y: 1 },
		]);
		expect(getNeighbors4({ x: 1, y: 0 }, grid)).toEqual([
			{ x: 2, y: 0 },
			{ x: 1, y: 1 },
			{ x: 0, y: 0 },
		]);
		expect(getNeighbors4({ x: 1, y: 1 }, grid)).toEqual([
			{ x: 1, y: 0 },
			{ x: 2, y: 1 },
			{ x: 1, y: 2 },
			{ x: 0, y: 1 },
		]);
	});

	it("returns surrounding neighbors in N/NE/E/SE/S/SW/W/NW order", () => {
		expect(getNeighbors8({ x: 0, y: 0 }, grid)).toEqual([
			{ x: 1, y: 0 },
			{ x: 1, y: 1 },
			{ x: 0, y: 1 },
		]);
		expect(getNeighbors8({ x: 1, y: 1 }, grid)).toEqual([
			{ x: 1, y: 0 },
			{ x: 2, y: 0 },
			{ x: 2, y: 1 },
			{ x: 2, y: 2 },
			{ x: 1, y: 2 },
			{ x: 0, y: 2 },
			{ x: 0, y: 1 },
			{ x: 0, y: 0 },
		]);
	});

	it("performs bounded BFS from multiple starts without duplicates", () => {
		const visited = bfs<GridCoord>({
			start: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 0 }],
			visit: (coord) => {
				if (
					coord.x < 0 ||
					coord.y < 0 ||
					coord.x > 1 ||
					coord.y > 1
				) {
					return null;
				}

				return coord;
			},
		});

		expect(visited).toEqual([
			{ x: 0, y: 0 },
			{ x: 1, y: 1 },
			{ x: 1, y: 0 },
			{ x: 0, y: 1 },
		]);
	});

	it("uses diagonal expansion when visiting neighbors", () => {
		const visited = bfs<GridCoord>({
			start: [{ x: 0, y: 0 }],
			visit: (coord) => {
				if (
					(coord.x === 0 && coord.y === 0) ||
					(coord.x === 1 && coord.y === 1)
				) {
					return coord;
				}

				return null;
			},
		});

		expect(visited).toEqual([
			{ x: 0, y: 0 },
			{ x: 1, y: 1 },
		]);
	});
});

function createGrid(width: number, height: number): RulesGrid {
	return {
		width,
		height,
		cells: Array.from({ length: width * height }, () => ({
			cellType: CellType.Safe,
			adjacentMineCount: 0,
			flagged: false,
			hasRelayPoint: false,
			erosionWarning: false,
		})),
	};
}
