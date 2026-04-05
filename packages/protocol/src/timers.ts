import type { GridCoord } from "./types.js";

export interface DetonateFuseEntry {
  type: "detonate_resolve";
  sourceCoord: GridCoord;
  initiatorSessionId: string;
  scheduledAt: number;
}

export interface UnmanagedChainEntry {
  type: "unmanaged_chain";
  coord: GridCoord;
  scheduledAt: number;
  chainDepth: number;
}

export interface ErosionPhaseEntry {
  type: "erosion_warn" | "erosion_convert";
  scheduledAt: number;
}

export interface ItemExpiryEntry {
  type: "item_expiry";
  groundItemId: string;
  scheduledAt: number;
}

export interface RespawnEntry {
  type: "respawn";
  sessionId: string;
  scheduledAt: number;
}

export interface EffectExpiryEntry {
  type: "effect_expiry";
  sessionId: string;
  effectType: string;
  scheduledAt: number;
}

export interface FutureEventEntry {
  type: "future_event";
  scheduledAt: number;
}

export type QueueEntry =
  | DetonateFuseEntry
  | UnmanagedChainEntry
  | ErosionPhaseEntry
  | ItemExpiryEntry
  | RespawnEntry
  | EffectExpiryEntry
  | FutureEventEntry;
