import type { GameParamsConfig } from "@detonator/config";
import { CellType, ErrorCode, PlayerLifeState, type GridCoord } from "@detonator/protocol";

import {
  recomputeAdjacentMineCount,
  recomputeAdjacentMineCounts,
} from "../grid/adjacent-mine-count.js";
import { chebyshevDistance, linearIndexOf } from "../grid/coords.js";
import { floodRevealFromSafeCell } from "../grid/flood-fill.js";
import { getNeighbors8 } from "../grid/neighbors.js";
import type { RulesGrid, RulesPlayer } from "../types.js";

export function resolveDig(input: {
  grid: RulesGrid;
  actor: RulesPlayer;
  target: GridCoord;
  config: GameParamsConfig;
}):
  | { kind: "invalid"; errorCode: ErrorCode }
  | {
      kind: "safe_dig";
      updatedGrid: RulesGrid;
      revealedCoords: GridCoord[];
      adjacentUpdatedCoords: GridCoord[];
    }
  | {
      kind: "dangerous_trigger";
      epicenterCoord: GridCoord;
    } {
  if (!isWithinBounds(input.target, input.grid)) {
    return { kind: "invalid", errorCode: ErrorCode.DigOutOfRange };
  }

  if (input.actor.lifeState !== PlayerLifeState.Alive) {
    return { kind: "invalid", errorCode: ErrorCode.DigNotAlive };
  }

  const actorCoord: GridCoord = {
    x: Math.floor(input.actor.position.x),
    y: Math.floor(input.actor.position.y),
  };

  if (chebyshevDistance(actorCoord, input.target) > 1) {
    return { kind: "invalid", errorCode: ErrorCode.DigOutOfRange };
  }

  const targetCell = input.grid.cells[linearIndexOf(input.target, input.grid.width)];

  if (
    targetCell?.cellType !== CellType.SafeMine &&
    targetCell?.cellType !== CellType.DangerousMine
  ) {
    return { kind: "invalid", errorCode: ErrorCode.DigInvalidTarget };
  }

  if (targetCell.cellType === CellType.DangerousMine) {
    return {
      kind: "dangerous_trigger",
      epicenterCoord: { ...input.target },
    };
  }

  const { updatedGrid, revealedCoords } = floodRevealFromSafeCell({
    grid: input.grid,
    startCoord: input.target,
  });
  const revealedCoordKeys = new Set(revealedCoords.map(coordKey));
  const adjacentCandidateCoords: GridCoord[] = [];

  for (const revealedCoord of revealedCoords) {
    for (const neighbor of getNeighbors8(revealedCoord, updatedGrid)) {
      if (revealedCoordKeys.has(coordKey(neighbor))) {
        continue;
      }

      const neighborCell = updatedGrid.cells[linearIndexOf(neighbor, updatedGrid.width)];

      if (neighborCell?.cellType === CellType.Safe) {
        adjacentCandidateCoords.push({ ...neighbor });
      }
    }
  }

  const adjacentUpdatedCoords = recomputeAdjacentMineCounts(updatedGrid, adjacentCandidateCoords);

  for (const coord of adjacentUpdatedCoords) {
    const index = linearIndexOf(coord, updatedGrid.width);
    const cell = updatedGrid.cells[index];

    if (cell === undefined) {
      continue;
    }

    updatedGrid.cells[index] = {
      ...cell,
      adjacentMineCount: recomputeAdjacentMineCount(updatedGrid, coord),
    };
  }

  void input.config;

  return {
    kind: "safe_dig",
    updatedGrid,
    revealedCoords,
    adjacentUpdatedCoords,
  };
}

function isWithinBounds(coord: GridCoord, grid: RulesGrid): boolean {
  return coord.x >= 0 && coord.y >= 0 && coord.x < grid.width && coord.y < grid.height;
}

function coordKey(coord: GridCoord): string {
  return `${coord.x},${coord.y}`;
}
