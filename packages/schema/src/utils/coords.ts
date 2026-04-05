import type { GridCoord } from "@detonator/protocol";

export function coordToIndex(x: number, y: number, width: number): number {
  return y * width + x;
}

export function indexToCoord(index: number, width: number): GridCoord {
  return {
    x: index % width,
    y: Math.floor(index / width),
  };
}

export function toCellKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function fromCellKey(key: string): GridCoord {
  const [xPart, yPart, ...rest] = key.split(",");

  if (xPart === undefined || yPart === undefined || rest.length > 0) {
    throw new Error(`Invalid cell key: ${key}`);
  }

  const x = Number(xPart);
  const y = Number(yPart);

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error(`Invalid cell key: ${key}`);
  }

  return { x, y };
}

export function isInBounds(x: number, y: number, width: number, height: number): boolean {
  return x >= 0 && y >= 0 && x < width && y < height;
}
