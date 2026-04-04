export enum CellType {
	Safe = 0,
	SafeMine = 1,
	DangerousMine = 2,
	Wasteland = 3,
	Hole = 4,
}

export enum GamePhase {
	Playing = 0,
	FloorClearTransition = 1,
	Rest = 2,
	GameOver = 3,
}

export enum PlayerLifeState {
	Alive = 0,
	Ghost = 1,
	Disconnected = 2,
}

export enum Facing8 {
	N = 0,
	NE = 1,
	E = 2,
	SE = 3,
	S = 4,
	SW = 5,
	W = 6,
	NW = 7,
}

export enum Facing4 {
	N = 0,
	E = 1,
	S = 2,
	W = 3,
}

export enum DeathCause {
	UnmanagedExplosion = 0,
	Erosion = 1,
	Event = 2,
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

export enum LeaveReason {
	Voluntary = "voluntary",
	Timeout = "timeout",
}

export enum FuseCancelReason {
	SourceRemoved = "source_removed",
	MineRemoved = "mine_removed",
	FlagRemoved = "flag_removed",
	FloorCleared = "floor_cleared",
}

export enum ErosionWarningCancelReason {
	TakeABreath = "take_a_breath",
	ShortBreak = "short_break",
	FloorCleared = "floor_cleared",
}

export enum ExpSource {
	Dig = "dig",
	DetonateCombo = "detonate_combo",
}

export enum ItemDestroyReason {
	UnmanagedExplosion = "unmanaged_explosion",
	Erosion = "erosion",
	FloorCleared = "floor_cleared",
}

export enum GameOverReason {
	AllDead = "all_dead",
	Floor10Cleared = "floor_10_cleared",
}

export enum ErrorCode {
	DigOutOfRange = "DIG_OUT_OF_RANGE",
	DigInvalidTarget = "DIG_INVALID_TARGET",
	DigNotAlive = "DIG_NOT_ALIVE",
	FlagOutOfRange = "FLAG_OUT_OF_RANGE",
	FlagInvalidTarget = "FLAG_INVALID_TARGET",
	FlagNotAlive = "FLAG_NOT_ALIVE",
	DetonateOutOfRange = "DETONATE_OUT_OF_RANGE",
	DetonateCooldown = "DETONATE_COOLDOWN",
	DetonateInvalidTarget = "DETONATE_INVALID_TARGET",
	DetonateNotAlive = "DETONATE_NOT_ALIVE",
	UseItemEmptySlot = "USE_ITEM_EMPTY_SLOT",
	UseItemInvalidTarget = "USE_ITEM_INVALID_TARGET",
	UseItemConditionNotMet = "USE_ITEM_CONDITION_NOT_MET",
	UseItemNotAlive = "USE_ITEM_NOT_ALIVE",
	DiscardEmptySlot = "DISCARD_EMPTY_SLOT",
	ClaimNoPendingReward = "CLAIM_NO_PENDING_REWARD",
	ClaimInvalidOfferId = "CLAIM_INVALID_OFFER_ID",
	ClaimInvalidOption = "CLAIM_INVALID_OPTION",
}

export interface Vec2 {
	x: number;
	y: number;
}

export interface GridCoord {
	x: number;
	y: number;
}

export interface RoomOptions {
	displayName: string;
}

export interface JoinOptions {
	displayName: string;
}

export interface InventorySlot {
	slotIndex: number;
	itemType: ItemType | null;
	stackCount: number;
}

export interface SkillRewardOption {
	type: "skill";
	skillType: SkillType;
	effectValue: number;
}

export interface ItemRewardOption {
	type: "item";
	itemType: ItemType;
	stackCount: number;
}

export interface ProtocolCommandNameMap {
	move: "move";
	dig: "dig";
	flag: "flag";
	detonate: "detonate";
	use_item: "use_item";
	discard_item: "discard_item";
	claim_reward: "claim_reward";
}

export interface ProtocolRoomNameMap {
	LobbyRoom: "LobbyRoom";
	DetonatorRoom: "DetonatorRoom";
}

export type RewardOption = SkillRewardOption | ItemRewardOption;
