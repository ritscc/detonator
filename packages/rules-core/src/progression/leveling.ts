import type { GameParamsConfig } from "@detonator/config";

export function requiredExpForLevel(
	level: number,
	config: GameParamsConfig,
): number {
	return Math.floor(
		config.progression.levelExpBase *
			Math.pow(config.progression.levelExpGrowth, level - 1),
	);
}

export function resolveLevelProgression(input: {
	currentLevel: number;
	currentExp: number;
	gainedExp: number;
	config: GameParamsConfig;
}): { newLevel: number; totalExp: number; leveledUpCount: number } {
	let newLevel = input.currentLevel;
	let totalExp = input.currentExp + input.gainedExp;
	let leveledUpCount = 0;

	while (totalExp >= requiredExpForLevel(newLevel + 1, input.config)) {
		totalExp -= requiredExpForLevel(newLevel + 1, input.config);
		newLevel += 1;
		leveledUpCount += 1;
	}

	return {
		newLevel,
		totalExp,
		leveledUpCount,
	};
}
