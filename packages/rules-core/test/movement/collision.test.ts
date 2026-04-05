import { describe, expect, it } from "vitest";

import { resolveAlivePlayerCollisions } from "../../src/movement/collision.js";

describe("AABB collision resolution", () => {
  it("returns no moved players when overlapX = 0, because collision requires overlapX > 0 and overlapY > 0", () => {
    const resolved = resolveAlivePlayerCollisions({
      alivePlayers: [
        { sessionId: "a", position: { x: 0, y: 0 } },
        { sessionId: "b", position: { x: 2, y: 0 } },
      ],
      radius: { x: 1, y: 1 },
    });

    expect(Array.from(resolved.entries())).toEqual([]);
  });

  it("pushes on the X axis when overlapX <= overlapY", () => {
    const resolved = resolveAlivePlayerCollisions({
      alivePlayers: [
        { sessionId: "a", position: { x: 0, y: 0 } },
        { sessionId: "b", position: { x: 1, y: 0 } },
      ],
      radius: { x: 1, y: 1 },
    });

    expect(Array.from(resolved.entries())).toEqual([
      ["a", { x: -0.5, y: 0 }],
      ["b", { x: 1.5, y: 0 }],
    ]);
  });

  it("pushes on the Y axis when overlapY is the shorter axis", () => {
    const resolved = resolveAlivePlayerCollisions({
      alivePlayers: [
        { sessionId: "a", position: { x: 0, y: 0 } },
        { sessionId: "b", position: { x: 0, y: 1 } },
      ],
      radius: { x: 2, y: 1 },
    });

    expect(Array.from(resolved.entries())).toEqual([
      ["a", { x: 0, y: -0.5 }],
      ["b", { x: 0, y: 1.5 }],
    ]);
  });

  it("uses X-axis priority and +1 direction for the dx=0, dy=0 tie-break", () => {
    const resolved = resolveAlivePlayerCollisions({
      alivePlayers: [
        { sessionId: "a", position: { x: 0, y: 0 } },
        { sessionId: "b", position: { x: 0, y: 0 } },
      ],
      radius: { x: 1, y: 1 },
    });

    expect(Array.from(resolved.entries())).toEqual([
      ["a", { x: -1, y: 0 }],
      ["b", { x: 1, y: 0 }],
    ]);
  });

  it("matches the spec's iterative resolution and returns only moved players", () => {
    const input = {
      alivePlayers: [
        { sessionId: "a", position: { x: 0, y: 0 } },
        { sessionId: "b", position: { x: 1, y: 0 } },
        { sessionId: "c", position: { x: 2, y: 0 } },
        { sessionId: "d", position: { x: 10, y: 0 } },
      ],
      radius: { x: 1, y: 1 },
    };

    const resolved = resolveAlivePlayerCollisions(input);

    expect(Array.from(resolved.entries())).toEqual(
      Array.from(resolveAlivePlayerCollisionsBySpec(input).entries()),
    );
    expect(resolved.has("d")).toBe(false);
  });
});

function resolveAlivePlayerCollisionsBySpec(input: {
  alivePlayers: Array<{ sessionId: string; position: { x: number; y: number } }>;
  radius: { x: number; y: number };
}): Map<string, { x: number; y: number }> {
  const originalPositions = input.alivePlayers.map((player) => ({
    sessionId: player.sessionId,
    position: { ...player.position },
  }));
  const resolvedPositions = input.alivePlayers.map((player) => ({
    sessionId: player.sessionId,
    position: { ...player.position },
  }));
  const maxIterations = Math.max(1, input.alivePlayers.length ** 2 * 4);

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    let changed = false;

    for (let leftIndex = 0; leftIndex < resolvedPositions.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < resolvedPositions.length; rightIndex += 1) {
        const left = resolvedPositions[leftIndex]!;
        const right = resolvedPositions[rightIndex]!;
        const dx = right.position.x - left.position.x;
        const dy = right.position.y - left.position.y;
        const overlapX = input.radius.x * 2 - Math.abs(dx);
        const overlapY = input.radius.y * 2 - Math.abs(dy);

        if (overlapX <= 0 || overlapY <= 0) {
          continue;
        }

        changed = true;

        if (overlapX <= overlapY) {
          const direction = dx === 0 ? 1 : Math.sign(dx);
          const pushAmount = overlapX / 2;

          left.position.x -= direction * pushAmount;
          right.position.x += direction * pushAmount;
        } else {
          const direction = dy === 0 ? 1 : Math.sign(dy);
          const pushAmount = overlapY / 2;

          left.position.y -= direction * pushAmount;
          right.position.y += direction * pushAmount;
        }
      }
    }

    if (!changed) {
      break;
    }
  }

  const movedPlayers = new Map<string, { x: number; y: number }>();

  for (let index = 0; index < resolvedPositions.length; index += 1) {
    const resolved = resolvedPositions[index]!;
    const original = originalPositions[index]!;

    if (
      resolved.position.x !== original.position.x ||
      resolved.position.y !== original.position.y
    ) {
      movedPlayers.set(resolved.sessionId, {
        x: normalizeSignedZero(resolved.position.x),
        y: normalizeSignedZero(resolved.position.y),
      });
    }
  }

  return movedPlayers;
}

function normalizeSignedZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}
