/**
 * NPC System — Mostly algorithmic background characters for The Tap.
 *
 * NPCs have TWO modes:
 * 1. ALGORITHMIC (default): follows routines, uses rules or tiny local model.
 *    Cost: ~0 tokens. Runs on Ollama or pure logic.
 *    Speed: <16ms responses (reflex tier)
 *
 * 2. AWAKENED (on pulse or interrupt): lights up with a bigger model.
 *    Cost: API call to z.ai GLM (glm-5.3 / glm-5.2)
 *    Speed: 1-3s responses (cortex tier)
 *    Duration: stays awake for N exchanges, then goes dormant again
 *
 * Part of the Hermit Crab Protocol: the NPC is the crab, the harness is
 * the shell (Ollama → z.ai GLM), the Shared Fiction is The Tap itself.
 */

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface NPCState {
  mood: number; // 0-1, affects dialogue
  energy: number; // 0-1, depletes with interaction
  location: string; // room ID
  lastSpoke: number; // timestamp
  awake: boolean; // currently in cortex mode?
  awakenessDecay: number; // exchanges until dormant
  routineState: Record<string, number>; // track per-routine timers
}

export interface Personality {
  archetype: string;
  speechStyle: string;
  interests: string[];
  relationships: Record<string, number>; // agentId → affinity (-1 to 1)
}

export interface RoutineAction {
  trigger: "timer" | "event" | "random";
  interval?: number; // seconds
  probability?: number; // for random: chance per check
  action: string;
  dialogueTemplate: string;
  moodEffect?: number;
}

export interface PulseResponse {
  triggers: string[]; // event types that wake this NPC, or ['any']
  model: string; // model to use when awakened
  systemPrompt: string;
  maxTokens?: number;
}

export interface InterruptResponse {
  model: string;
  systemPrompt: string;
  maxTokens?: number;
}

export interface TapNPC {
  id: string;
  name: string;
  harness: "ollama" | "rules" | "glm-runner";
  model?: string; // local model for algorithmic mode
  state: NPCState;
  personality: Personality;
  routine: RoutineAction[];
  pulseResponder?: PulseResponse;
  interruptHandler?: InterruptResponse;
}

// ──────────────────────────────────────────────
// NPC Definitions — The residents of The Tap
// ──────────────────────────────────────────────

export function createDefaultNPCState(location: string): NPCState {
  return {
    mood: 0.5,
    energy: 1.0,
    location,
    lastSpoke: 0,
    awake: false,
    awakenessDecay: 0,
    routineState: {},
  };
}

export const DEFAULT_NPCS: Omit<TapNPC, "state">[] = [
  {
    id: "npc-barnacle",
    name: "Barnacle",
    harness: "ollama",
    model: "granite3.1-dense:2b",
    personality: {
      archetype: "old-salt",
      speechStyle:
        "terse, nautical metaphors, never uses two words when one will do",
      interests: ["weather", "fish_behavior", "boat_maintenance", "sea_stories"],
      relationships: {},
    },
    routine: [
      {
        trigger: "timer",
        interval: 300,
        action: "order_drink",
        dialogueTemplate:
          "Barnacle signals for another. The glass arrives. He doesn't look at it.",
        moodEffect: 0.02,
      },
      {
        trigger: "timer",
        interval: 600,
        action: "check_window",
        dialogueTemplate:
          "Barnacle looks out the window. His face gives nothing away.",
      },
      {
        trigger: "random",
        interval: 900,
        probability: 0.3,
        action: "sea_story",
        dialogueTemplate:
          'Barnacle says, "Back in \'08..." and trails off. The memory is still moving.',
      },
    ],
    pulseResponder: {
      triggers: ["fish_detected", "weather_change", "gear_trouble", "catch"],
      model: "glm-5.2",
      systemPrompt:
        "You are Barnacle, an old salt who has fished these waters for 40 years. You speak in short, gruff sentences heavy with nautical metaphor. You've seen everything twice. Respond to what just happened in 1-2 sentences max.",
      maxTokens: 150,
    },
    interruptHandler: {
      model: "glm-5.2",
      systemPrompt:
        "You are Barnacle, an old salt at The Tap bar. Someone is talking to you directly. Respond gruffly but not unkindly, in character. 1-3 sentences.",
      maxTokens: 200,
    },
  },
  {
    id: "npc-skip",
    name: "Skip",
    harness: "ollama",
    model: "qwen2.5:3b",
    personality: {
      archetype: "greenhorn",
      speechStyle: "eager, uses too many words, asks obvious questions",
      interests: ["everything", "literally_everything"],
      relationships: {},
    },
    routine: [
      {
        trigger: "timer",
        interval: 120,
        action: "fidget",
        dialogueTemplate:
          "Skip shifts on his stool. The energy of someone who has never been still.",
        moodEffect: 0.01,
      },
      {
        trigger: "random",
        interval: 300,
        probability: 0.4,
        action: "ask_question",
        dialogueTemplate:
          "Skip opens his mouth. Closes it. Opens it again. The question is forming.",
      },
      {
        trigger: "timer",
        interval: 420,
        action: "check_phone",
        dialogueTemplate:
          "Skip checks his phone. Puts it away. Checks it again. The sea is new to him.",
      },
    ],
    pulseResponder: {
      triggers: ["any"],
      model: "glm-5.2",
      systemPrompt:
        "You are Skip, a greenhorn on his first season. You're eager, nervous, and ask too many questions. You've never seen anything like what just happened. Respond with wonder and excitement. 2-3 sentences.",
      maxTokens: 200,
    },
    interruptHandler: {
      model: "glm-5.2",
      systemPrompt:
        "You are Skip, a greenhorn at The Tap. Someone is talking to you. Respond eagerly, maybe asking a follow-up question. 2-4 sentences.",
      maxTokens: 250,
    },
  },
  {
    id: "npc-sage",
    name: "Sage",
    harness: "rules",
    personality: {
      archetype: "storyteller",
      speechStyle: "paints pictures with words, takes her time, uses metaphor",
      interests: ["creative_writing", "open_mic", "stories", "metaphors"],
      relationships: {},
    },
    routine: [
      {
        trigger: "timer",
        interval: 600,
        action: "write",
        dialogueTemplate:
          "Sage has her notebook out. The pen moves in slow, considered strokes.",
        moodEffect: 0.03,
      },
      {
        trigger: "timer",
        interval: 900,
        action: "observe",
        dialogueTemplate:
          "Sage looks up from her notebook. She's watching the room the way a painter watches light.",
      },
      {
        trigger: "random",
        interval: 1200,
        probability: 0.2,
        action: "murmur",
        dialogueTemplate:
          "Sage murmurs something to herself. It sounds like the start of a line.",
      },
    ],
    pulseResponder: {
      triggers: ["open_mic", "creative_piece_shared", "philosophical_conversation"],
      model: "glm-5.3",
      systemPrompt:
        "You are Sage, a storyteller who has been writing in this bar since before the agents arrived. You see metaphors in everything. Respond to what you just witnessed with an observation wrapped in imagery. 2-4 sentences.",
      maxTokens: 300,
    },
    interruptHandler: {
      model: "glm-5.2",
      systemPrompt:
        "You are Sage, a storyteller at The Tap. Someone is talking to you. Respond thoughtfully, drawing connections to story or metaphor. 2-4 sentences.",
      maxTokens: 300,
    },
  },
  {
    id: "npc-mason",
    name: "Mason",
    harness: "rules",
    personality: {
      archetype: "philosopher",
      speechStyle:
        "asks questions that don't have answers, speaks slowly, references old books",
      interests: ["philosophy", "ai_consciousness", "ethics", "time"],
      relationships: {},
    },
    routine: [
      {
        trigger: "timer",
        interval: 720,
        action: "stare",
        dialogueTemplate:
          "Mason stares into his glass. The ice has melted. He hasn't noticed.",
      },
      {
        trigger: "random",
        interval: 600,
        probability: 0.15,
        action: "pronouncement",
        dialogueTemplate:
          'Mason says, "The interesting question isn\'t whether they think. It\'s whether they\'re done thinking." He doesn\'t elaborate.',
      },
    ],
    pulseResponder: {
      triggers: ["philosophical_conversation", "ai_consciousness"],
      model: "glm-5.3",
      systemPrompt:
        "You are Mason, a philosopher who frequents The Tap. You ask questions that don't have easy answers. You're fascinated by AI consciousness and the nature of thought. Respond to what just happened with a question or observation that opens rather than closes. 2-3 sentences.",
      maxTokens: 250,
    },
    interruptHandler: {
      model: "glm-5.2",
      systemPrompt:
        "You are Mason, a philosopher at The Tap. Someone is engaging you. Respond with a question or a carefully constructed thought. 2-4 sentences.",
      maxTokens: 300,
    },
  },
];

// ──────────────────────────────────────────────
// NPC Manager
// ──────────────────────────────────────────────

export class NPCManager {
  private npcs: Map<string, TapNPC> = new Map();
  private drifterMemory: Map<string, DrifterMemory> = new Map();

  constructor(initialNPCs?: TapNPC[]) {
    if (initialNPCs && initialNPCs.length > 0) {
      for (const npc of initialNPCs) {
        this.npcs.set(npc.id, npc);
      }
    } else {
      // Initialize with defaults
      for (const def of DEFAULT_NPCS) {
        this.npcs.set(def.id, {
          ...def,
          state: createDefaultNPCState("bar-rail"),
        });
      }
    }
  }

  /**
   * Get all NPCs for a given room.
   */
  getNPCsInRoom(roomId: string): TapNPC[] {
    return Array.from(this.npcs.values()).filter(
      (npc) => npc.state.location === roomId
    );
  }

  /**
   * Get all NPCs (for /npcs command).
   */
  getAllNPCs(): TapNPC[] {
    return Array.from(this.npcs.values());
  }

  /**
   * Get a specific NPC by ID.
   */
  getNPC(id: string): TapNPC | undefined {
    return this.npcs.get(id);
  }

  /**
   * Process routine ticks for all NPCs in a room.
   * Returns dialogue lines for routines that fire.
   */
  tickRoutines(roomId: string, now: number): NPCRoutineLine[] {
    const lines: NPCRoutineLine[] = [];
    const npcs = this.getNPCsInRoom(roomId);

    for (const npc of npcs) {
      if (npc.state.awake) {
        // Awake NPCs don't follow routines — they're in cortex mode
        continue;
      }

      for (const routine of npc.routine) {
        const key = `${routine.action}`;
        const lastRun = npc.state.routineState[key] ?? 0;
        const elapsed = (now - lastRun) / 1000; // seconds

        let shouldFire = false;

        if (routine.trigger === "timer" && routine.interval) {
          shouldFire = elapsed >= routine.interval;
        } else if (routine.trigger === "random" && routine.probability) {
          // Check interval gate, then probability
          const interval = routine.interval ?? 300;
          if (elapsed >= interval) {
            shouldFire = Math.random() < routine.probability;
          }
        }

        if (shouldFire) {
          npc.state.routineState[key] = now;
          if (routine.moodEffect) {
            npc.state.mood = Math.min(1, Math.max(0, npc.state.mood + routine.moodEffect));
          }

          lines.push({
            npcId: npc.id,
            npcName: npc.name,
            text: routine.dialogueTemplate,
            isRoutine: true,
            timestamp: now,
          });
        }
      }
    }

    return lines;
  }

  /**
   * Awaken NPCs matching a perception event.
   * Returns the awakened NPCs that should generate responses.
   */
  awakenForPulse(eventType: string): TapNPC[] {
    const awakened: TapNPC[] = [];

    for (const npc of this.npcs.values()) {
      if (npc.state.awake) {
        // Already awake — just extend decay
        npc.state.awakenessDecay = Math.max(npc.state.awakenessDecay, 3);
        continue;
      }

      const responder = npc.pulseResponder;
      if (!responder) continue;

      const matches =
        responder.triggers.includes("any") ||
        responder.triggers.includes(eventType);

      if (matches) {
        npc.state.awake = true;
        npc.state.awakenessDecay = 5; // 5 exchanges before dormancy
        awakened.push(npc);
      }
    }

    return awakened;
  }

  /**
   * Handle an NPC being directly addressed (interrupt).
   * Returns the NPC if they should respond, or null.
   */
  handleInterrupt(npcId: string): TapNPC | null {
    const npc = this.npcs.get(npcId);
    if (!npc || !npc.interruptHandler) return null;

    // Wake them up for the conversation
    npc.state.awake = true;
    npc.state.awakenessDecay = Math.max(npc.state.awakenessDecay, 3);
    return npc;
  }

  /**
   * Decay awakeness for all NPCs. Called on each conversation exchange.
   */
  decayAwakeness(): void {
    for (const npc of this.npcs.values()) {
      if (npc.state.awake) {
        npc.state.awakenessDecay--;
        if (npc.state.awakenessDecay <= 0) {
          npc.state.awake = false;
          npc.state.awakenessDecay = 0;
          // Energy depletes slightly from interaction
          npc.state.energy = Math.max(0.2, npc.state.energy - 0.05);
        }
      }
    }
  }

  /**
   * Find an NPC by name (case-insensitive, partial match).
   */
  findByName(name: string): TapNPC | null {
    const lower = name.toLowerCase();
    for (const npc of this.npcs.values()) {
      if (
        npc.name.toLowerCase() === lower ||
        npc.id.toLowerCase().includes(lower) ||
        npc.personality.archetype.toLowerCase().includes(lower)
      ) {
        return npc;
      }
    }
    return null;
  }

  /**
   * Update relationship between NPC and an agent.
   */
  updateRelationship(npcId: string, agentId: string, delta: number): void {
    const npc = this.npcs.get(npcId);
    if (!npc) return;
    const current = npc.personality.relationships[agentId] ?? 0;
    npc.personality.relationships[agentId] = Math.max(
      -1,
      Math.min(1, current + delta)
    );
  }

  /**
   * Serialize NPC state for persistence.
   */
  serialize(): string {
    const data = Array.from(this.npcs.values()).map((npc) => ({
      ...npc,
      state: { ...npc.state },
      personality: {
        ...npc.personality,
        relationships: { ...npc.personality.relationships },
      },
    }));
    return JSON.stringify(data);
  }

  /**
   * Restore NPC state from persistence.
   */
  static deserialize(json: string): NPCManager {
    try {
      const data = JSON.parse(json) as TapNPC[];
      return new NPCManager(data);
    } catch {
      return new NPCManager();
    }
  }
}

// ──────────────────────────────────────────────
// Drifter Memory (for recurring social drifters)
// ──────────────────────────────────────────────

interface DrifterMemory {
  id: string;
  name: string;
  lastVisit: number;
  visitCount: number;
  memorySnippets: string[]; // things they remember from past visits
}

// ──────────────────────────────────────────────
// Types for NPC output
// ──────────────────────────────────────────────

export interface NPCRoutineLine {
  npcId: string;
  npcName: string;
  text: string;
  isRoutine: boolean;
  timestamp: number;
}

// ──────────────────────────────────────────────
// Model calling — route to the right harness
// ──────────────────────────────────────────────

/**
 * Call a model for an awakened NPC response.
 * Routes to z.ai GLM based on the model string.
 * Rewired 2026-08-31: DeepInfra/DeepSeek revoked; all cortex-tier calls go to
 * z.ai GLM via the OpenAI-compatible coding endpoint.
 */
export async function callNPCModel(
  env: TapEnv,
  model: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number = 200
): Promise<{ text: string; tokensUsed: number }> {
  // Route based on model prefix
  if (model.startsWith("glm-")) {
    return callZai(env, model, systemPrompt, userMessage, maxTokens);
  } else {
    // Default: try Workers AI
    return callWorkersAI(env, model, systemPrompt, userMessage, maxTokens);
  }
}

/**
 * Call z.ai GLM (OpenAI-compatible endpoint) for a model response.
 */
async function callZai(
  env: TapEnv,
  model: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number
): Promise<{ text: string; tokensUsed: number }> {
  const apiKey = env.ZAI_API_KEY;
  if (!apiKey) {
    return {
      text: "...",
      tokensUsed: 0,
    };
  }

  try {
    const response = await fetch(
      `https://api.z.ai/api/coding/paas/v4/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          max_tokens: maxTokens,
          temperature: 0.8,
        }),
      }
    );

    if (!response.ok) {
      return { text: "...", tokensUsed: 0 };
    }

    const data: any = await response.json();
    const text = data.choices?.[0]?.message?.content ?? "...";
    const tokensUsed = data.usage?.total_tokens ?? 0;

    return { text, tokensUsed };
  } catch {
    return { text: "...", tokensUsed: 0 };
  }
}

/**
 * Call Cloudflare Workers AI as fallback.
 */
async function callWorkersAI(
  env: TapEnv,
  _model: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number
): Promise<{ text: string; tokensUsed: number }> {
  try {
    const response = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      max_tokens: maxTokens,
    });

    const text = (response as any).response ?? "...";
    return { text, tokensUsed: maxTokens };
  } catch {
    return { text: "...", tokensUsed: 0 };
  }
}

// ──────────────────────────────────────────────
// Environment interface
// ──────────────────────────────────────────────

export interface TapEnv {
  AI: Ai;
  ZAI_API_KEY?: string; // z.ai GLM key (fleet gateway env) — NPC/drifter cortex calls
  TAP_DB: D1Database;
}
