import type { GridCoord } from "@detonator/protocol";

export function linearIndexOf(coord: GridCoord, width: number): number {
  return coord.y * width + coord.x;
}

export function coordOf(index: number, width: number): GridCoord {
  return {
    x: index % width,
    y: Math.floor(index / width),
  };
}

export function chebyshevDistance(a: GridCoord, b: GridCoord): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export function manhattanDistance(a: GridCoord, b: GridCoord): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function euclideanDistanceSquared(a: GridCoord, b: GridCoord): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;

  return dx * dx + dy * dy;
}
