import { ArraySchema, MapSchema } from "@colyseus/schema";
import { CellType, Facing8, PlayerLifeState } from "@detonator/protocol";
import { describe, expect, it } from "vitest";

import { CellState } from "../src/CellState.js";
import { GridState } from "../src/GridState.js";
import { GroundItemState } from "../src/GroundItemState.js";
import { PlayerState } from "../src/PlayerState.js";
import {
	clearCellTransientMarks,
	createCheckpointState,
	fromCellKey,
	getCell,
	indexToCoord,
	isInBounds,
	listRemainingCheckpointIds,
	markCheckpointCollected,
	requireCell,
	resetPlayersForNewFloor,
	resetStringArray,
	setCellFlags,
	toCellKey,
	upsertGroundItemState,
	upsertPlayerState,
	clearAllErosionWarnings,
	clearAllFlagsAndRelayPoints,
	convertAllMineCellsToSafe,
	coordToIndex,
} from "../src/index.js";

function createGrid(cellTypes: CellType[]): GridState {
	const grid = new GridState();
	grid.width = cellTypes.length;
	grid.height = 1;

	for (const cellType of cellTypes) {
		const cell = new CellState();
		cell.cellType = cellType;
		grid.cells.push(cell);
	}

	return grid;
}

describe("schema utility helpers", () => {
	it("round-trips coordinates and cell keys", () => {
		const coord = { x: 2, y: 3 };
		const index = coordToIndex(coord.x, coord.y, 10);

		expect(index).toBe(32);
		expect(indexToCoord(index, 10)).toEqual(coord);
		expect(fromCellKey(toCellKey(coord.x, coord.y))).toEqual(coord);
	});

	it("checks bounds inclusively/exclusively at edges", () => {
		expect(isInBounds(0, 0, 3, 2)).toBe(true);
		expect(isInBounds(2, 1, 3, 2)).toBe(true);
		expect(isInBounds(-1, 0, 3, 2)).toBe(false);
		expect(isInBounds(0, -1, 3, 2)).toBe(false);
		expect(isInBounds(3, 1, 3, 2)).toBe(false);
		expect(isInBounds(2, 2, 3, 2)).toBe(false);
	});

	it("reads and mutates flat grid cells", () => {
		const grid = createGrid([CellType.Safe, CellType.SafeMine]);
		const cell = requireCell(grid, 1);

		expect(getCell(grid, 0)?.cellType).toBe(CellType.Safe);
		expect(getCell(grid, 99)).toBeUndefined();

		setCellFlags(cell, { flagged: true, hasRelayPoint: true });
		cell.erosionWarning = true;

		expect(cell.flagged).toBe(true);
		expect(cell.hasRelayPoint).toBe(true);

		clearCellTransientMarks(cell);

		expect(cell.flagged).toBe(false);
		expect(cell.hasRelayPoint).toBe(false);
		expect(cell.erosionWarning).toBe(false);
		expect(() => requireCell(grid, 5)).toThrow("Cell not found at index 5");
	});

	it("creates and tracks checkpoints", () => {
		const checkpoints = new MapSchema();
		const first = createCheckpointState("cp-1", 1, 2);
		const second = createCheckpointState("cp-2", 3, 4);

		checkpoints.set(first.cpId, first);
		checkpoints.set(second.cpId, second);

		expect(listRemainingCheckpointIds(checkpoints)).toEqual(["cp-1", "cp-2"]);

		markCheckpointCollected(first, "session-1");

		expect(first.collected).toBe(true);
		expect(first.collectedBySessionId).toBe("session-1");
		expect(listRemainingCheckpointIds(checkpoints)).toEqual(["cp-2"]);
	});

	it("upserts player and ground item state in map schemas", () => {
		const players = new MapSchema<PlayerState>();
		const items = new MapSchema<GroundItemState>();

		const player = upsertPlayerState(players, "session-1");
		const samePlayer = upsertPlayerState(players, "session-1");
		const item = upsertGroundItemState(items, "item-1");
		const sameItem = upsertGroundItemState(items, "item-1");

		expect(player).toBe(samePlayer);
		expect(player.sessionId).toBe("session-1");
		expect(item).toBe(sameItem);
		expect(item.groundItemId).toBe("item-1");
	});

	it("clears array schema contents", () => {
		const arr = new ArraySchema<string>("a", "b", "c");

		resetStringArray(arr);

		expect([...arr]).toEqual([]);
	});

	it("applies reset helpers to grid and players", () => {
		const grid = createGrid([
			CellType.Safe,
			CellType.SafeMine,
			CellType.DangerousMine,
			CellType.Wasteland,
		]);

		grid.cells[0]!.flagged = true;
		grid.cells[0]!.hasRelayPoint = true;
		grid.cells[1]!.flagged = true;
		grid.cells[2]!.hasRelayPoint = true;
		grid.cells[1]!.erosionWarning = true;
		grid.cells[3]!.erosionWarning = true;

		clearAllFlagsAndRelayPoints(grid);
		clearAllErosionWarnings(grid);
		convertAllMineCellsToSafe(grid);

		expect(grid.cells.map((cell) => cell.flagged)).toEqual([
			false,
			false,
			false,
			false,
		]);
		expect(grid.cells.map((cell) => cell.hasRelayPoint)).toEqual([
			false,
			false,
			false,
			false,
		]);
		expect(grid.cells.map((cell) => cell.erosionWarning)).toEqual([
			false,
			false,
			false,
			false,
		]);
		expect(grid.cells.map((cell) => cell.cellType)).toEqual([
			CellType.Safe,
			CellType.Safe,
			CellType.Safe,
			CellType.Wasteland,
		]);

		const players = new MapSchema<PlayerState>();
		const player = new PlayerState();
		player.sessionId = "session-1";
		player.displayName = "Alice";
		player.x = 10;
		player.y = 20;
		player.facing = Facing8.NW;
		player.lifeState = PlayerLifeState.Ghost;
		player.respawnAt = 1234;
		player.level = 8;
		player.exp = 900;
		player.pendingRewardCount = 3;
		players.set(player.sessionId, player);

		resetPlayersForNewFloor(players);

		expect(player.x).toBe(0);
		expect(player.y).toBe(0);
		expect(player.facing).toBe(Facing8.S);
		expect(player.lifeState).toBe(PlayerLifeState.Alive);
		expect(player.respawnAt).toBe(0);
		expect(player.exp).toBe(0);
		expect(player.level).toBe(8);
		expect(player.pendingRewardCount).toBe(3);
		expect(player.displayName).toBe("Alice");
	});
});
