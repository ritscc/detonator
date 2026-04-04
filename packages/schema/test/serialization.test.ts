import { Decoder, Encoder } from "@colyseus/schema";
import {
	CellType,
	Facing8,
	GamePhase,
	ItemType,
	PlayerLifeState,
} from "@detonator/protocol";
import { describe, expect, it } from "vitest";

import {
	CellState,
	GameState,
	createCheckpointState,
	toCellKey,
	upsertGroundItemState,
	upsertPlayerState,
} from "../src/index.js";

describe("schema serialization", () => {
	it("round-trips full game state data", () => {
		const game = new GameState();
		game.phase = GamePhase.FloorClearTransition;
		game.floorNumber = 3;
		game.totalScore = 4200;

		game.floor.stageId = "stage-03";
		game.floor.floorStartedAt = 1_710_000_000_000;
		game.floor.cpTotal = 4;
		game.floor.cpCollected = 2;

		game.grid.width = 2;
		game.grid.height = 2;

		const cellA = new CellState();
		cellA.cellType = CellType.Safe;
		cellA.adjacentMineCount = 1;
		cellA.flagged = true;

		const cellB = new CellState();
		cellB.cellType = CellType.SafeMine;
		cellB.adjacentMineCount = 2;

		const cellC = new CellState();
		cellC.cellType = CellType.Wasteland;
		cellC.hasRelayPoint = true;

		const cellD = new CellState();
		cellD.cellType = CellType.Hole;
		cellD.erosionWarning = true;

		game.grid.cells.push(cellA, cellB, cellC, cellD);

		game.erosion.active = false;
		game.erosion.nextWarningAt = 1_710_000_000_500;
		game.erosion.nextConversionAt = 1_710_000_001_000;
		game.erosion.warningCellKeys.push(toCellKey(0, 1), toCellKey(1, 1));

		const player = upsertPlayerState(game.players, "session-1");
		player.displayName = "Alice";
		player.x = 1.5;
		player.y = 2.5;
		player.facing = Facing8.NE;
		player.lifeState = PlayerLifeState.Ghost;
		player.respawnAt = 1_710_000_002_000;
		player.level = 7;
		player.exp = 999;
		player.pendingRewardCount = 2;

		const groundItem = upsertGroundItemState(game.groundItems, "item-1");
		groundItem.itemType = ItemType.Dash;
		groundItem.x = 4;
		groundItem.y = 5;
		groundItem.stackCount = 3;
		groundItem.expiresAt = 1_710_000_003_000;

		const checkpoint = createCheckpointState("cp-1", 9, 8);
		checkpoint.collected = true;
		checkpoint.collectedBySessionId = player.sessionId;
		game.checkpoints.set(checkpoint.cpId, checkpoint);

		const encoder = new Encoder(game);
		const encoded = encoder.encodeAll();
		const decoded = new GameState();
		const decoder = new Decoder(decoded);

		decoder.decode(encoded);

		expect(decoded.toJSON()).toEqual(game.toJSON());
	});
});
