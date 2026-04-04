import { Facing4, Facing8 } from "@detonator/protocol";

const FACINGS_BY_SECTOR = [
	Facing8.E,
	Facing8.SE,
	Facing8.S,
	Facing8.SW,
	Facing8.W,
	Facing8.NW,
	Facing8.N,
	Facing8.NE,
] as const;

export function resolveFacing8(input: {
	previousFacing: Facing8;
	vx: number;
	vy: number;
}): Facing8 {
	if (input.vx === 0 && input.vy === 0) {
		return input.previousFacing;
	}

	const angle = Math.atan2(input.vy, input.vx);
	const sector = Math.round(angle / (Math.PI / 4));
	const normalizedSector = ((sector % 8) + 8) % 8;

	return FACINGS_BY_SECTOR[normalizedSector]!;
}

export function projectFacingToAxis4(facing: Facing8): Facing4 {
	switch (facing) {
		case Facing8.N:
		case Facing8.NW:
			return Facing4.N;
		case Facing8.NE:
		case Facing8.E:
			return Facing4.E;
		case Facing8.SE:
		case Facing8.S:
			return Facing4.S;
		case Facing8.SW:
		case Facing8.W:
			return Facing4.W;
	}
}
