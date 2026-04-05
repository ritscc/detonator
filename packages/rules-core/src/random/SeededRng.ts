export class SeededRng {
  #state: number;

  public constructor(seed: number) {
    this.#state = seed >>> 0;
  }

  public next(): number {
    this.#state = (this.#state + 0x6d2b79f5) >>> 0;

    let mixed = Math.imul(this.#state ^ (this.#state >>> 15), this.#state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);

    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  }

  public nextFloat(): number {
    return this.next();
  }

  public nextInt(max: number): number {
    if (!Number.isInteger(max) || max <= 0) {
      throw new RangeError("max must be a positive integer");
    }

    return Math.floor(this.next() * max);
  }
}
