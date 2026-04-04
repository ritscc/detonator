declare module "@detonator/protocol" {
	export enum CellType {
		Safe = 0,
		SafeMine = 1,
		DangerousMine = 2,
		Wasteland = 3,
		Hole = 4,
	}

	export enum ItemType {
		RelayPoint = "relay_point",
		Dash = "dash",
		ForceIgnition = "force_ignition",
		MineRemoverCheap = "mine_remover_cheap",
		MineRemoverNormal = "mine_remover_normal",
		MineRemoverHigh = "mine_remover_high",
		CatsEye = "cats_eye",
		Evacuation = "evacuation",
		TakeABreath = "take_a_breath",
		ShortBreak = "short_break",
		Bridge = "bridge",
		DisposableLife = "disposable_life",
		NineLives = "nine_lives",
		Purify = "purify",
	}

	export enum SkillType {
		Chord = "chord",
		RespawnTimeReduction = "respawn_time_reduction",
		MovementSpeedBoost = "movement_speed_boost",
		DetonateCooldownReduction = "detonate_cooldown_reduction",
		ExpGainBoost = "exp_gain_boost",
		ComboMultiplierBoost = "combo_multiplier_boost",
		ErosionCooldownIncrease = "erosion_cooldown_increase",
		ItemDropRateBoost = "item_drop_rate_boost",
		ItemPickupRangeBoost = "item_pickup_range_boost",
		ItemSlotIncrease = "item_slot_increase",
		CpDetectionRangeBoost = "cp_detection_range_boost",
		ErosionForewarning = "erosion_forewarning",
		DeathItemKeepChance = "death_item_keep_chance",
		WastelandSpeedReduction = "wasteland_speed_reduction",
	}

	export interface GridCoord {
		x: number;
		y: number;
	}
}
