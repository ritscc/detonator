import { describe, expect, it } from "vitest";

import { SeededRng } from "../../src/random/SeededRng.js";

describe("SeededRng", () => {
  it("produces the same sequence for the same seed", () => {
    const left = new SeededRng(12345);
    const right = new SeededRng(12345);

    const leftSequence = [left.next(), left.nextFloat(), left.nextInt(10), left.next()];
    const rightSequence = [right.next(), right.nextFloat(), right.nextInt(10), right.next()];

    expect(leftSequence).toEqual(rightSequence);
  });

  it("produces different sequences for different seeds", () => {
    const left = new SeededRng(1);
    const right = new SeededRng(2);

    expect([left.next(), left.next(), left.next()]).not.toEqual([
      right.next(),
      right.next(),
      right.next(),
    ]);
  });

  it("returns values in the expected ranges", () => {
    const rng = new SeededRng(99);

    for (let index = 0; index < 20; index += 1) {
      const value = rng.next();

      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }

    expect(() => rng.nextInt(0)).toThrow(RangeError);
    expect(() => rng.nextInt(3.5)).toThrow(RangeError);
  });
});
