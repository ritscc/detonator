export function calculateDigExp(input: {
	revealedCellCount: number;
	expGainBoostRatio: number;
}): number {
	return Math.floor(input.revealedCellCount * (1 + input.expGainBoostRatio));
}

export function calculateDetonateComboExp(input: {
	dangerousMineCellsConverted: number;
	comboMultiplier: number;
	expGainBoostRatio: number;
}): number {
	return Math.floor(
		input.dangerousMineCellsConverted *
			input.comboMultiplier *
			(1 + input.expGainBoostRatio),
	);
}
