import { Schema, type } from "@colyseus/schema";

export class CheckpointState extends Schema {
	@type("string")
	cpId = "";

	@type("number")
	x = 0;

	@type("number")
	y = 0;

	@type("boolean")
	collected = false;

	@type("string")
	collectedBySessionId = "";
}
