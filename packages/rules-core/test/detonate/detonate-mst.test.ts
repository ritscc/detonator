import { CellType, type GridCoord } from "@detonator/protocol";
import { describe, expect, it, vi } from "vitest";

import {
  buildDetonatePreview,
  resolveDetonateChain,
} from "../../src/detonate/detonate-mst.js";
import type { RulesCell, RulesGrid } from "../../src/types.js";

describe("detonate MST graph model and rooted Prim construction", () => {
  it("uses only the source when no other flagged mines or relay nodes exist", () => {
    const grid = createPlacedGrid(3, 3, [
      {
        coord: coord(1, 1),
        cell: createCell(CellType.DangerousMine, 2, { flagged: true }),
      },
      {
        coord: coord(0, 0),
        cell: createCell(CellType.DangerousMine, 0),
      },
      {
        coord: coord(2, 0),
        cell: createCell(CellType.SafeMine, 1),
      },
      {
        coord: coord(0, 2),
        cell: createCell(CellType.Safe, 0),
      },
    ]);

    const result = buildDetonatePreview({
      grid,
      sourceCoord: coord(1, 1),
    });

    expect(result.provisionalPath).toEqual([coord(1, 1)]);
  });

  it("includes flagged mines and relay nodes while excluding plain safe cells and non-flagged mines", () => {
    const grid = createPlacedGrid(4, 2, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(1, 0),
        cell: createCell(CellType.DangerousMine, 1, { flagged: true }),
      },
      {
        coord: coord(0, 1),
        cell: createCell(CellType.SafeMine, 1, { flagged: true }),
      },
      {
        coord: coord(2, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(3, 0),
        cell: createCell(CellType.DangerousMine, 0),
      },
      {
        coord: coord(1, 1),
        cell: createCell(CellType.SafeMine, 0),
      },
      {
        coord: coord(2, 1),
        cell: createCell(CellType.Safe, 0),
      },
      {
        coord: coord(3, 1),
        cell: createCell(CellType.Wasteland, 0),
      },
    ]);

    const result = resolveDetonateChain({
      grid,
      sourceCoord: coord(0, 0),
    });

    expect(result.resolvedPath).toEqual([coord(0, 0), coord(1, 0), coord(0, 1), coord(2, 0)]);
    expect(result.resolvedPath).toContainEqual(coord(0, 1));
    expect(result.resolvedPath).not.toContainEqual(coord(1, 1));
    expect(result.resolvedPath).not.toContainEqual(coord(2, 1));
    expect(result.resolvedPath).not.toContainEqual(coord(3, 0));
    expect(result.resolvedPath).not.toContainEqual(coord(3, 1));
  });

  it("never treats Wasteland or Hole cells as nodes even if flags or relay markers are set defensively", () => {
    const grid = createPlacedGrid(3, 2, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(1, 0),
        cell: createCell(CellType.Wasteland, 0, { flagged: true, hasRelayPoint: true }),
      },
      {
        coord: coord(2, 0),
        cell: createCell(CellType.Hole, 0, { flagged: true, hasRelayPoint: true }),
      },
      {
        coord: coord(1, 1),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
    ]);

    const result = buildDetonatePreview({
      grid,
      sourceCoord: coord(0, 0),
    });

    expect(result.provisionalPath).toEqual([coord(0, 0), coord(1, 1)]);
  });

  it("keeps the source in the graph exactly once even when it is both flagged and marked as a relay", () => {
    const grid = createPlacedGrid(2, 2, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.SafeMine, 3, { flagged: true, hasRelayPoint: true }),
      },
    ]);

    const result = resolveDetonateChain({
      grid,
      sourceCoord: coord(0, 0),
    });

    expect(result.resolvedPath).toEqual([coord(0, 0)]);
    expect(result.safeMineCellsConverted).toBe(1);
    expect(result.updatedGrid.cells[0]).toEqual(
      createCell(CellType.Safe, 3, { flagged: false, hasRelayPoint: false }),
    );
  });

  it("treats diagonal adjacency as Chebyshev distance 1", () => {
    const grid = createPlacedGrid(3, 3, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.DangerousMine, 1, { flagged: true }),
      },
      {
        coord: coord(1, 1),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(2, 2),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
    ]);

    const result = resolveDetonateChain({
      grid,
      sourceCoord: coord(0, 0),
    });

    expect(result.resolvedPath).toEqual([coord(0, 0), coord(1, 1), coord(2, 2)]);
  });

  it("connects far nodes solely by geometry even when Wasteland and Hole cells lie between them", () => {
    const grid = createPlacedGrid(5, 5, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.DangerousMine, 2, { flagged: true }),
      },
      {
        coord: coord(4, 4),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(1, 1),
        cell: createCell(CellType.Wasteland, 0),
      },
      {
        coord: coord(2, 2),
        cell: createCell(CellType.Hole, 0),
      },
      {
        coord: coord(3, 3),
        cell: createCell(CellType.Wasteland, 0),
      },
    ]);

    const result = buildDetonatePreview({
      grid,
      sourceCoord: coord(0, 0),
    });

    expect(result.provisionalPath).toEqual([coord(0, 0), coord(4, 4)]);
  });

  it("prefers the lower child linear index when multiple nodes have the same best weight", () => {
    const grid = createPlacedGrid(3, 3, [
      {
        coord: coord(1, 1),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(0, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(2, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
      {
        coord: coord(0, 2),
        cell: createCell(CellType.SafeMine, 0, { flagged: true }),
      },
    ]);

    const result = resolveDetonateChain({
      grid,
      sourceCoord: coord(1, 1),
    });

    expect(result.resolvedPath).toEqual([
      coord(1, 1),
      coord(0, 0),
      coord(2, 0),
      coord(0, 2),
    ]);
  });

  it("prefers the lower parent linear index when a child has equally good visited parents", () => {
    const grid = createPlacedGrid(4, 2, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(1, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(2, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(3, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
      {
        coord: coord(1, 1),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
    ]);

    const result = buildDetonatePreview({
      grid,
      sourceCoord: coord(0, 0),
    });

    expect(result.provisionalPath).toEqual([
      coord(0, 0),
      coord(1, 0),
      coord(1, 1),
      coord(2, 0),
      coord(3, 0),
    ]);
  });

  it("builds the minimum-weight chain MST when nodes lie on a straight line", () => {
    const grid = createPlacedGrid(4, 1, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
      {
        coord: coord(1, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(2, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(3, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
    ]);

    const result = resolveDetonateChain({
      grid,
      sourceCoord: coord(0, 0),
    });

    expect(result.resolvedPath).toEqual([
      coord(0, 0),
      coord(1, 0),
      coord(2, 0),
      coord(3, 0),
    ]);
  });

  it("builds a star topology when a central source is equally close to every other node", () => {
    const grid = createPlacedGrid(3, 3, [
      {
        coord: coord(1, 1),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(0, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(2, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
      {
        coord: coord(0, 2),
        cell: createCell(CellType.SafeMine, 0, { flagged: true }),
      },
      {
        coord: coord(2, 2),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
    ]);

    const result = buildDetonatePreview({
      grid,
      sourceCoord: coord(1, 1),
    });

    expect(result.provisionalPath).toEqual([
      coord(1, 1),
      coord(0, 0),
      coord(2, 0),
      coord(0, 2),
      coord(2, 2),
    ]);
  });
});

describe("detonate MST propagation order and path construction", () => {
  it("keeps sourceCoord as the first element and traverses a multi-level tree in BFS order", () => {
    const grid = createPlacedGrid(5, 3, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(1, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(0, 1),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(2, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
      {
        coord: coord(0, 2),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
    ]);

    const result = buildDetonatePreview({
      grid,
      sourceCoord: coord(0, 0),
    });

    expect(result.provisionalPath).toEqual([
      coord(0, 0),
      coord(1, 0),
      coord(0, 1),
      coord(2, 0),
      coord(0, 2),
    ]);
  });

  it("prunes an entire branch when a SafeMine node is processed", () => {
    const grid = createPlacedGrid(4, 1, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
      {
        coord: coord(1, 0),
        cell: createCell(CellType.SafeMine, 0, { flagged: true }),
      },
      {
        coord: coord(2, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(3, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
    ]);

    const result = resolveDetonateChain({
      grid,
      sourceCoord: coord(0, 0),
    });

    expect(result.resolvedPath).toEqual([coord(0, 0), coord(1, 0)]);
    expect(result.updatedGrid.cells[2]).toEqual(createCell(CellType.Safe, 0, { hasRelayPoint: true }));
    expect(result.updatedGrid.cells[3]).toEqual(
      createCell(CellType.DangerousMine, 0, { flagged: true }),
    );
  });

  it("continues through DangerousMine nodes and enqueues their children", () => {
    const grid = createPlacedGrid(3, 1, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(1, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
      {
        coord: coord(2, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
    ]);

    const result = buildDetonatePreview({
      grid,
      sourceCoord: coord(0, 0),
    });

    expect(result.provisionalPath).toEqual([coord(0, 0), coord(1, 0), coord(2, 0)]);
  });

  it("continues through relay nodes and enqueues their children", () => {
    const grid = createPlacedGrid(3, 1, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(1, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(2, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
    ]);

    const result = buildDetonatePreview({
      grid,
      sourceCoord: coord(0, 0),
    });

    expect(result.provisionalPath).toEqual([coord(0, 0), coord(1, 0), coord(2, 0)]);
  });

  it("keeps sibling order in ascending linear-index order within the same parent", () => {
    const grid = createPlacedGrid(4, 3, [
      {
        coord: coord(1, 1),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(0, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(2, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(0, 2),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
      {
        coord: coord(3, 2),
        cell: createCell(CellType.SafeMine, 0, { flagged: true }),
      },
    ]);

    const result = resolveDetonateChain({
      grid,
      sourceCoord: coord(1, 1),
    });

    expect(result.resolvedPath).toEqual([
      coord(1, 1),
      coord(0, 0),
      coord(2, 0),
      coord(0, 2),
      coord(3, 2),
    ]);
  });

  it("starts remainingPath as the full resolved path and records a shrinking suffix after each step", () => {
    const grid = createPlacedGrid(4, 1, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
      {
        coord: coord(1, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(2, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(3, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
    ]);

    const result = resolveDetonateChain({
      grid,
      sourceCoord: coord(0, 0),
    });

    expect(result.remainingPath).toEqual(result.resolvedPath);
    expect(result.chainSteps.map((step) => step.remainingPathAfter)).toEqual([
      [coord(1, 0), coord(2, 0), coord(3, 0)],
      [coord(2, 0), coord(3, 0)],
      [coord(3, 0)],
      [],
    ]);
  });
});

describe("detonate MST chain-step mutations", () => {
  it("converts DangerousMine nodes to Safe while clearing flags and relay markers", () => {
    const grid = createPlacedGrid(1, 1, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.DangerousMine, 4, { flagged: true, hasRelayPoint: true }),
      },
    ]);

    const result = resolveDetonateChain({
      grid,
      sourceCoord: coord(0, 0),
    });

    expect(result.dangerousMineCellsConverted).toBe(1);
    expect(result.safeMineCellsConverted).toBe(0);
    expect(result.updatedGrid.cells[0]).toEqual(
      createCell(CellType.Safe, 4, { flagged: false, hasRelayPoint: false }),
    );
  });

  it("converts SafeMine nodes to Safe, increments the safe count, and stops their descendants", () => {
    const grid = createPlacedGrid(3, 1, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.SafeMine, 2, { flagged: true, hasRelayPoint: true }),
      },
      {
        coord: coord(1, 0),
        cell: createCell(CellType.DangerousMine, 1, { flagged: true }),
      },
      {
        coord: coord(2, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
    ]);

    const result = resolveDetonateChain({
      grid,
      sourceCoord: coord(0, 0),
    });

    expect(result.resolvedPath).toEqual([coord(0, 0)]);
    expect(result.safeMineCellsConverted).toBe(1);
    expect(result.dangerousMineCellsConverted).toBe(0);
    expect(result.updatedGrid.cells[0]).toEqual(
      createCell(CellType.Safe, 2, { flagged: false, hasRelayPoint: false }),
    );
    expect(result.updatedGrid.cells[1]).toEqual(
      createCell(CellType.DangerousMine, 1, { flagged: true }),
    );
  });

  it("keeps Safe relay nodes as Safe and removes both flag and relay markers without changing counts", () => {
    const grid = createPlacedGrid(1, 1, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.Safe, 5, { flagged: true, hasRelayPoint: true }),
      },
    ]);

    const result = resolveDetonateChain({
      grid,
      sourceCoord: coord(0, 0),
    });

    expect(result.safeMineCellsConverted).toBe(0);
    expect(result.dangerousMineCellsConverted).toBe(0);
    expect(result.updatedGrid.cells[0]).toEqual(
      createCell(CellType.Safe, 5, { flagged: false, hasRelayPoint: false }),
    );
  });

  it("records cellTypeBefore and wasRelayPoint from the pre-mutation snapshot", () => {
    const grid = createPlacedGrid(3, 1, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.DangerousMine, 1, { flagged: true, hasRelayPoint: true }),
      },
      {
        coord: coord(1, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(2, 0),
        cell: createCell(CellType.SafeMine, 2, { flagged: true }),
      },
    ]);

    const result = resolveDetonateChain({
      grid,
      sourceCoord: coord(0, 0),
    });

    expect(result.chainSteps).toEqual([
      {
        coord: coord(0, 0),
        cellTypeBefore: CellType.DangerousMine,
        wasRelayPoint: true,
        remainingPathAfter: [coord(1, 0), coord(2, 0)],
      },
      {
        coord: coord(1, 0),
        cellTypeBefore: CellType.Safe,
        wasRelayPoint: true,
        remainingPathAfter: [coord(2, 0)],
      },
      {
        coord: coord(2, 0),
        cellTypeBefore: CellType.SafeMine,
        wasRelayPoint: false,
        remainingPathAfter: [],
      },
    ]);
  });
});

describe("detonate MST preview versus resolve snapshots", () => {
  it("produces identical paths and mutations when the grid is unchanged during the fuse", () => {
    const grid = createPlacedGrid(3, 1, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
      {
        coord: coord(1, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(2, 0),
        cell: createCell(CellType.SafeMine, 0, { flagged: true }),
      },
    ]);

    const preview = buildDetonatePreview({
      grid,
      sourceCoord: coord(0, 0),
    });
    const resolved = resolveDetonateChain({
      grid,
      sourceCoord: coord(0, 0),
    });

    expect(preview.provisionalPath).toEqual(resolved.resolvedPath);
    expect(preview.updatedGrid).toEqual(resolved.updatedGrid);
  });

  it("recomputes a shorter resolve path when a flagged node loses its flag before fuse resolution", () => {
    const previewGrid = createPlacedGrid(3, 1, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
      {
        coord: coord(1, 0),
        cell: createCell(CellType.SafeMine, 0, { flagged: true }),
      },
    ]);
    const resolveGrid = createPlacedGrid(3, 1, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
      {
        coord: coord(1, 0),
        cell: createCell(CellType.SafeMine, 0),
      },
    ]);

    const preview = buildDetonatePreview({
      grid: previewGrid,
      sourceCoord: coord(0, 0),
    });
    const resolved = resolveDetonateChain({
      grid: resolveGrid,
      sourceCoord: coord(0, 0),
    });

    expect(preview.provisionalPath).toEqual([coord(0, 0), coord(1, 0)]);
    expect(resolved.resolvedPath).toEqual([coord(0, 0)]);
  });

  it("recomputes the graph when a previously flagged mine is removed before resolution", () => {
    const previewGrid = createPlacedGrid(3, 1, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
      {
        coord: coord(2, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
    ]);
    const resolveGrid = createPlacedGrid(3, 1, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
      {
        coord: coord(2, 0),
        cell: createCell(CellType.Safe, 0),
      },
    ]);

    const preview = buildDetonatePreview({
      grid: previewGrid,
      sourceCoord: coord(0, 0),
    });
    const resolved = resolveDetonateChain({
      grid: resolveGrid,
      sourceCoord: coord(0, 0),
    });

    expect(preview.provisionalPath).toEqual([coord(0, 0), coord(2, 0)]);
    expect(resolved.resolvedPath).toEqual([coord(0, 0)]);
  });

  it("includes newly eligible nodes that were added after the preview snapshot", () => {
    const previewGrid = createPlacedGrid(3, 1, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
    ]);
    const resolveGrid = createPlacedGrid(3, 1, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(2, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
    ]);

    const preview = buildDetonatePreview({
      grid: previewGrid,
      sourceCoord: coord(0, 0),
    });
    const resolved = resolveDetonateChain({
      grid: resolveGrid,
      sourceCoord: coord(0, 0),
    });

    expect(preview.provisionalPath).toEqual([coord(0, 0)]);
    expect(resolved.resolvedPath).toEqual([coord(0, 0), coord(2, 0)]);
  });

  it("uses only the fuse-time snapshot and ignores preview-only nodes", () => {
    const previewGrid = createPlacedGrid(5, 1, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
      {
        coord: coord(1, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(2, 0),
        cell: createCell(CellType.SafeMine, 0, { flagged: true }),
      },
    ]);
    const resolveGrid = createPlacedGrid(5, 1, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
      {
        coord: coord(3, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(4, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
    ]);

    const preview = buildDetonatePreview({
      grid: previewGrid,
      sourceCoord: coord(0, 0),
    });
    const resolved = resolveDetonateChain({
      grid: resolveGrid,
      sourceCoord: coord(0, 0),
    });

    expect(preview.provisionalPath).toEqual([coord(0, 0), coord(1, 0), coord(2, 0)]);
    expect(resolved.resolvedPath).toEqual([coord(0, 0), coord(3, 0), coord(4, 0)]);
  });
});

describe("detonate MST boundary and dense scenarios", () => {
  it("handles a 1x1 relay source", () => {
    const grid = createPlacedGrid(1, 1, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
    ]);

    const result = resolveDetonateChain({
      grid,
      sourceCoord: coord(0, 0),
    });

    expect(result.resolvedPath).toEqual([coord(0, 0)]);
    expect(result.safeMineCellsConverted).toBe(0);
    expect(result.dangerousMineCellsConverted).toBe(0);
  });

  it("processes every node when all nodes are DangerousMine cells in a line", () => {
    const grid = createPlacedGrid(4, 1, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
      {
        coord: coord(1, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
      {
        coord: coord(2, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
      {
        coord: coord(3, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
    ]);

    const result = resolveDetonateChain({
      grid,
      sourceCoord: coord(0, 0),
    });

    expect(result.resolvedPath).toEqual([
      coord(0, 0),
      coord(1, 0),
      coord(2, 0),
      coord(3, 0),
    ]);
    expect(result.dangerousMineCellsConverted).toBe(4);
  });

  it("stops at the source when all reachable nodes are SafeMine cells", () => {
    const grid = createPlacedGrid(4, 1, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.SafeMine, 0, { flagged: true }),
      },
      {
        coord: coord(1, 0),
        cell: createCell(CellType.SafeMine, 0, { flagged: true }),
      },
      {
        coord: coord(2, 0),
        cell: createCell(CellType.SafeMine, 0, { flagged: true }),
      },
      {
        coord: coord(3, 0),
        cell: createCell(CellType.SafeMine, 0, { flagged: true }),
      },
    ]);

    const result = resolveDetonateChain({
      grid,
      sourceCoord: coord(0, 0),
    });

    expect(result.resolvedPath).toEqual([coord(0, 0)]);
    expect(result.safeMineCellsConverted).toBe(1);
  });

  it("processes all nodes without conversions when every node is a relay", () => {
    const grid = createPlacedGrid(4, 1, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(1, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(2, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(3, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
    ]);

    const result = resolveDetonateChain({
      grid,
      sourceCoord: coord(0, 0),
    });

    expect(result.resolvedPath).toEqual([
      coord(0, 0),
      coord(1, 0),
      coord(2, 0),
      coord(3, 0),
    ]);
    expect(result.safeMineCellsConverted).toBe(0);
    expect(result.dangerousMineCellsConverted).toBe(0);
  });

  it("handles a source at the top-left corner", () => {
    const grid = createPlacedGrid(3, 3, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
      {
        coord: coord(1, 1),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
    ]);

    const result = buildDetonatePreview({
      grid,
      sourceCoord: coord(0, 0),
    });

    expect(result.provisionalPath).toEqual([coord(0, 0), coord(1, 1)]);
  });

  it("handles a source on a non-corner grid edge", () => {
    const grid = createPlacedGrid(4, 3, [
      {
        coord: coord(2, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
      {
        coord: coord(2, 1),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(3, 2),
        cell: createCell(CellType.SafeMine, 0, { flagged: true }),
      },
    ]);

    const result = resolveDetonateChain({
      grid,
      sourceCoord: coord(2, 0),
    });

    expect(result.resolvedPath).toEqual([coord(2, 0), coord(2, 1), coord(3, 2)]);
  });

  it("handles a large 20x20 grid with scattered nodes deterministically", () => {
    const placements = [
      { coord: coord(0, 0), cell: createCell(CellType.DangerousMine, 0, { flagged: true }) },
      { coord: coord(1, 1), cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }) },
      { coord: coord(3, 3), cell: createCell(CellType.DangerousMine, 0, { flagged: true }) },
      { coord: coord(5, 5), cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }) },
      { coord: coord(7, 7), cell: createCell(CellType.DangerousMine, 0, { flagged: true }) },
      { coord: coord(9, 9), cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }) },
      { coord: coord(11, 11), cell: createCell(CellType.DangerousMine, 0, { flagged: true }) },
      { coord: coord(13, 13), cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }) },
      { coord: coord(15, 15), cell: createCell(CellType.DangerousMine, 0, { flagged: true }) },
      { coord: coord(17, 17), cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }) },
      { coord: coord(19, 19), cell: createCell(CellType.DangerousMine, 0, { flagged: true }) },
    ];
    const grid = createPlacedGrid(20, 20, placements);

    const result = resolveDetonateChain({
      grid,
      sourceCoord: coord(0, 0),
    });

    expect(result.resolvedPath).toHaveLength(11);
    expect(result.resolvedPath[0]).toEqual(coord(0, 0));
    expect(result.resolvedPath[10]).toEqual(coord(19, 19));
    expect(result.dangerousMineCellsConverted).toBe(6);
  });

  it("breaks complete-graph cycles by producing a tree with unique processed nodes", () => {
    const grid = createPlacedGrid(3, 3, [
      {
        coord: coord(1, 1),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(0, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(2, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(0, 2),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(2, 2),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
    ]);

    const result = resolveDetonateChain({
      grid,
      sourceCoord: coord(1, 1),
    });
    const uniqueCoords = new Set(result.resolvedPath.map(({ x, y }) => `${x},${y}`));

    expect(result.resolvedPath).toHaveLength(5);
    expect(uniqueCoords.size).toBe(5);
    expect(result.chainSteps).toHaveLength(5);
  });
});

describe("detonate MST immutability and determinism", () => {
  it("does not mutate the input grid or replace its original cell references", () => {
    const grid = createPlacedGrid(2, 1, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.DangerousMine, 1, { flagged: true }),
      },
      {
        coord: coord(1, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
    ]);
    const originalCells = [...grid.cells];

    const result = resolveDetonateChain({
      grid,
      sourceCoord: coord(0, 0),
    });

    expect(grid.cells[0]).toBe(originalCells[0]);
    expect(grid.cells[1]).toBe(originalCells[1]);
    expect(grid.cells[0]).toEqual(createCell(CellType.DangerousMine, 1, { flagged: true }));
    expect(grid.cells[1]).toEqual(createCell(CellType.Safe, 0, { hasRelayPoint: true }));
    expect(result.updatedGrid.cells[0]).not.toBe(grid.cells[0]);
    expect(result.updatedGrid.cells[1]).not.toBe(grid.cells[1]);
  });

  it("returns a deep-cloned output grid", () => {
    const grid = createPlacedGrid(3, 1, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(1, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
    ]);

    const result = buildDetonatePreview({
      grid,
      sourceCoord: coord(0, 0),
    });

    expect(result.updatedGrid).not.toBe(grid);
    expect(result.updatedGrid.cells).not.toBe(grid.cells);
    expect(result.updatedGrid.cells.every((cell, index) => cell !== grid.cells[index])).toBe(true);
  });

  it("returns identical values on repeated calls while still allocating fresh objects", () => {
    const grid = createPlacedGrid(3, 1, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
      {
        coord: coord(1, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(2, 0),
        cell: createCell(CellType.SafeMine, 0, { flagged: true }),
      },
    ]);

    const first = resolveDetonateChain({
      grid,
      sourceCoord: coord(0, 0),
    });
    const second = resolveDetonateChain({
      grid,
      sourceCoord: coord(0, 0),
    });

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.updatedGrid).not.toBe(second.updatedGrid);
    expect(first.resolvedPath).not.toBe(second.resolvedPath);
    expect(first.chainSteps).not.toBe(second.chainSteps);
  });

  it("does not consume Math.random while building the MST or path", () => {
    const randomSpy = vi.spyOn(Math, "random");
    const grid = createPlacedGrid(2, 1, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(1, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
    ]);

    resolveDetonateChain({
      grid,
      sourceCoord: coord(0, 0),
    });

    expect(randomSpy).not.toHaveBeenCalled();
    randomSpy.mockRestore();
  });
});

describe("detonate MST invalid input handling", () => {
  it("throws when the source coordinate is outside the grid", () => {
    const grid = createPlacedGrid(2, 2, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
    ]);

    expect(() =>
      resolveDetonateChain({
        grid,
        sourceCoord: coord(2, 0),
      }),
    ).toThrow(/out of bounds/i);
  });

  it("throws when the source coordinate is negative", () => {
    const grid = createPlacedGrid(2, 2, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
    ]);

    expect(() =>
      buildDetonatePreview({
        grid,
        sourceCoord: coord(-1, 0),
      }),
    ).toThrow(/out of bounds/i);
  });

  it("throws when the grid is empty", () => {
    const grid = createGrid(0, 0, []);

    expect(() =>
      resolveDetonateChain({
        grid,
        sourceCoord: coord(0, 0),
      }),
    ).toThrow(/non-empty/i);
  });

  it("throws when the source cell is a plain Safe cell without a relay", () => {
    const grid = createPlacedGrid(1, 1, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.Safe, 0),
      },
    ]);

    expect(() =>
      resolveDetonateChain({
        grid,
        sourceCoord: coord(0, 0),
      }),
    ).toThrow(/valid ignition node/i);
  });

  it("throws when the source cell is a non-flagged mine", () => {
    const grid = createPlacedGrid(1, 1, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.SafeMine, 0),
      },
    ]);

    expect(() =>
      resolveDetonateChain({
        grid,
        sourceCoord: coord(0, 0),
      }),
    ).toThrow(/valid ignition node/i);
  });

  it("throws when the source cell is Wasteland or Hole", () => {
    const wastelandGrid = createPlacedGrid(1, 1, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.Wasteland, 0, { flagged: true, hasRelayPoint: true }),
      },
    ]);
    const holeGrid = createPlacedGrid(1, 1, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.Hole, 0, { flagged: true, hasRelayPoint: true }),
      },
    ]);

    expect(() =>
      buildDetonatePreview({
        grid: wastelandGrid,
        sourceCoord: coord(0, 0),
      }),
    ).toThrow(/valid ignition node/i);
    expect(() =>
      buildDetonatePreview({
        grid: holeGrid,
        sourceCoord: coord(0, 0),
      }),
    ).toThrow(/valid ignition node/i);
  });

  it("throws when the grid contains missing cells", () => {
    const grid = createGrid(1, 1, new Array<RulesCell>(1));

    expect(() =>
      resolveDetonateChain({
        grid,
        sourceCoord: coord(0, 0),
      }),
    ).toThrow(/missing cells/i);
  });
});

describe("detonate MST integration scenarios", () => {
  it("matches a realistic 8x8 gameplay-like mix of mines, relays, terrain, and a pruned branch", () => {
    const grid = createPlacedGrid(8, 8, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.DangerousMine, 1, { flagged: true }),
      },
      {
        coord: coord(1, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(0, 1),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(2, 0),
        cell: createCell(CellType.DangerousMine, 2, { flagged: true }),
      },
      {
        coord: coord(1, 2),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(3, 1),
        cell: createCell(CellType.SafeMine, 2, { flagged: true }),
      },
      {
        coord: coord(2, 3),
        cell: createCell(CellType.DangerousMine, 3, { flagged: true }),
      },
      {
        coord: coord(4, 2),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(5, 5),
        cell: createCell(CellType.DangerousMine, 1, { flagged: true }),
      },
      {
        coord: coord(6, 1),
        cell: createCell(CellType.DangerousMine, 0),
      },
      {
        coord: coord(6, 6),
        cell: createCell(CellType.SafeMine, 0),
      },
      {
        coord: coord(7, 0),
        cell: createCell(CellType.Wasteland, 0),
      },
      {
        coord: coord(7, 7),
        cell: createCell(CellType.Hole, 0),
      },
    ]);

    const result = resolveDetonateChain({
      grid,
      sourceCoord: coord(0, 0),
    });

    expect(result.resolvedPath).toEqual([
      coord(0, 0),
      coord(1, 0),
      coord(0, 1),
      coord(2, 0),
      coord(1, 2),
      coord(3, 1),
      coord(2, 3),
    ]);
    expect(result.resolvedPath).not.toContainEqual(coord(4, 2));
    expect(result.resolvedPath).not.toContainEqual(coord(5, 5));
    expect(result.dangerousMineCellsConverted).toBe(3);
    expect(result.safeMineCellsConverted).toBe(1);
  });

  it("supports relay bridges across safe territory to connect distant nodes", () => {
    const grid = createPlacedGrid(6, 1, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
      {
        coord: coord(1, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(2, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(3, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(4, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(5, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
    ]);

    const result = buildDetonatePreview({
      grid,
      sourceCoord: coord(0, 0),
    });

    expect(result.provisionalPath).toEqual([
      coord(0, 0),
      coord(1, 0),
      coord(2, 0),
      coord(3, 0),
      coord(4, 0),
      coord(5, 0),
    ]);
  });

  it("tracks every step in a long 11-node chain and ends with an empty remainingPathAfter", () => {
    const placements = Array.from({ length: 11 }, (_, x) => ({
      coord: coord(x, 0),
      cell:
        x === 0 || x === 10
          ? createCell(CellType.DangerousMine, x, { flagged: true })
          : createCell(CellType.Safe, x, { hasRelayPoint: true }),
    }));
    const grid = createPlacedGrid(11, 1, placements);

    const result = resolveDetonateChain({
      grid,
      sourceCoord: coord(0, 0),
    });

    expect(result.resolvedPath).toEqual(placements.map((placement) => placement.coord));
    expect(result.chainSteps).toHaveLength(11);
    expect(result.chainSteps[0]?.remainingPathAfter).toEqual(placements.slice(1).map((p) => p.coord));
    expect(result.chainSteps[9]?.remainingPathAfter).toEqual([coord(10, 0)]);
    expect(result.chainSteps[10]?.remainingPathAfter).toEqual([]);
  });
});

describe("ROUND 2: Critical edge cases from exhaustive analysis", () => {
  it("deterministically resolves the 2x2 corner K4 and keeps the last corner attached to the root", () => {
    const grid = createPlacedGrid(2, 2, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.DangerousMine, 1, { flagged: true }),
      },
      {
        coord: coord(1, 0),
        cell: createCell(CellType.SafeMine, 2, { flagged: true }),
      },
      {
        coord: coord(0, 1),
        cell: createCell(CellType.SafeMine, 3, { flagged: true }),
      },
      {
        coord: coord(1, 1),
        cell: createCell(CellType.DangerousMine, 4, { flagged: true }),
      },
    ]);

    const result = resolveDetonateChain({
      grid,
      sourceCoord: coord(0, 0),
    });

    expect(result.resolvedPath).toEqual([coord(0, 0), coord(1, 0), coord(0, 1), coord(1, 1)]);
    expect(result.dangerousMineCellsConverted).toBe(2);
    expect(result.safeMineCellsConverted).toBe(2);
  });

  it("stops immediately when the source is a SafeMine even if the rooted MST gives it five children", () => {
    const grid = createPlacedGrid(3, 3, [
      {
        coord: coord(1, 1),
        cell: createCell(CellType.SafeMine, 4, { flagged: true }),
      },
      {
        coord: coord(0, 0),
        cell: createCell(CellType.DangerousMine, 1, { flagged: true }),
      },
      {
        coord: coord(1, 0),
        cell: createCell(CellType.Safe, 2, { hasRelayPoint: true }),
      },
      {
        coord: coord(2, 0),
        cell: createCell(CellType.SafeMine, 3, { flagged: true }),
      },
      {
        coord: coord(0, 2),
        cell: createCell(CellType.Safe, 5, { hasRelayPoint: true }),
      },
      {
        coord: coord(2, 2),
        cell: createCell(CellType.DangerousMine, 6, { flagged: true }),
      },
    ]);

    const result = resolveDetonateChain({
      grid,
      sourceCoord: coord(1, 1),
    });

    expect(result.resolvedPath).toEqual([coord(1, 1)]);
    expect(result.chainSteps).toEqual([
      {
        coord: coord(1, 1),
        cellTypeBefore: CellType.SafeMine,
        wasRelayPoint: false,
        remainingPathAfter: [],
      },
    ]);
    expect(result.updatedGrid.cells[indexOf(coord(0, 0), 3)]).toEqual(
      createCell(CellType.DangerousMine, 1, { flagged: true }),
    );
    expect(result.updatedGrid.cells[indexOf(coord(2, 2), 3)]).toEqual(
      createCell(CellType.DangerousMine, 6, { flagged: true }),
    );
  });

  it("excludes flagged Safe cells without relays from the graph when they are not the source", () => {
    const grid = createPlacedGrid(3, 1, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(1, 0),
        cell: createCell(CellType.Safe, 7, { flagged: true }),
      },
      {
        coord: coord(2, 0),
        cell: createCell(CellType.DangerousMine, 1, { flagged: true }),
      },
    ]);

    const result = resolveDetonateChain({
      grid,
      sourceCoord: coord(0, 0),
    });

    expect(result.resolvedPath).toEqual([coord(0, 0), coord(2, 0)]);
    expect(result.resolvedPath).not.toContainEqual(coord(1, 0));
    expect(result.updatedGrid.cells[1]).toEqual(createCell(CellType.Safe, 7, { flagged: true }));
  });

  it("treats a bottom-right source as the root even though it has the highest linear index", () => {
    const grid = createPlacedGrid(3, 3, [
      {
        coord: coord(2, 2),
        cell: createCell(CellType.DangerousMine, 2, { flagged: true }),
      },
      {
        coord: coord(1, 1),
        cell: createCell(CellType.Safe, 1, { hasRelayPoint: true }),
      },
      {
        coord: coord(0, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
    ]);

    const result = buildDetonatePreview({
      grid,
      sourceCoord: coord(2, 2),
    });

    expect(result.provisionalPath).toEqual([coord(2, 2), coord(1, 1), coord(0, 0)]);
  });

  it("uses y * width + x ordering correctly on a wide 20x2 grid", () => {
    const grid = createPlacedGrid(20, 2, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
      {
        coord: coord(0, 1),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(19, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
      {
        coord: coord(19, 1),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
    ]);

    const result = resolveDetonateChain({
      grid,
      sourceCoord: coord(0, 0),
    });

    expect(result.resolvedPath).toEqual([
      coord(0, 0),
      coord(19, 0),
      coord(0, 1),
      coord(19, 1),
    ]);
  });

  it("uses y * width + x ordering correctly on a tall 2x20 grid", () => {
    const grid = createPlacedGrid(2, 20, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
      {
        coord: coord(1, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(0, 19),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
      {
        coord: coord(1, 19),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
    ]);

    const result = resolveDetonateChain({
      grid,
      sourceCoord: coord(0, 0),
    });

    expect(result.resolvedPath).toEqual([
      coord(0, 0),
      coord(1, 0),
      coord(0, 19),
      coord(1, 19),
    ]);
  });

  it("matches a hand-verifiable five-node rooted Prim trace", () => {
    const grid = createPlacedGrid(6, 3, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
      {
        coord: coord(1, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(0, 2),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
      {
        coord: coord(2, 1),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(5, 1),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
    ]);

    const result = buildDetonatePreview({
      grid,
      sourceCoord: coord(0, 0),
    });

    expect(result.provisionalPath).toEqual([
      coord(0, 0),
      coord(1, 0),
      coord(0, 2),
      coord(2, 1),
      coord(5, 1),
    ]);
  });

  it("matches a brute-force minimum spanning-tree weight on a small five-node layout", () => {
    const width = 6;
    const height = 3;
    const nodes = [coord(0, 0), coord(1, 0), coord(0, 2), coord(2, 1), coord(5, 1)];
    const grid = createPlacedGrid(width, height, [
      {
        coord: nodes[0]!,
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
      {
        coord: nodes[1]!,
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: nodes[2]!,
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
      {
        coord: nodes[3]!,
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: nodes[4]!,
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
    ]);

    const chebyshev = (left: GridCoord, right: GridCoord): number =>
      Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y));
    const linearIndex = (target: GridCoord): number => target.y * width + target.x;

    const oracleChildren = nodes.map(() => [] as number[]);
    const oracleParents = Array.from({ length: nodes.length }, () => -1);
    const visited = new Set<number>([0]);

    while (visited.size < nodes.length) {
      let nextChild = -1;
      let nextParent = -1;
      let nextWeight = Number.POSITIVE_INFINITY;
      let nextChildIndex = Number.POSITIVE_INFINITY;
      let nextParentIndex = Number.POSITIVE_INFINITY;

      for (let child = 0; child < nodes.length; child += 1) {
        if (visited.has(child)) {
          continue;
        }

        let bestParent = -1;
        let bestWeight = Number.POSITIVE_INFINITY;
        let bestParentLinearIndex = Number.POSITIVE_INFINITY;

        for (const parent of visited) {
          const weight = chebyshev(nodes[parent]!, nodes[child]!);
          const parentLinearIndex = linearIndex(nodes[parent]!);

          if (
            weight < bestWeight ||
            (weight === bestWeight && parentLinearIndex < bestParentLinearIndex)
          ) {
            bestParent = parent;
            bestWeight = weight;
            bestParentLinearIndex = parentLinearIndex;
          }
        }

        const childLinearIndex = linearIndex(nodes[child]!);

        if (
          bestWeight < nextWeight ||
          (bestWeight === nextWeight && childLinearIndex < nextChildIndex) ||
          (bestWeight === nextWeight &&
            childLinearIndex === nextChildIndex &&
            bestParentLinearIndex < nextParentIndex)
        ) {
          nextChild = child;
          nextParent = bestParent;
          nextWeight = bestWeight;
          nextChildIndex = childLinearIndex;
          nextParentIndex = bestParentLinearIndex;
        }
      }

      oracleParents[nextChild] = nextParent;
      oracleChildren[nextParent]!.push(nextChild);
      visited.add(nextChild);
    }

    for (const childPositions of oracleChildren) {
      childPositions.sort((left, right) => linearIndex(nodes[left]!) - linearIndex(nodes[right]!));
    }

    const oraclePath: GridCoord[] = [];
    const queue = [0];

    for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
      const nodePosition = queue[queueIndex]!;
      oraclePath.push(nodes[nodePosition]!);
      queue.push(...oracleChildren[nodePosition]!);
    }

    const oracleWeight = oracleParents.reduce((total, parent, child) => {
      if (parent === -1) {
        return total;
      }

      return total + chebyshev(nodes[parent]!, nodes[child]!);
    }, 0);

    let minimumWeight = Number.POSITIVE_INFINITY;

    const visitAssignments = (child: number, parents: number[]): void => {
      if (child === nodes.length) {
        const seenValidTree = parents.every((parent, node) => {
          if (node === 0) {
            return parent === -1;
          }

          const encountered = new Set<number>();
          let cursor = node;

          while (cursor !== 0) {
            if (cursor < 0 || encountered.has(cursor)) {
              return false;
            }

            encountered.add(cursor);
            cursor = parents[cursor]!;
          }

          return true;
        });

        if (!seenValidTree) {
          return;
        }

        const totalWeight = parents.reduce((total, parent, node) => {
          if (parent === -1) {
            return total;
          }

          return total + chebyshev(nodes[parent]!, nodes[node]!);
        }, 0);

        minimumWeight = Math.min(minimumWeight, totalWeight);
        return;
      }

      for (let parent = 0; parent < nodes.length; parent += 1) {
        if (parent === child) {
          continue;
        }

        parents[child] = parent;
        visitAssignments(child + 1, parents);
      }
    };

    visitAssignments(1, [-1, -1, -1, -1, -1]);

    const result = buildDetonatePreview({
      grid,
      sourceCoord: coord(0, 0),
    });

    expect(oracleWeight).toBe(minimumWeight);
    expect(result.provisionalPath).toEqual(oraclePath);
  });

  it("chooses minimum connections rather than farthest-first maximum-style links", () => {
    const grid = createPlacedGrid(9, 1, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
      {
        coord: coord(1, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(2, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(8, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
    ]);

    const result = buildDetonatePreview({
      grid,
      sourceCoord: coord(0, 0),
    });

    expect(result.provisionalPath).toEqual([
      coord(0, 0),
      coord(1, 0),
      coord(2, 0),
      coord(8, 0),
    ]);
  });

  it("processes each SafeMine leaf child of a DangerousMine root exactly once without descending past it", () => {
    const grid = createPlacedGrid(5, 5, [
      {
        coord: coord(2, 2),
        cell: createCell(CellType.DangerousMine, 5, { flagged: true }),
      },
      {
        coord: coord(0, 0),
        cell: createCell(CellType.SafeMine, 1, { flagged: true }),
      },
      {
        coord: coord(4, 0),
        cell: createCell(CellType.SafeMine, 2, { flagged: true }),
      },
      {
        coord: coord(0, 4),
        cell: createCell(CellType.SafeMine, 3, { flagged: true }),
      },
      {
        coord: coord(4, 4),
        cell: createCell(CellType.SafeMine, 4, { flagged: true }),
      },
    ]);

    const result = resolveDetonateChain({
      grid,
      sourceCoord: coord(2, 2),
    });

    expect(result.resolvedPath).toEqual([
      coord(2, 2),
      coord(0, 0),
      coord(4, 0),
      coord(0, 4),
      coord(4, 4),
    ]);
    expect(result.dangerousMineCellsConverted).toBe(1);
    expect(result.safeMineCellsConverted).toBe(4);
  });

  it("uses BFS order rather than DFS when one branch has a grandchild and another is still shallow", () => {
    const grid = createPlacedGrid(3, 2, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(1, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
      {
        coord: coord(2, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
      {
        coord: coord(0, 1),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
    ]);

    const result = buildDetonatePreview({
      grid,
      sourceCoord: coord(0, 0),
    });

    expect(result.provisionalPath).toEqual([
      coord(0, 0),
      coord(1, 0),
      coord(0, 1),
      coord(2, 0),
    ]);
  });

  it("keeps a deep six-node tree breadth-first instead of walking one branch to completion", () => {
    const grid = createPlacedGrid(6, 2, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(1, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(2, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(3, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(4, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
      {
        coord: coord(0, 1),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
    ]);

    const result = buildDetonatePreview({
      grid,
      sourceCoord: coord(0, 0),
    });

    expect(result.provisionalPath).toEqual([
      coord(0, 0),
      coord(1, 0),
      coord(0, 1),
      coord(2, 0),
      coord(3, 0),
      coord(4, 0),
    ]);
  });
});

describe("ROUND 2: Spec contradiction and ambiguity resolution", () => {
  it("returns top-level remainingPath as the full resolvedPath and per-step suffixes after each processed node", () => {
    const grid = createPlacedGrid(3, 3, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
      {
        coord: coord(1, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(2, 0),
        cell: createCell(CellType.SafeMine, 0, { flagged: true }),
      },
      {
        coord: coord(0, 1),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(0, 2),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
    ]);

    const result = resolveDetonateChain({
      grid,
      sourceCoord: coord(0, 0),
    });

    expect(result.resolvedPath).toEqual([
      coord(0, 0),
      coord(1, 0),
      coord(0, 1),
      coord(2, 0),
      coord(0, 2),
    ]);
    expect(result.remainingPath).toEqual(result.resolvedPath);
    expect(result.chainSteps.map((step) => step.remainingPathAfter)).toEqual([
      [coord(1, 0), coord(0, 1), coord(2, 0), coord(0, 2)],
      [coord(0, 1), coord(2, 0), coord(0, 2)],
      [coord(2, 0), coord(0, 2)],
      [coord(0, 2)],
      [],
    ]);
  });

  it("freezes SafeMine pruning from the resolve-start snapshot even though the updatedGrid turns that source into Safe", () => {
    const grid = createPlacedGrid(3, 3, [
      {
        coord: coord(1, 1),
        cell: createCell(CellType.SafeMine, 3, { flagged: true }),
      },
      {
        coord: coord(0, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
      {
        coord: coord(2, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(0, 2),
        cell: createCell(CellType.SafeMine, 0, { flagged: true }),
      },
    ]);

    const result = resolveDetonateChain({
      grid,
      sourceCoord: coord(1, 1),
    });

    expect(result.resolvedPath).toEqual([coord(1, 1)]);
    expect(result.updatedGrid.cells[indexOf(coord(1, 1), 3)]).toEqual(
      createCell(CellType.Safe, 3, { flagged: false, hasRelayPoint: false }),
    );
    expect(result.updatedGrid.cells[indexOf(coord(0, 0), 3)]).toEqual(
      createCell(CellType.DangerousMine, 0, { flagged: true }),
    );
  });

  it("records chain-step metadata from the pre-mutation resolve snapshot on a mixed branched tree", () => {
    const grid = createPlacedGrid(3, 2, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.DangerousMine, 1, { flagged: true, hasRelayPoint: true }),
      },
      {
        coord: coord(1, 0),
        cell: createCell(CellType.Safe, 2, { hasRelayPoint: true }),
      },
      {
        coord: coord(2, 0),
        cell: createCell(CellType.SafeMine, 3, { flagged: true }),
      },
      {
        coord: coord(0, 1),
        cell: createCell(CellType.DangerousMine, 4, { flagged: true, hasRelayPoint: true }),
      },
    ]);

    const result = resolveDetonateChain({
      grid,
      sourceCoord: coord(0, 0),
    });

    expect(result.chainSteps).toEqual([
      {
        coord: coord(0, 0),
        cellTypeBefore: CellType.DangerousMine,
        wasRelayPoint: true,
        remainingPathAfter: [coord(1, 0), coord(0, 1), coord(2, 0)],
      },
      {
        coord: coord(1, 0),
        cellTypeBefore: CellType.Safe,
        wasRelayPoint: true,
        remainingPathAfter: [coord(0, 1), coord(2, 0)],
      },
      {
        coord: coord(0, 1),
        cellTypeBefore: CellType.DangerousMine,
        wasRelayPoint: true,
        remainingPathAfter: [coord(2, 0)],
      },
      {
        coord: coord(2, 0),
        cellTypeBefore: CellType.SafeMine,
        wasRelayPoint: false,
        remainingPathAfter: [],
      },
    ]);
  });

  it("ignores erosionWarning for path construction and counts while still preserving it in updatedGrid", () => {
    const basePlacements = [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.DangerousMine, 1, { flagged: true }),
      },
      {
        coord: coord(1, 0),
        cell: createCell(CellType.Safe, 2, { hasRelayPoint: true }),
      },
      {
        coord: coord(2, 0),
        cell: createCell(CellType.SafeMine, 3, { flagged: true }),
      },
      {
        coord: coord(0, 1),
        cell: createCell(CellType.Safe, 4),
      },
    ];
    const warningGrid = createPlacedGrid(3, 2, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.DangerousMine, 1, { flagged: true, erosionWarning: true }),
      },
      {
        coord: coord(1, 0),
        cell: createCell(CellType.Safe, 2, { hasRelayPoint: true, erosionWarning: true }),
      },
      {
        coord: coord(2, 0),
        cell: createCell(CellType.SafeMine, 3, { flagged: true, erosionWarning: true }),
      },
      {
        coord: coord(0, 1),
        cell: createCell(CellType.Safe, 4, { erosionWarning: true }),
      },
    ]);
    const calmGrid = createPlacedGrid(3, 2, basePlacements);

    const warned = resolveDetonateChain({
      grid: warningGrid,
      sourceCoord: coord(0, 0),
    });
    const calm = resolveDetonateChain({
      grid: calmGrid,
      sourceCoord: coord(0, 0),
    });

    expect(warned.resolvedPath).toEqual(calm.resolvedPath);
    expect(warned.processedCells).toEqual(calm.processedCells);
    expect(warned.remainingPath).toEqual(calm.remainingPath);
    expect(warned.safeMineCellsConverted).toBe(calm.safeMineCellsConverted);
    expect(warned.dangerousMineCellsConverted).toBe(calm.dangerousMineCellsConverted);
    expect(warned.updatedGrid.cells.map((cell) => cell.erosionWarning)).toEqual(
      warningGrid.cells.map((cell) => cell.erosionWarning),
    );
    expect(calm.updatedGrid.cells.map((cell) => cell.erosionWarning)).toEqual(
      calmGrid.cells.map((cell) => cell.erosionWarning),
    );
  });
});

describe("ROUND 2: Property-based invariants (PBT-style)", () => {
  const scenarioFactories = [
    {
      sourceCoord: coord(0, 0),
      createGrid: () =>
        createPlacedGrid(4, 2, [
          {
            coord: coord(0, 0),
            cell: createCell(CellType.DangerousMine, 1, { flagged: true }),
          },
          {
            coord: coord(1, 0),
            cell: createCell(CellType.Safe, 2, { hasRelayPoint: true }),
          },
          {
            coord: coord(2, 0),
            cell: createCell(CellType.SafeMine, 3, { flagged: true }),
          },
          {
            coord: coord(0, 1),
            cell: createCell(CellType.Safe, 4, { hasRelayPoint: true }),
          },
          {
            coord: coord(1, 1),
            cell: createCell(CellType.DangerousMine, 5, { flagged: true }),
          },
        ]),
    },
    {
      sourceCoord: coord(1, 1),
      createGrid: () =>
        createPlacedGrid(3, 3, [
          {
            coord: coord(1, 1),
            cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
          },
          {
            coord: coord(0, 0),
            cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
          },
          {
            coord: coord(2, 0),
            cell: createCell(CellType.SafeMine, 1, { flagged: true }),
          },
          {
            coord: coord(0, 2),
            cell: createCell(CellType.Safe, 2, { hasRelayPoint: true }),
          },
          {
            coord: coord(2, 2),
            cell: createCell(CellType.DangerousMine, 3, { flagged: true }),
          },
        ]),
    },
    {
      sourceCoord: coord(2, 2),
      createGrid: () =>
        createPlacedGrid(4, 4, [
          {
            coord: coord(2, 2),
            cell: createCell(CellType.DangerousMine, 6, { flagged: true }),
          },
          {
            coord: coord(1, 1),
            cell: createCell(CellType.Safe, 5, { hasRelayPoint: true }),
          },
          {
            coord: coord(0, 0),
            cell: createCell(CellType.SafeMine, 4, { flagged: true }),
          },
          {
            coord: coord(3, 0),
            cell: createCell(CellType.DangerousMine, 3, { flagged: true }),
          },
          {
            coord: coord(0, 3),
            cell: createCell(CellType.Safe, 2, { hasRelayPoint: true }),
          },
        ]),
    },
    {
      sourceCoord: coord(0, 0),
      createGrid: () =>
        createPlacedGrid(6, 2, [
          {
            coord: coord(0, 0),
            cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
          },
          {
            coord: coord(1, 0),
            cell: createCell(CellType.Safe, 1, { hasRelayPoint: true }),
          },
          {
            coord: coord(2, 0),
            cell: createCell(CellType.Safe, 2, { hasRelayPoint: true }),
          },
          {
            coord: coord(3, 0),
            cell: createCell(CellType.SafeMine, 3, { flagged: true }),
          },
          {
            coord: coord(0, 1),
            cell: createCell(CellType.DangerousMine, 4, { flagged: true }),
          },
        ]),
    },
  ];

  it("keeps sourceCoord first and never duplicates coordinates across the sample corpus", () => {
    for (const scenario of scenarioFactories) {
      const result = resolveDetonateChain({
        grid: scenario.createGrid(),
        sourceCoord: scenario.sourceCoord,
      });
      const uniqueCoords = new Set(result.resolvedPath.map(({ x, y }) => `${x},${y}`));

      expect(result.resolvedPath[0]).toEqual(scenario.sourceCoord);
      expect(uniqueCoords.size).toBe(result.resolvedPath.length);
    }
  });

  it("always returns processedCells equal to resolvedPath", () => {
    for (const scenario of scenarioFactories) {
      const result = resolveDetonateChain({
        grid: scenario.createGrid(),
        sourceCoord: scenario.sourceCoord,
      });

      expect(result.processedCells).toEqual(result.resolvedPath);
    }
  });

  it("keeps chainSteps aligned one-to-one with resolvedPath", () => {
    for (const scenario of scenarioFactories) {
      const result = resolveDetonateChain({
        grid: scenario.createGrid(),
        sourceCoord: scenario.sourceCoord,
      });

      expect(result.chainSteps).toHaveLength(result.resolvedPath.length);
      expect(result.chainSteps.map((step) => step.coord)).toEqual(result.resolvedPath);
    }
  });

  it("keeps top-level remainingPath equal to the full resolvedPath and step suffixes perfectly decreasing", () => {
    for (const scenario of scenarioFactories) {
      const result = resolveDetonateChain({
        grid: scenario.createGrid(),
        sourceCoord: scenario.sourceCoord,
      });

      expect(result.remainingPath).toEqual(result.resolvedPath);
      expect(result.chainSteps.map((step, index) => step.remainingPathAfter)).toEqual(
        result.resolvedPath.map((_, index) => result.resolvedPath.slice(index + 1)),
      );
    }
  });

  it("never mutates non-path cells in updatedGrid", () => {
    for (const scenario of scenarioFactories) {
      const grid = scenario.createGrid();
      const result = resolveDetonateChain({
        grid,
        sourceCoord: scenario.sourceCoord,
      });
      const pathIndexes = new Set(result.resolvedPath.map((target) => indexOf(target, grid.width)));

      grid.cells.forEach((cell, index) => {
        if (!pathIndexes.has(index)) {
          expect(result.updatedGrid.cells[index]).toEqual(cell);
        }
      });
    }
  });

  it("always clears flagged and relay markers on every processed path cell", () => {
    for (const scenario of scenarioFactories) {
      const result = resolveDetonateChain({
        grid: scenario.createGrid(),
        sourceCoord: scenario.sourceCoord,
      });

      for (const target of result.resolvedPath) {
        const updatedCell = result.updatedGrid.cells[indexOf(target, result.updatedGrid.width)]!;

        expect(updatedCell.cellType).toBe(CellType.Safe);
        expect(updatedCell.flagged).toBe(false);
        expect(updatedCell.hasRelayPoint).toBe(false);
      }
    }
  });

  it("keeps conversion counters equal to the pre-mutation mine types that actually appear in resolvedPath", () => {
    for (const scenario of scenarioFactories) {
      const grid = scenario.createGrid();
      const result = resolveDetonateChain({
        grid,
        sourceCoord: scenario.sourceCoord,
      });
      const pathCells = result.resolvedPath.map((target) => grid.cells[indexOf(target, grid.width)]!);
      const dangerousCount = pathCells.filter((cell) => cell.cellType === CellType.DangerousMine).length;
      const safeCount = pathCells.filter((cell) => cell.cellType === CellType.SafeMine).length;

      expect(result.dangerousMineCellsConverted).toBe(dangerousCount);
      expect(result.safeMineCellsConverted).toBe(safeCount);
    }
  });

  it("only processes nodes that were eligible in the resolve snapshot", () => {
    for (const scenario of scenarioFactories) {
      const grid = scenario.createGrid();
      const result = resolveDetonateChain({
        grid,
        sourceCoord: scenario.sourceCoord,
      });

      for (const target of result.resolvedPath.slice(1)) {
        const cell = grid.cells[indexOf(target, grid.width)]!;
        const isEligibleNode =
          (cell.flagged &&
            (cell.cellType === CellType.SafeMine || cell.cellType === CellType.DangerousMine)) ||
          (cell.cellType === CellType.Safe && cell.hasRelayPoint);

        expect(isEligibleNode).toBe(true);
      }
    }
  });

  it("is deterministic across repeated preview and resolve calls for the same sampled inputs", () => {
    for (const scenario of scenarioFactories) {
      const previewGrid = scenario.createGrid();
      const resolveGrid = scenario.createGrid();
      const previewA = buildDetonatePreview({
        grid: previewGrid,
        sourceCoord: scenario.sourceCoord,
      });
      const previewB = buildDetonatePreview({
        grid: scenario.createGrid(),
        sourceCoord: scenario.sourceCoord,
      });
      const resolveA = resolveDetonateChain({
        grid: resolveGrid,
        sourceCoord: scenario.sourceCoord,
      });
      const resolveB = resolveDetonateChain({
        grid: scenario.createGrid(),
        sourceCoord: scenario.sourceCoord,
      });

      expect(previewA).toEqual(previewB);
      expect(resolveA).toEqual(resolveB);
      expect(previewA.provisionalPath).not.toBe(previewB.provisionalPath);
      expect(resolveA.resolvedPath).not.toBe(resolveB.resolvedPath);
      expect(resolveA.chainSteps).not.toBe(resolveB.chainSteps);
    }
  });
});

describe("ROUND 2: Mutation semantics deep verification", () => {
  it("preserves adjacentMineCount = 7 when converting a DangerousMine source", () => {
    const result = resolveDetonateChain({
      grid: createPlacedGrid(1, 1, [
        {
          coord: coord(0, 0),
          cell: createCell(CellType.DangerousMine, 7, { flagged: true }),
        },
      ]),
      sourceCoord: coord(0, 0),
    });

    expect(result.updatedGrid.cells[0]).toEqual(
      createCell(CellType.Safe, 7, { flagged: false, hasRelayPoint: false }),
    );
  });

  it("preserves adjacentMineCount = 0 when converting a SafeMine source", () => {
    const result = resolveDetonateChain({
      grid: createPlacedGrid(1, 1, [
        {
          coord: coord(0, 0),
          cell: createCell(CellType.SafeMine, 0, { flagged: true }),
        },
      ]),
      sourceCoord: coord(0, 0),
    });

    expect(result.updatedGrid.cells[0]).toEqual(
      createCell(CellType.Safe, 0, { flagged: false, hasRelayPoint: false }),
    );
  });

  it("preserves adjacentMineCount = 8 when clearing a relay node", () => {
    const result = resolveDetonateChain({
      grid: createPlacedGrid(1, 1, [
        {
          coord: coord(0, 0),
          cell: createCell(CellType.Safe, 8, { flagged: true, hasRelayPoint: true }),
        },
      ]),
      sourceCoord: coord(0, 0),
    });

    expect(result.updatedGrid.cells[0]).toEqual(
      createCell(CellType.Safe, 8, { flagged: false, hasRelayPoint: false }),
    );
  });

  it("clears all three source conditions on a DangerousMine that is flagged and defensively marked as a relay", () => {
    const result = resolveDetonateChain({
      grid: createPlacedGrid(2, 1, [
        {
          coord: coord(0, 0),
          cell: createCell(CellType.DangerousMine, 4, { flagged: true, hasRelayPoint: true }),
        },
        {
          coord: coord(1, 0),
          cell: createCell(CellType.Safe, 1, { hasRelayPoint: true }),
        },
      ]),
      sourceCoord: coord(0, 0),
    });

    expect(result.resolvedPath).toEqual([coord(0, 0), coord(1, 0)]);
    expect(result.dangerousMineCellsConverted).toBe(1);
    expect(result.updatedGrid.cells[0]).toEqual(
      createCell(CellType.Safe, 4, { flagged: false, hasRelayPoint: false }),
    );
  });

  it("preserves erosionWarning on every processed path cell while clearing detonate-specific state", () => {
    const grid = createPlacedGrid(3, 1, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.DangerousMine, 1, { flagged: true, erosionWarning: true }),
      },
      {
        coord: coord(1, 0),
        cell: createCell(CellType.Safe, 2, { hasRelayPoint: true, erosionWarning: true }),
      },
      {
        coord: coord(2, 0),
        cell: createCell(CellType.SafeMine, 3, { flagged: true, erosionWarning: true }),
      },
    ]);

    const result = resolveDetonateChain({
      grid,
      sourceCoord: coord(0, 0),
    });

    expect(result.updatedGrid.cells[0]).toEqual(
      createCell(CellType.Safe, 1, {
        flagged: false,
        hasRelayPoint: false,
        erosionWarning: true,
      }),
    );
    expect(result.updatedGrid.cells[1]).toEqual(
      createCell(CellType.Safe, 2, {
        flagged: false,
        hasRelayPoint: false,
        erosionWarning: true,
      }),
    );
    expect(result.updatedGrid.cells[2]).toEqual(
      createCell(CellType.Safe, 3, {
        flagged: false,
        hasRelayPoint: false,
        erosionWarning: true,
      }),
    );
  });

  it("preserves erosionWarning on untouched non-path cells as well", () => {
    const grid = createPlacedGrid(3, 1, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
      {
        coord: coord(1, 0),
        cell: createCell(CellType.SafeMine, 8, { erosionWarning: true }),
      },
    ]);

    const result = resolveDetonateChain({
      grid,
      sourceCoord: coord(0, 0),
    });

    expect(result.resolvedPath).toEqual([coord(0, 0)]);
    expect(result.updatedGrid.cells[1]).toEqual(
      createCell(CellType.SafeMine, 8, { erosionWarning: true }),
    );
  });
});

describe("ROUND 2: Preview/resolve divergence edge cases", () => {
  it("throws at resolve time when a preview-valid DangerousMine source loses its flag before resolution", () => {
    const previewGrid = createPlacedGrid(2, 1, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
      {
        coord: coord(1, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
    ]);
    const resolveGrid = createPlacedGrid(2, 1, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.DangerousMine, 0),
      },
      {
        coord: coord(1, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
    ]);

    expect(
      buildDetonatePreview({
        grid: previewGrid,
        sourceCoord: coord(0, 0),
      }).provisionalPath,
    ).toEqual([coord(0, 0), coord(1, 0)]);
    expect(() =>
      resolveDetonateChain({
        grid: resolveGrid,
        sourceCoord: coord(0, 0),
      }),
    ).toThrow(/valid ignition node/i);
  });

  it("throws at resolve time when a preview-valid relay source loses its relay marker before resolution", () => {
    const previewGrid = createPlacedGrid(2, 1, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(1, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
    ]);
    const resolveGrid = createPlacedGrid(2, 1, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.Safe, 0),
      },
      {
        coord: coord(1, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
    ]);

    expect(
      buildDetonatePreview({
        grid: previewGrid,
        sourceCoord: coord(0, 0),
      }).provisionalPath,
    ).toEqual([coord(0, 0), coord(1, 0)]);
    expect(() =>
      resolveDetonateChain({
        grid: resolveGrid,
        sourceCoord: coord(0, 0),
      }),
    ).toThrow(/valid ignition node/i);
  });

  it("shrinks to the root when the source changes from DangerousMine to flagged SafeMine before resolve", () => {
    const previewGrid = createPlacedGrid(3, 1, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.DangerousMine, 1, { flagged: true }),
      },
      {
        coord: coord(1, 0),
        cell: createCell(CellType.Safe, 2, { hasRelayPoint: true }),
      },
      {
        coord: coord(2, 0),
        cell: createCell(CellType.DangerousMine, 3, { flagged: true }),
      },
    ]);
    const resolveGrid = createPlacedGrid(3, 1, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.SafeMine, 1, { flagged: true }),
      },
      {
        coord: coord(1, 0),
        cell: createCell(CellType.Safe, 2, { hasRelayPoint: true }),
      },
      {
        coord: coord(2, 0),
        cell: createCell(CellType.DangerousMine, 3, { flagged: true }),
      },
    ]);

    const preview = buildDetonatePreview({
      grid: previewGrid,
      sourceCoord: coord(0, 0),
    });
    const resolved = resolveDetonateChain({
      grid: resolveGrid,
      sourceCoord: coord(0, 0),
    });

    expect(preview.provisionalPath).toEqual([coord(0, 0), coord(1, 0), coord(2, 0)]);
    expect(resolved.resolvedPath).toEqual([coord(0, 0)]);
    expect(resolved.safeMineCellsConverted).toBe(1);
    expect(resolved.dangerousMineCellsConverted).toBe(0);
  });

  it("expands beyond the root when the source changes from flagged SafeMine to DangerousMine before resolve", () => {
    const previewGrid = createPlacedGrid(3, 1, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.SafeMine, 1, { flagged: true }),
      },
      {
        coord: coord(1, 0),
        cell: createCell(CellType.Safe, 2, { hasRelayPoint: true }),
      },
      {
        coord: coord(2, 0),
        cell: createCell(CellType.DangerousMine, 3, { flagged: true }),
      },
    ]);
    const resolveGrid = createPlacedGrid(3, 1, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.DangerousMine, 1, { flagged: true }),
      },
      {
        coord: coord(1, 0),
        cell: createCell(CellType.Safe, 2, { hasRelayPoint: true }),
      },
      {
        coord: coord(2, 0),
        cell: createCell(CellType.DangerousMine, 3, { flagged: true }),
      },
    ]);

    const preview = buildDetonatePreview({
      grid: previewGrid,
      sourceCoord: coord(0, 0),
    });
    const resolved = resolveDetonateChain({
      grid: resolveGrid,
      sourceCoord: coord(0, 0),
    });

    expect(preview.provisionalPath).toEqual([coord(0, 0)]);
    expect(resolved.resolvedPath).toEqual([coord(0, 0), coord(1, 0), coord(2, 0)]);
    expect(resolved.dangerousMineCellsConverted).toBe(2);
    expect(resolved.safeMineCellsConverted).toBe(0);
  });

  it("re-resolves descendant pruning when a future node changes from DangerousMine to SafeMine before resolve", () => {
    const previewGrid = createPlacedGrid(4, 1, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(1, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
      {
        coord: coord(2, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(3, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
    ]);
    const resolveGrid = createPlacedGrid(4, 1, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(1, 0),
        cell: createCell(CellType.SafeMine, 0, { flagged: true }),
      },
      {
        coord: coord(2, 0),
        cell: createCell(CellType.Safe, 0, { hasRelayPoint: true }),
      },
      {
        coord: coord(3, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
    ]);

    const preview = buildDetonatePreview({
      grid: previewGrid,
      sourceCoord: coord(0, 0),
    });
    const resolved = resolveDetonateChain({
      grid: resolveGrid,
      sourceCoord: coord(0, 0),
    });

    expect(preview.provisionalPath).toEqual([
      coord(0, 0),
      coord(1, 0),
      coord(2, 0),
      coord(3, 0),
    ]);
    expect(resolved.resolvedPath).toEqual([coord(0, 0), coord(1, 0)]);
    expect(resolved.safeMineCellsConverted).toBe(1);
    expect(resolved.dangerousMineCellsConverted).toBe(0);
  });
});

describe("ROUND 2: Error handling completeness", () => {
  it.each([
    ["NaN width", Number.NaN, 1],
    ["Infinity height", 1, Number.POSITIVE_INFINITY],
    ["-Infinity width", Number.NEGATIVE_INFINITY, 1],
    ["fractional height", 1, 0.5],
  ])("throws when grid dimensions are not integers (%s)", (_label, width, height) => {
    const grid = createGrid(width, height, []);

    expect(() =>
      resolveDetonateChain({
        grid,
        sourceCoord: coord(0, 0),
      }),
    ).toThrow(/dimensions must be integers/i);
  });

  it("throws when the grid cell count is smaller than width * height", () => {
    const grid = createGrid(2, 2, [createCell(CellType.DangerousMine, 0, { flagged: true })]);

    expect(() =>
      resolveDetonateChain({
        grid,
        sourceCoord: coord(0, 0),
      }),
    ).toThrow(/cell count does not match/i);
  });

  it("throws when the grid cell count is larger than width * height", () => {
    const grid = createGrid(1, 1, [
      createCell(CellType.DangerousMine, 0, { flagged: true }),
      createCell(CellType.Safe, 0),
    ]);

    expect(() =>
      buildDetonatePreview({
        grid,
        sourceCoord: coord(0, 0),
      }),
    ).toThrow(/cell count does not match/i);
  });

  it.each([
    ["fractional x", { x: 1.5, y: 0 }],
    ["fractional y", { x: 0, y: 2.7 }],
    ["NaN x", { x: Number.NaN, y: 0 }],
    ["Infinity y", { x: 0, y: Number.POSITIVE_INFINITY }],
  ])("throws when the source coordinate is not a finite in-bounds integer (%s)", (_label, sourceCoord) => {
    const grid = createPlacedGrid(3, 3, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.DangerousMine, 0, { flagged: true }),
      },
    ]);

    expect(() =>
      buildDetonatePreview({
        grid,
        sourceCoord,
      }),
    ).toThrow(/out of bounds/i);
  });

  it("throws when the grid contains an explicit null cell entry", () => {
    const cells = [createCell(CellType.DangerousMine, 0, { flagged: true })];
    Reflect.set(cells, 0, null);
    const grid = createGrid(1, 1, cells);

    expect(() =>
      resolveDetonateChain({
        grid,
        sourceCoord: coord(0, 0),
      }),
    ).toThrow(/missing cells/i);
  });

  it("throws when the source is a flagged Safe cell without a relay", () => {
    const grid = createPlacedGrid(1, 1, [
      {
        coord: coord(0, 0),
        cell: createCell(CellType.Safe, 0, { flagged: true }),
      },
    ]);

    expect(() =>
      resolveDetonateChain({
        grid,
        sourceCoord: coord(0, 0),
      }),
    ).toThrow(/valid ignition node/i);
  });

  it("rejects an out-of-enum source cellType as an invalid ignition node", () => {
    const invalidCellType = 99 as CellType;
    const grid = createGrid(1, 1, [
      {
        cellType: invalidCellType,
        adjacentMineCount: 0,
        flagged: true,
        hasRelayPoint: true,
        erosionWarning: false,
      },
    ]);

    expect(() =>
      buildDetonatePreview({
        grid,
        sourceCoord: coord(0, 0),
      }),
    ).toThrow(/valid ignition node/i);
  });
});

function coord(x: number, y: number): GridCoord {
  return { x, y };
}

function createPlacedGrid(
  width: number,
  height: number,
  placements: Array<{ coord: GridCoord; cell: RulesCell }>,
): RulesGrid {
  const cells = Array.from({ length: width * height }, () => createCell(CellType.Safe, 0));

  for (const placement of placements) {
    cells[indexOf(placement.coord, width)] = { ...placement.cell };
  }

  return createGrid(width, height, cells);
}

function createGrid(width: number, height: number, cells: RulesCell[]): RulesGrid {
  return {
    width,
    height,
    cells,
  };
}

function createCell(
  cellType: CellType,
  adjacentMineCount: number,
  overrides: Partial<Pick<RulesCell, "flagged" | "hasRelayPoint" | "erosionWarning">> = {},
): RulesCell {
  return {
    cellType,
    adjacentMineCount,
    flagged: false,
    hasRelayPoint: false,
    erosionWarning: false,
    ...overrides,
  };
}

function indexOf(target: GridCoord, width: number): number {
  return target.y * width + target.x;
}
