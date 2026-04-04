import type { ProtocolCommandNameMap, ProtocolRoomNameMap } from "./types.js";

export const ROOM_NAMES = {
	LobbyRoom: "LobbyRoom",
	DetonatorRoom: "DetonatorRoom",
} as const satisfies ProtocolRoomNameMap;

export const COMMAND_NAMES = {
	move: "move",
	dig: "dig",
	flag: "flag",
	detonate: "detonate",
	use_item: "use_item",
	discard_item: "discard_item",
	claim_reward: "claim_reward",
} as const satisfies ProtocolCommandNameMap;

export const EVENT_NAMES = {
	error: "error",
	player_joined: "player_joined",
	player_left: "player_left",
	player_disconnected: "player_disconnected",
	player_reconnected: "player_reconnected",
	detonate_preview: "detonate_preview",
	detonate_fuse_scheduled: "detonate_fuse_scheduled",
	detonate_fuse_canceled: "detonate_fuse_canceled",
	detonate_chain_step: "detonate_chain_step",
	detonate_resolved: "detonate_resolved",
	unmanaged_explosion_triggered: "unmanaged_explosion_triggered",
	unmanaged_chain_step: "unmanaged_chain_step",
	unmanaged_explosion_resolved: "unmanaged_explosion_resolved",
	erosion_warning: "erosion_warning",
	erosion_warning_canceled: "erosion_warning_canceled",
	erosion_applied: "erosion_applied",
	cats_eye_activated: "cats_eye_activated",
	cats_eye_expired: "cats_eye_expired",
	cp_collected: "cp_collected",
	exp_gained: "exp_gained",
	level_up: "level_up",
	reward_offer: "reward_offer",
	item_dropped: "item_dropped",
	item_picked_up: "item_picked_up",
	item_expired: "item_expired",
	item_used: "item_used",
	item_auto_triggered: "item_auto_triggered",
	item_destroyed: "item_destroyed",
	inventory_updated: "inventory_updated",
	player_death: "player_death",
	death_avoided: "death_avoided",
	player_ghost: "player_ghost",
	player_respawned: "player_respawned",
	game_over: "game_over",
	floor_cleared: "floor_cleared",
	rest_phase_started: "rest_phase_started",
	next_floor_started: "next_floor_started",
	score_updated: "score_updated",
} as const;

export const ALL_COMMAND_NAMES = Object.values(COMMAND_NAMES);
export const ALL_EVENT_NAMES = Object.values(EVENT_NAMES);
export const ALL_ROOM_NAMES = Object.values(ROOM_NAMES);
