import { MapSchema, Schema, type } from "@colyseus/schema";
import type { GamePhase } from "@detonator/protocol";

import { CheckpointState } from "./CheckpointState.js";
import { ErosionState } from "./ErosionState.js";
import { FloorState } from "./FloorState.js";
import { GridState } from "./GridState.js";
import { GroundItemState } from "./GroundItemState.js";
import { PlayerState } from "./PlayerState.js";

export class GameState extends Schema {
	@type("uint8")
	phase: GamePhase = 0 as GamePhase;

	@type("uint8")
	floorNumber = 1;

	@type(FloorState)
	floor = new FloorState();

	@type(GridState)
	grid = new GridState();

	@type(ErosionState)
	erosion = new ErosionState();

	@type("number")
	totalScore = 0;

	@type({ map: PlayerState })
	players = new MapSchema<PlayerState>();

	@type({ map: GroundItemState })
	groundItems = new MapSchema<GroundItemState>();

	@type({ map: CheckpointState })
	checkpoints = new MapSchema<CheckpointState>();
}
