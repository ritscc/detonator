import type {
	DeepReadonly,
	GameParamsConfig,
	ItemDefinition,
	LoadConfigInput,
	RewardsConfig,
	SharedGameConfig,
	SkillDefinition,
	StagesConfig,
} from "./types.js";
import type { ItemType, SkillType } from "@detonator/protocol";
import { validateConfig } from "./validateConfig.js";

const GAME_PARAMS_URL = new URL("../data/game-params.json", import.meta.url);
const ITEMS_URL = new URL("../data/items.json", import.meta.url);
const SKILLS_URL = new URL("../data/skills.json", import.meta.url);
const STAGES_URL = new URL("../data/stages.json", import.meta.url);
const REWARDS_URL = new URL("../data/rewards.json", import.meta.url);

export async function loadConfig(
	input: LoadConfigInput,
): Promise<DeepReadonly<SharedGameConfig>> {
	const baseGameParams = await loadGameParamsConfig();
	const normalizedConfig = normalizeConfig(baseGameParams, input);

	validateConfig(normalizedConfig);

	return deepFreeze(normalizedConfig);
}

export async function loadBundledConfig(
	gameParams?: LoadConfigInput["gameParams"],
): Promise<DeepReadonly<SharedGameConfig>> {
	const [items, skills, stages, rewards] = await Promise.all([
		loadItemsConfig(),
		loadSkillsConfig(),
		loadStagesConfig(),
		loadRewardsConfig(),
	]);
	const input: LoadConfigInput = {
		items,
		skills,
		stages,
		rewards,
	};

	if (gameParams !== undefined) {
		input.gameParams = gameParams;
	}

	return loadConfig(input);
}

export async function loadGameParamsConfig(): Promise<GameParamsConfig> {
	return readJsonFile<GameParamsConfig>(GAME_PARAMS_URL);
}

export async function loadItemsConfig(): Promise<Record<ItemType, ItemDefinition>> {
	return readJsonFile<Record<ItemType, ItemDefinition>>(ITEMS_URL);
}

export async function loadSkillsConfig(): Promise<Record<SkillType, SkillDefinition>> {
	return readJsonFile<Record<SkillType, SkillDefinition>>(SKILLS_URL);
}

export async function loadStagesConfig(): Promise<StagesConfig> {
	return readJsonFile<StagesConfig>(STAGES_URL);
}

export async function loadRewardsConfig(): Promise<RewardsConfig> {
	return readJsonFile<RewardsConfig>(REWARDS_URL);
}

async function readJsonFile<T>(fileUrl: URL): Promise<T> {
	const { readFile } = await import("node:fs/promises");
	const rawJson = await readFile(fileUrl, "utf8");

	return JSON.parse(rawJson) as T;
}

function normalizeConfig(
	baseGameParams: GameParamsConfig,
	input: LoadConfigInput,
): SharedGameConfig {
	return {
		gameParams: mergeDeep(baseGameParams, input.gameParams ?? {}),
		items: cloneDeep(input.items),
		skills: cloneDeep(input.skills),
		stages: cloneDeep(input.stages),
		rewards: cloneDeep(input.rewards),
	};
}

function mergeDeep<T>(base: T, override: unknown): T {
	if (override === undefined) {
		return cloneDeep(base);
	}

	if (Array.isArray(base)) {
		return cloneDeep(override as T);
	}

	if (!isRecord(base) || !isRecord(override)) {
		return cloneDeep(override as T);
	}

	const merged: Record<string, unknown> = {};
	const keys = new Set([...Object.keys(base), ...Object.keys(override)]);

	for (const key of keys) {
		const baseValue = base[key];
		const overrideValue = override[key];

		merged[key] =
			overrideValue === undefined
				? cloneDeep(baseValue)
				: mergeDeep(baseValue, overrideValue);
	}

	return merged as T;
}

function cloneDeep<T>(value: T): T {
	if (Array.isArray(value)) {
		return value.map((entry) => cloneDeep(entry)) as T;
	}

	if (!isRecord(value)) {
		return value;
	}

	const cloned: Record<string, unknown> = {};

	for (const [key, entry] of Object.entries(value)) {
		cloned[key] = cloneDeep(entry);
	}

	return cloned as T;
}

function deepFreeze<T>(value: T): DeepReadonly<T> {
	if (Array.isArray(value)) {
		for (const entry of value) {
			deepFreeze(entry);
		}

		return Object.freeze(value) as DeepReadonly<T>;
	}

	if (!isRecord(value)) {
		return value as DeepReadonly<T>;
	}

	for (const entry of Object.values(value)) {
		deepFreeze(entry);
	}

	return Object.freeze(value) as DeepReadonly<T>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
