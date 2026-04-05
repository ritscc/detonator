import type { GridCoord } from "@detonator/protocol";

import type { RulesGrid } from "../types.js";

const OFFSETS_4 = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
] as const;

const OFFSETS_8 = [
  { x: 0, y: -1 },
  { x: 1, y: -1 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: 0 },
  { x: -1, y: -1 },
] as const;

export function getNeighbors4(coord: GridCoord, grid: RulesGrid): GridCoord[] {
  return OFFSETS_4.flatMap((offset) => {
    const nextCoord = { x: coord.x + offset.x, y: coord.y + offset.y };

    return isWithinBounds(nextCoord, grid) ? [nextCoord] : [];
  });
}

export function getNeighbors8(coord: GridCoord, grid: RulesGrid): GridCoord[] {
  return OFFSETS_8.flatMap((offset) => {
    const nextCoord = { x: coord.x + offset.x, y: coord.y + offset.y };

    return isWithinBounds(nextCoord, grid) ? [nextCoord] : [];
  });
}

export function bfs<T>(input: {
  start: GridCoord[];
  visit: (coord: GridCoord) => T | null;
}): T[] {
  const queue: GridCoord[] = [];
  const seen = new Set<string>();
  const results: T[] = [];

  for (const startCoord of input.start) {
    const key = coordKey(startCoord);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    queue.push({ ...startCoord });
  }

  for (let index = 0; index < queue.length; index += 1) {
    const coord = queue[index]!;
    const visited = input.visit(coord);

    if (visited === null) {
      continue;
    }

    results.push(visited);

    for (const offset of OFFSETS_8) {
      const neighbor = { x: coord.x + offset.x, y: coord.y + offset.y };
      const key = coordKey(neighbor);

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      queue.push(neighbor);
    }
  }

  return results;
}

function isWithinBounds(coord: GridCoord, grid: RulesGrid): boolean {
  return coord.x >= 0 && coord.y >= 0 && coord.x < grid.width && coord.y < grid.height;
}

function coordKey(coord: GridCoord): string {
  return `${coord.x},${coord.y}`;
}
