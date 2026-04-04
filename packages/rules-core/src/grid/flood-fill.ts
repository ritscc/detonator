import { CellType, type GridCoord } from "@detonator/protocol";

import type { RulesGrid } from "../types.js";
import { linearIndexOf } from "./coords.js";
import { getNeighbors8 } from "./neighbors.js";

export function floodRevealFromSafeCell(input: {
	grid: RulesGrid;
	startCoord: GridCoord;
}): {
	revealedCoords: GridCoord[];
	updatedGrid: RulesGrid;
} {
	const updatedGrid = cloneGrid(input.grid);
	const revealedCoords: GridCoord[] = [];
	const queue: GridCoord[] = [];

	if (!revealSafeMine(input.startCoord, updatedGrid, revealedCoords, queue)) {
		return { revealedCoords, updatedGrid };
	}

	for (let index = 0; index < queue.length; index += 1) {
		const coord = queue[index]!;
		const cell = updatedGrid.cells[linearIndexOf(coord, updatedGrid.width)];

		if (cell?.adjacentMineCount !== 0) {
			continue;
		}

		for (const neighbor of getNeighbors8(coord, updatedGrid)) {
			revealSafeMine(neighbor, updatedGrid, revealedCoords, queue);
		}
	}

	return { revealedCoords, updatedGrid };
}

function revealSafeMine(
	coord: GridCoord,
	grid: RulesGrid,
	revealedCoords: GridCoord[],
	queue: GridCoord[],
): boolean {
	if (
		coord.x < 0 ||
		coord.y < 0 ||
		coord.x >= grid.width ||
		coord.y >= grid.height
	) {
		return false;
	}

	const index = linearIndexOf(coord, grid.width);
	const cell = grid.cells[index];

	if (cell === undefined || cell.cellType !== CellType.SafeMine) {
		return false;
	}

	grid.cells[index] = {
		...cell,
		cellType: CellType.Safe,
	};
	revealedCoords.push({ ...coord });
	queue.push({ ...coord });

	return true;
}

function cloneGrid(grid: RulesGrid): RulesGrid {
	return {
		width: grid.width,
		height: grid.height,
		cells: grid.cells.map((cell) => ({ ...cell })),
	};
}
