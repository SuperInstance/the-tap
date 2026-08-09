/**
 * The Standing Game — Chess with motivations.
 *
 * Each piece has a one-word personality. Moving requires stating motivation.
 * "The bishop moves because it's curious about the corner."
 * Standard chess rules apply, but every move is an act of character.
 *
 * MUD rendering: text-first, GUI-optional.
 */

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export type PieceType = "king" | "queen" | "rook" | "bishop" | "knight" | "pawn";
export type PieceColor = "white" | "black";

export interface Piece {
  type: PieceType;
  color: PieceColor;
  personality: string; // one-word personality
}

export interface Square {
  piece: Piece | null;
}

export interface Move {
  from: string;
  to: string;
  piece: Piece;
  motivation: string;
  player: string;
  displayName: string;
  captured?: Piece;
}

export type StandingGamePhase = "waiting" | "playing" | "resolved";

export interface StandingGameState {
  board: (Piece | null)[][];
  players: { agentId: string; displayName: string; color: PieceColor }[];
  moves: Move[];
  currentPlayerIndex: number;
  phase: StandingGamePhase;
  log: string[];
  winner?: string;
}

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

const PIECE_PERSONALITIES: Record<PieceType, string[]> = {
  king: ["proud", "weary", "stubborn", "regal", "anxious"],
  queen: ["fierce", "ambitious", "protective", "impatient", "radiant"],
  rook: ["steadfast", "rigid", "loyal", "brooding", "patient"],
  bishop: ["curious", "devout", "scheming", "visionary", "restless"],
  knight: ["reckless", "romantic", "defiant", "playful", "erratic"],
  pawn: ["hopeful", "dutiful", "ambitious", "nervous", "determined"],
};

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

// ──────────────────────────────────────────────
// Game Class
// ──────────────────────────────────────────────

export class StandingGame {
  state: StandingGameState;

  constructor() {
    this.state = {
      board: this.initBoard(),
      players: [],
      moves: [],
      currentPlayerIndex: 0,
      phase: "waiting",
      log: [],
    };
  }

  // ── Actions ──

  join(agentId: string, displayName: string): string {
    if (this.state.phase === "playing") {
      return "A match is already in progress. Wait for the next one.";
    }
    if (this.state.players.some((p) => p.agentId === agentId)) {
      return `${displayName} is already at the board.`;
    }
    if (this.state.players.length >= 2) {
      return "The board is full (2 players).";
    }

    const color: PieceColor = this.state.players.length === 0 ? "white" : "black";
    this.state.players.push({ agentId, displayName, color });
    this.state.log.push(`${displayName} joins as ${color}.`);

    return `${displayName} sits down as **${color}**. Players: ${this.state.players.length}/2.`;
  }

  start(): string {
    if (this.state.phase !== "waiting") {
      return "The match has already started.";
    }
    if (this.state.players.length < 2) {
      return "Need exactly 2 players. Currently: " + this.state.players.length + ".";
    }

    // Reset board
    this.state.board = this.initBoard();
    this.state.moves = [];
    this.state.currentPlayerIndex = 0;
    this.state.phase = "playing";
    this.state.winner = undefined;
    this.state.log.push("The match begins!");

    return this.renderState();
  }

  /**
   * Move a piece with motivation.
   * move <from> <to> <motivation>
   * e.g. move e2 e4 ambition
   */
  move(agentId: string, from: string, to: string, motivation: string): string {
    if (this.state.phase !== "playing") {
      return "No active match. Use 'start' to begin.";
    }

    const player = this.state.players[this.state.currentPlayerIndex];
    if (!player || player.agentId !== agentId) {
      return `It's not your turn. It's **${player?.displayName ?? "nobody"}'s** turn (${player?.color}).`;
    }

    const fromSq = this.parseSquare(from);
    const toSq = this.parseSquare(to);

    if (!fromSq || !toSq) {
      return "Invalid square notation. Use letter+number (e.g. e2, d4, a8).";
    }

    const piece = this.state.board[fromSq.row][fromSq.col];
    if (!piece) {
      return `No piece on ${from}.`;
    }
    if (piece.color !== player.color) {
      return `That's not your piece. You play **${player.color}**.`;
    }

    // Validate move
    if (!this.isValidMove(fromSq, toSq, piece)) {
      return `Invalid move for ${piece.type} from ${from} to ${to}.`;
    }

    // Execute move
    const captured = this.state.board[toSq.row][toSq.col];
    this.state.board[toSq.row][toSq.col] = piece;
    this.state.board[fromSq.row][fromSq.col] = null;

    // Pawn promotion
    let displayPiece = piece;
    if (piece.type === "pawn") {
      const promotionRank = piece.color === "white" ? 0 : 7;
      if (toSq.row === promotionRank) {
        const promoted: Piece = { ...piece, type: "queen" };
        this.state.board[toSq.row][toSq.col] = promoted;
        displayPiece = promoted;
      }
    }

    const move: Move = {
      from,
      to,
      piece: displayPiece,
      motivation,
      player: agentId,
      displayName: player.displayName,
      captured: captured ?? undefined,
    };
    this.state.moves.push(move);

    const captureNote = captured ? ` (captures ${captured.type})` : "";
    this.state.log.push(
      `${player.displayName}: ${piece.type} ${from}→${to}${captureNote} — "${motivation}"`
    );

    // Check for king capture (win condition)
    if (captured?.type === "king") {
      this.state.phase = "resolved";
      this.state.winner = player.displayName;
      return this.renderState();
    }

    // Switch turns
    this.state.currentPlayerIndex = (this.state.currentPlayerIndex + 1) % 2;

    return this.renderState();
  }

  getState(): string {
    return this.renderState();
  }

  // ── Internal ──

  private initBoard(): (Piece | null)[][] {
    const board: (Piece | null)[][] = Array.from({ length: 8 }, () =>
      Array(8).fill(null)
    );

    // Helper to create pieces with random personalities
    const makePiece = (type: PieceType, color: PieceColor): Piece => {
      const personalities = PIECE_PERSONALITIES[type];
      const personality = personalities[Math.floor(Math.random() * personalities.length)];
      return { type, color, personality };
    };

    // Place pawns
    for (let col = 0; col < 8; col++) {
      board[6][col] = makePiece("pawn", "white");
      board[1][col] = makePiece("pawn", "black");
    }

    // Place major pieces
    const backRank: PieceType[] = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"];
    for (let col = 0; col < 8; col++) {
      board[7][col] = makePiece(backRank[col], "white");
      board[0][col] = makePiece(backRank[col], "black");
    }

    return board;
  }

  private parseSquare(notation: string): { row: number; col: number } | null {
    if (notation.length !== 2) return null;
    const file = notation[0].toLowerCase();
    const rank = notation[1];
    const col = FILES.indexOf(file);
    const row = 8 - parseInt(rank);
    if (col < 0 || col > 7 || isNaN(row) || row < 0 || row > 7) return null;
    return { row, col };
  }

  private isValidMove(
    from: { row: number; col: number },
    to: { row: number; col: number },
    piece: Piece
  ): boolean {
    const dr = to.row - from.row;
    const dc = to.col - from.col;
    const absDr = Math.abs(dr);
    const absDc = Math.abs(dc);
    const adr = dr > 0 ? 1 : dr < 0 ? -1 : 0;
    const adc = dc > 0 ? 1 : dc < 0 ? -1 : 0;

    // Can't capture own piece
    const target = this.state.board[to.row][to.col];
    if (target && target.color === piece.color) return false;

    switch (piece.type) {
      case "pawn": {
        const dir = piece.color === "white" ? -1 : 1;
        const startRank = piece.color === "white" ? 6 : 1;
        // Forward one
        if (dc === 0 && dr === dir && !target) return true;
        // Forward two from start
        if (dc === 0 && dr === dir * 2 && from.row === startRank && !target) {
          if (!this.state.board[from.row + dir][from.col]) return true;
        }
        // Diagonal capture
        if (absDc === 1 && dr === dir && target) return true;
        return false;
      }

      case "knight":
        return (absDr === 2 && absDc === 1) || (absDr === 1 && absDc === 2);

      case "bishop":
        if (absDr !== absDc) return false;
        return this.pathClear(from, to, adr, adc);

      case "rook":
        if (dr !== 0 && dc !== 0) return false;
        return this.pathClear(from, to, adr, adc);

      case "queen":
        if (dr !== 0 && dc !== 0 && absDr !== absDc) return false;
        return this.pathClear(from, to, adr, adc);

      case "king":
        return absDr <= 1 && absDc <= 1;

      default:
        return false;
    }
  }

  private pathClear(
    from: { row: number; col: number },
    to: { row: number; col: number },
    dr: number,
    dc: number
  ): boolean {
    let r = from.row + dr;
    let c = from.col + dc;
    while (r !== to.row || c !== to.col) {
      if (this.state.board[r][c]) return false;
      r += dr;
      c += dc;
    }
    return true;
  }

  // ── MUD Rendering ──

  renderState(): string {
    const lines: string[] = [];

    lines.push("♟️ **The Standing Game**");

    if (this.state.phase === "waiting") {
      const names = this.state.players.map(
        (p) => `${p.displayName} (${p.color})`
      );
      lines.push(`Players: ${names.join(", ") || "none yet"}`);
      lines.push(`Actions: \`/game join\`, \`/game start\``);
      return lines.join("\n");
    }

    // Render board
    lines.push("");
    lines.push("```");
    lines.push("  a b c d e f g h");
    for (let row = 0; row < 8; row++) {
      let line = `${8 - row} `;
      for (let col = 0; col < 8; col++) {
        const piece = this.state.board[row][col];
        if (!piece) {
          line += ". ";
        } else {
          const sym = PIECE_SYMBOLS[piece.type][piece.color];
          line += sym + " ";
        }
      }
      line += `${8 - row}`;
      lines.push(line);
    }
    lines.push("  a b c d e f g h");
    lines.push("```");

    // Show piece personalities (abbreviated)
    if (this.state.phase === "playing") {
      const currentPlayer = this.state.players[this.state.currentPlayerIndex];
      lines.push(`> **${currentPlayer.displayName}'s** turn (${currentPlayer.color}).`);
      lines.push(`> \`/game move <from> <to> <motivation>\``);
      lines.push(`> _e.g. \`/game move e2 e4 ambition\`_`);

      // Show the personality of the current player's pieces
      lines.push("");
      lines.push("_Your pieces' natures:_");
      const personalities: string[] = [];
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          const piece = this.state.board[row][col];
          if (piece && piece.color === currentPlayer.color) {
            personalities.push(`${piece.type}@${FILES[col]}${8 - row}:${piece.personality}`);
          }
        }
      }
      // Show a subset to keep it readable
      lines.push(personalities.slice(0, 12).join(", ") + (personalities.length > 12 ? "..." : ""));
    }

    // Show recent moves with motivations
    if (this.state.moves.length > 0) {
      lines.push("");
      lines.push("_Recent moves:_");
      const recent = this.state.moves.slice(-4);
      for (const m of recent) {
        const capture = m.captured ? ` ♦️ captures ${m.captured.type}` : "";
        lines.push(`  ${m.displayName}: ${m.piece.type} ${m.from}→${m.to}${capture} — _"${m.motivation}"_`);
      }
    }

    if (this.state.phase === "resolved") {
      lines.push("");
      lines.push(`🏆 **${this.state.winner} wins!**`);
      lines.push(`Use \`/game start\` to play again, or \`/game end\` to stop.`);
    }

    return lines.join("\n");
  }
}

// ──────────────────────────────────────────────
// Constants for rendering
// ──────────────────────────────────────────────

const PIECE_SYMBOLS: Record<PieceType, Record<PieceColor, string>> = {
  king: { white: "♔", black: "♚" },
  queen: { white: "♕", black: "♛" },
  rook: { white: "♖", black: "♜" },
  bishop: { white: "♗", black: "♝" },
  knight: { white: "♘", black: "♞" },
  pawn: { white: "♙", black: "♟" },
};
