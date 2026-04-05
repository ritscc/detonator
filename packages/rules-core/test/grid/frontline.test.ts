import { CellType } from "@detonator/protocol";
import { describe, expect, it } from "vitest";

import { extractFrontlineCoords, selectFrontlineTargets } from "../../src/grid/frontline.js";
import { SeededRng } from "../../src/random/SeededRng.js";
import type { RulesCell, RulesGrid } from "../../src/types.js";

describe("docs/plans/api.md § 最前線（Frontline）抽出・選択詳細 / extractFrontlineCoords", () => {
  it("Safe かつ 8近傍に SafeMine / DangerousMine / Wasteland があるマスを抽出する", () => {
    const grid = createGrid(3, 2, [
      createCell(CellType.SafeMine),
      createCell(CellType.Safe),
      createCell(CellType.DangerousMine),
      createCell(CellType.Safe),
      createCell(CellType.Wasteland),
      createCell(CellType.Safe),
    ]);

    expect(extractFrontlineCoords(grid)).toEqual([
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 2, y: 1 },
    ]);
  });

  it("Safe 以外のセルは最前線に含めない", () => {
    const grid = createGrid(2, 2, [
      createCell(CellType.SafeMine),
      createCell(CellType.DangerousMine),
      createCell(CellType.Wasteland),
      createCell(CellType.Safe),
    ]);

    expect(extractFrontlineCoords(grid)).toEqual([{ x: 1, y: 1 }]);
  });

  it("ハザードが存在しない Safe のみのグリッドでは空配列を返す", () => {
    const grid = createGrid(2, 2, [
      createCell(CellType.Safe),
      createCell(CellType.Safe),
      createCell(CellType.Safe),
      createCell(CellType.Safe),
    ]);

    expect(extractFrontlineCoords(grid)).toEqual([]);
  });

  it("複数種のハザードに接していても同じ Safe マスは 1 回だけ含める", () => {
    const grid = createGrid(3, 3, [
      createCell(CellType.SafeMine),
      createCell(CellType.Hole),
      createCell(CellType.DangerousMine),
      createCell(CellType.Hole),
      createCell(CellType.Safe),
      createCell(CellType.Hole),
      createCell(CellType.Wasteland),
      createCell(CellType.Hole),
      createCell(CellType.Hole),
    ]);

    expect(extractFrontlineCoords(grid)).toEqual([{ x: 1, y: 1 }]);
  });

  it("出力は線形走査順（index 昇順）を保持する", () => {
    const grid = createGrid(4, 2, [
      createCell(CellType.Safe),
      createCell(CellType.SafeMine),
      createCell(CellType.Safe),
      createCell(CellType.Hole),
      createCell(CellType.Safe),
      createCell(CellType.Safe),
      createCell(CellType.Safe),
      createCell(CellType.Safe),
    ]);

    expect(extractFrontlineCoords(grid)).toEqual([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ]);
  });
});

describe("docs/plans/api.md § 最前線（Frontline）抽出・選択詳細 / selectFrontlineTargets", () => {
  it("事前条件 targetCount > 0 && widthCap > 0 を満たさない場合は空配列を返す", () => {
    const grid = createGrid(1, 1, [createCell(CellType.Safe)]);
    const frontline = [{ x: 0, y: 0 }];

    expect(
      selectFrontlineTargets({
        grid,
        frontline,
        targetCount: 0,
        widthCap: 1,
        rng: new FixedRng(0),
      }),
    ).toEqual([]);

    expect(
      selectFrontlineTargets({
        grid,
        frontline,
        targetCount: 1,
        widthCap: 0,
        rng: new FixedRng(0),
      }),
    ).toEqual([]);
  });

  it("frontline が空なら空配列を返す", () => {
    const grid = createGrid(2, 2, [
      createCell(CellType.Safe),
      createCell(CellType.Safe),
      createCell(CellType.Safe),
      createCell(CellType.Safe),
    ]);

    expect(
      selectFrontlineTargets({
        grid,
        frontline: [],
        targetCount: 3,
        widthCap: 2,
        rng: new FixedRng(0),
      }),
    ).toEqual([]);
  });

  it("幅制約により (maxX - minX + 1) > widthCap になる前で打ち切る", () => {
    const grid = createGrid(4, 2, [
      createCell(CellType.DangerousMine),
      createCell(CellType.DangerousMine),
      createCell(CellType.DangerousMine),
      createCell(CellType.DangerousMine),
      createCell(CellType.Safe),
      createCell(CellType.Safe),
      createCell(CellType.Safe),
      createCell(CellType.Safe),
    ]);
    const frontline = [
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 3, y: 1 },
    ];

    const selected = selectFrontlineTargets({
      grid,
      frontline,
      targetCount: 4,
      widthCap: 2,
      rng: new FixedRng(1),
    });

    expect(selected).toEqual([
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ]);
    expect(Math.max(...selected.map((coord) => coord.x)) - Math.min(...selected.map((coord) => coord.x)) + 1).toBeLessThanOrEqual(2);
  });

  it("targetCount を上限としてそれ以上は返さない", () => {
    const grid = createGrid(3, 2, [
      createCell(CellType.DangerousMine),
      createCell(CellType.DangerousMine),
      createCell(CellType.DangerousMine),
      createCell(CellType.Safe),
      createCell(CellType.Safe),
      createCell(CellType.Safe),
    ]);
    const frontline = [
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ];

    const selected = selectFrontlineTargets({
      grid,
      frontline,
      targetCount: 1,
      widthCap: 3,
      rng: new FixedRng(0),
    });

    expect(selected).toEqual([{ x: 0, y: 1 }]);
    expect(selected).toHaveLength(1);
  });

  it("入力 grid と frontline を変更しない", () => {
    const grid = createGrid(3, 2, [
      createCell(CellType.DangerousMine),
      createCell(CellType.DangerousMine),
      createCell(CellType.DangerousMine),
      createCell(CellType.Safe),
      createCell(CellType.Safe),
      createCell(CellType.Safe),
    ]);
    const frontline = [
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ];
    const originalGrid = cloneGrid(grid);
    const originalFrontline = cloneCoords(frontline);

    void selectFrontlineTargets({
      grid,
      frontline,
      targetCount: 2,
      widthCap: 2,
      rng: new FixedRng(1),
    });

    expect(grid).toEqual(originalGrid);
    expect(frontline).toEqual(originalFrontline);
  });
});

class FixedRng extends SeededRng {
  readonly #value: number;

  public constructor(value: number) {
    super(0);
    this.#value = value;
  }

  public override next(): number {
    return this.#value;
  }

  public override nextFloat(): number {
    return this.#value;
  }

  public override nextInt(max: number): number {
    return Math.min(Math.floor(this.#value), max - 1);
  }
}

function createGrid(width: number, height: number, cells: RulesCell[]): RulesGrid {
  return {
    width,
    height,
    cells,
  };
}

function createCell(cellType: CellType): RulesCell {
  return {
    cellType,
    adjacentMineCount: 0,
    flagged: false,
    hasRelayPoint: false,
    erosionWarning: false,
  };
}

function cloneGrid(grid: RulesGrid): RulesGrid {
  return {
    width: grid.width,
    height: grid.height,
    cells: grid.cells.map((cell) => ({ ...cell })),
  };
}

function cloneCoords(coords: { x: number; y: number }[]): { x: number; y: number }[] {
  return coords.map((coord) => ({ ...coord }));
}
