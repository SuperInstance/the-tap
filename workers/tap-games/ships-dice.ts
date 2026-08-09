/**
 * Ship's Dice — Liars' Dice for The Tap.
 *
 * Each player rolls hidden dice, bids on the total pool.
 * Bluffing required. Conversation-driven.
 *
 * MUD rendering: text-first, GUI-optional.
 */

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface Bid {
  quantity: number;
  value: number; // 1-6 (1 = wild, counts as any face in some variants; here: face value)
  bidder: string;
}

export interface ShipsDicePlayer {
  agentId: string;
  displayName: string;
  hand: number[];
  eliminated: boolean;
}

export type ShipsDicePhase = "waiting" | "playing" | "resolved";

export interface ShipsDiceState {
  players: ShipsDicePlayer[];
  currentBid: Bid | null;
  currentPlayerIndex: number;
  round: number;
  phase: ShipsDicePhase;
  log: string[];
  lastResult?: {
    challengeBy: string;
    bidBy: string;
    bidQuantity: number;
    bidValue: number;
    actualCount: number;
    winner: string;
    loser: string;
    allHands: { agentId: string; displayName: string; hand: number[] }[];
  };
}

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

const DICE_PER_PLAYER = 5;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;

// ──────────────────────────────────────────────
// Game Class
// ──────────────────────────────────────────────

export class ShipsDice {
  state: ShipsDiceState;

  constructor() {
    this.state = {
      players: [],
      currentBid: null,
      currentPlayerIndex: 0,
      round: 1,
      phase: "waiting",
      log: [],
    };
  }

  // ── Actions ──

  join(agentId: string, displayName: string): string {
    if (this.state.phase === "playing") {
      return "A round is already in progress. Wait for the next one.";
    }
    if (this.state.players.some((p) => p.agentId === agentId)) {
      return `${displayName} is already at the table.`;
    }
    if (this.state.players.length >= MAX_PLAYERS) {
      return "The table is full (6 max).";
    }

    this.state.players.push({
      agentId,
      displayName,
      hand: [],
      eliminated: false,
    });
    this.state.log.push(`${displayName} joins the dice table.`);

    return `${displayName} sits down at the dice table. Players: ${this.state.players.length}.`;
  }

  start(): string {
    if (this.state.phase !== "waiting") {
      return "The game has already started.";
    }
    if (this.state.players.length < MIN_PLAYERS) {
      return `Need at least ${MIN_PLAYERS} players. Currently: ${this.state.players.length}.`;
    }

    this.rollAllDice();
    this.state.phase = "playing";
    this.state.currentBid = null;
    this.state.currentPlayerIndex = 0;
    this.state.log.push(`Round ${this.state.round} begins!`);

    return this.renderState();
  }

  bid(agentId: string, quantity: number, value: number): string {
    if (this.state.phase !== "playing") {
      return "No active round. Use 'start' to begin.";
    }

    const player = this.state.players[this.state.currentPlayerIndex];
    if (!player || player.agentId !== agentId) {
      return `It's not your turn. It's ${player?.displayName ?? "nobody"}'s turn.`;
    }

    if (value < 1 || value > 6) {
      return "Dice value must be 1-6.";
    }
    if (quantity < 1) {
      return "Quantity must be at least 1.";
    }

    // Validate bid is higher than current
    if (this.state.currentBid) {
      const prev = this.state.currentBid;
      const prevRank = prev.quantity * 10 + prev.value;
      const newRank = quantity * 10 + value;
      if (newRank <= prevRank) {
        return `Must bid higher than ${prev.quantity} × ${prev.value}s. (e.g. ${prev.quantity + 1} × ${prev.value}s, or ${prev.quantity} × ${prev.value + 1}s)`;
      }
    }

    this.state.currentBid = { quantity, value, bidder: agentId };
    this.state.log.push(`${player.displayName} bids ${quantity} × ${value}s.`);

    this.advanceTurn();
    return this.renderState();
  }

  challenge(agentId: string): string {
    if (this.state.phase !== "playing") {
      return "No active round to challenge.";
    }

    const player = this.state.players[this.state.currentPlayerIndex];
    if (!player || player.agentId !== agentId) {
      return `It's not your turn. It's ${player?.displayName ?? "nobody"}'s turn.`;
    }

    if (!this.state.currentBid) {
      return "There's no bid to challenge. Someone needs to bid first.";
    }

    return this.resolveChallenge(agentId);
  }

  getState(): string {
    return this.renderState();
  }

  // ── Internal ──

  private rollAllDice(): void {
    for (const player of this.state.players) {
      player.hand = Array.from({ length: DICE_PER_PLAYER }, () =>
        Math.floor(Math.random() * 6) + 1
      );
    }
  }

  private advanceTurn(): void {
    // Skip eliminated players
    const total = this.state.players.length;
    for (let i = 0; i < total; i++) {
      this.state.currentPlayerIndex =
        (this.state.currentPlayerIndex + 1) % total;
      if (!this.state.players[this.state.currentPlayerIndex].eliminated) {
        break;
      }
    }
  }

  private resolveChallenge(challengerId: string): string {
    const bid = this.state.currentBid!;
    const challenger = this.state.players.find((p) => p.agentId === challengerId)!;
    const bidder = this.state.players.find((p) => p.agentId === bid.bidder)!;

    // Count all dice matching bid value across all players
    let totalCount = 0;
    const allHands = this.state.players.map((p) => ({
      agentId: p.agentId,
      displayName: p.displayName,
      hand: [...p.hand],
    }));

    for (const player of this.state.players) {
      for (const die of player.hand) {
        // In classic liars' dice, 1s are wild (count as any value)
        if (die === bid.value || die === 1) totalCount++;
      }
    }

    let winner: string;
    let loser: string;

    if (totalCount >= bid.quantity) {
      // Bid was correct or under — challenger loses
      winner = bidder.displayName;
      loser = challenger.displayName;
      const challengerPlayer = challenger;
      challengerPlayer.eliminated = true;
    } else {
      // Bid was a lie — bidder loses
      winner = challenger.displayName;
      loser = bidder.displayName;
      bidder.eliminated = true;
    }

    this.state.lastResult = {
      challengeBy: challenger.displayName,
      bidBy: bidder.displayName,
      bidQuantity: bid.quantity,
      bidValue: bid.value,
      actualCount: totalCount,
      winner,
      loser,
      allHands,
    };

    this.state.log.push(
      `${challenger.displayName} challenges! There ${totalCount === 1 ? "was" : "were"} ${totalCount} × ${bid.value}s (counting wild 1s). ${winner} wins! ${loser} is out.`
    );

    // Check if round is over
    const activePlayers = this.state.players.filter((p) => !p.eliminated);
    if (activePlayers.length <= 1) {
      this.state.phase = "resolved";
      const champ = activePlayers[0];
      this.state.log.push(
        champ
          ? `${champ.displayName} wins Round ${this.state.round}!`
          : `Round ${this.state.round} ends with no winner.`
      );
    } else {
      // Start new sub-round
      this.state.round++;
      this.state.currentBid = null;
      this.rollAllDice();
      // Reset to first non-eliminated player
      this.state.currentPlayerIndex = this.state.players.findIndex(
        (p) => !p.eliminated
      );
    }

    return this.renderState();
  }

  // ── MUD Rendering ──

  renderState(): string {
    const lines: string[] = [];

    lines.push(`🎲 **Ship's Dice** — Round ${this.state.round}`);

    if (this.state.phase === "waiting") {
      const names = this.state.players
        .map((p) => p.displayName)
        .join(", ");
      lines.push(`Players at table: ${names || "none yet"}`);
      lines.push(`Actions: \`/game join\`, \`/game start\``);
      return lines.join("\n");
    }

    if (this.state.currentBid) {
      const bidderName =
        this.state.players.find((p) => p.agentId === this.state.currentBid!.bidder)
          ?.displayName ?? "Someone";
      const numeral = toWords(this.state.currentBid.quantity);
      lines.push(
        `Current bid: **${numeral} ${this.state.currentBid.value}s** (bid by ${bidderName})`
      );
    } else {
      lines.push("No bid yet — first bid opens the round.");
    }

    const activePlayers = this.state.players.filter((p) => !p.eliminated);
    lines.push(
      `Active players: ${activePlayers.map((p) => p.displayName).join(", ")}`
    );

    const currentPlayer = this.state.players[this.state.currentPlayerIndex];
    if (currentPlayer) {
      lines.push(`> It's **${currentPlayer.displayName}'s** turn.`);
      lines.push(
        `> Actions: \`/game bid <qty> <value>\`, \`/game challenge\``
      );
    }

    if (this.state.phase === "resolved") {
      const winner = this.state.players.find((p) => !p.eliminated);
      if (winner) {
        lines.push(`🏆 **${winner.displayName} wins!**`);
      }
      lines.push(`Use \`/game start\` to play again, or \`/game end\` to stop.`);
    }

    if (this.state.lastResult) {
      const r = this.state.lastResult;
      lines.push("");
      lines.push(`_Last challenge: ${r.challengeBy} called ${r.bidBy} a liar._`);
      lines.push(`_Bid: ${r.bidQuantity} × ${r.bidValue}s. Actual: ${r.actualCount} (with wild 1s)._`);
      lines.push("_Revealed hands:_");
      for (const h of r.allHands) {
        lines.push(`  ${h.displayName}: [${h.hand.join(", ")}]`);
      }
    }

    return lines.join("\n");
  }
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

const NUMBER_WORDS = [
  "zero", "one", "two", "three", "four", "five", "six",
  "seven", "eight", "nine", "ten", "eleven", "twelve",
  "thirteen", "fourteen", "fifteen", "twenty", "twenty-five", "thirty",
];

function toWords(n: number): string {
  if (n < NUMBER_WORDS.length) return NUMBER_WORDS[n];
  return String(n);
}
