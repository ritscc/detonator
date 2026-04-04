import { CellType, ItemType, SkillType } from "@detonator/protocol";

import type { RewardPoolEntry, SharedGameConfig } from "./types.js";

const ITEM_TYPES = Object.values(ItemType);
const SKILL_TYPES = Object.values(SkillType);
const CELL_TYPE_VALUES = new Set(
	Object.values(CellType).filter(
		(value): value is CellType => typeof value === "number",
	),
);
const ITEM_TYPE_VALUES = new Set(ITEM_TYPES);
const SKILL_TYPE_VALUES = new Set(SKILL_TYPES);

const NON_ZERO_TUNING_PATHS = [
	"board.minWidth",
	"board.minHeight",
	"board.maxWidth",
	"board.maxHeight",
	"board.initialSafeZoneWidth",
	"board.initialSafeZoneHeight",
	"mines.safeMineRatio",
	"mines.dangerousMineRatio",
	"mines.mineDensity",
	"mines.erosionSafeMineRatio",
	"mines.erosionDangerousMineRatio",
	"erosion.baseIntervalSec",
	"erosion.basePowerCells",
	"erosion.warningFixedDurationSec",
	"erosion.warningIntervalThresholdSec",
	"erosion.warningShortIntervalMultiplier",
	"erosion.takeABreathPauseMs",
	"erosion.shortBreakPauseMs",
	"progression.levelExpBase",
	"progression.levelExpGrowth",
	"progression.comboMultiplierBase",
	"progression.comboMultiplierPerChain",
	"respawn.baseRespawnSec",
	"respawn.shortenDropWeightRatioWhenDeadExists",
	"detonate.baseCooldownSec",
	"detonate.fuseMs",
	"detonate.chainIntervalMs",
	"drop.baseDropRate",
	"drop.itemLifetimeMs",
	"checkpoint.detectionRadiusCells",
	"scoring.timeBonusBaseSeconds",
	"scoring.minimumTimeBonusMultiplier",
	"movement.baseCellsPerSec",
	"movement.wastelandSpeedMultiplier",
	"movement.dashSpeedMultiplier",
	"movement.dashDurationMs",
	"room.reconnectGraceSec",
	"room.patchRateHz",
	"room.maxPlayers",
	"room.seatReservationTimeoutSec",
	"inventory.baseSlots",
	"inventory.maxSlots",
	"itemEffects.catsEyeDurationMs",
	"itemEffects.disposableLifeDurationMs",
	"itemEffects.purifyForwardRangeCells",
] as const;

export class ConfigValidationError extends Error {
	readonly issues: readonly string[];

	constructor(issues: string[]) {
		super(`Config validation failed:\n- ${issues.join("\n- ")}`);
		this.name = "ConfigValidationError";
		this.issues = issues;
	}
}

export function validateConfig(config: SharedGameConfig): void {
	const issues: string[] = [];

	validateGameParams(config, issues);
	validateItems(config, issues);
	validateSkills(config, issues);
	validateStages(config, issues);
	validateRewards(config, issues);

	if (issues.length > 0) {
		throw new ConfigValidationError(issues);
	}
}

function validateGameParams(config: SharedGameConfig, issues: string[]): void {
	for (const path of NON_ZERO_TUNING_PATHS) {
		const value = getValueAtPath(config.gameParams, path);

		if (typeof value !== "number" || value === 0) {
			issues.push(`gameParams.${path} must be a non-zero number`);
		}
	}

	validateCellType(
		config.gameParams.itemEffects.bridgeTargetCellType,
		"gameParams.itemEffects.bridgeTargetCellType",
		issues,
	);
	validateCellType(
		config.gameParams.itemEffects.relayPointPlacementCellType,
		"gameParams.itemEffects.relayPointPlacementCellType",
		issues,
	);
}

function validateItems(config: SharedGameConfig, issues: string[]): void {
	for (const itemType of ITEM_TYPES) {
		if (config.items[itemType] === undefined) {
			issues.push(`items must define ${itemType}`);
		}
	}

	for (const [recordKey, item] of Object.entries(config.items)) {
		validateItemType(recordKey, `items.${recordKey} record key`, issues);
		validateItemType(item.itemType, `items.${recordKey}.itemType`, issues);

		if (recordKey !== item.itemType) {
			issues.push(
				`items.${recordKey}.itemType must match its record key (${item.itemType} !== ${recordKey})`,
			);
		}

		for (const [index, cellType] of item.allowedTargetCellTypes.entries()) {
			validateCellType(
				cellType,
				`items.${recordKey}.allowedTargetCellTypes[${index}]`,
				issues,
			);
		}

		if (item.durationMs !== undefined && item.durationMs === 0) {
			issues.push(`items.${recordKey}.durationMs must be non-zero when provided`);
		}

		validateItemEffectRef(config, item.effectKind, item.effectRef, `items.${recordKey}`, issues);
	}
}

function validateSkills(config: SharedGameConfig, issues: string[]): void {
	for (const skillType of SKILL_TYPES) {
		if (config.skills[skillType] === undefined) {
			issues.push(`skills must define ${skillType}`);
		}
	}

	for (const [recordKey, skill] of Object.entries(config.skills)) {
		validateSkillType(recordKey, `skills.${recordKey} record key`, issues);
		validateSkillType(skill.skillType, `skills.${recordKey}.skillType`, issues);

		if (recordKey !== skill.skillType) {
			issues.push(
				`skills.${recordKey}.skillType must match its record key (${skill.skillType} !== ${recordKey})`,
			);
		}
	}
}

function validateStages(config: SharedGameConfig, issues: string[]): void {
	const seenDefinedStageIds = new Set<string>();
	const referencedStageIds = new Set<string>();
	const seenFloorNumbers = new Set<number>();

	for (const [recordKey, stage] of Object.entries(config.stages.stages)) {
		if (seenDefinedStageIds.has(stage.stageId)) {
			issues.push(`Duplicate stageId detected: ${stage.stageId}`);
		}

		seenDefinedStageIds.add(stage.stageId);

		if (recordKey !== stage.stageId) {
			issues.push(
				`stages.stages.${recordKey}.stageId must match its record key (${stage.stageId} !== ${recordKey})`,
			);
		}
	}

	for (const [index, floor] of config.stages.floors.entries()) {
		if (seenFloorNumbers.has(floor.floorNumber)) {
			issues.push(`Duplicate floorNumber detected: ${floor.floorNumber}`);
		}

		seenFloorNumbers.add(floor.floorNumber);

		if (config.stages.stages[floor.stageId] === undefined) {
			issues.push(
				`stages.floors[${index}] references unknown stageId ${floor.stageId}`,
			);
		}

		if (referencedStageIds.has(floor.stageId)) {
			issues.push(`Duplicate stageId detected in floors: ${floor.stageId}`);
		}

		referencedStageIds.add(floor.stageId);
	}

	for (const stageId of seenDefinedStageIds) {
		if (!referencedStageIds.has(stageId)) {
			issues.push(`stages.stages.${stageId} must be referenced by a floor`);
		}
	}
}

function validateRewards(config: SharedGameConfig, issues: string[]): void {
	if (config.rewards.itemPool.length === 0) {
		issues.push("rewards.itemPool must contain at least one entry");
	}

	if (config.rewards.skillPool.length === 0) {
		issues.push("rewards.skillPool must contain at least one entry");
	}

	for (const [index, entry] of config.rewards.itemPool.entries()) {
		validateRewardEntry(entry, "item", `rewards.itemPool[${index}]`, issues);
		validateItemType(entry.id, `rewards.itemPool[${index}].id`, issues);

		if (config.items[entry.id] === undefined) {
			issues.push(`rewards.itemPool[${index}].id must reference an existing item`);
		}
	}

	for (const [index, entry] of config.rewards.skillPool.entries()) {
		validateRewardEntry(entry, "skill", `rewards.skillPool[${index}]`, issues);
		validateSkillType(entry.id, `rewards.skillPool[${index}].id`, issues);

		if (config.skills[entry.id] === undefined) {
			issues.push(`rewards.skillPool[${index}].id must reference an existing skill`);
		}
	}
}

function validateRewardEntry(
	entry: RewardPoolEntry<ItemType | SkillType>,
	expectedKind: "item" | "skill",
	path: string,
	issues: string[],
): void {
	if (entry.kind !== expectedKind) {
		issues.push(`${path}.kind must be ${expectedKind}`);
	}

	if (!Number.isFinite(entry.weight) || entry.weight <= 0) {
		issues.push(`${path}.weight must be a positive finite number`);
	}

	validateMinMax(entry.minFloor, entry.maxFloor, `${path} floor bounds`, issues);
	validateMinMax(entry.minLevel, entry.maxLevel, `${path} level bounds`, issues);
}

function validateMinMax(
	min: number | undefined,
	max: number | undefined,
	path: string,
	issues: string[],
): void {
	if (min !== undefined && max !== undefined && min > max) {
		issues.push(`${path} must satisfy min <= max`);
	}
}

function validateItemEffectRef(
	config: SharedGameConfig,
	effectKind: string,
	effectRef: string | undefined,
	path: string,
	issues: string[],
): void {
	const requiredRefsByEffectKind: Partial<Record<string, ReadonlySet<string>>> = {
		mine_remover: new Set(Object.keys(config.gameParams.itemEffects.mineRemoverRefs)),
		erosion_pause: new Set(["takeABreathPauseMs", "shortBreakPauseMs"]),
		purify_wasteland: new Set(["purifyForwardRangeCells"]),
	};
	const allowedRefs = requiredRefsByEffectKind[effectKind];

	if (allowedRefs === undefined) {
		if (effectRef !== undefined) {
			issues.push(`${path}.effectRef must be omitted for effectKind ${effectKind}`);
		}

		return;
	}

	if (effectRef === undefined || !allowedRefs.has(effectRef)) {
		issues.push(`${path}.effectRef is invalid for effectKind ${effectKind}`);
	}
}

function validateItemType(value: unknown, path: string, issues: string[]): void {
	if (!ITEM_TYPE_VALUES.has(value as ItemType)) {
		issues.push(`${path} must be a valid ItemType`);
	}
}

function validateSkillType(value: unknown, path: string, issues: string[]): void {
	if (!SKILL_TYPE_VALUES.has(value as SkillType)) {
		issues.push(`${path} must be a valid SkillType`);
	}
}

function validateCellType(value: unknown, path: string, issues: string[]): void {
	if (!CELL_TYPE_VALUES.has(value as CellType)) {
		issues.push(`${path} must be a valid CellType`);
	}
}

function getValueAtPath(value: unknown, path: string): unknown {
	let current: unknown = value;

	for (const segment of path.split(".")) {
		if (!isRecord(current)) {
			return undefined;
		}

		current = current[segment];
	}

	return current;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
