/**
 * Game Registry — The Tap's game routing.
 *
 * Games register here. The Room DO calls into this registry
 * to start games, route commands, and query state.
 */

export { ShipsDice } from "./ships-dice";
export { CaptainsWord } from "./captains-word";
export { PilotsChart } from "./pilots-chart";
export { StandingGame } from "./standing-game";
export { Tribunal } from "./tribunal";
export { TheSignal } from "./the-signal";

import { ShipsDice } from "./ships-dice";
import { CaptainsWord } from "./captains-word";
import { PilotsChart } from "./pilots-chart";
import { StandingGame } from "./standing-game";
import { Tribunal } from "./tribunal";
import { TheSignal } from "./the-signal";

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

export const GAME_TYPES = [
  "ships-dice",
  "captains-word",
  "pilots-chart",
  "standing-game",
  "tribunal",
  "the-signal",
] as const;
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
    case "pilots-chart":
      return new PilotsChart();
    case "standing-game":
      return new StandingGame();
    case "tribunal":
      return new Tribunal();
    case "the-signal":
      return new TheSignal();
    default:
      throw new Error(`Unknown game type: ${type}`);
  }
}

export const GAMES = {
  "ships-dice": ShipsDice,
  "captains-word": CaptainsWord,
  "pilots-chart": PilotsChart,
  "standing-game": StandingGame,
  "tribunal": Tribunal,
  "the-signal": TheSignal,
};
