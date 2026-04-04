import type { GridCoord } from "@detonator/protocol";

import { SeededRng } from "../random/SeededRng.js";

export function selectCheckpointCoords(input: {
	candidateCoords: GridCoord[];
	holeCoords: GridCoord[];
	initialSafeZoneCoords: GridCoord[];
	cpCount: number;
	rng: SeededRng;
}): GridCoord[] {
	if (input.cpCount <= 0) {
		return [];
	}

	const excludedKeys = new Set<string>([
		...input.holeCoords.map(coordKey),
		...input.initialSafeZoneCoords.map(coordKey),
	]);
	const filteredCoords: GridCoord[] = [];
	const seen = new Set<string>();

	for (const coord of input.candidateCoords) {
		const key = coordKey(coord);

		if (excludedKeys.has(key) || seen.has(key)) {
			continue;
		}

		seen.add(key);
		filteredCoords.push({ ...coord });
	}

	for (let index = filteredCoords.length - 1; index > 0; index -= 1) {
		const swapIndex = input.rng.nextInt(index + 1);
		const current = filteredCoords[index]!;
		filteredCoords[index] = filteredCoords[swapIndex]!;
		filteredCoords[swapIndex] = current;
	}

	return filteredCoords.slice(0, input.cpCount);
}

function coordKey(coord: GridCoord): string {
	return `${coord.x},${coord.y}`;
}
