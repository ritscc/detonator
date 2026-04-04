import { describe, expect, it } from "vitest";

import { resolveAlivePlayerCollisions } from "../../src/movement/collision.js";

describe("alive player collision resolution", () => {
	it("returns no updates when players do not overlap", () => {
		const resolved = resolveAlivePlayerCollisions({
			alivePlayers: [
				{ sessionId: "a", position: { x: 0, y: 0 } },
				{ sessionId: "b", position: { x: 3, y: 0 } },
			],
			radius: { x: 1, y: 1 },
		});

		expect(resolved.size).toBe(0);
	});

	it("pushes two overlapping players apart along the shortest axis", () => {
		const resolved = resolveAlivePlayerCollisions({
			alivePlayers: [
				{ sessionId: "a", position: { x: 0, y: 0 } },
				{ sessionId: "b", position: { x: 1, y: 0 } },
			],
			radius: { x: 1, y: 1 },
		});

		expect(resolved.get("a")).toEqual({ x: -0.5, y: 0 });
		expect(resolved.get("b")).toEqual({ x: 1.5, y: 0 });
	});

	it("uses the x-axis as a deterministic tie-breaker", () => {
		const resolved = resolveAlivePlayerCollisions({
			alivePlayers: [
				{ sessionId: "a", position: { x: 0, y: 0 } },
				{ sessionId: "b", position: { x: 0, y: 0 } },
			],
			radius: { x: 1, y: 1 },
		});

		expect(resolved.get("a")).toEqual({ x: -1, y: 0 });
		expect(resolved.get("b")).toEqual({ x: 1, y: 0 });
	});

	it("resolves chained overlaps across multiple players", () => {
		const players = [
			{ sessionId: "a", position: { x: 0, y: 0 } },
			{ sessionId: "b", position: { x: 1, y: 0 } },
			{ sessionId: "c", position: { x: 2, y: 0 } },
		];
		const resolved = resolveAlivePlayerCollisions({
			alivePlayers: players,
			radius: { x: 1, y: 1 },
		});

		expect(resolved.size).toBe(2);
		expectNoOverlaps(players, resolved, { x: 1, y: 1 });
	});

	it("leaves players untouched when they only touch at the edge", () => {
		const resolved = resolveAlivePlayerCollisions({
			alivePlayers: [
				{ sessionId: "a", position: { x: 0, y: 0 } },
				{ sessionId: "b", position: { x: 2, y: 0 } },
			],
			radius: { x: 1, y: 1 },
		});

		expect(resolved.size).toBe(0);
	});
});

function expectNoOverlaps(
	players: Array<{ sessionId: string; position: { x: number; y: number } }>,
	resolved: Map<string, { x: number; y: number }>,
	radius: { x: number; y: number },
): void {
	const finalPositions = players.map((player) => ({
		sessionId: player.sessionId,
		position: resolved.get(player.sessionId) ?? player.position,
	}));

	for (let leftIndex = 0; leftIndex < finalPositions.length; leftIndex += 1) {
		for (
			let rightIndex = leftIndex + 1;
			rightIndex < finalPositions.length;
			rightIndex += 1
		) {
			const left = finalPositions[leftIndex]!;
			const right = finalPositions[rightIndex]!;
			const overlapX = radius.x * 2 - Math.abs(right.position.x - left.position.x);
			const overlapY = radius.y * 2 - Math.abs(right.position.y - left.position.y);

			expect(overlapX <= 0 || overlapY <= 0).toBe(true);
		}
	}
}
