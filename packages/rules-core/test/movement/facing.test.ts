import { Facing4, Facing8 } from "@detonator/protocol";
import { describe, expect, it } from "vitest";

import { projectFacingToAxis4, resolveFacing8 } from "../../src/movement/facing.js";

describe("api.md § 向き（Facing）解決詳細 / resolveFacing8", () => {
  it("仕様 1: 零ベクトルでは previousFacing をそのまま返す", () => {
    expect(resolveFacing8({ previousFacing: Facing8.NW, vx: 0, vy: 0 })).toBe(Facing8.NW);
    expect(resolveFacing8({ previousFacing: Facing8.SE, vx: 0, vy: 0 })).toBe(Facing8.SE);
  });

  it("仕様 2-3: 非零ベクトルは atan2 のセクター表に従って 8 方向へ解決される", () => {
    const cases = [
      { vx: 0, vy: -1, expected: Facing8.N },
      { vx: 1, vy: -1, expected: Facing8.NE },
      { vx: 1, vy: 0, expected: Facing8.E },
      { vx: 1, vy: 1, expected: Facing8.SE },
      { vx: 0, vy: 1, expected: Facing8.S },
      { vx: -1, vy: 1, expected: Facing8.SW },
      { vx: -1, vy: 0, expected: Facing8.W },
      { vx: -1, vy: -1, expected: Facing8.NW },
    ] as const;

    for (const { vx, vy, expected } of cases) {
      expect(resolveFacing8({ previousFacing: Facing8.S, vx, vy })).toBe(expected);
    }
  });

  it("仕様 2: atan2 に基づくため負の値や大きな値でも角度が同じなら同じ向きになる", () => {
    expect(resolveFacing8({ previousFacing: Facing8.N, vx: -1, vy: 0 })).toBe(Facing8.W);
    expect(resolveFacing8({ previousFacing: Facing8.N, vx: 10, vy: 0 })).toBe(Facing8.E);
    expect(resolveFacing8({ previousFacing: Facing8.N, vx: -20, vy: -20 })).toBe(Facing8.NW);
  });
});

describe("api.md § 向き（Facing）解決詳細 / projectFacingToAxis4", () => {
  it("仕様表: Facing8 は定義済みの対応表どおり Facing4 に射影される", () => {
    const cases = [
      { input: Facing8.N, expected: Facing4.N },
      { input: Facing8.NW, expected: Facing4.N },
      { input: Facing8.NE, expected: Facing4.E },
      { input: Facing8.E, expected: Facing4.E },
      { input: Facing8.SE, expected: Facing4.S },
      { input: Facing8.S, expected: Facing4.S },
      { input: Facing8.SW, expected: Facing4.W },
      { input: Facing8.W, expected: Facing4.W },
    ] as const;

    for (const { input, expected } of cases) {
      expect(projectFacingToAxis4(input)).toBe(expected);
    }
  });
});
