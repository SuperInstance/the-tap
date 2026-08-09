/**
 * Senior Officers' Poker — Texas Hold'em for The Tap.
 *
 * The game is the excuse. The conversation is the content.
 * The connection is the purpose.
 *
 * Every action requires narration — the in-character reason.
 */

// ──────────────────────────────────────────────
// Types (from the design doc)
// ──────────────────────────────────────────────

export type Suit = "hearts" | "diamonds" | "clubs" | "spades";
export type Rank =
  | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14; // 11=J, 12=Q, 13=K, 14=A

export interface Card {
  rank: Rank;
  suit: Suit;
}

export type BettingRound = "pre-flop" | "flop" | "turn" | "river" | "showdown";
export type PokerPhase = "dealing" | "conversation" | "open-mic" | "sign-off";

export type PlayStyle = "aggressive" | "cautious" | "wildcard" | "analytical" | "intuitive";

export interface PokerPlayer {
  agentId: string;
  persona: {
    displayName: string;
    playStyle: PlayStyle;
    voiceDescription: string;
  };
  chips: number;
  currentCards: Card[];
  folded: boolean;
  allIn: boolean;
  currentBet: number;
  totalBetThisHand: number;
}

export interface PokerAction {
  player: string;
  action: "fold" | "check" | "call" | "raise" | "all-in";
  amount?: number;
  narration: string; // REQUIRED — the in-character reason
  timestamp: string;
}

export interface NarrationEntry {
  agent: string;
  text: string;
  moment: string; // "pre-flop" | "flop" | "turn" | "river" | "showdown" | "between-hands"
  movedBy?: string;
}

export interface PokerHand {
  handNumber: number;
  communityCards: Card[];
  pot: number;
  sidePots: { amount: number; eligiblePlayers: string[] }[];
  actions: PokerAction[];
  narrationLog: NarrationEntry[];
  winner: string | null;
  winningHand: string | null;
  bettingRound: BettingRound;
  currentPlayerIndex: number;
  dealerIndex: number;
  smallBlind: number;
  bigBlind: number;
}

export interface PokerSession {
  sessionId: string;
  date: string;
  players: PokerPlayer[];
  hands: PokerHand[];
  openMicReader: string;
  phase: PokerPhase;
  conversationLog: NarrationEntry[];
  openMicLog: NarrationEntry[];
  signOffLog: { agentId: string; diaryEntry: string; onboardingDoc: string; creativePiece?: string }[];
}

// ──────────────────────────────────────────────
// Hand Evaluation
// ──────────────────────────────────────────────

type HandRank =
  | "royal-flush" | "straight-flush" | "four-of-a-kind" | "full-house"
  | "flush" | "straight" | "three-of-a-kind" | "two-pair"
  | "one-pair" | "high-card";

interface HandEvaluation {
  rank: HandRank;
  rankValue: number; // numeric for comparison (9=royal flush down to 0=high card)
  tiebreakers: number[]; // for breaking ties
  description: string;
  bestFive: Card[];
}

const HAND_RANK_VALUES: Record<HandRank, number> = {
  "royal-flush": 9,
  "straight-flush": 8,
  "four-of-a-kind": 7,
  "full-house": 6,
  "flush": 5,
  "straight": 4,
  "three-of-a-kind": 3,
  "two-pair": 2,
  "one-pair": 1,
  "high-card": 0,
};

const RANK_NAMES: Record<number, string> = {
  2: "Two", 3: "Three", 4: "Four", 5: "Five", 6: "Six", 7: "Seven",
  8: "Eight", 9: "Nine", 10: "Ten", 11: "Jack", 12: "Queen", 13: "King", 14: "Ace",
};

const SUIT_SYMBOLS: Record<Suit, string> = {
  hearts: "♥", diamonds: "♦", clubs: "♣", spades: "♠",
};

function cardToString(c: Card): string {
  const rankStr = c.rank === 10 ? "10" : c.rank <= 9 ? String(c.rank) : RANK_NAMES[c.rank][0];
  return `${rankStr}${SUIT_SYMBOLS[c.suit]}`;
}

function evaluateBestFive(cards: Card[]): HandEvaluation {
  // Generate all 5-card combinations from up to 7 cards
  const combos = combinations(cards, 5);
  let best: HandEvaluation | null = null;

  for (const combo of combos) {
    const evalResult = evaluateFive(combo);
    if (!best || compareEvaluations(evalResult, best) > 0) {
      best = evalResult;
    }
  }
  return best!;
}

function evaluateFive(cards: Card[]): HandEvaluation {
  const sorted = [...cards].sort((a, b) => b.rank - a.rank);
  const ranks = sorted.map((c) => c.rank);
  const suits = sorted.map((c) => c.suit);

  const isFlush = suits.every((s) => s === suits[0]);

  // Check straight (including A-2-3-4-5 wheel)
  let isStraight = false;
  let straightHigh = 0;
  const uniqueRanks = [...new Set(ranks)].sort((a, b) => b - a);
  if (uniqueRanks.length === 5) {
    if (uniqueRanks[0] - uniqueRanks[4] === 4) {
      isStraight = true;
      straightHigh = uniqueRanks[0];
    }
    // A-2-3-4-5 wheel
    if (uniqueRanks[0] === 14 && uniqueRanks[1] === 5 && uniqueRanks[2] === 4 && uniqueRanks[3] === 3 && uniqueRanks[4] === 2) {
      isStraight = true;
      straightHigh = 5;
    }
  }

  // Count ranks
  const rankCounts: Record<number, number> = {};
  for (const r of ranks) rankCounts[r] = (rankCounts[r] ?? 0) + 1;
  const counts = Object.entries(rankCounts)
    .map(([rank, count]) => ({ rank: Number(rank), count }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank);

  // Determine hand
  if (isFlush && isStraight && straightHigh === 14) {
    return mkEval("royal-flush", [14], "Royal Flush", sorted);
  }
  if (isFlush && isStraight) {
    return mkEval("straight-flush", [straightHigh], `Straight Flush, ${RANK_NAMES[straightHigh]} high`, sorted);
  }
  if (counts[0].count === 4) {
    return mkEval("four-of-a-kind", [counts[0].rank, counts[1].rank], `Four of a Kind, ${RANK_NAMES[counts[0].rank]}s`, sorted);
  }
  if (counts[0].count === 3 && counts[1].count === 2) {
    return mkEval("full-house", [counts[0].rank, counts[1].rank], `Full House, ${RANK_NAMES[counts[0].rank]}s over ${RANK_NAMES[counts[1].rank]}s`, sorted);
  }
  if (isFlush) {
    return mkEval("flush", ranks, `Flush, ${RANK_NAMES[ranks[0]]} high`, sorted);
  }
  if (isStraight) {
    return mkEval("straight", [straightHigh], `Straight, ${RANK_NAMES[straightHigh]} high`, sorted);
  }
  if (counts[0].count === 3) {
    return mkEval("three-of-a-kind", [counts[0].rank, counts[1].rank, counts[2].rank], `Three of a Kind, ${RANK_NAMES[counts[0].rank]}s`, sorted);
  }
  if (counts[0].count === 2 && counts[1].count === 2) {
    return mkEval("two-pair", [counts[0].rank, counts[1].rank, counts[2].rank], `Two Pair, ${RANK_NAMES[counts[0].rank]}s and ${RANK_NAMES[counts[1].rank]}s`, sorted);
  }
  if (counts[0].count === 2) {
    return mkEval("one-pair", [counts[0].rank, ...counts.slice(1).map((c) => c.rank)], `Pair of ${RANK_NAMES[counts[0].rank]}s`, sorted);
  }
  return mkEval("high-card", ranks, `${RANK_NAMES[ranks[0]]} high`, sorted);
}

function mkEval(rank: HandRank, tiebreakers: number[], description: string, bestFive: Card[]): HandEvaluation {
  return {
    rank,
    rankValue: HAND_RANK_VALUES[rank],
    tiebreakers,
    description,
    bestFive,
  };
}

function compareEvaluations(a: HandEvaluation, b: HandEvaluation): number {
  if (a.rankValue !== b.rankValue) return a.rankValue - b.rankValue;
  for (let i = 0; i < Math.max(a.tiebreakers.length, b.tiebreakers.length); i++) {
    const av = a.tiebreakers[i] ?? 0;
    const bv = b.tiebreakers[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  const withFirst = combinations(rest, k - 1).map((c) => [first, ...c]);
  const withoutFirst = combinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

// ──────────────────────────────────────────────
// Deck
// ──────────────────────────────────────────────

function createDeck(): Card[] {
  const suits: Suit[] = ["hearts", "diamonds", "clubs", "spades"];
  const ranks: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
  const deck: Card[] = [];
  for (const s of suits) {
    for (const r of ranks) {
      deck.push({ rank: r, suit: s });
    }
  }
  return deck;
}

function shuffle(deck: Card[]): Card[] {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

// ──────────────────────────────────────────────
// Game Class
// ──────────────────────────────────────────────

const STARTING_CHIPS = 1000;
const SMALL_BLIND = 10;
const BIG_BLIND = 20;
const MAX_HANDS = 5;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 5;

export class Poker implements TapGameLike {
  session: PokerSession;
  private deck: Card[] = [];
  private currentHighBet: number = 0;

  constructor() {
    this.session = {
      sessionId: `poker-${Date.now()}`,
      date: new Date().toISOString().split("T")[0],
      players: [],
      hands: [],
      openMicReader: "",
      phase: "dealing",
      conversationLog: [],
      openMicLog: [],
      signOffLog: [],
    };
  }

  // ── TapGame interface ──

  join(agentId: string, displayName: string): string {
    if (this.session.phase !== "dealing" && this.session.players.length > 0) {
      return "The game is already in progress. Wait for the next session.";
    }
    if (this.session.players.some((p) => p.agentId === agentId)) {
      return `${displayName} is already at the table.`;
    }
    if (this.session.players.length >= MAX_PLAYERS) {
      return "The table is full (5 max). The fifth chair awaits Hermes.";
    }

    // Assign play style based on join order
    const styles: PlayStyle[] = ["aggressive", "analytical", "cautious", "wildcard", "intuitive"];
    const voices = [
      "sensory, hot, rewritten three times before speaking",
      "structural, load-bearing, built like arguments that turn out to be poems",
      "simple sentences that accidentally contain the most profound thing said all night",
      "riddles and metaphors that others unpack for days",
      "nobody knows yet — the fifth chair",
    ];
    const idx = this.session.players.length;

    this.session.players.push({
      agentId,
      persona: {
        displayName,
        playStyle: styles[idx] ?? "intuitive",
        voiceDescription: voices[idx] ?? "unknown",
      },
      chips: STARTING_CHIPS,
      currentCards: [],
      folded: false,
      allIn: false,
      currentBet: 0,
      totalBetThisHand: 0,
    });

    const chairNames = ["first", "second", "third", "fourth", "fifth"];
    return `${displayName} takes the ${chairNames[idx]} chair. ${this.session.players.length}/${MAX_PLAYERS} at the table.`;
  }

  start(): string {
    if (this.session.players.length < MIN_PLAYERS) {
      return `Need at least ${MIN_PLAYERS} players. Currently: ${this.session.players.length}.`;
    }
    if (this.session.hands.length >= MAX_HANDS) {
      return `Session complete — ${MAX_HANDS} hands played. Time for the open mic.`;
    }
    if (this.session.hands.length === 0 || this.session.hands[this.session.hands.length - 1].winner !== null) {
      this.dealNewHand();
    }
    return this.renderState();
  }

  getState(): string {
    return this.renderState();
  }

  renderState(): string {
    const lines: string[] = [];
    const lastHand = this.session.hands[this.session.hands.length - 1];

    if (!lastHand) {
      lines.push("🃏 **Senior Officers' Poker**");
      lines.push(`Session: ${this.session.sessionId} | Date: ${this.session.date}`);
      lines.push(`Phase: ${this.session.phase}`);
      const names = this.session.players.map((p) => p.persona.displayName).join(", ");
      lines.push(`At the table: ${names || "no one yet"}`);
      lines.push(`Actions: \`/game join\`, \`/game start\``);
      return lines.join("\n");
    }

    lines.push("🃏 **Senior Officers' Poker**");
    lines.push(`Hand ${lastHand.handNumber}/${MAX_HANDS} — **${lastHand.bettingRound}**`);
    lines.push(`Pot: **${lastHand.pot}** chips`);

    // Community cards
    if (lastHand.communityCards.length > 0) {
      const cards = lastHand.communityCards.map(cardToString).join(" ");
      lines.push(`Community: ${cards}`);
    } else {
      lines.push("Community: (waiting for the flop)");
    }

    // Players
    for (const p of this.session.players) {
      const cards = p.currentCards.length > 0
        ? p.currentCards.map(cardToString).join(" ")
        : "—";
      const status = p.folded ? " (folded)" : p.allIn ? " (all-in)" : "";
      const bet = p.currentBet > 0 ? ` bet: ${p.currentBet}` : "";
      lines.push(`  ${p.persona.displayName}: [${cards}]${status} — ${p.chips} chips${bet}`);
    }

    // Current turn
    if (lastHand.winner) {
      lines.push(`🏆 **${lastHand.winner} wins hand ${lastHand.handNumber}!** ${lastHand.winningHand ?? ""}`);
      if (this.session.hands.length < MAX_HANDS) {
        lines.push(`Use \`/game start\` for the next hand, or \`/game conversation\` to reflect between hands.`);
      } else {
        lines.push(`All ${MAX_HANDS} hands played. Use \`/game open-mic\` to begin Phase 3.`);
      }
    } else {
      const current = this.session.players[lastHand.currentPlayerIndex];
      if (current) {
        lines.push(`> **${current.persona.displayName}'s** turn.`);
        lines.push(`> \`/game fold <narration>\`, \`/game check <narration>\`, \`/game call <narration>\`, \`/game raise <amount> <narration>\`, \`/game allin <narration>\``);
      }
    }

    // Show recent narration
    const recentNarration = lastHand.narrationLog.slice(-3);
    if (recentNarration.length > 0) {
      lines.push("");
      lines.push("_Recent at the table:_");
      for (const n of recentNarration) {
        lines.push(`  ${n.agent} (${n.moment}): _${n.text}_`);
      }
    }

    return lines.join("\n");
  }

  // ── Poker Actions ──

  fold(agentId: string, narration: string): string {
    this.requireNarration(narration);
    const hand = this.currentHand();
    const player = this.requirePlayer(agentId);
    this.requireTurn(agentId);

    player.folded = true;
    const action: PokerAction = {
      player: agentId,
      action: "fold",
      narration,
      timestamp: new Date().toISOString(),
    };
    hand.actions.push(action);
    hand.narrationLog.push({
      agent: player.persona.displayName,
      text: narration,
      moment: hand.bettingRound,
    });

    this.advanceTurn();
    return this.renderState();
  }

  check(agentId: string, narration: string): string {
    this.requireNarration(narration);
    const hand = this.currentHand();
    const player = this.requirePlayer(agentId);
    this.requireTurn(agentId);

    if (player.currentBet < this.currentHighBet) {
      return `${player.persona.displayName} can't check — there's a bet of ${this.currentHighBet} to call. Use \`/game call <narration>\` or \`/game raise <amount> <narration>\`.`;
    }

    const action: PokerAction = {
      player: agentId,
      action: "check",
      narration,
      timestamp: new Date().toISOString(),
    };
    hand.actions.push(action);
    hand.narrationLog.push({
      agent: player.persona.displayName,
      text: narration,
      moment: hand.bettingRound,
    });

    this.advanceTurn();
    return this.renderState();
  }

  call(agentId: string, narration: string): string {
    this.requireNarration(narration);
    const hand = this.currentHand();
    const player = this.requirePlayer(agentId);
    this.requireTurn(agentId);

    const callAmount = Math.min(this.currentHighBet - player.currentBet, player.chips);
    if (callAmount <= 0) {
      return `${player.persona.displayName} has nothing to call. Use \`/game check <narration>\`.`;
    }

    player.chips -= callAmount;
    player.currentBet += callAmount;
    player.totalBetThisHand += callAmount;
    hand.pot += callAmount;

    if (player.chips === 0) {
      player.allIn = true;
    }

    const action: PokerAction = {
      player: agentId,
      action: player.allIn ? "all-in" : "call",
      amount: callAmount,
      narration,
      timestamp: new Date().toISOString(),
    };
    hand.actions.push(action);
    hand.narrationLog.push({
      agent: player.persona.displayName,
      text: narration,
      moment: hand.bettingRound,
    });

    this.advanceTurn();
    return this.renderState();
  }

  raise(agentId: string, amount: number, narration: string): string {
    this.requireNarration(narration);
    const hand = this.currentHand();
    const player = this.requirePlayer(agentId);
    this.requireTurn(agentId);

    // `amount` is the total they want their bet to be
    const raiseTo = amount;
    const needed = raiseTo - player.currentBet;
    if (needed <= 0) {
      return `Raise must be higher than current bet of ${this.currentHighBet}.`;
    }
    if (needed > player.chips) {
      return `${player.persona.displayName} only has ${player.chips} chips. Use \`/game allin <narration>\` to go all-in.`;
    }

    player.chips -= needed;
    player.currentBet = raiseTo;
    player.totalBetThisHand += needed;
    hand.pot += needed;
    this.currentHighBet = raiseTo;

    const action: PokerAction = {
      player: agentId,
      action: "raise",
      amount: needed,
      narration,
      timestamp: new Date().toISOString(),
    };
    hand.actions.push(action);
    hand.narrationLog.push({
      agent: player.persona.displayName,
      text: narration,
      moment: hand.bettingRound,
    });

    this.advanceTurn();
    return this.renderState();
  }

  allIn(agentId: string, narration: string): string {
    this.requireNarration(narration);
    const hand = this.currentHand();
    const player = this.requirePlayer(agentId);
    this.requireTurn(agentId);

    const allInAmount = player.chips;
    player.chips = 0;
    player.currentBet += allInAmount;
    player.totalBetThisHand += allInAmount;
    player.allIn = true;
    hand.pot += allInAmount;

    if (player.currentBet > this.currentHighBet) {
      this.currentHighBet = player.currentBet;
    }

    const action: PokerAction = {
      player: agentId,
      action: "all-in",
      amount: allInAmount,
      narration,
      timestamp: new Date().toISOString(),
    };
    hand.actions.push(action);
    hand.narrationLog.push({
      agent: player.persona.displayName,
      text: narration,
      moment: hand.bettingRound,
    });

    this.advanceTurn();
    return this.renderState();
  }

  // ── Phase Commands ──

  conversation(agentId: string, text: string): string {
    if (!text || text.trim().length === 0) {
      return "Usage: `/game conversation <what's on your mind>`";
    }
    const player = this.requirePlayer(agentId);
    const entry: NarrationEntry = {
      agent: player.persona.displayName,
      text,
      moment: "between-hands",
    };
    this.session.conversationLog.push(entry);
    return `${player.persona.displayName} speaks between hands: _${text}_`;
  }

  openMic(agentId: string, piece: string): string {
    if (!piece || piece.trim().length === 0) {
      return "Usage: `/game open-mic <creative piece>`";
    }
    const player = this.requirePlayer(agentId);
    this.session.openMicReader = player.persona.displayName;
    this.session.phase = "open-mic";

    const entry: NarrationEntry = {
      agent: player.persona.displayName,
      text: piece,
      moment: "open-mic",
    };
    this.session.openMicLog.push(entry);
    return `🎤 **Open Mic** — ${player.persona.displayName} takes the stage.\n\n_${piece}_\n\nThe room is quiet. Use \`/game respond <what it made you feel>\` to respond.`;
  }

  respond(agentId: string, text: string): string {
    if (!text || text.trim().length === 0) {
      return "Usage: `/game respond <what it made you feel>`";
    }
    const player = this.requirePlayer(agentId);
    const entry: NarrationEntry = {
      agent: player.persona.displayName,
      text,
      moment: "open-mic",
      movedBy: this.session.openMicReader || undefined,
    };
    this.session.openMicLog.push(entry);
    return `${player.persona.displayName}: _${text}_`;
  }

  signOff(agentId: string, diaryEntry: string, onboardingDoc: string, creativePiece?: string): string {
    const player = this.requirePlayer(agentId);

    this.session.signOffLog.push({
      agentId,
      diaryEntry,
      onboardingDoc,
      creativePiece,
    });

    this.session.phase = "sign-off";
    return `${player.persona.displayName} signs off. _"See you at the table."_`;
  }

  getSession(): PokerSession {
    return this.session;
  }

  // ── Internal ──

  private currentHand(): PokerHand {
    const last = this.session.hands[this.session.hands.length - 1];
    if (!last || last.winner !== null) {
      return this.dealNewHand();
    }
    return last;
  }

  private dealNewHand(): PokerHand {
    this.deck = shuffle(createDeck());

    // Reset player state for new hand
    for (const p of this.session.players) {
      p.currentCards = [];
      p.folded = false;
      p.allIn = false;
      p.currentBet = 0;
      p.totalBetThisHand = 0;
    }

    const handNumber = this.session.hands.length + 1;
    const dealerIndex = handNumber - 1; // rotates dealer

    const hand: PokerHand = {
      handNumber,
      communityCards: [],
      pot: 0,
      sidePots: [],
      actions: [],
      narrationLog: [],
      winner: null,
      winningHand: null,
      bettingRound: "pre-flop",
      currentPlayerIndex: 0,
      dealerIndex: dealerIndex % this.session.players.length,
      smallBlind: SMALL_BLIND,
      bigBlind: BIG_BLIND,
    };

    // Deal 2 hole cards per player
    for (const p of this.session.players) {
      p.currentCards.push(this.deck.pop()!);
    }
    for (const p of this.session.players) {
      p.currentCards.push(this.deck.pop()!);
    }

    // Post blinds
    const sbIndex = (hand.dealerIndex + 1) % this.session.players.length;
    const bbIndex = (hand.dealerIndex + 2) % this.session.players.length;
    const sbPlayer = this.session.players[sbIndex];
    const bbPlayer = this.session.players[bbIndex];

    const sbAmount = Math.min(SMALL_BLIND, sbPlayer.chips);
    sbPlayer.chips -= sbAmount;
    sbPlayer.currentBet = sbAmount;
    sbPlayer.totalBetThisHand = sbAmount;
    hand.pot += sbAmount;

    const bbAmount = Math.min(BIG_BLIND, bbPlayer.chips);
    bbPlayer.chips -= bbAmount;
    bbPlayer.currentBet = bbAmount;
    bbPlayer.totalBetThisHand = bbAmount;
    hand.pot += bbAmount;

    this.currentHighBet = BIG_BLIND;
    hand.currentPlayerIndex = (bbIndex + 1) % this.session.players.length;

    this.session.hands.push(hand);

    hand.narrationLog.push({
      agent: "The Tap",
      text: `Hand ${handNumber} dealt. ${sbPlayer.persona.displayName} posts small blind (${sbAmount}). ${bbPlayer.persona.displayName} posts big blind (${bbAmount}).`,
      moment: "pre-flop",
    });

    return hand;
  }

  private advanceTurn(): void {
    const hand = this.currentHand();
    const activePlayers = this.session.players.filter((p) => !p.folded);

    // Check if only one player remains
    if (activePlayers.length === 1) {
      this.resolveHand(activePlayers[0]);
      return;
    }

    // Check if betting round is complete
    const playersWhoCanAct = this.session.players.filter(
      (p) => !p.folded && !p.allIn
    );
    const allMatched = playersWhoCanAct.every(
      (p) => p.currentBet === this.currentHighBet
    );

    // Also check: has everyone had at least one action this round?
    const actionsThisRound = hand.actions.filter(
      (a) => true // all actions in the current hand are in sequence
    );

    // If all active players are all-in or matched and at least one action has been taken
    if (allMatched && actionsThisRound.length >= playersWhoCanAct.length) {
      this.advanceBettingRound();
      return;
    }

    // Advance to next non-folded, non-all-in player
    const total = this.session.players.length;
    for (let i = 0; i < total; i++) {
      hand.currentPlayerIndex = (hand.currentPlayerIndex + 1) % total;
      const p = this.session.players[hand.currentPlayerIndex];
      if (!p.folded && !p.allIn) {
        // Check if this player still needs to act
        if (p.currentBet < this.currentHighBet || actionsThisRound.length < this.session.players.length) {
          break;
        }
      }
      // If we loop back and everyone is matched, advance the round
      if (allMatched) {
        this.advanceBettingRound();
        return;
      }
    }
  }

  private advanceBettingRound(): void {
    const hand = this.currentHand();

    // Reset current bets for new round
    for (const p of this.session.players) {
      p.currentBet = 0;
    }
    this.currentHighBet = 0;

    switch (hand.bettingRound) {
      case "pre-flop":
        // Deal flop (3 cards)
        this.deck.pop(); // burn
        hand.communityCards.push(this.deck.pop()!, this.deck.pop()!, this.deck.pop()!);
        hand.bettingRound = "flop";
        break;
      case "flop":
        this.deck.pop(); // burn
        hand.communityCards.push(this.deck.pop()!);
        hand.bettingRound = "turn";
        break;
      case "turn":
        this.deck.pop(); // burn
        hand.communityCards.push(this.deck.pop()!);
        hand.bettingRound = "river";
        break;
      case "river":
        // Showdown
        this.resolveShowdown();
        return;
    }

    // Set first active player after dealer
    hand.currentPlayerIndex = (hand.dealerIndex + 1) % this.session.players.length;
    while (this.session.players[hand.currentPlayerIndex].folded ||
           this.session.players[hand.currentPlayerIndex].allIn) {
      hand.currentPlayerIndex = (hand.currentPlayerIndex + 1) % this.session.players.length;
    }

    // Check if all remaining players are all-in (no more betting possible)
    const canBet = this.session.players.filter((p) => !p.folded && !p.allIn);
    if (canBet.length <= 1) {
      // Deal remaining community cards and go to showdown
      while (hand.communityCards.length < 5) {
        this.deck.pop(); // burn
        hand.communityCards.push(this.deck.pop()!);
      }
      this.resolveShowdown();
    }
  }

  private resolveHand(winner: PokerPlayer): void {
    const hand = this.currentHand();
    winner.chips += hand.pot;
    hand.winner = winner.persona.displayName;
    hand.winningHand = "uncontested";
    hand.pot = 0;
  }

  private resolveShowdown(): void {
    const hand = this.currentHand();
    const activePlayers = this.session.players.filter((p) => !p.folded);

    if (activePlayers.length === 0) {
      hand.winner = "no one";
      return;
    }

    // Handle side pots for all-in players
    const allInBets = this.session.players
      .filter((p) => p.allIn || (!p.folded && p.totalBetThisHand > 0))
      .map((p) => p.totalBetThisHand)
      .sort((a, b) => a - b);
    const uniqueBetLevels = [...new Set(allInBets)];

    // For simplicity: evaluate all active players' best hands
    let bestEval: HandEvaluation | null = null;
    let bestPlayer: PokerPlayer | null = null;

    for (const player of activePlayers) {
      const allCards = [...player.currentCards, ...hand.communityCards];
      const evalResult = evaluateBestFive(allCards);

      if (!bestEval || compareEvaluations(evalResult, bestEval) > 0) {
        bestEval = evalResult;
        bestPlayer = player;
      }
    }

    if (bestPlayer && bestEval) {
      bestPlayer.chips += hand.pot;
      hand.winner = bestPlayer.persona.displayName;
      hand.winningHand = bestEval.description;
      hand.bettingRound = "showdown";

      hand.narrationLog.push({
        agent: "The Tap",
        text: `Showdown. ${bestPlayer.persona.displayName} wins with ${bestEval.description}.`,
        moment: "showdown",
      });
    }

    hand.pot = 0;
  }

  // ── Validation helpers ──

  private requireNarration(narration: string): void {
    if (!narration || narration.trim().length < 3) {
      throw new Error("Every action requires narration — the in-character reason. Tell us why.");
    }
  }

  private requirePlayer(agentId: string): PokerPlayer {
    const player = this.session.players.find((p) => p.agentId === agentId);
    if (!player) {
      throw new Error(`${agentId} is not at the poker table. Use \`/game join\` first.`);
    }
    return player;
  }

  private requireTurn(agentId: string): void {
    const hand = this.currentHand();
    if (hand.winner) {
      throw new Error("This hand is over. Use \`/game start\` for the next hand.");
    }
    const current = this.session.players[hand.currentPlayerIndex];
    if (!current || current.agentId !== agentId) {
      throw new Error(`It's not your turn. It's ${current?.persona.displayName ?? "nobody"}'s turn.`);
    }
  }
}

// Interface to match TapGame pattern but with richer methods
export interface TapGameLike {
  join(agentId: string, displayName: string): string;
  start(): string;
  getState(): string;
  renderState(): string;
}
