import { Schema, type } from "@colyseus/schema";

export class FloorState extends Schema {
  @type("string")
  stageId = "";

  @type("number")
  floorStartedAt = 0;

  @type("uint8")
  cpTotal = 0;

  @type("uint8")
  cpCollected = 0;
}
