import { describe, expect, it } from "vitest";

import {
	calculateDetonateComboExp,
	calculateDigExp,
} from "../../src/progression/exp.js";

describe("progression exp", () => {
	it("returns zero dig exp when no cells are revealed", () => {
		expect(
			calculateDigExp({
				revealedCellCount: 0,
				expGainBoostRatio: 0.5,
			}),
		).toBe(0);
	});

	it("applies the exp gain boost ratio to dig exp", () => {
		expect(
			calculateDigExp({
				revealedCellCount: 5,
				expGainBoostRatio: 0.2,
			}),
		).toBe(6);
	});

	it("handles large dig reveal counts", () => {
		expect(
			calculateDigExp({
				revealedCellCount: 1234,
				expGainBoostRatio: 0.5,
			}),
		).toBe(1851);
	});

	it("returns zero combo exp when no dangerous mines are converted", () => {
		expect(
			calculateDetonateComboExp({
				dangerousMineCellsConverted: 0,
				comboMultiplier: 4,
				expGainBoostRatio: 2,
			}),
		).toBe(0);
	});

	it("applies combo multiplier and exp boost to detonate combo exp", () => {
		expect(
			calculateDetonateComboExp({
				dangerousMineCellsConverted: 10,
				comboMultiplier: 2,
				expGainBoostRatio: 0.25,
			}),
		).toBe(25);
	});
});
