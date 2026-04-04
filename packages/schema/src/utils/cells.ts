import type { CellState } from "../CellState.js";
import type { GridState } from "../GridState.js";

export function getCell(grid: GridState, index: number): CellState | undefined {
	return grid.cells[index];
}

export function requireCell(grid: GridState, index: number): CellState {
	const cell = getCell(grid, index);

	if (cell === undefined) {
		throw new Error(`Cell not found at index ${index}`);
	}

	return cell;
}

export function setCellFlags(
	cell: CellState,
	flags: { flagged?: boolean; hasRelayPoint?: boolean },
): void {
	if (flags.flagged !== undefined) {
		cell.flagged = flags.flagged;
	}

	if (flags.hasRelayPoint !== undefined) {
		cell.hasRelayPoint = flags.hasRelayPoint;
	}
}

export function clearCellTransientMarks(cell: CellState): void {
	cell.flagged = false;
	cell.hasRelayPoint = false;
	cell.erosionWarning = false;
}
