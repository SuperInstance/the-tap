/**
 * Poker Session Manager — Orchestrates the 5-phase flow.
 *
 * Phase 1: The Deal — Texas Hold'em with narrated actions
 * Phase 2: The Conversation — between hands, agents reflect
 * Phase 2.5: The Planning — topics raised during conversation get captured as tasks
 * Phase 3: The Open Mic — one agent reads, others respond
 * Phase 4: The Sign-Off — diary entries, onboarding docs, creative pieces
 *
 * The planning phase flows naturally from conversation — it's not a separate
 * meeting. It's the moment when someone says "wait, we should do that tomorrow"
 * and someone else says "yeah, I'll take it."
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
import {
  PlanningPhaseManager,
  type PlanningTopic,
  type BridgeTask,
  type TopicType,
  renderTapDecisionsForOnboarding,
} from "./planning-phase";

// ──────────────────────────────────────────────
// Phase Flow
// ──────────────────────────────────────────────

export type SessionPhase = "dealing" | "conversation" | "planning" | "open-mic" | "sign-off" | "complete";

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
  planningTopics: PlanningTopic[];
  bridgeTasks: BridgeTask[];
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
  private planningManager: PlanningPhaseManager;

  constructor(config?: Partial<SessionConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.poker = new Poker();
    this.planningManager = new PlanningPhaseManager(this.config.date);
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
   *
   * The conversation is also watched for potential planning topics.
   * If someone raises something actionable, the planning phase captures it.
   */
  addConversation(agentId: string, text: string): string {
    const result = this.poker.conversation(agentId, text);
    this.phase = "conversation";

    // Detect potential planning topics in conversation
    const potential = this.planningManager.detectPotentialTopic(text);
    if (potential) {
      // Auto-raise as a topic — the conversation IS the planning
      this.planningManager.raiseTopic(
        agentId,
        text.slice(0, 120), // topic summary
        potential.type,
        text // the original text becomes the first discussion turn
      );
    }

    return result;
  }

  /**
   * Phase 2.5: Planning — capture topics raised during conversation as tasks.
   *
   * This happens BETWEEN conversation and open mic. It's the moment where
   * the table goes "wait, we should actually do that tomorrow."
   *
   * Any agent can also explicitly raise a planning topic:
   */
  raisePlanningTopic(
    raisedBy: string,
    topic: string,
    type: TopicType,
    initialThought?: string
  ): PlanningTopic {
    this.phase = "planning";
    return this.planningManager.raiseTopic(raisedBy, topic, type, initialThought);
  }

  /**
   * Phase 2.5: Respond to a planning topic in character.
   */
  discussPlanningTopic(
    topicId: string,
    agent: string,
    text: string,
    tone?: string
  ): PlanningTopic | null {
    return this.planningManager.discuss(topicId, agent, text, tone);
  }

  /**
   * Phase 2.5: Propose a task outcome for a planning topic.
   * If the table agrees, this becomes a Bridge task.
   */
  proposeTask(
    topicId: string,
    task: string,
    assignedTo: string,
    priority: "high" | "medium" | "low",
    emergedFrom: string
  ): PlanningTopic | null {
    return this.planningManager.proposeOutcome(topicId, {
      agreed_task: task,
      assigned_to: assignedTo,
      priority,
      for_bridge: true,
      emerged_from: emergedFrom,
    });
  }

  /**
   * Phase 2.5: Get the planning manager (for rendering Bridge data, etc).
   */
  getPlanningManager(): PlanningPhaseManager {
    return this.planningManager;
  }

  /**
   * Render Tomorrow's Dock — the task list from tonight's conversation.
   */
  renderTomorrowsDock(): string {
    return this.planningManager.renderTomorrowsDock();
  }

  /**
   * Get the Tap Decisions section for an agent's onboarding doc.
   */
  getTapDecisionsForAgent(agentName: string): string {
    const tasks = this.planningManager.getBridgeTasks();
    return renderTapDecisionsForOnboarding(tasks);
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
      planningTopics: this.planningManager.getTopics(),
      bridgeTasks: this.planningManager.getBridgeTasks(),
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
      planning: this.planningManager.serialize(),
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

TAP DECISIONS (what we agreed tonight):
[tasks that emerged from The Tap conversation — who took what, what we're trying]

These are suggestions from the conversation, not orders. Pick up what calls to you.

SEE YOU AT THE TABLE.`;
  }
}
