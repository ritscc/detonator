import { CellType, type GridCoord } from "@detonator/protocol";

import { chebyshevDistance, linearIndexOf } from "../grid/coords.js";
import type { RulesCell, RulesGrid } from "../types.js";

export interface BuildDetonatePreviewInput {
  grid: RulesGrid;
  sourceCoord: GridCoord;
}

export interface BuildDetonatePreviewOutput {
  provisionalPath: GridCoord[];
  updatedGrid: RulesGrid;
}

export interface ResolveDetonateChainInput {
  grid: RulesGrid;
  sourceCoord: GridCoord;
}

export interface ResolveDetonateChainStep {
  coord: GridCoord;
  cellTypeBefore: CellType;
  wasRelayPoint: boolean;
  remainingPathAfter: GridCoord[];
}

export interface ResolveDetonateChainOutput {
  resolvedPath: GridCoord[];
  processedCells: GridCoord[];
  safeMineCellsConverted: number;
  dangerousMineCellsConverted: number;
  remainingPath: GridCoord[];
  updatedGrid: RulesGrid;
  chainSteps: ResolveDetonateChainStep[];
}

interface DetonateNode {
  coord: GridCoord;
  linearIndex: number;
}

interface DetonateResolution {
  path: GridCoord[];
  updatedGrid: RulesGrid;
  safeMineCellsConverted: number;
  dangerousMineCellsConverted: number;
  chainSteps: ResolveDetonateChainStep[];
}

export function buildDetonatePreview(
  input: BuildDetonatePreviewInput,
): BuildDetonatePreviewOutput {
  const resolution = resolveDetonateSnapshot(input.grid, input.sourceCoord);

  return {
    provisionalPath: cloneCoords(resolution.path),
    updatedGrid: resolution.updatedGrid,
  };
}

export function resolveDetonateChain(
  input: ResolveDetonateChainInput,
): ResolveDetonateChainOutput {
  const resolution = resolveDetonateSnapshot(input.grid, input.sourceCoord);
  const resolvedPath = cloneCoords(resolution.path);

  return {
    resolvedPath,
    processedCells: cloneCoords(resolution.path),
    safeMineCellsConverted: resolution.safeMineCellsConverted,
    dangerousMineCellsConverted: resolution.dangerousMineCellsConverted,
    remainingPath: cloneCoords(resolution.path),
    updatedGrid: resolution.updatedGrid,
    chainSteps: resolution.chainSteps,
  };
}

function resolveDetonateSnapshot(grid: RulesGrid, sourceCoord: GridCoord): DetonateResolution {
  validateGrid(grid);

  if (!isCoordInBounds(sourceCoord, grid)) {
    throw new Error("Detonate source is out of bounds.");
  }

  const sourceIndex = linearIndexOf(sourceCoord, grid.width);
  const sourceCell = getCellOrThrow(grid, sourceIndex);

  if (!isValidIgnitionSource(sourceCell)) {
    throw new Error("Detonate source is not a valid ignition node.");
  }

  const nodes = collectDetonateNodes(grid, sourceIndex);
  const rootNodePosition = nodes.findIndex((node) => node.linearIndex === sourceIndex);

  if (rootNodePosition === -1) {
    throw new Error("Detonate source node was not collected.");
  }

  const childrenByNodePosition = buildRootedPrimTree(nodes, rootNodePosition);
  const path = buildPropagationPath(grid, nodes, childrenByNodePosition, rootNodePosition);

  return applyDetonateMutations(grid, path);
}

function validateGrid(grid: RulesGrid): void {
  if (!Number.isInteger(grid.width) || !Number.isInteger(grid.height)) {
    throw new Error("Grid dimensions must be integers.");
  }

  if (grid.width <= 0 || grid.height <= 0) {
    throw new Error("Grid must be non-empty.");
  }

  const expectedCellCount = grid.width * grid.height;

  if (grid.cells.length !== expectedCellCount) {
    throw new Error("Grid cell count does not match dimensions.");
  }

  for (let index = 0; index < expectedCellCount; index += 1) {
    if (grid.cells[index] == null) {
      throw new Error("Grid contains missing cells.");
    }
  }
}

function isCoordInBounds(coord: GridCoord, grid: RulesGrid): boolean {
  return (
    Number.isInteger(coord.x) &&
    Number.isInteger(coord.y) &&
    coord.x >= 0 &&
    coord.y >= 0 &&
    coord.x < grid.width &&
    coord.y < grid.height
  );
}

function isValidIgnitionSource(cell: RulesCell): boolean {
  return isFlaggedMineNode(cell) || isRelayNode(cell);
}

function isFlaggedMineNode(cell: RulesCell): boolean {
  return cell.flagged && isMineCellType(cell.cellType);
}

function isRelayNode(cell: RulesCell): boolean {
  return cell.cellType === CellType.Safe && cell.hasRelayPoint;
}

function isMineCellType(cellType: CellType): boolean {
  return cellType === CellType.SafeMine || cellType === CellType.DangerousMine;
}

function collectDetonateNodes(grid: RulesGrid, sourceIndex: number): DetonateNode[] {
  const nodes: DetonateNode[] = [];

  for (let linearIndex = 0; linearIndex < grid.cells.length; linearIndex += 1) {
    const cell = getCellOrThrow(grid, linearIndex);
    const shouldInclude = linearIndex === sourceIndex || isFlaggedMineNode(cell) || isRelayNode(cell);

    if (!shouldInclude) {
      continue;
    }

    nodes.push({
      coord: {
        x: linearIndex % grid.width,
        y: Math.floor(linearIndex / grid.width),
      },
      linearIndex,
    });
  }

  return nodes;
}

function buildRootedPrimTree(nodes: DetonateNode[], rootNodePosition: number): number[][] {
  const childrenByNodePosition = nodes.map(() => [] as number[]);
  const visitedNodePositions = new Set<number>([rootNodePosition]);

  while (visitedNodePositions.size < nodes.length) {
    let nextChildNodePosition = -1;
    let nextParentNodePosition = -1;
    let nextWeight = Number.POSITIVE_INFINITY;
    let nextChildLinearIndex = Number.POSITIVE_INFINITY;
    let nextParentLinearIndex = Number.POSITIVE_INFINITY;

    for (let childNodePosition = 0; childNodePosition < nodes.length; childNodePosition += 1) {
      if (visitedNodePositions.has(childNodePosition)) {
        continue;
      }

      const childNode = nodes[childNodePosition]!;
      let bestParentNodePosition = -1;
      let bestWeight = Number.POSITIVE_INFINITY;
      let bestParentLinearIndex = Number.POSITIVE_INFINITY;

      for (const parentNodePosition of visitedNodePositions) {
        const parentNode = nodes[parentNodePosition]!;
        const weight = chebyshevDistance(parentNode.coord, childNode.coord);

        if (
          weight < bestWeight ||
          (weight === bestWeight && parentNode.linearIndex < bestParentLinearIndex)
        ) {
          bestParentNodePosition = parentNodePosition;
          bestWeight = weight;
          bestParentLinearIndex = parentNode.linearIndex;
        }
      }

      if (
        bestWeight < nextWeight ||
        (bestWeight === nextWeight && childNode.linearIndex < nextChildLinearIndex) ||
        (bestWeight === nextWeight &&
          childNode.linearIndex === nextChildLinearIndex &&
          bestParentLinearIndex < nextParentLinearIndex)
      ) {
        nextChildNodePosition = childNodePosition;
        nextParentNodePosition = bestParentNodePosition;
        nextWeight = bestWeight;
        nextChildLinearIndex = childNode.linearIndex;
        nextParentLinearIndex = bestParentLinearIndex;
      }
    }

    if (nextChildNodePosition === -1 || nextParentNodePosition === -1) {
      throw new Error("Failed to build detonate MST.");
    }

    childrenByNodePosition[nextParentNodePosition]!.push(nextChildNodePosition);
    visitedNodePositions.add(nextChildNodePosition);
  }

  for (const childNodePositions of childrenByNodePosition) {
    childNodePositions.sort(
      (left, right) => nodes[left]!.linearIndex - nodes[right]!.linearIndex,
    );
  }

  return childrenByNodePosition;
}

function buildPropagationPath(
  grid: RulesGrid,
  nodes: DetonateNode[],
  childrenByNodePosition: number[][],
  rootNodePosition: number,
): GridCoord[] {
  const path: GridCoord[] = [];
  const queue = [rootNodePosition];

  for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
    const nodePosition = queue[queueIndex]!;
    const node = nodes[nodePosition]!;
    const cell = getCellOrThrow(grid, node.linearIndex);

    path.push(cloneCoord(node.coord));

    if (cell.cellType === CellType.SafeMine) {
      continue;
    }

    for (const childNodePosition of childrenByNodePosition[nodePosition]!) {
      queue.push(childNodePosition);
    }
  }

  return path;
}

function applyDetonateMutations(grid: RulesGrid, path: GridCoord[]): DetonateResolution {
  const updatedGrid = cloneGrid(grid);
  const chainSteps: ResolveDetonateChainStep[] = [];
  let safeMineCellsConverted = 0;
  let dangerousMineCellsConverted = 0;

  for (let index = 0; index < path.length; index += 1) {
    const coord = path[index]!;
    const linearIndex = linearIndexOf(coord, updatedGrid.width);
    const cell = getCellOrThrow(updatedGrid, linearIndex);
    const cellTypeBefore = cell.cellType;
    const wasRelayPoint = cell.hasRelayPoint;

    if (cellTypeBefore === CellType.DangerousMine) {
      updatedGrid.cells[linearIndex] = {
        ...cell,
        cellType: CellType.Safe,
        flagged: false,
        hasRelayPoint: false,
      };
      dangerousMineCellsConverted += 1;
    } else if (cellTypeBefore === CellType.SafeMine) {
      updatedGrid.cells[linearIndex] = {
        ...cell,
        cellType: CellType.Safe,
        flagged: false,
        hasRelayPoint: false,
      };
      safeMineCellsConverted += 1;
    } else if (cellTypeBefore === CellType.Safe) {
      updatedGrid.cells[linearIndex] = {
        ...cell,
        flagged: false,
        hasRelayPoint: false,
      };
    } else {
      throw new Error("Detonate path contained an unsupported cell type.");
    }

    chainSteps.push({
      coord: cloneCoord(coord),
      cellTypeBefore,
      wasRelayPoint,
      remainingPathAfter: cloneCoords(path.slice(index + 1)),
    });
  }

  return {
    path,
    updatedGrid,
    safeMineCellsConverted,
    dangerousMineCellsConverted,
    chainSteps,
  };
}

function cloneGrid(grid: RulesGrid): RulesGrid {
  return {
    width: grid.width,
    height: grid.height,
    cells: grid.cells.map((cell) => ({ ...cell })),
  };
}

function getCellOrThrow(grid: RulesGrid, linearIndex: number): RulesCell {
  const cell = grid.cells[linearIndex];

  if (cell == null) {
    throw new Error("Grid contains missing cells.");
  }

  return cell;
}

function cloneCoords(coords: GridCoord[]): GridCoord[] {
  return coords.map(cloneCoord);
}

function cloneCoord(coord: GridCoord): GridCoord {
  return { ...coord };
}
