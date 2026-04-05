import type { GridCoord, InventorySlot, RewardOption } from "./types.js";
import type {
  CellType,
  DeathCause,
  ErosionWarningCancelReason,
  ErrorCode,
  ExpSource,
  FuseCancelReason,
  GameOverReason,
  ItemDestroyReason,
  ItemType,
  LeaveReason,
} from "./types.js";

export interface ErrorEvent {
  code: ErrorCode;
  message: string;
}

export interface PlayerJoinedEvent {
  sessionId: string;
  displayName: string;
  isMidGame: boolean;
}

export interface PlayerLeftEvent {
  sessionId: string;
  reason: LeaveReason;
}

export interface PlayerDisconnectedEvent {
  sessionId: string;
  reconnectDeadline: number;
}

export interface PlayerReconnectedEvent {
  sessionId: string;
}

export interface DetonatePreviewEvent {
  sourceCoord: GridCoord;
  provisionalPath: GridCoord[];
  fuseEndsAt: number;
}

export interface DetonateFuseScheduledEvent {
  sourceCoord: GridCoord;
  fuseEndsAt: number;
  initiatorSessionId: string;
}

export interface DetonateFuseCanceledEvent {
  sourceCoord: GridCoord;
  reason: FuseCancelReason;
}

export interface DetonateChainStepEvent {
  sourceCoord: GridCoord;
  coord: GridCoord;
  cellTypeBefore: CellType;
  wasRelayPoint: boolean;
  remainingPath: GridCoord[];
}

export interface DetonateResolvedEvent {
  sourceCoord: GridCoord;
  processedCells: GridCoord[];
  safeMineCellsConverted: number;
  dangerousMineCellsConverted: number;
}

export interface UnmanagedExplosionTriggeredEvent {
  epicenterCoord: GridCoord;
  triggerSessionId: string;
  blastCoords: GridCoord[];
  wastelandCoords: GridCoord[];
}

export interface UnmanagedChainStepEvent {
  epicenterCoord: GridCoord;
  coord: GridCoord;
  chainDepth: number;
  blastCoords: GridCoord[];
  wastelandCoords: GridCoord[];
}

export interface UnmanagedExplosionResolvedEvent {
  originCoord: GridCoord;
  totalChainsTriggered: number;
}

export interface ErosionWarningEvent {
  targetCoords: GridCoord[];
  warningEndsAt: number;
}

export interface ErosionWarningCanceledEvent {
  canceledCoords: GridCoord[];
  reason: ErosionWarningCancelReason;
}

export interface ErosionAppliedEvent {
  convertedSafeMineCoords: GridCoord[];
  convertedDangerousMineCoords: GridCoord[];
  updatedAdjacentCoords: GridCoord[];
}

export interface CatsEyeActivatedEvent {
  sessionId: string;
  revealedCpIds: string[];
  expiresAt: number;
}

export interface CatsEyeExpiredEvent {
  sessionId: string;
}

export interface CpCollectedEvent {
  cpId: string;
  coord: GridCoord;
  collectorSessionId: string;
  remainingCount: number;
}

export interface ExpGainedEvent {
  sessionId: string;
  amount: number;
  comboMultiplier: number;
  source: ExpSource;
  totalExp: number;
}

export interface LevelUpEvent {
  sessionId: string;
  newLevel: number;
  pendingRewardCount: number;
}

export interface RewardOfferEvent {
  offerId: string;
  options: RewardOption[];
}

export interface ItemDroppedEvent {
  groundItemId: string;
  itemType: ItemType;
  coord: GridCoord;
  stackCount: number;
  expiresAt: number;
}

export interface ItemPickedUpEvent {
  groundItemId: string;
  pickerSessionId: string;
  itemType: ItemType;
  stackCount: number;
  usedNewSlot: boolean;
}

export interface ItemExpiredEvent {
  groundItemId: string;
}

export interface ItemUsedEvent {
  sessionId: string;
  itemType: ItemType;
  slotIndex: number;
  targetCoord?: GridCoord;
}

export interface ItemAutoTriggeredEvent {
  sessionId: string;
  itemType: ItemType;
}

export interface ItemDestroyedEvent {
  groundItemId: string;
  reason: ItemDestroyReason;
}

export interface InventoryUpdatedEvent {
  slots: InventorySlot[];
  maxSlots: number;
}

export interface PlayerDeathEvent {
  sessionId: string;
  cause: DeathCause;
  coord: GridCoord;
  respawnAt: number;
  lostItems: ItemType[];
}

export interface DeathAvoidedEvent {
  sessionId: string;
  cause: DeathCause;
  itemUsed: ItemType;
}

export interface PlayerGhostEvent {
  sessionId: string;
  respawnAt: number;
}

export interface PlayerRespawnedEvent {
  sessionId: string;
  spawnCoord: GridCoord;
}

export interface GameOverEvent {
  finalFloor: number;
  finalScore: number;
  reason: GameOverReason;
}

export interface FloorClearedEvent {
  floorNumber: number;
  clearedAt: number;
  clearTimeMs: number;
}

export interface RestPhaseStartedEvent {
  floorNumber: number;
}

export interface NextFloorStartedEvent {
  floorNumber: number;
  stageId: string;
  gridWidth: number;
  gridHeight: number;
}

export interface ScoreUpdatedEvent {
  totalScore: number;
  floorScore: number;
  timeBonusMultiplier: number;
}
