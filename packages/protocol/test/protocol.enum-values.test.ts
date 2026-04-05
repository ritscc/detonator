import { describe, expect, it } from "vitest";

import {
  CellType,
  DeathCause,
  ErosionWarningCancelReason,
  ErrorCode,
  ExpSource,
  Facing4,
  Facing8,
  FuseCancelReason,
  GameOverReason,
  GamePhase,
  ItemDestroyReason,
  ItemType,
  LeaveReason,
  PlayerLifeState,
  SkillType,
} from "../src/index.js";

function enumMemberNames(enumObject: Record<string, string | number>): string[] {
  return Object.keys(enumObject).filter((key) => Number.isNaN(Number(key)));
}

describe("protocol enum exact values", () => {
  describe("CellType", () => {
    it("has the expected values in order", () => {
      expect(enumMemberNames(CellType)).toEqual(["Safe", "SafeMine", "DangerousMine", "Wasteland", "Hole"]);
      expect(CellType.Safe).toBe(0);
      expect(CellType.SafeMine).toBe(1);
      expect(CellType.DangerousMine).toBe(2);
      expect(CellType.Wasteland).toBe(3);
      expect(CellType.Hole).toBe(4);
    });

    it("has the correct cardinality", () => {
      expect(enumMemberNames(CellType)).toHaveLength(5);
    });
  });

  describe("GamePhase", () => {
    it("has the expected values in order", () => {
      expect(enumMemberNames(GamePhase)).toEqual(["Playing", "FloorClearTransition", "Rest", "GameOver"]);
      expect(GamePhase.Playing).toBe(0);
      expect(GamePhase.FloorClearTransition).toBe(1);
      expect(GamePhase.Rest).toBe(2);
      expect(GamePhase.GameOver).toBe(3);
    });

    it("has the correct cardinality", () => {
      expect(enumMemberNames(GamePhase)).toHaveLength(4);
    });
  });

  describe("PlayerLifeState", () => {
    it("has the expected values in order", () => {
      expect(enumMemberNames(PlayerLifeState)).toEqual(["Alive", "Ghost", "Disconnected"]);
      expect(PlayerLifeState.Alive).toBe(0);
      expect(PlayerLifeState.Ghost).toBe(1);
      expect(PlayerLifeState.Disconnected).toBe(2);
    });

    it("has the correct cardinality", () => {
      expect(enumMemberNames(PlayerLifeState)).toHaveLength(3);
    });
  });

  describe("Facing8", () => {
    it("has the expected values in order", () => {
      expect(enumMemberNames(Facing8)).toEqual(["N", "NE", "E", "SE", "S", "SW", "W", "NW"]);
      expect(Facing8.N).toBe(0);
      expect(Facing8.NE).toBe(1);
      expect(Facing8.E).toBe(2);
      expect(Facing8.SE).toBe(3);
      expect(Facing8.S).toBe(4);
      expect(Facing8.SW).toBe(5);
      expect(Facing8.W).toBe(6);
      expect(Facing8.NW).toBe(7);
    });

    it("has the correct cardinality", () => {
      expect(enumMemberNames(Facing8)).toHaveLength(8);
    });
  });

  describe("Facing4", () => {
    it("has the expected values in order", () => {
      expect(enumMemberNames(Facing4)).toEqual(["N", "E", "S", "W"]);
      expect(Facing4.N).toBe(0);
      expect(Facing4.E).toBe(1);
      expect(Facing4.S).toBe(2);
      expect(Facing4.W).toBe(3);
    });

    it("has the correct cardinality", () => {
      expect(enumMemberNames(Facing4)).toHaveLength(4);
    });
  });

  describe("DeathCause", () => {
    it("has the expected values in order", () => {
      expect(enumMemberNames(DeathCause)).toEqual(["UnmanagedExplosion", "Erosion", "Event"]);
      expect(DeathCause.UnmanagedExplosion).toBe(0);
      expect(DeathCause.Erosion).toBe(1);
      expect(DeathCause.Event).toBe(2);
    });

    it("has the correct cardinality", () => {
      expect(enumMemberNames(DeathCause)).toHaveLength(3);
    });
  });

  describe("ItemType", () => {
    it("has the expected values in order", () => {
      expect(enumMemberNames(ItemType)).toEqual([
        "RelayPoint",
        "Dash",
        "ForceIgnition",
        "MineRemoverCheap",
        "MineRemoverNormal",
        "MineRemoverHigh",
        "CatsEye",
        "Evacuation",
        "TakeABreath",
        "ShortBreak",
        "Bridge",
        "DisposableLife",
        "NineLives",
        "Purify",
      ]);
      expect(ItemType.RelayPoint).toBe("relay_point");
      expect(ItemType.Dash).toBe("dash");
      expect(ItemType.ForceIgnition).toBe("force_ignition");
      expect(ItemType.MineRemoverCheap).toBe("mine_remover_cheap");
      expect(ItemType.MineRemoverNormal).toBe("mine_remover_normal");
      expect(ItemType.MineRemoverHigh).toBe("mine_remover_high");
      expect(ItemType.CatsEye).toBe("cats_eye");
      expect(ItemType.Evacuation).toBe("evacuation");
      expect(ItemType.TakeABreath).toBe("take_a_breath");
      expect(ItemType.ShortBreak).toBe("short_break");
      expect(ItemType.Bridge).toBe("bridge");
      expect(ItemType.DisposableLife).toBe("disposable_life");
      expect(ItemType.NineLives).toBe("nine_lives");
      expect(ItemType.Purify).toBe("purify");
    });

    it("has the correct cardinality", () => {
      expect(enumMemberNames(ItemType)).toHaveLength(14);
    });
  });

  describe("SkillType", () => {
    it("has the expected values in order", () => {
      expect(enumMemberNames(SkillType)).toEqual([
        "Chord",
        "RespawnTimeReduction",
        "MovementSpeedBoost",
        "DetonateCooldownReduction",
        "ExpGainBoost",
        "ComboMultiplierBoost",
        "ErosionCooldownIncrease",
        "ItemDropRateBoost",
        "ItemPickupRangeBoost",
        "ItemSlotIncrease",
        "CpDetectionRangeBoost",
        "ErosionForewarning",
        "DeathItemKeepChance",
        "WastelandSpeedReduction",
      ]);
      expect(SkillType.Chord).toBe("chord");
      expect(SkillType.RespawnTimeReduction).toBe("respawn_time_reduction");
      expect(SkillType.MovementSpeedBoost).toBe("movement_speed_boost");
      expect(SkillType.DetonateCooldownReduction).toBe("detonate_cooldown_reduction");
      expect(SkillType.ExpGainBoost).toBe("exp_gain_boost");
      expect(SkillType.ComboMultiplierBoost).toBe("combo_multiplier_boost");
      expect(SkillType.ErosionCooldownIncrease).toBe("erosion_cooldown_increase");
      expect(SkillType.ItemDropRateBoost).toBe("item_drop_rate_boost");
      expect(SkillType.ItemPickupRangeBoost).toBe("item_pickup_range_boost");
      expect(SkillType.ItemSlotIncrease).toBe("item_slot_increase");
      expect(SkillType.CpDetectionRangeBoost).toBe("cp_detection_range_boost");
      expect(SkillType.ErosionForewarning).toBe("erosion_forewarning");
      expect(SkillType.DeathItemKeepChance).toBe("death_item_keep_chance");
      expect(SkillType.WastelandSpeedReduction).toBe("wasteland_speed_reduction");
    });

    it("has the correct cardinality", () => {
      expect(enumMemberNames(SkillType)).toHaveLength(14);
    });
  });

  describe("LeaveReason", () => {
    it("has the expected values in order", () => {
      expect(enumMemberNames(LeaveReason)).toEqual(["Voluntary", "Timeout"]);
      expect(LeaveReason.Voluntary).toBe("voluntary");
      expect(LeaveReason.Timeout).toBe("timeout");
    });

    it("has the correct cardinality", () => {
      expect(enumMemberNames(LeaveReason)).toHaveLength(2);
    });
  });

  describe("FuseCancelReason", () => {
    it("has the expected values in order", () => {
      expect(enumMemberNames(FuseCancelReason)).toEqual(["SourceRemoved", "MineRemoved", "FlagRemoved", "FloorCleared"]);
      expect(FuseCancelReason.SourceRemoved).toBe("source_removed");
      expect(FuseCancelReason.MineRemoved).toBe("mine_removed");
      expect(FuseCancelReason.FlagRemoved).toBe("flag_removed");
      expect(FuseCancelReason.FloorCleared).toBe("floor_cleared");
    });

    it("has the correct cardinality", () => {
      expect(enumMemberNames(FuseCancelReason)).toHaveLength(4);
    });
  });

  describe("ErosionWarningCancelReason", () => {
    it("has the expected values in order", () => {
      expect(enumMemberNames(ErosionWarningCancelReason)).toEqual(["TakeABreath", "ShortBreak", "FloorCleared"]);
      expect(ErosionWarningCancelReason.TakeABreath).toBe("take_a_breath");
      expect(ErosionWarningCancelReason.ShortBreak).toBe("short_break");
      expect(ErosionWarningCancelReason.FloorCleared).toBe("floor_cleared");
    });

    it("has the correct cardinality", () => {
      expect(enumMemberNames(ErosionWarningCancelReason)).toHaveLength(3);
    });
  });

  describe("ExpSource", () => {
    it("has the expected values in order", () => {
      expect(enumMemberNames(ExpSource)).toEqual(["Dig", "DetonateCombo"]);
      expect(ExpSource.Dig).toBe("dig");
      expect(ExpSource.DetonateCombo).toBe("detonate_combo");
    });

    it("has the correct cardinality", () => {
      expect(enumMemberNames(ExpSource)).toHaveLength(2);
    });
  });

  describe("ItemDestroyReason", () => {
    it("has the expected values in order", () => {
      expect(enumMemberNames(ItemDestroyReason)).toEqual(["UnmanagedExplosion", "Erosion", "FloorCleared"]);
      expect(ItemDestroyReason.UnmanagedExplosion).toBe("unmanaged_explosion");
      expect(ItemDestroyReason.Erosion).toBe("erosion");
      expect(ItemDestroyReason.FloorCleared).toBe("floor_cleared");
    });

    it("has the correct cardinality", () => {
      expect(enumMemberNames(ItemDestroyReason)).toHaveLength(3);
    });
  });

  describe("GameOverReason", () => {
    it("has the expected values in order", () => {
      expect(enumMemberNames(GameOverReason)).toEqual(["AllDead", "Floor10Cleared"]);
      expect(GameOverReason.AllDead).toBe("all_dead");
      expect(GameOverReason.Floor10Cleared).toBe("floor_10_cleared");
    });

    it("has the correct cardinality", () => {
      expect(enumMemberNames(GameOverReason)).toHaveLength(2);
    });
  });

  describe("ErrorCode", () => {
    it("has the expected values in order", () => {
      expect(enumMemberNames(ErrorCode)).toEqual([
        "DigOutOfRange",
        "DigInvalidTarget",
        "DigNotAlive",
        "FlagOutOfRange",
        "FlagInvalidTarget",
        "FlagNotAlive",
        "DetonateOutOfRange",
        "DetonateCooldown",
        "DetonateInvalidTarget",
        "DetonateNotAlive",
        "UseItemEmptySlot",
        "UseItemInvalidTarget",
        "UseItemConditionNotMet",
        "UseItemNotAlive",
        "DiscardEmptySlot",
        "ClaimNoPendingReward",
        "ClaimInvalidOfferId",
        "ClaimInvalidOption",
      ]);
      expect(ErrorCode.DigOutOfRange).toBe("DIG_OUT_OF_RANGE");
      expect(ErrorCode.DigInvalidTarget).toBe("DIG_INVALID_TARGET");
      expect(ErrorCode.DigNotAlive).toBe("DIG_NOT_ALIVE");
      expect(ErrorCode.FlagOutOfRange).toBe("FLAG_OUT_OF_RANGE");
      expect(ErrorCode.FlagInvalidTarget).toBe("FLAG_INVALID_TARGET");
      expect(ErrorCode.FlagNotAlive).toBe("FLAG_NOT_ALIVE");
      expect(ErrorCode.DetonateOutOfRange).toBe("DETONATE_OUT_OF_RANGE");
      expect(ErrorCode.DetonateCooldown).toBe("DETONATE_COOLDOWN");
      expect(ErrorCode.DetonateInvalidTarget).toBe("DETONATE_INVALID_TARGET");
      expect(ErrorCode.DetonateNotAlive).toBe("DETONATE_NOT_ALIVE");
      expect(ErrorCode.UseItemEmptySlot).toBe("USE_ITEM_EMPTY_SLOT");
      expect(ErrorCode.UseItemInvalidTarget).toBe("USE_ITEM_INVALID_TARGET");
      expect(ErrorCode.UseItemConditionNotMet).toBe("USE_ITEM_CONDITION_NOT_MET");
      expect(ErrorCode.UseItemNotAlive).toBe("USE_ITEM_NOT_ALIVE");
      expect(ErrorCode.DiscardEmptySlot).toBe("DISCARD_EMPTY_SLOT");
      expect(ErrorCode.ClaimNoPendingReward).toBe("CLAIM_NO_PENDING_REWARD");
      expect(ErrorCode.ClaimInvalidOfferId).toBe("CLAIM_INVALID_OFFER_ID");
      expect(ErrorCode.ClaimInvalidOption).toBe("CLAIM_INVALID_OPTION");
    });

    it("has the correct cardinality", () => {
      expect(enumMemberNames(ErrorCode)).toHaveLength(18);
    });
  });
});
