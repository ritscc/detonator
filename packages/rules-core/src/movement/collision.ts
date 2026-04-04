import type { Vec2 } from "@detonator/protocol";

export function resolveAlivePlayerCollisions(input: {
	alivePlayers: Array<{ sessionId: string; position: Vec2 }>;
	radius: Vec2;
}): Map<string, Vec2> {
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

		for (
			let leftIndex = 0;
			leftIndex < resolvedPositions.length;
			leftIndex += 1
		) {
			for (
				let rightIndex = leftIndex + 1;
				rightIndex < resolvedPositions.length;
				rightIndex += 1
			) {
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
					const offset = overlapX / 2;

					left.position.x -= direction * offset;
					right.position.x += direction * offset;
				} else {
					const direction = dy === 0 ? 1 : Math.sign(dy);
					const offset = overlapY / 2;

					left.position.y -= direction * offset;
					right.position.y += direction * offset;
				}
			}
		}

		if (!changed) {
			break;
		}
	}

	const moved = new Map<string, Vec2>();

	for (let index = 0; index < resolvedPositions.length; index += 1) {
		const resolved = resolvedPositions[index]!;
		const original = originalPositions[index]!;

		if (
			resolved.position.x !== original.position.x ||
			resolved.position.y !== original.position.y
		) {
			moved.set(resolved.sessionId, normalizeVector(resolved.position));
		}
	}

	return moved;
}

function normalizeVector(vector: Vec2): Vec2 {
	return {
		x: Object.is(vector.x, -0) ? 0 : vector.x,
		y: Object.is(vector.y, -0) ? 0 : vector.y,
	};
}
