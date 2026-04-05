import { CellType, Facing8, ItemType, PlayerLifeState, SkillType } from "@detonator/protocol";
import { expect, it } from "vitest";

import type {
  CheckpointModel,
  GroundItemDropModel,
  RulesGrid,
  RulesInventory,
  RulesPlayer,
  SkillStackEntry,
  TransitionTimerSnapshot,
} from "../src/index.js";

it("accepts the shared DTO shapes", () => {
  const grid: RulesGrid = {
    width: 1,
    height: 1,
    cells: [
      {
        cellType: CellType.Safe,
        adjacentMineCount: 0,
        flagged: false,
        hasRelayPoint: false,
        erosionWarning: false,
      },
    ],
  };
  const player: RulesPlayer = {
    sessionId: "player-1",
    position: { x: 1, y: 2 },
    facing: Facing8.SE,
    lifeState: PlayerLifeState.Alive,
    respawnAt: 0,
    level: 1,
    exp: 0,
    pendingRewardCount: 0,
  };
  const stackEntry: SkillStackEntry = {
    skillType: SkillType.MovementSpeedBoost,
    effectValue: 0.25,
  };
  const inventory: RulesInventory = {
    slots: [{ slotIndex: 0, itemType: ItemType.Dash, stackCount: 1 }],
    maxSlots: 3,
  };
  const drop: GroundItemDropModel = {
    groundItemId: "drop-1",
    itemType: ItemType.Dash,
    coord: { x: 0, y: 0 },
    stackCount: 2,
    expiresAt: 1000,
  };
  const checkpoint: CheckpointModel = {
    cpId: "cp-1",
    coord: { x: 0, y: 0 },
    collected: false,
  };
  const timers: TransitionTimerSnapshot = {
    pendingDetonates: [],
    pendingUnmanagedCount: 0,
    pendingErosionWarning: false,
    pendingErosionConvert: false,
    pendingRespawns: [],
    pendingItemExpiries: [],
    pendingEffectExpiries: [],
    pendingFutureEvents: false,
  };

  expect(grid.cells[0]?.cellType).toBe(CellType.Safe);
  expect(player.facing).toBe(Facing8.SE);
  expect(stackEntry.skillType).toBe(SkillType.MovementSpeedBoost);
  expect(inventory.slots[0]?.itemType).toBe(ItemType.Dash);
  expect(drop.stackCount).toBe(2);
  expect(checkpoint.collected).toBe(false);
  expect(timers.pendingFutureEvents).toBe(false);
});
