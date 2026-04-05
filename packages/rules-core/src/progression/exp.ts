import type { GameParamsConfig } from "@detonator/config";

type ExpFormulaConfig = {
  progression?: Partial<GameParamsConfig["progression"]> & {
    baseExpPerCell?: number;
  };
};

export function calculateDigExp(input: {
  revealedCellCount: number;
  expGainBoostRatio: number;
  config?: ExpFormulaConfig;
}): number {
  return Math.floor(
    input.revealedCellCount * resolveBaseExpPerCell(input.config) * (1 + input.expGainBoostRatio),
  );
}

export function calculateDetonateComboExp(input: {
  dangerousMineCellsConverted: number;
  comboMultiplier: number;
  expGainBoostRatio: number;
  config?: ExpFormulaConfig;
}): number {
  return Math.floor(
    input.dangerousMineCellsConverted *
      resolveBaseExpPerCell(input.config) *
      input.comboMultiplier *
      (1 + input.expGainBoostRatio),
  );
}

function resolveBaseExpPerCell(config?: ExpFormulaConfig): number {
  return config?.progression?.baseExpPerCell ?? 1;
}
