import { Decoder, Encoder, Metadata } from "@colyseus/schema";
import { CellType, Facing8, GamePhase, ItemType, PlayerLifeState } from "@detonator/protocol";
import { describe, expect, it } from "vitest";

import {
  CellState,
  CheckpointState,
  ErosionState,
  FloorState,
  GameState,
  GridState,
  GroundItemState,
  PlayerState,
} from "../src/index.js";

const getFieldCount = (schemaClass: object): number => {
  return Object.keys(Metadata.getFields(schemaClass)).length;
};

describe("shared schema definitions", () => {
  it("keeps the expected @type() field counts", () => {
    expect(getFieldCount(CellState)).toBe(5);
    expect(getFieldCount(GridState)).toBe(3);
    expect(getFieldCount(FloorState)).toBe(4);
    expect(getFieldCount(ErosionState)).toBe(4);
    expect(getFieldCount(CheckpointState)).toBe(5);
    expect(getFieldCount(GroundItemState)).toBe(6);
    expect(getFieldCount(PlayerState)).toBe(10);
    expect(getFieldCount(GameState)).toBe(9);
  });

  it("stores grid cells as a flat ArraySchema", () => {
    const grid = new GridState();
    grid.width = 2;
    grid.height = 2;

    const topLeft = new CellState();
    topLeft.cellType = CellType.Safe;

    const topRight = new CellState();
    topRight.cellType = CellType.SafeMine;

    const bottomLeft = new CellState();
    bottomLeft.cellType = CellType.DangerousMine;

    const bottomRight = new CellState();
    bottomRight.cellType = CellType.Hole;

    grid.cells.push(topLeft, topRight, bottomLeft, bottomRight);

    expect(grid.cells).toHaveLength(4);
    expect(grid.cells[2]?.cellType).toBe(CellType.DangerousMine);
    expect(grid.cells[3]?.cellType).toBe(CellType.Hole);
  });

  it("stores players in a MapSchema keyed by sessionId", () => {
    const game = new GameState();
    const player = new PlayerState();
    player.sessionId = "session-1";
    player.displayName = "Alice";

    game.players.set(player.sessionId, player);

    expect(game.players.has("session-1")).toBe(true);
    expect(game.players.get("session-1")?.displayName).toBe("Alice");
  });

  it("round-trips game state serialization", () => {
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
    game.erosion.warningCellKeys.push("0,1", "1,1");

    const player = new PlayerState();
    player.sessionId = "session-1";
    player.displayName = "Alice";
    player.x = 1.5;
    player.y = 2.5;
    player.facing = Facing8.NE;
    player.lifeState = PlayerLifeState.Ghost;
    player.respawnAt = 1_710_000_002_000;
    player.level = 7;
    player.exp = 999;
    player.pendingRewardCount = 2;
    game.players.set(player.sessionId, player);

    const groundItem = new GroundItemState();
    groundItem.groundItemId = "item-1";
    groundItem.itemType = ItemType.Dash;
    groundItem.x = 4;
    groundItem.y = 5;
    groundItem.stackCount = 3;
    groundItem.expiresAt = 1_710_000_003_000;
    game.groundItems.set(groundItem.groundItemId, groundItem);

    const checkpoint = new CheckpointState();
    checkpoint.cpId = "cp-1";
    checkpoint.x = 9;
    checkpoint.y = 8;
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
