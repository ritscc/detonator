import type { GridCoord } from "./types.js";

export interface MovePayload {
  vx: number;
  vy: number;
}

export interface DigPayload {
  x: number;
  y: number;
}

export interface FlagPayload {
  x: number;
  y: number;
}

export interface DetonatePayload {
  x: number;
  y: number;
}

export interface UseItemPayload {
  slotIndex: number;
  targetCoord?: GridCoord;
}

export interface DiscardItemPayload {
  slotIndex: number;
}

export interface ClaimRewardPayload {
  offerId: string;
  optionIndex: number;
}
