import { Decoder, Encoder } from "@colyseus/schema";
import { CellType, Facing8, GamePhase, ItemType, PlayerLifeState } from "@detonator/protocol";
import { describe, expect, it } from "vitest";

import {
  CellState,
  GameState,
  createCheckpointState,
  toCellKey,
  upsertGroundItemState,
  upsertPlayerState,
} from "../src/index.js";

function roundTrip(game: GameState): GameState {
  const encoder = new Encoder(game);
  const encoded = encoder.encodeAll();
  const decoded = new GameState();
  const decoder = new Decoder(decoded);

  decoder.decode(encoded);

  return decoded;
}

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

  it("round-trips incremental state changes", () => {
    const game = new GameState();
    game.phase = GamePhase.FloorClearTransition;
    game.floorNumber = 2;

    const player = upsertPlayerState(game.players, "session-1");
    player.displayName = "Alice";
    player.level = 1;
    player.exp = 10;

    const encoder = new Encoder(game);
    const encoded1 = encoder.encodeAll();

    game.phase = GamePhase.Rest;
    game.floorNumber = 5;
    player.level = 2;
    player.exp = 25;

    const encoded2 = encoder.encode();
    const decoded = new GameState();
    const decoder = new Decoder(decoded);

    decoder.decode(encoded1);
    decoder.decode(encoded2);

    expect(decoded.phase).toBe(GamePhase.Rest);
    expect(decoded.floorNumber).toBe(5);
    expect(decoded.players.get("session-1")?.level).toBe(2);
    expect(decoded.players.get("session-1")?.exp).toBe(25);
    expect(decoded.toJSON()).toEqual(game.toJSON());
  });

  it("round-trips multiple players and ground items in MapSchemas", () => {
    const game = new GameState();

    const p1 = upsertPlayerState(game.players, "s1");
    p1.displayName = "Alice";
    p1.level = 3;
    p1.exp = 150;

    const p2 = upsertPlayerState(game.players, "s2");
    p2.displayName = "Bob";
    p2.level = 1;
    p2.exp = 50;
    p2.lifeState = PlayerLifeState.Ghost;

    const item1 = upsertGroundItemState(game.groundItems, "g1");
    item1.itemType = ItemType.Dash;
    item1.stackCount = 2;

    const item2 = upsertGroundItemState(game.groundItems, "g2");
    item2.itemType = ItemType.RelayPoint;
    item2.stackCount = 5;

    const decoded = roundTrip(game);
    const decodedP1 = decoded.players.get("s1");
    const decodedP2 = decoded.players.get("s2");
    const decodedItem1 = decoded.groundItems.get("g1");
    const decodedItem2 = decoded.groundItems.get("g2");

    expect(decoded.players.size).toBe(2);
    expect(decoded.groundItems.size).toBe(2);

    expect(decodedP1?.sessionId).toBe("s1");
    expect(decodedP1?.displayName).toBe("Alice");
    expect(decodedP1?.level).toBe(3);
    expect(decodedP1?.exp).toBe(150);

    expect(decodedP2?.sessionId).toBe("s2");
    expect(decodedP2?.displayName).toBe("Bob");
    expect(decodedP2?.level).toBe(1);
    expect(decodedP2?.exp).toBe(50);
    expect(decodedP2?.lifeState).toBe(PlayerLifeState.Ghost);

    expect(decodedItem1?.groundItemId).toBe("g1");
    expect(decodedItem1?.itemType).toBe(ItemType.Dash);
    expect(decodedItem1?.stackCount).toBe(2);

    expect(decodedItem2?.groundItemId).toBe("g2");
    expect(decodedItem2?.itemType).toBe(ItemType.RelayPoint);
    expect(decodedItem2?.stackCount).toBe(5);

    expect(decoded.toJSON()).toEqual(game.toJSON());
  });

  it("round-trips erosion state with warning cell keys", () => {
    const game = new GameState();
    game.erosion.active = true;
    game.erosion.nextWarningAt = 100;
    game.erosion.nextConversionAt = 200;
    game.erosion.warningCellKeys.push("0,1", "2,3", "4,5");

    const decoded = roundTrip(game);

    expect(decoded.erosion.active).toBe(true);
    expect(decoded.erosion.nextWarningAt).toBe(100);
    expect(decoded.erosion.nextConversionAt).toBe(200);
    expect([...decoded.erosion.warningCellKeys]).toEqual(["0,1", "2,3", "4,5"]);
  });

  it("preserves all cell type variants through round-trip", () => {
    const game = new GameState();
    game.grid.width = 5;
    game.grid.height = 1;

    const types = [
      CellType.Safe,
      CellType.SafeMine,
      CellType.DangerousMine,
      CellType.Wasteland,
      CellType.Hole,
    ];

    for (const cellType of types) {
      const cell = new CellState();
      cell.cellType = cellType;
      cell.adjacentMineCount = cellType === CellType.Safe ? 2 : 0;
      game.grid.cells.push(cell);
    }

    const decoded = roundTrip(game);

    expect(decoded.grid.width).toBe(5);
    expect(decoded.grid.height).toBe(1);
    expect(decoded.grid.cells).toHaveLength(types.length);
    expect(decoded.grid.cells.map((cell) => cell.cellType)).toEqual(types);
    expect(decoded.grid.cells[0]?.adjacentMineCount).toBe(2);
    expect(decoded.toJSON()).toEqual(game.toJSON());
  });
});
