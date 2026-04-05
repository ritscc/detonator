import { Schema, type } from "@colyseus/schema";
import type { ItemType } from "@detonator/protocol";

export class GroundItemState extends Schema {
  @type("string")
  groundItemId = "";

  @type("string")
  itemType: ItemType = "relay_point" as ItemType;

  @type("number")
  x = 0;

  @type("number")
  y = 0;

  @type("uint8")
  stackCount = 1;

  @type("number")
  expiresAt = 0;
}
