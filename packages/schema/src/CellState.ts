import { Schema, type } from "@colyseus/schema";
import type { CellType } from "@detonator/protocol";

export class CellState extends Schema {
  @type("uint8")
  cellType: CellType = 0 as CellType;

  @type("uint8")
  adjacentMineCount = 0;

  @type("boolean")
  flagged = false;

  @type("boolean")
  hasRelayPoint = false;

  @type("boolean")
  erosionWarning = false;
}
