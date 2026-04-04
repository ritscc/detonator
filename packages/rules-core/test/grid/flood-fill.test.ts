import { CellType } from "@detonator/protocol";
import { describe, expect, it } from "vitest";

import { floodRevealFromSafeCell } from "../../src/grid/flood-fill.js";
import type { RulesCell, RulesGrid } from "../../src/types.js";

describe("flood reveal", () => {
	it("reveals a single safe-mine cell and keeps the input grid unchanged", () => {
		const grid = createGrid(1, 1, [createCell(CellType.SafeMine, 0)]);

		const result = floodRevealFromSafeCell({
			grid,
			startCoord: { x: 0, y: 0 },
		});

		expect(result.revealedCoords).toEqual([{ x: 0, y: 0 }]);
		expect(result.updatedGrid.cells[0]?.cellType).toBe(CellType.Safe);
		expect(grid.cells[0]?.cellType).toBe(CellType.SafeMine);
	});

	it("reveals an entire zero-count region", () => {
		const grid = createGrid(
			3,
			3,
			Array.from({ length: 9 }, () => createCell(CellType.SafeMine, 0)),
		);

		const result = floodRevealFromSafeCell({
			grid,
			startCoord: { x: 1, y: 1 },
		});

		expect(result.revealedCoords).toHaveLength(9);
		expect(
			result.updatedGrid.cells.every((cell) => cell.cellType === CellType.Safe),
		).toBe(true);
	});

	it("does not reveal dangerous mines while expanding", () => {
		const grid = createGrid(3, 3, [
			createCell(CellType.SafeMine, 1),
			createCell(CellType.SafeMine, 1),
			createCell(CellType.SafeMine, 1),
			createCell(CellType.SafeMine, 1),
			createCell(CellType.SafeMine, 0),
			createCell(CellType.DangerousMine, 0),
			createCell(CellType.SafeMine, 1),
			createCell(CellType.SafeMine, 1),
			createCell(CellType.SafeMine, 1),
		]);

		const result = floodRevealFromSafeCell({
			grid,
			startCoord: { x: 1, y: 1 },
		});

		expect(result.revealedCoords).toHaveLength(8);
		expect(result.updatedGrid.cells[5]?.cellType).toBe(CellType.DangerousMine);
	});

	it("returns a no-op clone when the start cell is already revealed", () => {
		const grid = createGrid(2, 2, [
			createCell(CellType.Safe, 0),
			createCell(CellType.SafeMine, 0),
			createCell(CellType.SafeMine, 0),
			createCell(CellType.SafeMine, 0),
		]);

		const result = floodRevealFromSafeCell({
			grid,
			startCoord: { x: 0, y: 0 },
		});

		expect(result.revealedCoords).toEqual([]);
		expect(result.updatedGrid).not.toBe(grid);
		expect(result.updatedGrid.cells).toEqual(grid.cells);
	});
});

function createGrid(width: number, height: number, cells: RulesCell[]): RulesGrid {
	return {
		width,
		height,
		cells,
	};
}

function createCell(cellType: CellType, adjacentMineCount: number): RulesCell {
	return {
		cellType,
		adjacentMineCount,
		flagged: false,
		hasRelayPoint: false,
		erosionWarning: false,
	};
}
