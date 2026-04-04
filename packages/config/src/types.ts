import type { CellType, GridCoord, ItemType, SkillType } from "@detonator/protocol";

export interface SharedGameConfig {
	gameParams: GameParamsConfig;
	items: Record<ItemType, ItemDefinition>;
	skills: Record<SkillType, SkillDefinition>;
	stages: StagesConfig;
	rewards: RewardsConfig;
}

export interface GameParamsConfig {
	board: BoardParams;
	mines: MineParams;
	erosion: ErosionParams;
	progression: ProgressionParams;
	respawn: RespawnParams;
	detonate: DetonateParams;
	drop: DropParams;
	checkpoint: CheckpointParams;
	scoring: ScoringParams;
	movement: MovementParams;
	room: RoomParams;
	inventory: InventoryParams;
	itemEffects: ItemEffectParams;
}

export interface BoardParams {
	sizeFormula: string;
	minWidth: number;
	minHeight: number;
	maxWidth: number;
	maxHeight: number;
	initialSafeZoneWidth: number;
	initialSafeZoneHeight: number;
}

export interface MineParams {
	safeMineRatio: number;
	dangerousMineRatio: number;
	mineDensity: number;
	erosionSafeMineRatio: number;
	erosionDangerousMineRatio: number;
}

export interface ErosionParams {
	baseIntervalSec: number;
	basePowerCells: number;
	warningFixedDurationSec: number;
	warningIntervalThresholdSec: number;
	warningShortIntervalMultiplier: number;
	intervalFormula: string;
	powerFormula: string;
	takeABreathPauseMs: number;
	shortBreakPauseMs: number;
}

export interface ProgressionParams {
	levelExpBase: number;
	levelExpGrowth: number;
	comboMultiplierBase: number;
	comboMultiplierPerChain: number;
}

export interface RespawnParams {
	baseRespawnSec: number;
	shortenDropWeightRatioWhenDeadExists: number;
	respawnTimeFormula: string;
}

export interface DetonateParams {
	baseCooldownSec: number;
	fuseMs: number;
	chainIntervalMs: number;
	cooldownFormula: string;
}

export interface DropParams {
	baseDropRate: number;
	itemLifetimeMs: number;
	dropRateFormula: string;
}

export interface CheckpointParams {
	detectionRadiusCells: number;
	countFormula: string;
}

export interface ScoringParams {
	timeBonusBaseSeconds: number;
	minimumTimeBonusMultiplier: number;
	roundingMode: "round";
	formula: string;
}

export interface MovementParams {
	baseCellsPerSec: number;
	wastelandSpeedMultiplier: number;
	dashSpeedMultiplier: number;
	dashDurationMs: number;
}

export interface RoomParams {
	reconnectGraceSec: number;
	patchRateHz: number;
	maxPlayers: number;
	seatReservationTimeoutSec: number;
}

export interface InventoryParams {
	baseSlots: number;
	maxSlots: number;
}

export interface ItemEffectParams {
	catsEyeDurationMs: number;
	disposableLifeDurationMs: number;
	mineRemoverRefs: Record<"cheap" | "normal" | "high", string>;
	purifyForwardRangeCells: number;
	bridgeTargetCellType: CellType;
	relayPointPlacementCellType: CellType;
}

export interface ItemDefinition {
	itemType: ItemType;
	displayName: string;
	manualUse: boolean;
	autoTriggerOnDeath: boolean;
	stackable: boolean;
	maxStack: number;
	targeting: ItemTargeting;
	allowedTargetCellTypes: CellType[];
	effectKind: ItemEffectKind;
	effectRef?: string;
	durationMs?: number;
	description: string;
}

export interface ItemTargeting {
	mode: ItemTargetingMode;
	usesFacingCorrection: boolean;
	requiresLineOfSight: boolean;
}

export type ItemTargetingMode =
	| "none"
	| "self"
	| "grid_coord_required"
	| "grid_coord_optional";

export type ItemEffectKind =
	| "relay_point_place"
	| "dash_buff"
	| "force_ignition_arm"
	| "mine_remover"
	| "cats_eye_reveal"
	| "teleport_to_respawn"
	| "erosion_pause"
	| "bridge_place"
	| "death_avoidance_buff"
	| "death_avoidance_stock"
	| "purify_wasteland";

export interface SkillDefinition {
	skillType: SkillType;
	displayName: string;
	rarity: SkillRarity;
	uniquePerRun: boolean;
	stackLimit: number;
	effectKind: SkillEffectKind;
	valueRoll: SkillValueRoll;
	description: string;
}

export type SkillRarity = "common" | "rare";

export type SkillEffectKind =
	| "rare_global_modifier"
	| "respawn_time_reduction"
	| "movement_speed_multiplier"
	| "detonate_cooldown_reduction"
	| "exp_gain_multiplier"
	| "combo_multiplier_bonus"
	| "erosion_interval_extension"
	| "drop_rate_bonus"
	| "pickup_radius_bonus"
	| "inventory_slot_bonus"
	| "cp_detection_radius_bonus"
	| "erosion_warning_bonus"
	| "death_item_keep_chance"
	| "wasteland_penalty_reduction";

export interface SkillValueRoll {
	min: number;
	max: number;
	unit: SkillValueUnit;
	notes?: string;
}

export type SkillValueUnit =
	| "seconds"
	| "percent"
	| "multiplier"
	| "cells"
	| "flat";

export interface StagesConfig {
	floors: FloorDefinition[];
	stages: Record<string, StageDefinition>;
}

export interface FloorDefinition {
	floorNumber: number;
	stageId: string;
	displayName: string;
}

export interface StageDefinition {
	stageId: string;
	displayName: string;
	boardProfile: StageBoardProfile;
	holeCoords: GridCoord[];
	cpCandidateCoords: GridCoord[];
	spawnGroups: SpawnGroupDefinition[];
	notes?: string;
}

export interface StageBoardProfile {
	sizeRuleRef: string;
	mineDensityOverride?: number;
	safeMineRatioOverride?: number;
	dangerousMineRatioOverride?: number;
	cpCountFormulaRef: string;
	erosionFrontlineWidthCap?: number;
}

export interface SpawnGroupDefinition {
	groupId: string;
	coords: GridCoord[];
}

export interface RewardsConfig {
	levelUp: LevelUpRewardConfig;
	itemPool: RewardPoolEntry<ItemType>[];
	skillPool: RewardPoolEntry<SkillType>[];
}

export interface LevelUpRewardConfig {
	optionCount: number;
	allowOfferCarryOver: boolean;
	filterFullInventoryItems: boolean;
	filterStackCappedSkills: boolean;
}

export interface RewardPoolEntry<T extends ItemType | SkillType> {
	kind: "item" | "skill";
	id: T;
	weight: number;
	minFloor?: number;
	maxFloor?: number;
	minLevel?: number;
	maxLevel?: number;
	requiresFreeSlot?: boolean;
	uniquePerRun?: boolean;
}

export type DeepPartial<T> = T extends (...args: never[]) => unknown
	? T
	: T extends readonly (infer U)[]
		? DeepPartial<U>[]
		: T extends object
			? { [K in keyof T]?: DeepPartial<T[K]> }
			: T;

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
	? T
	: T extends readonly (infer U)[]
		? readonly DeepReadonly<U>[]
		: T extends object
			? { readonly [K in keyof T]: DeepReadonly<T[K]> }
			: T;

export interface LoadConfigInput {
	items: Record<ItemType, ItemDefinition>;
	skills: Record<SkillType, SkillDefinition>;
	stages: StagesConfig;
	rewards: RewardsConfig;
	gameParams?: DeepPartial<GameParamsConfig>;
}
