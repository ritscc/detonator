import { describe, expect, it } from "vitest";

import {
  collectCheckpointOnOverlap,
  detectCheckpointsInRange,
} from "../../src/checkpoint/detection.js";
import type { CheckpointModel } from "../../src/types.js";

describe("checkpoint detection", () => {
  it("uses the default spec radius 3 with inclusive Euclidean dist² <= R² filtering", () => {
    expect(
      detectCheckpointsInRange({
        playerCoord: { x: 0, y: 0 },
        checkpoints: [
          createCheckpoint("origin", { x: 0, y: 0 }, false),
          createCheckpoint("boundary-axis", { x: 3, y: 0 }, false),
          createCheckpoint("boundary-diagonal", { x: 2, y: 2 }, false),
          createCheckpoint("outside", { x: 3, y: 1 }, false),
          createCheckpoint("collected", { x: 1, y: 1 }, true),
        ],
        detectionRadius: 3,
      }),
    ).toEqual(["origin", "boundary-axis", "boundary-diagonal"]);
  });

  it("includes checkpoints exactly on the Euclidean boundary because the comparison is <=", () => {
    expect(
      detectCheckpointsInRange({
        playerCoord: { x: 5, y: 5 },
        checkpoints: [createCheckpoint("edge", { x: 8, y: 5 }, false)],
        detectionRadius: 3,
      }),
    ).toEqual(["edge"]);
  });

  it("excludes checkpoints when dist² is greater than R²", () => {
    expect(
      detectCheckpointsInRange({
        playerCoord: { x: 0, y: 0 },
        checkpoints: [createCheckpoint("outside", { x: 2, y: 2 }, false)],
        detectionRadius: 2,
      }),
    ).toEqual([]);
  });

  it("with radius 0 detects only a checkpoint on the exact same cell", () => {
    expect(
      detectCheckpointsInRange({
        playerCoord: { x: 2, y: 2 },
        checkpoints: [
          createCheckpoint("same-cell", { x: 2, y: 2 }, false),
          createCheckpoint("adjacent", { x: 2, y: 3 }, false),
        ],
        detectionRadius: 0,
      }),
    ).toEqual(["same-cell"]);
  });

  it("collectCheckpointOnOverlap returns the first uncollected checkpoint whose x and y exactly match the player cell", () => {
    const first = createCheckpoint("first", { x: 3, y: 4 }, false);
    const second = createCheckpoint("second", { x: 3, y: 4 }, false);

    expect(
      collectCheckpointOnOverlap({
        playerCoord: { x: 3, y: 4 },
        checkpoints: [createCheckpoint("collected", { x: 3, y: 4 }, true), first, second],
      }),
    ).toBe(first);
  });

  it("returns null when no uncollected checkpoint exactly overlaps the player cell", () => {
    expect(
      collectCheckpointOnOverlap({
        playerCoord: { x: 5, y: 5 },
        checkpoints: [
          createCheckpoint("different-x", { x: 4, y: 5 }, false),
          createCheckpoint("different-y", { x: 5, y: 4 }, false),
          createCheckpoint("collected-overlap", { x: 5, y: 5 }, true),
        ],
      }),
    ).toBeNull();
  });
});

function createCheckpoint(
  cpId: string,
  coord: { x: number; y: number },
  collected: boolean,
): CheckpointModel {
  return {
    cpId,
    coord,
    collected,
  };
}
