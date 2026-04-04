import { CellType, type GridCoord } from "@detonator/protocol";

import { SeededRng } from "../random/SeededRng.js";
import type { RulesGrid } from "../types.js";
import { coordOf, linearIndexOf } from "./coords.js";
import { getNeighbors8 } from "./neighbors.js";

export function extractFrontlineCoords(grid: RulesGrid): GridCoord[] {
	const frontline: GridCoord[] = [];

	for (let index = 0; index < grid.cells.length; index += 1) {
		const cell = grid.cells[index];

		if (cell?.cellType !== CellType.Safe) {
			continue;
		}

		const coord = coordOf(index, grid.width);
		const hasHazardNeighbor = getNeighbors8(coord, grid).some((neighbor) => {
			const neighborCell = grid.cells[linearIndexOf(neighbor, grid.width)];

			return neighborCell !== undefined && isFrontlineHazard(neighborCell.cellType);
		});

		if (hasHazardNeighbor) {
			frontline.push(coord);
		}
	}

	return frontline;
}

export function selectFrontlineTargets(input: {
	grid: RulesGrid;
	frontline: GridCoord[];
	targetCount: number;
	widthCap: number;
	rng: SeededRng;
}): GridCoord[] {
	if (input.targetCount <= 0 || input.widthCap <= 0) {
		return [];
	}

	const selected: GridCoord[] = [];
	const selectedKeys = new Set<string>();
	const excludedKeys = new Set<string>();
	let currentFrontline = normalizeFrontline(
		input.frontline,
		input.grid,
		selectedKeys,
		excludedKeys,
	);
	let explorationCount = 0;

	while (
		selected.length < input.targetCount &&
		currentFrontline.length > 0 &&
		explorationCount < input.targetCount
	) {
		explorationCount += 1;

		const currentFrontlineKeys = new Set(currentFrontline.map(coordKey));
		const seed = currentFrontline[input.rng.nextInt(currentFrontline.length)]!;
		const component = collectConnectedComponent(
			seed,
			currentFrontlineKeys,
			input.grid,
		);
		const selectedThisPass = selectWithinWidth(
			component,
			seed,
			input.targetCount - selected.length,
			input.widthCap,
		);

		for (const coord of selectedThisPass) {
			const key = coordKey(coord);

			if (selectedKeys.has(key)) {
				continue;
			}

			selectedKeys.add(key);
			selected.push(coord);
		}

		for (const coord of currentFrontline) {
			const key = coordKey(coord);

			if (!selectedKeys.has(key)) {
				excludedKeys.add(key);
			}
		}

		if (selected.length >= input.targetCount) {
			break;
		}

		currentFrontline = buildAdvancedFrontline(
			input.grid,
			selectedKeys,
			excludedKeys,
		);
	}

	return selected;
}

function normalizeFrontline(
	frontline: GridCoord[],
	grid: RulesGrid,
	selectedKeys: Set<string>,
	excludedKeys: Set<string>,
): GridCoord[] {
	const normalized: GridCoord[] = [];
	const seen = new Set<string>();

	for (const coord of frontline) {
		if (!isSafeCoord(grid, coord)) {
			continue;
		}

		const key = coordKey(coord);

		if (seen.has(key) || selectedKeys.has(key) || excludedKeys.has(key)) {
			continue;
		}

		seen.add(key);
		normalized.push({ ...coord });
	}

	return normalized;
}

function buildAdvancedFrontline(
	grid: RulesGrid,
	selectedKeys: Set<string>,
	excludedKeys: Set<string>,
): GridCoord[] {
	const advanced: GridCoord[] = [];

	for (let index = 0; index < grid.cells.length; index += 1) {
		const cell = grid.cells[index];

		if (cell?.cellType !== CellType.Safe) {
			continue;
		}

		const coord = coordOf(index, grid.width);
		const key = coordKey(coord);

		if (selectedKeys.has(key) || excludedKeys.has(key)) {
			continue;
		}

		const touchesFront = getNeighbors8(coord, grid).some((neighbor) => {
			const neighborKey = coordKey(neighbor);

			if (selectedKeys.has(neighborKey)) {
				return true;
			}

			const neighborCell = grid.cells[linearIndexOf(neighbor, grid.width)];

			return neighborCell !== undefined && isFrontlineHazard(neighborCell.cellType);
		});

		if (touchesFront) {
			advanced.push(coord);
		}
	}

	return advanced;
}

function collectConnectedComponent(
	start: GridCoord,
	frontlineKeys: Set<string>,
	grid: RulesGrid,
): GridCoord[] {
	const component: GridCoord[] = [];
	const queue: GridCoord[] = [start];
	const seen = new Set<string>([coordKey(start)]);

	for (let index = 0; index < queue.length; index += 1) {
		const coord = queue[index]!;
		component.push(coord);

		for (const neighbor of getNeighbors8(coord, grid)) {
			const key = coordKey(neighbor);

			if (!frontlineKeys.has(key) || seen.has(key)) {
				continue;
			}

			seen.add(key);
			queue.push(neighbor);
		}
	}

	return component;
}

function selectWithinWidth(
	component: GridCoord[],
	seed: GridCoord,
	remainingTargetCount: number,
	widthCap: number,
): GridCoord[] {
	const byColumn = new Map<number, GridCoord[]>();

	for (const coord of component) {
		const column = byColumn.get(coord.x);

		if (column === undefined) {
			byColumn.set(coord.x, [{ ...coord }]);
			continue;
		}

		column.push({ ...coord });
	}

	for (const coords of byColumn.values()) {
		coords.sort((left, right) => compareCoordsWithinColumn(left, right, seed));
	}

	const pendingColumns = new Set(byColumn.keys());
	const columnOrder: number[] = [];

	for (let offset = 0; pendingColumns.size > 0; offset += 1) {
		const leftColumn = seed.x - offset;

		if (pendingColumns.has(leftColumn)) {
			pendingColumns.delete(leftColumn);
			columnOrder.push(leftColumn);
		}

		if (offset === 0) {
			continue;
		}

		const rightColumn = seed.x + offset;

		if (pendingColumns.has(rightColumn)) {
			pendingColumns.delete(rightColumn);
			columnOrder.push(rightColumn);
		}
	}

	const selected: GridCoord[] = [];
	let minX = seed.x;
	let maxX = seed.x;

	for (const column of columnOrder) {
		const nextMinX = Math.min(minX, column);
		const nextMaxX = Math.max(maxX, column);

		if (nextMaxX - nextMinX + 1 > widthCap) {
			break;
		}

		minX = nextMinX;
		maxX = nextMaxX;

		for (const coord of byColumn.get(column) ?? []) {
			selected.push(coord);

			if (selected.length >= remainingTargetCount) {
				return selected;
			}
		}
	}

	return selected;
}

function compareCoordsWithinColumn(
	left: GridCoord,
	right: GridCoord,
	seed: GridCoord,
): number {
	const leftIsSeed = left.x === seed.x && left.y === seed.y;
	const rightIsSeed = right.x === seed.x && right.y === seed.y;

	if (leftIsSeed !== rightIsSeed) {
		return leftIsSeed ? -1 : 1;
	}

	return (
		Math.abs(left.y - seed.y) - Math.abs(right.y - seed.y) ||
		left.y - right.y ||
		left.x - right.x
	);
}

function isSafeCoord(grid: RulesGrid, coord: GridCoord): boolean {
	if (
		coord.x < 0 ||
		coord.y < 0 ||
		coord.x >= grid.width ||
		coord.y >= grid.height
	) {
		return false;
	}

	return grid.cells[linearIndexOf(coord, grid.width)]?.cellType === CellType.Safe;
}

function isFrontlineHazard(cellType: CellType): boolean {
	return (
		cellType === CellType.SafeMine ||
		cellType === CellType.DangerousMine ||
		cellType === CellType.Wasteland
	);
}

function coordKey(coord: GridCoord): string {
	return `${coord.x},${coord.y}`;
}
