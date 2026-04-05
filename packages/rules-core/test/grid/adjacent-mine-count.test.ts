import { CellType } from "@detonator/protocol";
import { describe, expect, it } from "vitest";

import {
  recomputeAdjacentMineCount,
  recomputeAdjacentMineCounts,
} from "../../src/grid/adjacent-mine-count.js";
import type { RulesCell, RulesGrid } from "../../src/types.js";

describe("adjacent mine counts", () => {
  it("counts dangerous and safe mines in the 8-neighborhood", () => {
    const grid = createGridFromTypes(3, 3, [
      CellType.Safe,
      CellType.SafeMine,
      CellType.Safe,
      CellType.Safe,
      CellType.Safe,
      CellType.Safe,
      CellType.Safe,
      CellType.DangerousMine,
      CellType.Safe,
    ]);

    expect(recomputeAdjacentMineCount(grid, { x: 1, y: 1 })).toBe(2);
    expect(recomputeAdjacentMineCount(grid, { x: 0, y: 0 })).toBe(1);
    expect(recomputeAdjacentMineCount(grid, { x: 2, y: 0 })).toBe(1);
  });

  it("returns zero when no neighboring mines exist", () => {
    const grid = createGridFromTypes(2, 2, [
      CellType.Safe,
      CellType.Safe,
      CellType.Safe,
      CellType.Safe,
    ]);

    expect(recomputeAdjacentMineCount(grid, { x: 0, y: 0 })).toBe(0);
  });

  it("counts all eight surrounding mines", () => {
    const grid = createGridFromTypes(3, 3, [
      CellType.SafeMine,
      CellType.SafeMine,
      CellType.SafeMine,
      CellType.SafeMine,
      CellType.Safe,
      CellType.SafeMine,
      CellType.SafeMine,
      CellType.DangerousMine,
      CellType.SafeMine,
    ]);

    expect(recomputeAdjacentMineCount(grid, { x: 1, y: 1 })).toBe(8);
  });

  it("returns only coordinates whose stored count is stale", () => {
    const grid = createGridFromTypes(
      3,
      3,
      [
        CellType.SafeMine,
        CellType.Safe,
        CellType.Safe,
        CellType.Safe,
        CellType.Safe,
        CellType.DangerousMine,
        CellType.Safe,
        CellType.Safe,
        CellType.Safe,
      ],
      [1, 0, 0, 1, 9, 0, 0, 0, 0],
    );

    const changed = recomputeAdjacentMineCounts(grid, [
      { x: 1, y: 1 },
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ]);

    expect(changed).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ]);
    expect(grid.cells[4]?.adjacentMineCount).toBe(9);
  });
});

function createGridFromTypes(
  width: number,
  height: number,
  cellTypes: CellType[],
  counts?: number[],
): RulesGrid {
  return {
    width,
    height,
    cells: cellTypes.map((cellType, index) => createCell(cellType, counts?.[index] ?? 0)),
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
