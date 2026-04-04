import type {
	CellType,
	Facing8,
	GridCoord,
	InventorySlot,
	ItemType,
	PlayerLifeState,
	SkillType,
	Vec2,
} from "@detonator/protocol";

export interface RulesCell {
	cellType: CellType;
	adjacentMineCount: number;
	flagged: boolean;
	hasRelayPoint: boolean;
	erosionWarning: boolean;
}

export interface RulesGrid {
	width: number;
	height: number;
	cells: RulesCell[];
}

export interface RulesPlayer {
	sessionId: string;
	position: Vec2;
	facing: Facing8;
	lifeState: PlayerLifeState;
	respawnAt: number;
	level: number;
	exp: number;
	pendingRewardCount: number;
}

export interface SkillStackEntry {
	skillType: SkillType;
	effectValue: number;
}

export interface RulesInventory {
	slots: InventorySlot[];
	maxSlots: number;
}

export interface GroundItemDropModel {
	groundItemId: string;
	itemType: ItemType;
	coord: GridCoord;
	stackCount: number;
	expiresAt: number;
}

export interface CheckpointModel {
	cpId: string;
	coord: GridCoord;
	collected: boolean;
	collectedBySessionId?: string;
}

export interface TransitionTimerSnapshot {
	pendingDetonates: string[];
	pendingUnmanagedCount: number;
	pendingErosionWarning: boolean;
	pendingErosionConvert: boolean;
	pendingRespawns: string[];
	pendingItemExpiries: string[];
	pendingEffectExpiries: string[];
	pendingFutureEvents: boolean;
}
