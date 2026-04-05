import { CellType, type GridCoord } from "@detonator/protocol";
import { describe, expect, it } from "vitest";

import { bfs, getNeighbors4, getNeighbors8 } from "../../src/grid/neighbors.js";
import type { RulesGrid } from "../../src/types.js";

const SPEC_OFFSETS_4: GridCoord[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

const SPEC_OFFSETS_8: GridCoord[] = [
  { x: 0, y: -1 },
  { x: 1, y: -1 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: 0 },
  { x: -1, y: -1 },
];

describe("grid neighbors", () => {
  const grid = createGrid(3, 3);

  it("returns 4-neighbors in the exact spec order N/E/S/W", () => {
    expect(getNeighbors4({ x: 0, y: 0 }, grid)).toEqual(
      neighborsFromSpec({ x: 0, y: 0 }, grid, SPEC_OFFSETS_4),
    );
    expect(getNeighbors4({ x: 1, y: 0 }, grid)).toEqual(
      neighborsFromSpec({ x: 1, y: 0 }, grid, SPEC_OFFSETS_4),
    );
    expect(getNeighbors4({ x: 1, y: 1 }, grid)).toEqual(
      neighborsFromSpec({ x: 1, y: 1 }, grid, SPEC_OFFSETS_4),
    );
  });

  it("returns 8-neighbors in the exact spec order N/NE/E/SE/S/SW/W/NW", () => {
    expect(getNeighbors8({ x: 0, y: 0 }, grid)).toEqual(
      neighborsFromSpec({ x: 0, y: 0 }, grid, SPEC_OFFSETS_8),
    );
    expect(getNeighbors8({ x: 1, y: 1 }, grid)).toEqual(
      neighborsFromSpec({ x: 1, y: 1 }, grid, SPEC_OFFSETS_8),
    );
  });

  it("skips out-of-bounds offsets instead of wrapping around grid edges", () => {
    expect(getNeighbors4({ x: 2, y: 2 }, grid)).toEqual([
      { x: 2, y: 1 },
      { x: 1, y: 2 },
    ]);
    expect(getNeighbors8({ x: 0, y: 2 }, grid)).toEqual([
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 2 },
    ]);
  });

  it("deduplicates BFS start nodes before expanding in 8-neighbor order", () => {
    const visited = bfs<GridCoord>({
      start: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 0 },
      ],
      visit: (coord) => {
        if (coord.x < 0 || coord.y < 0 || coord.x > 1 || coord.y > 1) {
          return null;
        }

        return coord;
      },
    });

    expect(visited).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ]);
  });

  it("includes diagonal expansion because BFS walks the spec's 8-neighbor offsets", () => {
    const visited = bfs<GridCoord>({
      start: [{ x: 0, y: 0 }],
      visit: (coord) => {
        if ((coord.x === 0 && coord.y === 0) || (coord.x === 1 && coord.y === 1)) {
          return coord;
        }

        return null;
      },
    });

    expect(visited).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ]);
  });
});

function neighborsFromSpec(
  coord: GridCoord,
  grid: RulesGrid,
  offsets: GridCoord[],
): GridCoord[] {
  return offsets.flatMap((offset) => {
    const next = { x: coord.x + offset.x, y: coord.y + offset.y };

    return isWithinBounds(next, grid) ? [next] : [];
  });
}

function isWithinBounds(coord: GridCoord, grid: RulesGrid): boolean {
  return coord.x >= 0 && coord.x < grid.width && coord.y >= 0 && coord.y < grid.height;
}

function createGrid(width: number, height: number): RulesGrid {
  return {
    width,
    height,
    cells: Array.from({ length: width * height }, () => ({
      cellType: CellType.Safe,
      adjacentMineCount: 0,
      flagged: false,
      hasRelayPoint: false,
      erosionWarning: false,
    })),
  };
}
