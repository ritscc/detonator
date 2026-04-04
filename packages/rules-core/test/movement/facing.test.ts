import { Facing4, Facing8 } from "@detonator/protocol";
import { describe, expect, it } from "vitest";

import {
	projectFacingToAxis4,
	resolveFacing8,
} from "../../src/movement/facing.js";

describe("resolveFacing8", () => {
	it("keeps the previous facing when not moving", () => {
		expect(
			resolveFacing8({ previousFacing: Facing8.NW, vx: 0, vy: 0 }),
		).toBe(Facing8.NW);
	});

	it("maps vectors into all eight directions", () => {
		expect(resolveFacing8({ previousFacing: Facing8.N, vx: 0, vy: -1 })).toBe(
			Facing8.N,
		);
		expect(resolveFacing8({ previousFacing: Facing8.N, vx: 1, vy: -1 })).toBe(
			Facing8.NE,
		);
		expect(resolveFacing8({ previousFacing: Facing8.N, vx: 1, vy: 0 })).toBe(
			Facing8.E,
		);
		expect(resolveFacing8({ previousFacing: Facing8.N, vx: 1, vy: 1 })).toBe(
			Facing8.SE,
		);
		expect(resolveFacing8({ previousFacing: Facing8.N, vx: 0, vy: 1 })).toBe(
			Facing8.S,
		);
		expect(resolveFacing8({ previousFacing: Facing8.N, vx: -1, vy: 1 })).toBe(
			Facing8.SW,
		);
		expect(resolveFacing8({ previousFacing: Facing8.N, vx: -1, vy: 0 })).toBe(
			Facing8.W,
		);
		expect(resolveFacing8({ previousFacing: Facing8.N, vx: -1, vy: -1 })).toBe(
			Facing8.NW,
		);
	});
});

describe("projectFacingToAxis4", () => {
	it("projects diagonal facings to the expected axis", () => {
		expect(projectFacingToAxis4(Facing8.N)).toBe(Facing4.N);
		expect(projectFacingToAxis4(Facing8.NE)).toBe(Facing4.E);
		expect(projectFacingToAxis4(Facing8.E)).toBe(Facing4.E);
		expect(projectFacingToAxis4(Facing8.SE)).toBe(Facing4.S);
		expect(projectFacingToAxis4(Facing8.S)).toBe(Facing4.S);
		expect(projectFacingToAxis4(Facing8.SW)).toBe(Facing4.W);
		expect(projectFacingToAxis4(Facing8.W)).toBe(Facing4.W);
		expect(projectFacingToAxis4(Facing8.NW)).toBe(Facing4.N);
	});
});
