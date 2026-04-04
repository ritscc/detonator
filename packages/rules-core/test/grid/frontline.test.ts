import { CellType } from "@detonator/protocol";
import { describe, expect, it } from "vitest";

import {
	extractFrontlineCoords,
	selectFrontlineTargets,
} from "../../src/grid/frontline.js";
import { SeededRng } from "../../src/random/SeededRng.js";
import type { RulesCell, RulesGrid } from "../../src/types.js";

describe("frontline extraction", () => {
	it("extracts safe cells adjacent to mine cells", () => {
		const grid = createGrid(3, 1, [
			createCell(CellType.SafeMine),
			createCell(CellType.Safe),
			createCell(CellType.DangerousMine),
		]);

		expect(extractFrontlineCoords(grid)).toEqual([{ x: 1, y: 0 }]);
	});

	it("extracts safe cells adjacent to wasteland", () => {
		const grid = createGrid(2, 2, [
			createCell(CellType.Wasteland),
			createCell(CellType.Safe),
			createCell(CellType.Safe),
			createCell(CellType.Safe),
		]);

		expect(extractFrontlineCoords(grid)).toEqual([
			{ x: 1, y: 0 },
			{ x: 0, y: 1 },
			{ x: 1, y: 1 },
		]);
	});

	it("returns no frontline when no hazards exist", () => {
		const grid = createGrid(2, 2, [
			createCell(CellType.Safe),
			createCell(CellType.Safe),
			createCell(CellType.Safe),
			createCell(CellType.Safe),
		]);

		expect(extractFrontlineCoords(grid)).toEqual([]);
	});
});

describe("frontline target selection", () => {
	it("respects width caps and advances to a newly exposed frontline", () => {
		const grid = createGrid(4, 3, [
			createCell(CellType.DangerousMine),
			createCell(CellType.DangerousMine),
			createCell(CellType.DangerousMine),
			createCell(CellType.DangerousMine),
			createCell(CellType.Safe),
			createCell(CellType.Safe),
			createCell(CellType.Safe),
			createCell(CellType.Safe),
			createCell(CellType.Safe),
			createCell(CellType.Safe),
			createCell(CellType.Safe),
			createCell(CellType.Safe),
		]);
		const frontline = extractFrontlineCoords(grid);

		const targets = selectFrontlineTargets({
			grid,
			frontline,
			targetCount: 3,
			widthCap: 2,
			rng: new FixedRng(0),
		});

		expect(targets).toEqual([
			{ x: 0, y: 1 },
			{ x: 1, y: 1 },
			{ x: 0, y: 2 },
		]);
	});

	it("returns an empty selection when no targets can be chosen", () => {
		const grid = createGrid(1, 1, [createCell(CellType.Safe)]);

		expect(
			selectFrontlineTargets({
				grid,
				frontline: [],
				targetCount: 2,
				widthCap: 1,
				rng: new FixedRng(0),
			}),
		).toEqual([]);
	});
});

class FixedRng extends SeededRng {
	readonly #value: number;

	public constructor(value: number) {
		super(0);
		this.#value = value;
	}

	public override next(): number {
		return this.#value;
	}

	public override nextFloat(): number {
		return this.#value;
	}

	public override nextInt(max: number): number {
		return Math.min(Math.floor(this.#value), max - 1);
	}
}

function createGrid(width: number, height: number, cells: RulesCell[]): RulesGrid {
	return {
		width,
		height,
		cells,
	};
}

function createCell(cellType: CellType): RulesCell {
	return {
		cellType,
		adjacentMineCount: 0,
		flagged: false,
		hasRelayPoint: false,
		erosionWarning: false,
	};
}
