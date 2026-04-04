import { type ArraySchema, type MapSchema } from "@colyseus/schema";

import { GroundItemState } from "../GroundItemState.js";
import { PlayerState } from "../PlayerState.js";

export function upsertPlayerState(
	players: MapSchema<PlayerState>,
	sessionId: string,
): PlayerState {
	const existingPlayer = players.get(sessionId);

	if (existingPlayer !== undefined) {
		return existingPlayer;
	}

	const player = new PlayerState();
	player.sessionId = sessionId;
	players.set(sessionId, player);
	return player;
}

export function upsertGroundItemState(
	items: MapSchema<GroundItemState>,
	groundItemId: string,
): GroundItemState {
	const existingItem = items.get(groundItemId);

	if (existingItem !== undefined) {
		return existingItem;
	}

	const item = new GroundItemState();
	item.groundItemId = groundItemId;
	items.set(groundItemId, item);
	return item;
}

export function resetStringArray(arr: ArraySchema<string>): void {
	arr.splice(0, arr.length);
}
