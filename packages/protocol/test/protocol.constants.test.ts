import { describe, expect, it } from "vitest";

import {
  ALL_COMMAND_NAMES,
  ALL_EVENT_NAMES,
  ALL_ROOM_NAMES,
  COMMAND_NAMES,
  EVENT_NAMES,
  ErrorCode,
  ItemType,
  ROOM_NAMES,
  SkillType,
} from "../src";

describe("protocol constants", () => {
  it("has the expected command, event, and room counts", () => {
    expect(ALL_COMMAND_NAMES).toHaveLength(7);
    expect(ALL_EVENT_NAMES).toHaveLength(38);
    expect(ALL_ROOM_NAMES).toHaveLength(2);
  });

  it("has no duplicate public names", () => {
    const allNames = [...ALL_COMMAND_NAMES, ...ALL_EVENT_NAMES, ...ALL_ROOM_NAMES];

    expect(new Set(ALL_COMMAND_NAMES).size).toBe(ALL_COMMAND_NAMES.length);
    expect(new Set(ALL_EVENT_NAMES).size).toBe(ALL_EVENT_NAMES.length);
    expect(new Set(ALL_ROOM_NAMES).size).toBe(ALL_ROOM_NAMES.length);
    expect(new Set(allNames).size).toBe(allNames.length);
  });

  it("freezes the expected name maps", () => {
    expect(Object.values(COMMAND_NAMES)).toEqual(ALL_COMMAND_NAMES);
    expect(Object.values(EVENT_NAMES)).toEqual(ALL_EVENT_NAMES);
    expect(Object.values(ROOM_NAMES)).toEqual(ALL_ROOM_NAMES);
  });

  it("keeps stable enum cardinalities from the spec", () => {
    expect(Object.values(ItemType)).toHaveLength(14);
    expect(Object.values(SkillType)).toHaveLength(14);
    expect(Object.values(ErrorCode)).toHaveLength(18);
  });
});
