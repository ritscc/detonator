import { ArraySchema, Schema, type } from "@colyseus/schema";

export class ErosionState extends Schema {
  @type("boolean")
  active = true;

  @type("number")
  nextWarningAt = 0;

  @type("number")
  nextConversionAt = 0;

  @type(["string"])
  warningCellKeys = new ArraySchema<string>();
}
