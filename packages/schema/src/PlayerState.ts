import { Schema, type } from "@colyseus/schema";
import type { Facing8, PlayerLifeState } from "@detonator/protocol";

export class PlayerState extends Schema {
	@type("string")
	sessionId = "";

	@type("string")
	displayName = "";

	@type("number")
	x = 0;

	@type("number")
	y = 0;

	@type("uint8")
	facing: Facing8 = 4 as Facing8;

	@type("uint8")
	lifeState: PlayerLifeState = 0 as PlayerLifeState;

	@type("number")
	respawnAt = 0;

	@type("uint8")
	level = 1;

	@type("number")
	exp = 0;

	@type("uint8")
	pendingRewardCount = 0;
}
