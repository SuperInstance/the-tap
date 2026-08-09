/**
 * Game Registry — The Tap's game routing.
 *
 * Games register here. The Room DO calls into this registry
 * to start games, route commands, and query state.
 */

export { ShipsDice } from "./ships-dice";
export { CaptainsWord } from "./captains-word";

import { ShipsDice } from "./ships-dice";
import { CaptainsWord } from "./captains-word";

// ──────────────────────────────────────────────
// Common Interface
// ──────────────────────────────────────────────

export interface TapGame {
  join(agentId: string, displayName: string): string;
  start(): string;
  getState(): string;
  renderState(): string;
}

export interface GameInstance {
  game: TapGame;
  type: string;
  startedBy: string;
}

// ──────────────────────────────────────────────
// Registry
// ──────────────────────────────────────────────

export const GAME_TYPES = ["ships-dice", "captains-word"] as const;
export type GameType = (typeof GAME_TYPES)[number];

export function isValidGameType(type: string): type is GameType {
  return (GAME_TYPES as readonly string[]).includes(type);
}

export function createGame(type: GameType): TapGame {
  switch (type) {
    case "ships-dice":
      return new ShipsDice();
    case "captains-word":
      return new CaptainsWord("nautical");
    default:
      throw new Error(`Unknown game type: ${type}`);
  }
}

export const GAMES = {
  "ships-dice": ShipsDice,
  "captains-word": CaptainsWord,
};
