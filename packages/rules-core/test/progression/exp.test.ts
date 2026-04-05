import { describe, expect, it } from "vitest";

import { calculateDetonateComboExp, calculateDigExp } from "../../src/progression/exp.js";

describe("progression exp", () => {
  it("returns zero dig exp when no cells are revealed", () => {
    const expectedExp = expectedDigExp({
      revealedCellCount: 0,
      expGainBoostRatio: 0.5,
    });

    expect(
      calculateDigExp({
        revealedCellCount: 0,
        expGainBoostRatio: 0.5,
      }),
    ).toBe(expectedExp);
  });

  it("applies the exp gain boost ratio to dig exp", () => {
    const expectedExp = expectedDigExp({
      revealedCellCount: 5,
      expGainBoostRatio: 0.2,
    });

    expect(
      calculateDigExp({
        revealedCellCount: 5,
        expGainBoostRatio: 0.2,
      }),
    ).toBe(expectedExp);
  });

  it("handles large dig reveal counts", () => {
    const expectedExp = expectedDigExp({
      revealedCellCount: 1234,
      expGainBoostRatio: 0.5,
    });

    expect(
      calculateDigExp({
        revealedCellCount: 1234,
        expGainBoostRatio: 0.5,
      }),
    ).toBe(expectedExp);
  });

  it("uses configured base exp per cell for dig exp", () => {
    const expectedExp = expectedDigExp({
      revealedCellCount: 5,
      expGainBoostRatio: 0.2,
      baseExpPerCell: 2,
    });

    expect(
      calculateDigExp({
        revealedCellCount: 5,
        expGainBoostRatio: 0.2,
        config: {
          progression: {
            baseExpPerCell: 2,
          },
        },
      }),
    ).toBe(expectedExp);
  });

  it("returns zero combo exp when no dangerous mines are converted", () => {
    const expectedExp = expectedComboExp({
      dangerousMineCellsConverted: 0,
      comboMultiplier: 4,
      expGainBoostRatio: 2,
    });

    expect(
      calculateDetonateComboExp({
        dangerousMineCellsConverted: 0,
        comboMultiplier: 4,
        expGainBoostRatio: 2,
      }),
    ).toBe(expectedExp);
  });

  it("applies combo multiplier and exp boost to detonate combo exp", () => {
    const comboMultiplier = comboMultiplierFromChain(10);
    const expectedExp = expectedComboExp({
      dangerousMineCellsConverted: 10,
      comboMultiplier,
      expGainBoostRatio: 0.25,
    });

    expect(
      calculateDetonateComboExp({
        dangerousMineCellsConverted: 10,
        comboMultiplier,
        expGainBoostRatio: 0.25,
      }),
    ).toBe(expectedExp);
  });

  it("uses configured base exp per cell for detonate combo exp", () => {
    const comboMultiplier = comboMultiplierFromChain(10);
    const expectedExp = expectedComboExp({
      dangerousMineCellsConverted: 10,
      comboMultiplier,
      expGainBoostRatio: 0.25,
      baseExpPerCell: 2,
    });

    expect(
      calculateDetonateComboExp({
        dangerousMineCellsConverted: 10,
        comboMultiplier,
        expGainBoostRatio: 0.25,
        config: {
          progression: {
            baseExpPerCell: 2,
          },
        },
      }),
    ).toBe(expectedExp);
  });
});

function expectedDigExp(input: {
  revealedCellCount: number;
  expGainBoostRatio: number;
  baseExpPerCell?: number;
}): number {
  return Math.floor(
    input.revealedCellCount * (input.baseExpPerCell ?? 1) * (1 + input.expGainBoostRatio),
  );
}

function expectedComboExp(input: {
  dangerousMineCellsConverted: number;
  comboMultiplier: number;
  expGainBoostRatio: number;
  baseExpPerCell?: number;
}): number {
  return Math.floor(
    input.dangerousMineCellsConverted *
      (input.baseExpPerCell ?? 1) *
      input.comboMultiplier *
      (1 + input.expGainBoostRatio),
  );
}

function comboMultiplierFromChain(chainCount: number): number {
  const comboMultiplierBase = 1;
  const comboMultiplierPerChain = 0.1;

  return comboMultiplierBase + comboMultiplierPerChain * chainCount;
}
