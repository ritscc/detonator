import { CellType } from "@detonator/protocol";
import { describe, expect, it } from "vitest";

import { floodRevealFromSafeCell } from "../../src/grid/flood-fill.js";
import type { RulesCell, RulesGrid } from "../../src/types.js";

describe("flood reveal", () => {
  it("reveals a single safe-mine cell and keeps the input grid unchanged", () => {
    const grid = createGrid(1, 1, [createCell(CellType.SafeMine, 0)]);

    const result = floodRevealFromSafeCell({
      grid,
      startCoord: { x: 0, y: 0 },
    });

    expect(result.revealedCoords).toEqual([{ x: 0, y: 0 }]);
    expect(result.updatedGrid.cells[0]?.cellType).toBe(CellType.Safe);
    expect(grid.cells[0]?.cellType).toBe(CellType.SafeMine);
  });

  it("reveals an entire zero-count region", () => {
    const grid = createGrid(
      3,
      3,
      Array.from({ length: 9 }, () => createCell(CellType.SafeMine, 0)),
    );

    const result = floodRevealFromSafeCell({
      grid,
      startCoord: { x: 1, y: 1 },
    });

    expect(result.revealedCoords).toHaveLength(9);
    expect(result.updatedGrid.cells.every((cell) => cell.cellType === CellType.Safe)).toBe(true);
  });

  it("does not reveal dangerous mines while expanding", () => {
    const grid = createGrid(3, 3, [
      createCell(CellType.SafeMine, 1),
      createCell(CellType.SafeMine, 1),
      createCell(CellType.SafeMine, 1),
      createCell(CellType.SafeMine, 1),
      createCell(CellType.SafeMine, 0),
      createCell(CellType.DangerousMine, 0),
      createCell(CellType.SafeMine, 1),
      createCell(CellType.SafeMine, 1),
      createCell(CellType.SafeMine, 1),
    ]);

    const result = floodRevealFromSafeCell({
      grid,
      startCoord: { x: 1, y: 1 },
    });

    expect(result.revealedCoords).toHaveLength(8);
    expect(result.updatedGrid.cells[5]?.cellType).toBe(CellType.DangerousMine);
  });

  it("returns a no-op clone when the start cell is already revealed", () => {
    const grid = createGrid(2, 2, [
      createCell(CellType.Safe, 0),
      createCell(CellType.SafeMine, 0),
      createCell(CellType.SafeMine, 0),
      createCell(CellType.SafeMine, 0),
    ]);

    const result = floodRevealFromSafeCell({
      grid,
      startCoord: { x: 0, y: 0 },
    });

    expect(result.revealedCoords).toEqual([]);
    expect(result.updatedGrid).not.toBe(grid);
    expect(result.updatedGrid.cells).toEqual(grid.cells);
  });
});

describe("flood reveal boundary and expansion edges", () => {
  it("reveals only the single SafeMine in a 1x1 grid", () => {
    const grid = createGrid(1, 1, [createCell(CellType.SafeMine, 0)]);

    const result = floodRevealFromSafeCell({
      grid,
      startCoord: { x: 0, y: 0 },
    });

    expect(result.revealedCoords).toEqual([{ x: 0, y: 0 }]);
    expect(result.updatedGrid.cells).toEqual([createCell(CellType.Safe, 0)]);
    expect(result.updatedGrid.cells).toHaveLength(1);
    expect(grid.cells).toEqual([createCell(CellType.SafeMine, 0)]);
  });

  it("reveals only the start cell when all 8 neighbors are DangerousMine", () => {
    const grid = createGrid(3, 3, [
      createCell(CellType.DangerousMine, 0),
      createCell(CellType.DangerousMine, 0),
      createCell(CellType.DangerousMine, 0),
      createCell(CellType.DangerousMine, 0),
      createCell(CellType.SafeMine, 8),
      createCell(CellType.DangerousMine, 0),
      createCell(CellType.DangerousMine, 0),
      createCell(CellType.DangerousMine, 0),
      createCell(CellType.DangerousMine, 0),
    ]);

    const result = floodRevealFromSafeCell({
      grid,
      startCoord: { x: 1, y: 1 },
    });

    expect(result.revealedCoords).toEqual([{ x: 1, y: 1 }]);
    expect(result.updatedGrid.cells[4]?.cellType).toBe(CellType.Safe);
    expect(
      result.updatedGrid.cells.filter((cell) => cell.cellType === CellType.DangerousMine),
    ).toHaveLength(8);
  });

  it("expands from a corner using only in-bounds 8-neighbors and never wraps", () => {
    const grid = createGrid(3, 3, [
      createCell(CellType.SafeMine, 0),
      createCell(CellType.SafeMine, 0),
      createCell(CellType.DangerousMine, 0),
      createCell(CellType.SafeMine, 0),
      createCell(CellType.SafeMine, 0),
      createCell(CellType.DangerousMine, 0),
      createCell(CellType.DangerousMine, 0),
      createCell(CellType.DangerousMine, 0),
      createCell(CellType.DangerousMine, 0),
    ]);

    const result = floodRevealFromSafeCell({
      grid,
      startCoord: { x: 0, y: 0 },
    });

    expect(result.revealedCoords).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ]);
    expect(result.revealedCoords.every(({ x, y }) => x >= 0 && y >= 0)).toBe(true);
    expect(result.updatedGrid.cells[2]?.cellType).toBe(CellType.DangerousMine);
    expect(result.updatedGrid.cells[6]?.cellType).toBe(CellType.DangerousMine);
  });

  it("reveals every cell in a 5x5 SafeMine region when all adjacentMineCount values are zero", () => {
    const grid = createGrid(
      5,
      5,
      Array.from({ length: 25 }, () => createCell(CellType.SafeMine, 0)),
    );

    const result = floodRevealFromSafeCell({
      grid,
      startCoord: { x: 2, y: 2 },
    });
    const expectedCoords = allCoordsInGrid(5, 5);

    expect(result.revealedCoords).toHaveLength(25);
    expect(sortCoords(result.revealedCoords)).toEqual(sortCoords(expectedCoords));
    expect(result.updatedGrid.cells.every((cell) => cell.cellType === CellType.Safe)).toBe(true);
  });

  it("reveals a SafeMine peninsula while the DangerousMine on the fourth side acts as a boundary", () => {
    const grid = createGrid(4, 3, [
      createCell(CellType.Safe, 0),
      createCell(CellType.Safe, 0),
      createCell(CellType.Safe, 0),
      createCell(CellType.Safe, 0),
      createCell(CellType.SafeMine, 0),
      createCell(CellType.SafeMine, 0),
      createCell(CellType.SafeMine, 1),
      createCell(CellType.DangerousMine, 0),
      createCell(CellType.Safe, 0),
      createCell(CellType.Safe, 0),
      createCell(CellType.Safe, 0),
      createCell(CellType.Safe, 0),
    ]);

    const result = floodRevealFromSafeCell({
      grid,
      startCoord: { x: 0, y: 1 },
    });

    expect(result.revealedCoords).toEqual([
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ]);
    expect(result.updatedGrid.cells[7]?.cellType).toBe(CellType.DangerousMine);
    expect(result.updatedGrid.cells[0]?.cellType).toBe(CellType.Safe);
    expect(result.updatedGrid.cells[10]?.cellType).toBe(CellType.Safe);
  });

  it("returns an empty reveal set and a deep-cloned grid when the start cell is already Safe", () => {
    const grid = createGrid(2, 2, [
      createCell(CellType.Safe, 0),
      createCell(CellType.SafeMine, 2),
      createCell(CellType.DangerousMine, 0),
      createCell(CellType.Safe, 1),
    ]);
    const originalSnapshot = grid.cells.map((cell) => ({ ...cell }));
    const originalStartCell = grid.cells[0];

    const result = floodRevealFromSafeCell({
      grid,
      startCoord: { x: 0, y: 0 },
    });

    expect(result.revealedCoords).toEqual([]);
    expect(result.updatedGrid).not.toBe(grid);
    expect(result.updatedGrid.cells).not.toBe(grid.cells);
    expect(result.updatedGrid.cells[0]).not.toBe(grid.cells[0]);
    expect(result.updatedGrid.cells).toEqual(originalSnapshot);
    expect(grid.cells).toEqual(originalSnapshot);
    expect(grid.cells[0]).toBe(originalStartCell);
  });

  it("reveals a non-zero SafeMine boundary cell but does not expand through it", () => {
    const grid = createGrid(3, 1, [
      createCell(CellType.SafeMine, 0),
      createCell(CellType.SafeMine, 3),
      createCell(CellType.SafeMine, 0),
    ]);

    const result = floodRevealFromSafeCell({
      grid,
      startCoord: { x: 0, y: 0 },
    });

    expect(result.revealedCoords).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    expect(result.updatedGrid.cells[2]?.cellType).toBe(CellType.SafeMine);
  });
});

function allCoordsInGrid(width: number, height: number): Array<{ x: number; y: number }> {
  return Array.from({ length: width * height }, (_, index) => ({
    x: index % width,
    y: Math.floor(index / width),
  }));
}

function sortCoords(coords: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  return [...coords].sort((left, right) => left.y - right.y || left.x - right.x);
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
