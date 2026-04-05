import { describe, expectTypeOf, it } from "vitest";

import type {
  ClaimRewardPayload,
  DetonateFuseEntry,
  DetonatePayload,
  DeathCause,
  DigPayload,
  DiscardItemPayload,
  EffectExpiryEntry,
  ErosionPhaseEntry,
  ErrorEvent,
  ErrorCode,
  ExpGainedEvent,
  ExpSource,
  FlagPayload,
  FutureEventEntry,
  GridCoord,
  ItemExpiryEntry,
  ItemType,
  MovePayload,
  PlayerDeathEvent,
  QueueEntry,
  RespawnEntry,
  UnmanagedChainEntry,
  UseItemPayload,
} from "../src/index.js";

describe("protocol shape contracts", () => {
  it("keeps command payload shapes stable", () => {
    expectTypeOf<MovePayload>().toEqualTypeOf<{ vx: number; vy: number }>();
    expectTypeOf<DigPayload>().toEqualTypeOf<{ x: number; y: number }>();
    expectTypeOf<FlagPayload>().toEqualTypeOf<{ x: number; y: number }>();
    expectTypeOf<DetonatePayload>().toEqualTypeOf<{ x: number; y: number }>();
    expectTypeOf<UseItemPayload>().toEqualTypeOf<{ slotIndex: number; targetCoord?: GridCoord }>();
    expectTypeOf<DiscardItemPayload>().toEqualTypeOf<{ slotIndex: number }>();
    expectTypeOf<ClaimRewardPayload>().toEqualTypeOf<{ offerId: string; optionIndex: number }>();
  });

  it("keeps critical event shapes stable", () => {
    expectTypeOf<ErrorEvent>().toEqualTypeOf<{ code: ErrorCode; message: string }>();
    expectTypeOf<ExpGainedEvent>().toEqualTypeOf<{
      sessionId: string;
      amount: number;
      comboMultiplier: number;
      source: ExpSource;
      totalExp: number;
    }>();
    expectTypeOf<PlayerDeathEvent>().toEqualTypeOf<{
      sessionId: string;
      cause: DeathCause;
      coord: GridCoord;
      respawnAt: number;
      lostItems: ItemType[];
    }>();
  });

  it("keeps queue entry union coverage stable", () => {
    expectTypeOf<QueueEntry>().toEqualTypeOf<
      | DetonateFuseEntry
      | UnmanagedChainEntry
      | ErosionPhaseEntry
      | ItemExpiryEntry
      | RespawnEntry
      | EffectExpiryEntry
      | FutureEventEntry
    >();

    expectTypeOf<QueueEntry["type"]>().toEqualTypeOf<
      | "detonate_resolve"
      | "unmanaged_chain"
      | "erosion_warn"
      | "erosion_convert"
      | "item_expiry"
      | "respawn"
      | "effect_expiry"
      | "future_event"
    >();

    expectTypeOf<Extract<QueueEntry, { type: "detonate_resolve" }>>().toEqualTypeOf<DetonateFuseEntry>();
    expectTypeOf<Extract<QueueEntry, { type: "unmanaged_chain" }>>().toEqualTypeOf<UnmanagedChainEntry>();
    expectTypeOf<Extract<QueueEntry, { type: "erosion_warn" }>>().toEqualTypeOf<ErosionPhaseEntry>();
    expectTypeOf<Extract<QueueEntry, { type: "erosion_convert" }>>().toEqualTypeOf<ErosionPhaseEntry>();
    expectTypeOf<Extract<QueueEntry, { type: "item_expiry" }>>().toEqualTypeOf<ItemExpiryEntry>();
    expectTypeOf<Extract<QueueEntry, { type: "respawn" }>>().toEqualTypeOf<RespawnEntry>();
    expectTypeOf<Extract<QueueEntry, { type: "effect_expiry" }>>().toEqualTypeOf<EffectExpiryEntry>();
    expectTypeOf<Extract<QueueEntry, { type: "future_event" }>>().toEqualTypeOf<FutureEventEntry>();
  });
});
