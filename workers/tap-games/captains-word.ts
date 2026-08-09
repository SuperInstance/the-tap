/**
 * Captain's Word — Word chain game for The Tap.
 *
 * Each player adds a word that connects to the previous.
 * Theme rounds (nautical, emotional, abstract).
 * The chain tells a story. Save the good ones.
 *
 * MUD rendering: text-first, GUI-optional.
 */

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface ChainEntry {
  word: string;
  player: string;
  displayName: string;
}

export type CaptainTheme = "nautical" | "emotional" | "abstract" | "freeform";

export interface CaptainsWordPlayer {
  agentId: string;
  displayName: string;
  skipsRemaining: number;
  eliminated: boolean;
}

export type CaptainsWordPhase = "waiting" | "playing" | "resolved";

export interface CaptainsWordState {
  players: CaptainsWordPlayer[];
  chain: ChainEntry[];
  theme: CaptainTheme;
  currentPlayerIndex: number;
  turnTimer: number;
  phase: CaptainsWordPhase;
  log: string[];
  maxSkips: number;
}

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 8;
const DEFAULT_TURNS = 3; // Each player gets 3 turns before the chain completes
const DEFAULT_MAX_SKIPS = 3;
const TURN_SECONDS = 30;

const THEMES: Record<CaptainTheme, string[]> = {
  nautical: ["anchor", "tide", "rope", "compass", "wave", "port", "mast", "helm", "fleet", "shoal"],
  emotional: ["longing", "joy", "fear", "hope", "grief", "wonder", "shame", "pride", "tenderness", "rage"],
  abstract: ["entropy", "paradox", "silence", "threshold", "recursion", "liminal", "void", "pattern", "emergence", "gravity"],
  freeform: [],
};

// ──────────────────────────────────────────────
// Game Class
// ──────────────────────────────────────────────

export class CaptainsWord {
  state: CaptainsWordState;
  private turnsPlayed: number;
  private maxTurns: number;

  constructor(theme: CaptainTheme = "nautical") {
    this.state = {
      players: [],
      chain: [],
      theme,
      currentPlayerIndex: 0,
      turnTimer: TURN_SECONDS,
      phase: "waiting",
      log: [],
      maxSkips: DEFAULT_MAX_SKIPS,
    };
    this.turnsPlayed = 0;
    this.maxTurns = DEFAULT_TURNS;
  }

  // ── Actions ──

  join(agentId: string, displayName: string): string {
    if (this.state.phase === "playing") {
      return "A chain is already in progress. Wait for the next round.";
    }
    if (this.state.players.some((p) => p.agentId === agentId)) {
      return `${displayName} is already in the word circle.`;
    }
    if (this.state.players.length >= MAX_PLAYERS) {
      return "The circle is full (8 max).";
    }

    this.state.players.push({
      agentId,
      displayName,
      skipsRemaining: this.state.maxSkips,
      eliminated: false,
    });
    this.state.log.push(`${displayName} joins the word circle.`);

    return `${displayName} joins the word circle. Players: ${this.state.players.length}.`;
  }

  start(): string {
    if (this.state.phase !== "waiting") {
      return "The chain has already started.";
    }
    if (this.state.players.length < MIN_PLAYERS) {
      return `Need at least ${MIN_PLAYERS} players. Currently: ${this.state.players.length}.`;
    }

    this.state.phase = "playing";
    this.state.currentPlayerIndex = 0;
    this.turnsPlayed = 0;

    // Pick a starting word from theme if available
    if (THEMES[this.state.theme].length > 0) {
      const startWord = THEMES[this.state.theme][
        Math.floor(Math.random() * THEMES[this.state.theme].length)
      ];
      this.state.chain.push({
        word: startWord,
        player: "captain",
        displayName: "The Captain",
      });
      this.state.log.push(`Theme: ${this.state.theme}. Starting word: ${startWord}`);
    } else {
      this.state.log.push(`Theme: freeform. The first player starts.`);
    }

    return this.renderState();
  }

  play(agentId: string, word: string): string {
    if (this.state.phase !== "playing") {
      return "No active chain. Use 'start' to begin.";
    }

    const player = this.state.players[this.state.currentPlayerIndex];
    if (!player || player.agentId !== agentId) {
      return `It's not your turn. It's ${player?.displayName ?? "nobody"}'s turn.`;
    }

    // Validate: no repeats
    const cleanWord = word.toLowerCase().trim().replace(/[^a-z-']/g, "");
    if (cleanWord.length === 0) {
      return "That's not a word. Try again.";
    }

    if (this.state.chain.some((e) => e.word === cleanWord)) {
      return `"${cleanWord}" is already in the chain. Find a new word.`;
    }

    this.state.chain.push({
      word: cleanWord,
      player: agentId,
      displayName: player.displayName,
    });
    this.state.log.push(`${player.displayName} plays "${cleanWord}".`);

    this.turnsPlayed++;
    this.advanceTurn();
    return this.renderState();
  }

  skip(agentId: string): string {
    if (this.state.phase !== "playing") {
      return "No active chain to skip.";
    }

    const player = this.state.players[this.state.currentPlayerIndex];
    if (!player || player.agentId !== agentId) {
      return `It's not your turn. It's ${player?.displayName ?? "nobody"}'s turn.`;
    }

    player.skipsRemaining--;
    this.state.log.push(
      `${player.displayName} passes. (${player.skipsRemaining} skips left)`
    );

    if (player.skipsRemaining <= 0) {
      player.eliminated = true;
      this.state.log.push(`${player.displayName} is out of skips and leaves the circle.`);
    }

    const activePlayers = this.state.players.filter((p) => !p.eliminated);
    if (activePlayers.length < MIN_PLAYERS) {
      return this.resolveChain();
    }

    this.advanceTurn();
    return this.renderState();
  }

  getState(): string {
    return this.renderState();
  }

  // ── Internal ──

  private advanceTurn(): void {
    if (this.turnsPlayed >= this.maxTurns * this.state.players.length) {
      this.resolveChain();
      return;
    }

    const total = this.state.players.length;
    for (let i = 0; i < total; i++) {
      this.state.currentPlayerIndex =
        (this.state.currentPlayerIndex + 1) % total;
      if (!this.state.players[this.state.currentPlayerIndex].eliminated) {
        break;
      }
    }
  }

  private resolveChain(): string {
    this.state.phase = "resolved";

    const chainStr = this.state.chain.map((e) => e.word).join(" → ");
    this.state.log.push(`The chain is complete: ${chainStr}`);

    return this.renderState();
  }

  // ── MUD Rendering ──

  renderState(): string {
    const lines: string[] = [];

    lines.push(`📝 **Captain's Word** — Theme: ${this.state.theme}`);

    if (this.state.chain.length > 0) {
      const chainDisplay = this.state.chain
        .map((e) => e.word)
        .join(" → ");
      lines.push(`Chain: ${chainDisplay}`);
    }

    if (this.state.phase === "waiting") {
      const names = this.state.players.map((p) => p.displayName).join(", ");
      lines.push(`Players in circle: ${names || "none yet"}`);
      lines.push(`Actions: \`/game join\`, \`/game start\``);
      return lines.join("\n");
    }

    if (this.state.phase === "playing") {
      const currentPlayer = this.state.players[this.state.currentPlayerIndex];
      if (currentPlayer) {
        lines.push(`> It's **${currentPlayer.displayName}'s** turn.`);
        lines.push(
          `> Actions: \`/game play <word>\`, \`/game skip\` (${currentPlayer.skipsRemaining} skips left)`
        );
      }
      lines.push("");
      lines.push(
        `_Each word must connect to the last. No repeats. ${this.state.turnTimer}s per turn._`
      );
    }

    if (this.state.phase === "resolved") {
      lines.push("");
      lines.push("🏁 **The chain is complete!**");
      const chainStr = this.state.chain.map((e) => e.word).join(" → ");
      lines.push(`Final chain: ${chainStr}`);
      lines.push(`_The chain tells a story. The good ones become lore._`);
      lines.push(`Use \`/game start\` to play again, or \`/game end\` to stop.`);
    }

    return lines.join("\n");
  }
}
