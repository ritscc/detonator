import type { GameParamsConfig } from "@detonator/config";
import { CellType, ErrorCode, Facing8, PlayerLifeState } from "@detonator/protocol";
import { describe, expect, it } from "vitest";

import { resolveDig } from "../../src/dig/resolve-dig.js";
import { floodRevealFromSafeCell } from "../../src/grid/flood-fill.js";
import { calculateDigExp } from "../../src/progression/exp.js";
import type { RulesCell, RulesGrid, RulesPlayer } from "../../src/types.js";

describe("resolveDig", () => {
  it("allows alive players to dig a nearby safe mine", () => {
    const result = resolveDig({
      grid: createGrid(2, 2, [
        createCell(CellType.SafeMine, 0),
        createCell(CellType.Safe, 1),
        createCell(CellType.Safe, 1),
        createCell(CellType.Safe, 1),
      ]),
      actor: createPlayer({ x: 0, y: 0 }),
      target: { x: 0, y: 0 },
      config: createConfig(),
    });

    expect(result).toEqual({
      kind: "safe_dig",
      updatedGrid: createGrid(2, 2, [
        createCell(CellType.Safe, 0),
        createCell(CellType.Safe, 0),
        createCell(CellType.Safe, 0),
        createCell(CellType.Safe, 0),
      ]),
      revealedCoords: [{ x: 0, y: 0 }],
      adjacentUpdatedCoords: [
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ],
    });
  });

  it("rejects out-of-bounds targets", () => {
    const result = resolveDig({
      grid: createGrid(2, 2, [
        createCell(CellType.SafeMine, 0),
        createCell(CellType.SafeMine, 0),
        createCell(CellType.SafeMine, 0),
        createCell(CellType.SafeMine, 0),
      ]),
      actor: createPlayer({ x: 0, y: 0 }),
      target: { x: -1, y: 0 },
      config: createConfig(),
    });

    expect(result).toEqual({
      kind: "invalid",
      errorCode: ErrorCode.DigOutOfRange,
    });
  });

  it("rejects targets farther than one cell away", () => {
    const result = resolveDig({
      grid: createGrid(
        3,
        3,
        Array.from({ length: 9 }, () => createCell(CellType.SafeMine, 0)),
      ),
      actor: createPlayer({ x: 0, y: 0 }),
      target: { x: 2, y: 0 },
      config: createConfig(),
    });

    expect(result).toEqual({
      kind: "invalid",
      errorCode: ErrorCode.DigOutOfRange,
    });
  });

  it("rejects non-mine targets", () => {
    const result = resolveDig({
      grid: createGrid(2, 2, [
        createCell(CellType.Safe, 0),
        createCell(CellType.SafeMine, 0),
        createCell(CellType.SafeMine, 0),
        createCell(CellType.SafeMine, 0),
      ]),
      actor: createPlayer({ x: 0, y: 0 }),
      target: { x: 0, y: 0 },
      config: createConfig(),
    });

    expect(result).toEqual({
      kind: "invalid",
      errorCode: ErrorCode.DigInvalidTarget,
    });
  });

  it("rejects ghost players", () => {
    const result = resolveDig({
      grid: createGrid(2, 2, [
        createCell(CellType.SafeMine, 0),
        createCell(CellType.SafeMine, 0),
        createCell(CellType.SafeMine, 0),
        createCell(CellType.SafeMine, 0),
      ]),
      actor: createPlayer({ x: 0, y: 0 }, { lifeState: PlayerLifeState.Ghost }),
      target: { x: 0, y: 0 },
      config: createConfig(),
    });

    expect(result).toEqual({
      kind: "invalid",
      errorCode: ErrorCode.DigNotAlive,
    });
  });

  it("rejects disconnected players", () => {
    const result = resolveDig({
      grid: createGrid(2, 2, [
        createCell(CellType.SafeMine, 0),
        createCell(CellType.SafeMine, 0),
        createCell(CellType.SafeMine, 0),
        createCell(CellType.SafeMine, 0),
      ]),
      actor: createPlayer({ x: 0, y: 0 }, { lifeState: PlayerLifeState.Disconnected }),
      target: { x: 0, y: 0 },
      config: createConfig(),
    });

    expect(result).toEqual({
      kind: "invalid",
      errorCode: ErrorCode.DigNotAlive,
    });
  });

  it("lets alive players proceed to normal dig validation", () => {
    const result = resolveDig({
      grid: createGrid(2, 2, [
        createCell(CellType.Safe, 0),
        createCell(CellType.SafeMine, 0),
        createCell(CellType.SafeMine, 0),
        createCell(CellType.SafeMine, 0),
      ]),
      actor: createPlayer({ x: 0, y: 0 }, { lifeState: PlayerLifeState.Alive }),
      target: { x: 0, y: 0 },
      config: createConfig(),
    });

    expect(result).toEqual({
      kind: "invalid",
      errorCode: ErrorCode.DigInvalidTarget,
    });
  });

  it("reveals connected safe-mine cells and refreshes neighboring safe counts", () => {
    const grid = createGrid(3, 3, [
      createCell(CellType.SafeMine, 0),
      createCell(CellType.SafeMine, 0),
      createCell(CellType.Safe, 1),
      createCell(CellType.SafeMine, 0),
      createCell(CellType.SafeMine, 0),
      createCell(CellType.Safe, 1),
      createCell(CellType.SafeMine, 0),
      createCell(CellType.SafeMine, 0),
      createCell(CellType.Safe, 1),
    ]);

    const result = resolveDig({
      grid,
      actor: createPlayer({ x: 0, y: 0 }),
      target: { x: 0, y: 0 },
      config: createConfig(),
    });

    expect(result.kind).toBe("safe_dig");

    if (result.kind !== "safe_dig") {
      return;
    }

    expect(result.revealedCoords).toHaveLength(6);
    expect(result.adjacentUpdatedCoords).toEqual([
      { x: 2, y: 0 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
    ]);
    expect(
      result.updatedGrid.cells.slice(0, 6).every((cell) => cell.cellType === CellType.Safe),
    ).toBe(true);
    expect(result.updatedGrid.cells[2]?.adjacentMineCount).toBe(0);
    expect(result.updatedGrid.cells[5]?.adjacentMineCount).toBe(0);
    expect(result.updatedGrid.cells[8]?.adjacentMineCount).toBe(0);
    expect(grid.cells[0]?.cellType).toBe(CellType.SafeMine);
    expect(grid.cells[2]?.adjacentMineCount).toBe(1);
  });

  it("composes dig, flood-fill, and dig exp from the same revealed region", () => {
    const grid = createGrid(3, 2, [
      createCell(CellType.SafeMine, 0),
      createCell(CellType.SafeMine, 1),
      createCell(CellType.DangerousMine, 0),
      createCell(CellType.SafeMine, 0),
      createCell(CellType.SafeMine, 2),
      createCell(CellType.DangerousMine, 0),
    ]);
    const floodResult = floodRevealFromSafeCell({
      grid,
      startCoord: { x: 0, y: 0 },
    });

    const digResult = resolveDig({
      grid,
      actor: createPlayer({ x: 0, y: 0 }),
      target: { x: 0, y: 0 },
      config: createConfig(),
    });

    expect(digResult.kind).toBe("safe_dig");

    if (digResult.kind !== "safe_dig") {
      return;
    }

    expect(digResult.revealedCoords).toEqual(floodResult.revealedCoords);
    expect(digResult.updatedGrid).toEqual(floodResult.updatedGrid);
    expect(digResult.adjacentUpdatedCoords).toEqual([]);
    expect(
      calculateDigExp({
        revealedCellCount: digResult.revealedCoords.length,
        expGainBoostRatio: 0.25,
        config: {
          progression: {
            baseExpPerCell: 3,
          },
        },
      }),
    ).toBe(15);
  });

  it("recomputes boundary safe counts after flood-revealed mines become safe", () => {
    const grid = createGrid(4, 3, [
      createCell(CellType.SafeMine, 0),
      createCell(CellType.SafeMine, 0),
      createCell(CellType.Safe, 3),
      createCell(CellType.Safe, 1),
      createCell(CellType.SafeMine, 0),
      createCell(CellType.SafeMine, 0),
      createCell(CellType.Safe, 4),
      createCell(CellType.DangerousMine, 0),
      createCell(CellType.SafeMine, 0),
      createCell(CellType.SafeMine, 0),
      createCell(CellType.Safe, 3),
      createCell(CellType.Safe, 1),
    ]);
    const floodResult = floodRevealFromSafeCell({
      grid,
      startCoord: { x: 0, y: 0 },
    });

    const digResult = resolveDig({
      grid,
      actor: createPlayer({ x: 0, y: 0 }),
      target: { x: 0, y: 0 },
      config: createConfig(),
    });

    expect(digResult.kind).toBe("safe_dig");

    if (digResult.kind !== "safe_dig") {
      return;
    }

    expect(digResult.revealedCoords).toEqual(floodResult.revealedCoords);
    expect(digResult.adjacentUpdatedCoords).toEqual([
      { x: 2, y: 0 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
    ]);
    expect(digResult.updatedGrid.cells[2]?.adjacentMineCount).toBe(1);
    expect(digResult.updatedGrid.cells[6]?.adjacentMineCount).toBe(1);
    expect(digResult.updatedGrid.cells[10]?.adjacentMineCount).toBe(1);
    expect(floodResult.updatedGrid.cells[2]?.adjacentMineCount).toBe(3);
    expect(floodResult.updatedGrid.cells[6]?.adjacentMineCount).toBe(4);
    expect(floodResult.updatedGrid.cells[10]?.adjacentMineCount).toBe(3);
    expect(digResult.updatedGrid.cells[7]?.cellType).toBe(CellType.DangerousMine);
    expect(grid.cells[2]?.adjacentMineCount).toBe(3);
    expect(grid.cells[6]?.adjacentMineCount).toBe(4);
    expect(grid.cells[10]?.adjacentMineCount).toBe(3);
  });

  it("returns a dangerous trigger for dangerous mines", () => {
    const result = resolveDig({
      grid: createGrid(2, 2, [
        createCell(CellType.SafeMine, 0),
        createCell(CellType.DangerousMine, 0),
        createCell(CellType.SafeMine, 0),
        createCell(CellType.SafeMine, 0),
      ]),
      actor: createPlayer({ x: 0, y: 0 }),
      target: { x: 1, y: 0 },
      config: createConfig(),
    });

    expect(result).toEqual({
      kind: "dangerous_trigger",
      epicenterCoord: { x: 1, y: 0 },
    });
  });
});

function createPlayer(
  position: { x: number; y: number },
  overrides: Partial<RulesPlayer> = {},
): RulesPlayer {
  return {
    sessionId: "player-1",
    position,
    facing: Facing8.SE,
    lifeState: PlayerLifeState.Alive,
    respawnAt: 0,
    level: 1,
    exp: 0,
    pendingRewardCount: 0,
    ...overrides,
  };
}

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

function createConfig(): GameParamsConfig {
  return {
    board: {
      sizeFormula: "",
      minWidth: 20,
      minHeight: 20,
      maxWidth: 40,
      maxHeight: 40,
      initialSafeZoneWidth: 5,
      initialSafeZoneHeight: 5,
    },
    mines: {
      safeMineRatio: 3,
      dangerousMineRatio: 1,
      mineDensity: 0.2,
      erosionSafeMineRatio: 7,
      erosionDangerousMineRatio: 3,
    },
    erosion: {
      baseIntervalSec: 10,
      basePowerCells: 3,
      warningFixedDurationSec: 3,
      warningIntervalThresholdSec: 4,
      warningShortIntervalMultiplier: 0.75,
      intervalFormula: "",
      powerFormula: "",
      takeABreathPauseMs: 5000,
      shortBreakPauseMs: 15000,
    },
    progression: {
      levelExpBase: 100,
      levelExpGrowth: 1.5,
      comboMultiplierBase: 1,
      comboMultiplierPerChain: 0.1,
    },
    respawn: {
      baseRespawnSec: 40,
      shortenDropWeightRatioWhenDeadExists: 0.9,
      respawnTimeFormula: "",
    },
    detonate: {
      baseCooldownSec: 10,
      fuseMs: 3000,
      chainIntervalMs: 125,
      cooldownFormula: "",
    },
    drop: {
      baseDropRate: 0.1,
      itemLifetimeMs: 15000,
      dropRateFormula: "",
    },
    checkpoint: {
      detectionRadiusCells: 3,
      countFormula: "",
    },
    scoring: {
      timeBonusBaseSeconds: 600,
      minimumTimeBonusMultiplier: 1,
      roundingMode: "round",
      formula: "",
    },
    movement: {
      baseCellsPerSec: 2,
      wastelandSpeedMultiplier: 0.4,
      dashSpeedMultiplier: 1.5,
      dashDurationMs: 15000,
    },
    room: {
      reconnectGraceSec: 60,
      patchRateHz: 30,
      maxPlayers: 10,
      seatReservationTimeoutSec: 15,
    },
    inventory: {
      baseSlots: 3,
      maxSlots: 10,
    },
    itemEffects: {
      catsEyeDurationMs: 10000,
      disposableLifeDurationMs: 10000,
      mineRemoverRefs: {
        cheap: "mine_remover_cheap",
        normal: "mine_remover_normal",
        high: "mine_remover_high",
      },
      purifyForwardRangeCells: 1,
      bridgeTargetCellType: CellType.Hole,
      relayPointPlacementCellType: CellType.Safe,
    },
  };
}
