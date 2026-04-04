import { type MapSchema } from "@colyseus/schema";
import { CellType } from "@detonator/protocol";

import type { GridState } from "../GridState.js";
import { PlayerState } from "../PlayerState.js";

export function clearAllFlagsAndRelayPoints(grid: GridState): void {
	for (const cell of grid.cells) {
		cell.flagged = false;
		cell.hasRelayPoint = false;
	}
}

export function clearAllErosionWarnings(grid: GridState): void {
	for (const cell of grid.cells) {
		cell.erosionWarning = false;
	}
}

export function convertAllMineCellsToSafe(grid: GridState): void {
	for (const cell of grid.cells) {
		if (
			cell.cellType === CellType.SafeMine ||
			cell.cellType === CellType.DangerousMine
		) {
			cell.cellType = CellType.Safe;
		}
	}
}

export function resetPlayersForNewFloor(
	players: MapSchema<PlayerState>,
): void {
	const defaults = new PlayerState();

	for (const player of players.values()) {
		player.x = defaults.x;
		player.y = defaults.y;
		player.facing = defaults.facing;
		player.lifeState = defaults.lifeState;
		player.respawnAt = defaults.respawnAt;
		player.exp = defaults.exp;
	}
}
