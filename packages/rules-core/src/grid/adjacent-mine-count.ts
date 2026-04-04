import { CellType, type GridCoord } from "@detonator/protocol";

import { linearIndexOf } from "./coords.js";
import { getNeighbors8 } from "./neighbors.js";
import type { RulesGrid } from "../types.js";

export function recomputeAdjacentMineCount(
	grid: RulesGrid,
	coord: GridCoord,
): number {
	return getNeighbors8(coord, grid).reduce((count, neighbor) => {
		const neighborCell = grid.cells[linearIndexOf(neighbor, grid.width)];

		if (
			neighborCell?.cellType === CellType.SafeMine ||
			neighborCell?.cellType === CellType.DangerousMine
		) {
			return count + 1;
		}

		return count;
	}, 0);
}

export function recomputeAdjacentMineCounts(
	grid: RulesGrid,
	coords: GridCoord[],
): GridCoord[] {
	const uniqueCoords: GridCoord[] = [];
	const seen = new Set<string>();

	for (const coord of coords) {
		if (
			coord.x < 0 ||
			coord.y < 0 ||
			coord.x >= grid.width ||
			coord.y >= grid.height
		) {
			continue;
		}

		const key = `${coord.x},${coord.y}`;

		if (seen.has(key)) {
			continue;
		}

		seen.add(key);
		uniqueCoords.push(coord);
	}

	return uniqueCoords.filter((coord) => {
		const cell = grid.cells[linearIndexOf(coord, grid.width)];

		return (
			cell !== undefined &&
			cell.cellType === CellType.Safe &&
			cell.adjacentMineCount !== recomputeAdjacentMineCount(grid, coord)
		);
	});
}
