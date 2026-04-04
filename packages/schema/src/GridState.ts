import { ArraySchema, Schema, type } from "@colyseus/schema";

import { CellState } from "./CellState.js";

export class GridState extends Schema {
	@type("number")
	width = 0;

	@type("number")
	height = 0;

	@type([CellState])
	cells = new ArraySchema<CellState>();
}
