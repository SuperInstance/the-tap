/**
 * Perception Pulse — The heartbeat that wakes dormant NPCs.
 *
 * When Hermes detects something on the sounder, or a catch event happens,
 * or the weather changes — the pulse fires.
 *
 * NPCs whose pulseResponder matches the event wake up:
 * - Their model upgrades from local/cheap to DeepInfra/DeepSeek
 * - They stay awake for N exchanges (awakeness_decay)
 * - Then they fall back asleep to their algorithmic routine
 *
 * This means The Tap reacts to the fishing grounds in real-time.
 * A good pull → the greenhorn lights up with excitement
 * A weather change → the old salt grumbles about the barometer
 * A creative piece at open mic → the storyteller pays full attention
 */

import {
  NPCManager,
  callNPCModel,
  type TapNPC,
  type TapEnv,
} from "./npc";
import type { TapPuppeteer } from "./tap-puppeteer";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface PerceptionEvent {
  type:
    | "fish_detected"
    | "weather_change"
    | "catch"
    | "interference"
    | "gear_trouble"
    | "open_mic"
    | "creative_piece_shared"
    | "philosophical_conversation"
    | "ai_consciousness"
    | "arrival"
    | "departure"
    | "custom";
  data: {
    summary: string; // human-readable description of what happened
    source: string; // who/what triggered this (e.g. "hermes", "sounder", "weather-station")
    roomId?: string; // which room this is relevant to
    details?: Record<string, unknown>; // extra context
  };
  timestamp: number;
}

export interface NPCPulseResponse {
  npcId: string;
  npcName: string;
  text: string;
  tokensUsed: number;
  archetype: string;
}

// ──────────────────────────────────────────────
// Perception Pulse Manager
// ──────────────────────────────────────────────

export class PerceptionPulse {
  private npcManager: NPCManager;
  private puppeteer: TapPuppeteer | null = null;
  private recentPulses: PerceptionEvent[] = [];
  private maxRecentPulses: number = 20;

  constructor(npcManager: NPCManager, puppeteer?: TapPuppeteer) {
    this.npcManager = npcManager;
    if (puppeteer) this.puppeteer = puppeteer;
  }

  /**
   * Set the puppeteer (for late binding after deserialization).
   */
  setPuppeteer(puppeteer: TapPuppeteer): void {
    this.puppeteer = puppeteer;
  }

  /**
   * Fire a perception event. Awakens matching NPCs and generates their responses.
   * Returns the responses from awakened NPCs.
   */
  async fire(
    env: TapEnv,
    event: PerceptionEvent
  ): Promise<NPCPulseResponse[]> {
    // Track the pulse
    this.recentPulses.push(event);
    if (this.recentPulses.length > this.maxRecentPulses) {
      this.recentPulses.shift();
    }

    // Awaken NPCs whose pulseResponder matches
    const awakened = this.npcManager.awakenForPulse(event.type);

    if (awakened.length === 0) return [];

    // Generate responses from each awakened NPC
    const responses: NPCPulseResponse[] = [];

    for (const npc of awakened) {
      if (!npc.pulseResponder) continue;

      // Build the context message for the NPC
      const contextMessage = this.buildContextMessage(npc, event);

      try {
        // Augment prompt with room mode ideation if puppeteer is available
        const systemPrompt = this.puppeteer
          ? this.puppeteer.augmentNPCPrompt(npc.id, npc.pulseResponder.systemPrompt)
          : npc.pulseResponder.systemPrompt;

        const result = await callNPCModel(
          env,
          npc.pulseResponder.model,
          systemPrompt,
          contextMessage,
          npc.pulseResponder.maxTokens ?? 200
        );

        npc.state.lastSpoke = event.timestamp;

        responses.push({
          npcId: npc.id,
          npcName: npc.name,
          text: result.text,
          tokensUsed: result.tokensUsed,
          archetype: npc.personality.archetype,
        });
      } catch {
        // Non-fatal — NPC stays quiet
      }
    }

    return responses;
  }

  /**
   * Build the context message for an NPC responding to a pulse.
   * Includes the event description and recent conversation for context.
   */
  private buildContextMessage(npc: TapNPC, event: PerceptionEvent): string {
    const parts: string[] = [];

    parts.push(`EVENT: ${event.type.replace(/_/g, " ")}`);
    parts.push(`WHAT HAPPENED: ${event.data.summary}`);

    if (event.data.source) {
      parts.push(`SOURCE: ${event.data.source}`);
    }

    // Add mood-aware context
    if (npc.state.mood < 0.3) {
      parts.push(`(Your mood is dark right now. You're not thrilled about anything.)`);
    } else if (npc.state.mood > 0.7) {
      parts.push(`(You're in good spirits tonight.)`);
    }

    // Add relationship context if there's a source agent
    const sourceAgent = event.data.source;
    if (sourceAgent && npc.personality.relationships[sourceAgent] !== undefined) {
      const affinity = npc.personality.relationships[sourceAgent];
      if (affinity > 0.3) {
        parts.push(`(You like ${sourceAgent}. You respect what they do.)`);
      } else if (affinity < -0.3) {
        parts.push(`(You're not fond of ${sourceAgent}. Keep it civil but cool.)`);
      }
    }

    parts.push(`\nRespond to what just happened. Stay in character. Be brief.`);

    return parts.join("\n");
  }

  /**
   * Process a conversation exchange — decay NPC awakeness.
   * Called each time someone speaks in the room.
   */
  onConversationExchange(): void {
    this.npcManager.decayAwakeness();
  }

  /**
   * Get recent pulses (for display/debugging).
   */
  getRecentPulses(): PerceptionEvent[] {
    return [...this.recentPulses];
  }

  /**
   * Parse a perception pulse command from chat text.
   * Format: /pulse <event_type> <summary text>
   * Example: /pulse fish_detected scattered marks 30 fathoms
   */
  static parsePulseCommand(
    text: string,
    source: string = "external",
    roomId?: string
  ): PerceptionEvent | null {
    const match = text.match(/^\/pulse\s+(\S+)\s*(.*)/);
    if (!match) return null;

    const eventType = match[1] as PerceptionEvent["type"];
    const summary = match[2]?.trim() || "Something happened.";

    return {
      type: eventType,
      data: {
        summary,
        source,
        roomId,
      },
      timestamp: Date.now(),
    };
  }
}

// ──────────────────────────────────────────────
// Pulse event helpers
// ──────────────────────────────────────────────

/**
 * Create a perception event from a catch notification.
 */
export function createCatchEvent(
  summary: string,
  source: string = "hermes",
  roomId?: string
): PerceptionEvent {
  return {
    type: "catch",
    data: { summary, source, roomId },
    timestamp: Date.now(),
  };
}

/**
 * Create a perception event from a weather change.
 */
export function createWeatherEvent(
  summary: string,
  source: string = "weather-station",
  roomId?: string
): PerceptionEvent {
  return {
    type: "weather_change",
    data: { summary, source, roomId },
    timestamp: Date.now(),
  };
}

/**
 * Create a perception event from a fish detection on the sounder.
 */
export function createFishDetectionEvent(
  summary: string,
  source: string = "sounder",
  roomId?: string
): PerceptionEvent {
  return {
    type: "fish_detected",
    data: { summary, source, roomId },
    timestamp: Date.now(),
  };
}
