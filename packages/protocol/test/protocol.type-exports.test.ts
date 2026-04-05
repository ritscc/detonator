import { describe, expect, expectTypeOf, it } from "vitest";

import * as protocol from "../src";
import { COMMAND_NAMES, ROOM_NAMES } from "../src";
import type {
  CatsEyeActivatedEvent,
  CatsEyeExpiredEvent,
  ClaimRewardPayload,
  CpCollectedEvent,
  DeathAvoidedEvent,
  DetonateChainStepEvent,
  DetonateFuseCanceledEvent,
  DetonateFuseEntry,
  DetonateFuseScheduledEvent,
  DetonatePayload,
  DetonatePreviewEvent,
  DetonateResolvedEvent,
  DigPayload,
  DiscardItemPayload,
  EffectExpiryEntry,
  ErosionAppliedEvent,
  ErosionPhaseEntry,
  ErosionWarningCanceledEvent,
  ErosionWarningEvent,
  ErrorEvent,
  ExpGainedEvent,
  FlagPayload,
  FloorClearedEvent,
  FutureEventEntry,
  GameOverEvent,
  GridCoord,
  InventorySlot,
  InventoryUpdatedEvent,
  ItemAutoTriggeredEvent,
  ItemDestroyReason,
  ItemDestroyedEvent,
  ItemDroppedEvent,
  ItemExpiredEvent,
  ItemExpiryEntry,
  ItemPickedUpEvent,
  ItemRewardOption,
  ItemType,
  ItemUsedEvent,
  JoinOptions,
  LevelUpEvent,
  MovePayload,
  NextFloorStartedEvent,
  PlayerDeathEvent,
  PlayerDisconnectedEvent,
  PlayerGhostEvent,
  PlayerJoinedEvent,
  PlayerLeftEvent,
  PlayerReconnectedEvent,
  PlayerRespawnedEvent,
  ProtocolCommandNameMap,
  ProtocolRoomNameMap,
  QueueEntry,
  RespawnEntry,
  RestPhaseStartedEvent,
  RewardOfferEvent,
  RewardOption,
  RoomOptions,
  ScoreUpdatedEvent,
  SkillRewardOption,
  UnmanagedChainEntry,
  UnmanagedChainStepEvent,
  UnmanagedExplosionResolvedEvent,
  UnmanagedExplosionTriggeredEvent,
  UseItemPayload,
  Vec2,
} from "../src";

type InterfaceExports = [
  Vec2,
  GridCoord,
  RoomOptions,
  JoinOptions,
  InventorySlot,
  SkillRewardOption,
  ItemRewardOption,
  RewardOption,
  ProtocolCommandNameMap,
  ProtocolRoomNameMap,
];

type CommandExports = [
  MovePayload,
  DigPayload,
  FlagPayload,
  DetonatePayload,
  UseItemPayload,
  DiscardItemPayload,
  ClaimRewardPayload,
];

type EventExports = [
  ErrorEvent,
  PlayerJoinedEvent,
  PlayerLeftEvent,
  PlayerDisconnectedEvent,
  PlayerReconnectedEvent,
  DetonatePreviewEvent,
  DetonateFuseScheduledEvent,
  DetonateFuseCanceledEvent,
  DetonateChainStepEvent,
  DetonateResolvedEvent,
  UnmanagedExplosionTriggeredEvent,
  UnmanagedChainStepEvent,
  UnmanagedExplosionResolvedEvent,
  ErosionWarningEvent,
  ErosionWarningCanceledEvent,
  ErosionAppliedEvent,
  CatsEyeActivatedEvent,
  CatsEyeExpiredEvent,
  CpCollectedEvent,
  ExpGainedEvent,
  LevelUpEvent,
  RewardOfferEvent,
  ItemDroppedEvent,
  ItemPickedUpEvent,
  ItemExpiredEvent,
  ItemUsedEvent,
  ItemAutoTriggeredEvent,
  ItemDestroyedEvent,
  InventoryUpdatedEvent,
  PlayerDeathEvent,
  DeathAvoidedEvent,
  PlayerGhostEvent,
  PlayerRespawnedEvent,
  GameOverEvent,
  FloorClearedEvent,
  RestPhaseStartedEvent,
  NextFloorStartedEvent,
  ScoreUpdatedEvent,
];

type TimerExports = [
  DetonateFuseEntry,
  UnmanagedChainEntry,
  ErosionPhaseEntry,
  ItemExpiryEntry,
  RespawnEntry,
  EffectExpiryEntry,
  FutureEventEntry,
  QueueEntry,
];

describe("protocol export surface", () => {
  it("exports the expected runtime symbols", () => {
    expect(Object.keys(protocol).sort()).toEqual(
      [
        "ALL_COMMAND_NAMES",
        "ALL_EVENT_NAMES",
        "ALL_ROOM_NAMES",
        "COMMAND_NAMES",
        "CellType",
        "DeathCause",
        "ErosionWarningCancelReason",
        "EVENT_NAMES",
        "ErrorCode",
        "ExpSource",
        "Facing4",
        "Facing8",
        "FuseCancelReason",
        "GameOverReason",
        "GamePhase",
        "ItemDestroyReason",
        "ItemType",
        "LeaveReason",
        "PlayerLifeState",
        "ROOM_NAMES",
        "SkillType",
      ].sort(),
    );
  });

  it("exports compile-time protocol contracts", () => {
    const commandNameMap: ProtocolCommandNameMap = COMMAND_NAMES;
    const roomNameMap: ProtocolRoomNameMap = ROOM_NAMES;

    expect(commandNameMap.claim_reward).toBe("claim_reward");
    expect(roomNameMap.DetonatorRoom).toBe("DetonatorRoom");

    expectTypeOf<InterfaceExports>().not.toBeAny();
    expectTypeOf<CommandExports>().not.toBeAny();
    expectTypeOf<EventExports>().not.toBeAny();
    expectTypeOf<TimerExports>().not.toBeAny();
    expectTypeOf<RewardOption>().toMatchTypeOf<SkillRewardOption | ItemRewardOption>();
    expectTypeOf<QueueEntry>().toMatchTypeOf<
      | DetonateFuseEntry
      | UnmanagedChainEntry
      | ErosionPhaseEntry
      | ItemExpiryEntry
      | RespawnEntry
      | EffectExpiryEntry
      | FutureEventEntry
    >();
    expectTypeOf<ItemDestroyReason>().not.toBeAny();
    expectTypeOf<ItemType>().not.toBeAny();
  });
});
