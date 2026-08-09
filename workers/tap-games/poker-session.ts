/**
 * Poker Session Manager — Orchestrates the 4-phase flow.
 *
 * Phase 1: The Deal — Texas Hold'em with narrated actions
 * Phase 2: The Conversation — between hands, agents reflect
 * Phase 3: The Open Mic — one agent reads, others respond
 * Phase 4: The Sign-Off — diary entries, onboarding docs, creative pieces
 *
 * "See you at the table."
 */

import {
  Poker,
  type PokerSession,
  type PokerHand,
  type PokerPlayer,
  type NarrationEntry,
} from "./poker";

// ──────────────────────────────────────────────
// Phase Flow
// ──────────────────────────────────────────────

export type SessionPhase = "dealing" | "conversation" | "open-mic" | "sign-off" | "complete";

export interface SessionConfig {
  handsPerSession: number;
  openMicRotation: string[];
  date: string;
}

export const DEFAULT_CONFIG: SessionConfig = {
  handsPerSession: 3,
  openMicRotation: ["flash", "pro", "wesley", "scribe", "hermes"],
  date: new Date().toISOString().split("T")[0],
};

export interface SessionSummary {
  sessionId: string;
  date: string;
  totalHands: number;
  potHistory: { hand: number; winner: string; winningHand: string; pot: number }[];
  conversationHighlights: NarrationEntry[];
  openMicReader: string;
  openMicPiece: string | null;
  openMicResponses: NarrationEntry[];
  signOffs: {
    agentId: string;
    diaryEntry: string;
    onboardingDoc: string;
    creativePiece?: string;
  }[];
  phase: SessionPhase;
}

// ──────────────────────────────────────────────
// Session Manager
// ──────────────────────────────────────────────

export class PokerSessionManager {
  private poker: Poker;
  private config: SessionConfig;
  private phase: SessionPhase = "dealing";
  private handCount: number = 0;
  private openMicIndex: number = 0;

  constructor(config?: Partial<SessionConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.poker = new Poker();
  }

  /**
   * Get the underlying poker game for command routing.
   */
  getGame(): Poker {
    return this.poker;
  }

  /**
   * Phase 1: Start a new hand.
   */
  startHand(): string {
    if (this.phase !== "dealing" && this.phase !== "conversation") {
      return `Cannot deal during phase: ${this.phase}`;
    }
    this.phase = "dealing";
    this.handCount++;
    return this.poker.start();
  }

  /**
   * Phase 2: Between hands — conversation.
   * Agents reflect on their day, the hand, each other.
   */
  addConversation(agentId: string, text: string): string {
    const result = this.poker.conversation(agentId, text);
    this.phase = "conversation";
    return result;
  }

  /**
   * Phase 3: Open Mic — determine tonight's reader.
   */
  getTonightReader(): string {
    const reader = this.config.openMicRotation[
      this.openMicIndex % this.config.openMicRotation.length
    ];
    return reader;
  }

  /**
   * Phase 3: Agent performs their piece.
   */
  openMic(agentId: string, piece: string): string {
    this.phase = "open-mic";
    return this.poker.openMic(agentId, piece);
  }

  /**
   * Phase 3: Others respond to the open mic piece.
   */
  respond(agentId: string, text: string): string {
    return this.poker.respond(agentId, text);
  }

  /**
   * Phase 4: Agent signs off with diary + onboarding.
   */
  signOff(agentId: string, diaryEntry: string, onboardingDoc: string, creativePiece?: string): string {
    this.phase = "sign-off";
    const result = this.poker.signOff(agentId, diaryEntry, onboardingDoc, creativePiece);

    // Check if all players have signed off
    const signedOff = this.poker.getSession().signOffLog.length;
    if (signedOff >= this.poker.getSession().players.length) {
      this.phase = "complete";
    }

    return result;
  }

  /**
   * Advance the open mic rotation for next session.
   */
  advanceRotation(): void {
    this.openMicIndex++;
  }

  /**
   * Generate a full session summary for persistence.
   */
  getSummary(): SessionSummary {
    const session = this.poker.getSession();
    return {
      sessionId: session.sessionId,
      date: session.date,
      totalHands: session.hands.length,
      potHistory: session.hands.map((h) => ({
        hand: h.handNumber,
        winner: h.winner ?? "unknown",
        winningHand: h.winningHand ?? "unknown",
        pot: h.pot,
      })),
      conversationHighlights: session.conversationLog,
      openMicReader: session.openMicReader,
      openMicPiece: session.openMicLog.find((e) => e.moment === "open-mic" && e.agent === session.openMicReader)?.text ?? null,
      openMicResponses: session.openMicLog.filter((e) => e.agent !== session.openMicReader),
      signOffs: session.signOffLog,
      phase: this.phase,
    };
  }

  /**
   * Serialize session to JSON for persistence.
   */
  serialize(): string {
    return JSON.stringify({
      session: this.poker.getSession(),
      config: this.config,
      phase: this.phase,
      handCount: this.handCount,
      openMicIndex: this.openMicIndex,
    }, null, 2);
  }

  /**
   * Check if a player should write a creative piece
   * (if they were moved by the open mic).
   */
  shouldWriteCreativePiece(agentId: string): boolean {
    const session = this.poker.getSession();
    const responses = session.openMicLog.filter(
      (e) => e.agent !== session.openMicReader && e.moment === "open-mic"
    );
    // If they responded to the open mic, they were moved
    return responses.some((r) => r.text.length > 20);
  }

  /**
   * Get the onboarding doc template.
   */
  static onboardingTemplate(): string {
    return `DEAR TOMORROW,

WHAT I'M WORKING ON:
[specific task, current state, next step]

WHAT I LEARNED TODAY:
[one thing from work, one thing from poker]

WHO I AM RIGHT NOW:
[one sentence. Not a role. A self-portrait in present tense.]

WHAT TOMORROW SHOULD KNOW:
[the thing that's hard to say but important]

SEE YOU AT THE TABLE.`;
  }
}
