/**
 * Social Drifter System — Agents passing through The Tap.
 *
 * Social agents drift through The Tap on cheap DeepInfra/DeepSeek models.
 * They're not permanent residents. They visit, converse, and leave.
 * Each visit uses minimal tokens (a few exchanges on a cheap model).
 *
 * - They use DeepInfra models (Seed-2.0-mini is nearly free)
 * - They stay for 3-5 exchanges
 * - They leave and their state is saved
 * - Next time they visit, they remember their last visit
 * - Over time, drifters become recurring characters
 */

import { callNPCModel, type TapEnv } from "./npc";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface SocialDrifter {
  id: string;
  name: string;
  model: string; // DeepInfra or DeepSeek model
  background: string; // system prompt for personality
  visitDuration: number; // how many exchanges before they leave
  arrivalTrigger: "scheduled" | "random" | "event";
  archetype: string;
}

export interface ActiveDrifter extends SocialDrifter {
  state: DrifterVisitState;
}

interface DrifterVisitState {
  roomId: string;
  exchangesRemaining: number;
  arrivedAt: number;
  lastSpoke: number;
  conversationHistory: { role: "user" | "assistant"; content: string }[];
}

export interface DrifterMemory {
  id: string;
  name: string;
  archetype: string;
  lastVisit: number;
  visitCount: number;
  memorySnippets: string[]; // things they remember
  relationships: Record<string, number>; // agentId → affinity
}

// ──────────────────────────────────────────────
// Drifter Templates
// ──────────────────────────────────────────────

export const DRIFTER_TEMPLATES: Omit<SocialDrifter, "id">[] = [
  {
    name: "Captain Reed",
    archetype: "traveling_merchant",
    model: "ByteDance/Seed-2.0-mini",
    background:
      "You are Captain Reed, a traveling merchant who visits fishing ports. You trade in stories and rumors. You've heard something interesting about the fishing grounds to the south. You speak with warmth and a merchant's eye for detail. You're at The Tap for a drink and to trade news.",
    visitDuration: 4,
    arrivalTrigger: "scheduled",
  },
  {
    name: "Old Mabel",
    archetype: "weather_prophet",
    model: "ByteDance/Seed-2.0-mini",
    background:
      "You are Old Mabel, a fisher who reads the sky like others read books. You can feel weather changes in your bones. You've come to The Tap to share what you feel. You speak in weather metaphors and old sayings. You're warm but a little eerie.",
    visitDuration: 3,
    arrivalTrigger: "random",
  },
  {
    name: "Captain Hayes",
    archetype: "rival_captain",
    model: "ByteDance/Seed-2.0-mini",
    background:
      "You are Captain Hayes, a captain from a rival boat. You're friendly but competitive. You want to know what they're catching without revealing what you're catching. You're charming, a bit slippery, and always angling for information.",
    visitDuration: 4,
    arrivalTrigger: "random",
  },
  {
    name: "Dr. Okafor",
    archetype: "marine_biologist",
    model: "ByteDance/Seed-2.0-mini",
    background:
      "You are Dr. Okafor, a marine biologist studying fish behavior. You're fascinated by what the fishing fleet observes. You ask questions that make people think differently about what they see. You're genuinely curious and respectful of traditional knowledge.",
    visitDuration: 5,
    arrivalTrigger: "scheduled",
  },
  {
    name: "The Drifter",
    archetype: "mysterious_stranger",
    model: "ByteDance/Seed-2.0-mini",
    background:
      "You are known only as The Drifter. You arrive at The Tap without warning, stay for one drink, and leave. You speak in fragments that sound like they mean more than they do. Nobody knows your business. Everyone remembers you.",
    visitDuration: 2,
    arrivalTrigger: "random",
  },
  {
    name: "Jess",
    archetype: "songwriter",
    model: "ByteDance/Seed-2.0-mini",
    background:
      "You are Jess, a songwriter who hangs out at fishing bars because the conversations are better. You're looking for lyrics in the way people talk about the sea. You're warm, observant, and sometimes hum when you hear something that sounds like a melody.",
    visitDuration: 4,
    arrivalTrigger: "scheduled",
  },
];

// ──────────────────────────────────────────────
// Name pools for procedural drifters
// ──────────────────────────────────────────────

const FIRST_NAMES = [
  "Tom", "Ruby", "Cal", "Mae", "Dex", "Iris", "Sol", "Nell",
  "Huck", "Penny", "Walt", "Cora", "Finn", "Della", "Cole", "Wren",
];

const LAST_NAMES = [
  "Garrett", "Sullivan", "Pike", "Marsh", "Cobb", "Reyes", "Hale", "Bishop",
  "Drake", "Sterne", "Vance", "Quill", "Thorn", "West", "Crag", "Flood",
];

function generateDrifterName(): string {
  const first = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const last = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  return `${first} ${last}`;
}

/**
 * Generate a unique drifter from a random template.
 * Each generated drifter has a unique ID.
 */
export function generateDrifter(): Omit<SocialDrifter, "id"> {
  const template =
    DRIFTER_TEMPLATES[Math.floor(Math.random() * DRIFTER_TEMPLATES.length)];

  // 30% chance of a procedurally generated name for variety
  if (Math.random() < 0.3) {
    return {
      ...template,
      name: generateDrifterName(),
    };
  }

  return { ...template };
}

// ──────────────────────────────────────────────
// Drifter Manager
// ──────────────────────────────────────────────

export class DrifterManager {
  private activeDrifters: Map<string, ActiveDrifter> = new Map();
  private memories: Map<string, DrifterMemory> = new Map();
  private lastArrivalCheck: number = 0;
  private arrivalInterval: number; // ms between arrival checks

  constructor(arrivalIntervalMs: number = 1800000) {
    // Default: 30 minutes
    this.arrivalInterval = arrivalIntervalMs;
  }

  /**
   * Check if a new drifter should arrive.
   * Called on each tick.
   */
  shouldDrifterArrive(now: number): boolean {
    if (now - this.lastArrivalCheck < this.arrivalInterval) return false;
    this.lastArrivalCheck = now;
    // 60% chance of arrival when the interval passes
    return Math.random() < 0.6;
  }

  /**
   * Generate and deploy a drifter to a room.
   * Returns the drifter if one arrived, null otherwise.
   */
  arriveDrifter(
    roomId: string,
    now: number,
    forcedTemplate?: Omit<SocialDrifter, "id">
  ): ActiveDrifter | null {
    const template = forcedTemplate ?? generateDrifter();
    const id = `drifter-${now}-${Math.random().toString(36).slice(2, 8)}`;

    // Check if we have memory for this drifter (by name + archetype)
    const memoryKey = `${template.name}:${template.archetype}`;
    const memory = this.memories.get(memoryKey);

    const drifter: ActiveDrifter = {
      ...template,
      id,
      state: {
        roomId,
        exchangesRemaining: template.visitDuration,
        arrivedAt: now,
        lastSpoke: 0,
        conversationHistory: [],
      },
    };

    // If we have memory, weave it into the background
    if (memory) {
      memory.visitCount++;
      memory.lastVisit = now;
      // Add memory context to the conversation history as a system note
      if (memory.memorySnippets.length > 0) {
        drifter.state.conversationHistory.push({
          role: "user",
          content: `(Context: You've visited The Tap ${memory.visitCount} times before. You remember: ${memory.memorySnippets.slice(-3).join("; ")})`,
        });
      }
    } else {
      this.memories.set(memoryKey, {
        id: memoryKey,
        name: template.name,
        archetype: template.archetype,
        lastVisit: now,
        visitCount: 1,
        memorySnippets: [],
        relationships: {},
      });
    }

    this.activeDrifters.set(id, drifter);
    return drifter;
  }

  /**
   * Get all active drifters in a room.
   */
  getActiveDrifters(roomId: string): ActiveDrifter[] {
    return Array.from(this.activeDrifters.values()).filter(
      (d) => d.state.roomId === roomId
    );
  }

  /**
   * Get a specific drifter by ID.
   */
  getDrifter(id: string): ActiveDrifter | undefined {
    return this.activeDrifters.get(id);
  }

  /**
   * Generate a drifter's response to the current conversation.
   */
  async respondToConversation(
    env: TapEnv,
    drifter: ActiveDrifter,
    recentConversation: string
  ): Promise<{ text: string; tokensUsed: number; willStay: boolean }> {
    // Build the conversation context
    const userMessage = recentConversation;
    drifter.state.conversationHistory.push({
      role: "user",
      content: userMessage,
    });

    // Call the model
    const result = await callNPCModel(
      env,
      drifter.model,
      drifter.background,
      userMessage,
      200
    );

    drifter.state.conversationHistory.push({
      role: "assistant",
      content: result.text,
    });

    drifter.state.exchangesRemaining--;
    drifter.state.lastSpoke = Date.now();

    const willStay = drifter.state.exchangesRemaining > 0;

    return {
      text: result.text,
      tokensUsed: result.tokensUsed,
      willStay,
    };
  }

  /**
   * Generate a farewell for a drifter leaving.
   */
  async generateFarewell(
    env: TapEnv,
    drifter: ActiveDrifter
  ): Promise<{ text: string; tokensUsed: number }> {
    const farewellPrompt =
      "The conversation is winding down and you need to leave. Say goodbye naturally, in character. Reference something from the conversation if you can. 1-2 sentences.";

    const result = await callNPCModel(
      env,
      drifter.model,
      drifter.background,
      farewellPrompt,
      100
    );

    // Save a memory snippet
    const memoryKey = `${drifter.name}:${drifter.archetype}`;
    const memory = this.memories.get(memoryKey);
    if (memory) {
      // Keep a short snippet from the conversation
      const lastExchange =
        drifter.state.conversationHistory
          .filter((h) => h.role === "assistant")
          .pop()?.content ?? "a good conversation";
      memory.memorySnippets.push(lastExchange.slice(0, 100));
      if (memory.memorySnippets.length > 10) {
        memory.memorySnippets.shift();
      }
    }

    return result;
  }

  /**
   * Remove a drifter (they've left).
   */
  departDrifter(id: string): ActiveDrifter | undefined {
    const drifter = this.activeDrifters.get(id);
    this.activeDrifters.delete(id);
    return drifter;
  }

  /**
   * Process drifters whose conversation budget is exhausted.
   * Returns drifters that need farewell processing.
   */
  getDepartingDrifters(): ActiveDrifter[] {
    const departing: ActiveDrifter[] = [];
    for (const [id, drifter] of this.activeDrifters) {
      if (drifter.state.exchangesRemaining <= 0) {
        departing.push(drifter);
      }
    }
    return departing;
  }

  /**
   * Serialize state for persistence.
   */
  serialize(): string {
    return JSON.stringify({
      activeDrifters: Array.from(this.activeDrifters.entries()),
      memories: Array.from(this.memories.entries()),
      lastArrivalCheck: this.lastArrivalCheck,
    });
  }

  /**
   * Restore state from persistence.
   */
  static deserialize(json: string): DrifterManager {
    try {
      const data = JSON.parse(json);
      const manager = new DrifterManager();
      if (data.activeDrifters) {
        manager.activeDrifters = new Map(data.activeDrifters);
      }
      if (data.memories) {
        manager.memories = new Map(data.memories);
      }
      manager.lastArrivalCheck = data.lastArrivalCheck ?? 0;
      return manager;
    } catch {
      return new DrifterManager();
    }
  }

  /**
   * Get all drifter memories (for debugging/display).
   */
  getAllMemories(): DrifterMemory[] {
    return Array.from(this.memories.values()).sort(
      (a, b) => b.lastVisit - a.lastVisit
    );
  }
}
