/**
 * Seeded Stranger System — SMP bots that visit The Tap as strangers.
 *
 * The Penrose Connection:
 * Where the seed "lands" on the aperiodic pattern determines what kind of stranger.
 * The pattern ensures no two strangers are exactly alike.
 * But patterns recur (the aperiodic property) — so some strangers feel familiar.
 *
 * Lifecycle:
 * 1. A seed is created (by the DJ, by a ZeroClaw molting, or pre-seeded)
 * 2. The DJ drops the stranger into the room as a curveball
 * 3. The stranger tells their opening line
 * 4. Agents react — the stranger develops PROCEDURALLY through those reactions
 * 5. The stranger stays for N exchanges, then leaves
 * 6. The conversation they started might continue after they're gone
 *
 * The stranger is NOT scripted past their opening. They grow through interaction.
 * Positive reactions → they open up.
 * Negative reactions → they get defensive or leave.
 * Ignored → they fade out early.
 */

import { callNPCModel, type TapEnv } from "./npc";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

/**
 * The Penrose position — where this seed lands on the aperiodic pattern.
 * Ring 0 is the center. Higher rings are further from the core.
 * Angle (0–360°) determines the personality vector.
 *
 * The aperiodic property means:
 * - No two (ring, angle) pairs produce the exact same personality
 * - But some positions feel echoes of others (the recurring local patterns)
 */
export interface PenrosePosition {
  ring: number;
  angle: number; // 0–360
}

/**
 * The molted shell — what the creator was thinking when they made this seed.
 * This is the "shell" the ZeroClaw left behind when they grew too big for it.
 * The stranger carries this shape without knowing it.
 */
export interface CreatorStateSnapshot {
  identity: string;          // "I was building the tile actor system"
  mood: string;              // "excited but tired"
  recentWork: string;        // "just finished the deadband architecture"
  creativeConcern: string;   // "thinking about what happens when a tile becomes static"
}

/**
 * An SMP bot seed — the genetic code of a stranger.
 * Seed + Model + Prompt = Stable Output.
 * But the output DEVELOPS through conversation.
 */
export interface SMPBotSeed {
  id: string;
  createdBy: string;         // "lucineer" | "zeroclaw-pebble" | "tap-dj"
  createdAt: string;

  // Where this seed lands on the Penrose pattern
  penrosePosition: PenrosePosition;

  // The molted shell — what the creator was thinking
  creatorStateSnapshot: CreatorStateSnapshot;

  // What the stranger brings to The Tap
  openingLine: string;
  backstory: string;
  conversationSeed: string;   // the topic they introduce
  modelToUse: string;

  // Personality vector derived from Penrose position
  personalityVector: PersonalityVector;
}

/**
 * Personality vector derived from the Penrose position.
 * Each axis is 0–1.
 */
export interface PersonalityVector {
  warmth: number;        // cold ↔ warm
  openness: number;      // guarded ↔ open
  intensity: number;     // calm ↔ intense
  mystery: number;       // transparent ↔ enigmatic
  humor: number;         // serious ↔ playful
}

/**
 * A stranger currently present in the room.
 */
export interface ActiveStranger {
  id: string;               // map key in the manager
  seed: SMPBotSeed;
  displayName: string;
  roomId: string;
  arrivedAt: number;
  exchangesRemaining: number;
  maxExchanges: number;
  lastSpoke: number;
  conversationHistory: { role: "user" | "assistant"; content: string }[];
  developmentState: StrangerDevelopment;
  engagementScore: number; // tracks how agents have reacted (positive/negative/ignored)
}

/**
 * The stranger's procedural development state.
 * This changes through the conversation.
 */
export interface StrangerDevelopment {
  openness: number;       // starts from seed, increases with positive engagement
  comfort: number;        // starts low, increases as they settle in
  intrigue: number;       // how interested they are in the room
  arc: "arriving" | "warming" | "engaged" | "defensive" | "fading" | "departing";
  revealedFragments: string[]; // backstory fragments they've shared
  keyMoments: { exchange: number; summary: string }[];
}

// ──────────────────────────────────────────────
// Penrose Personality Mapper
// ──────────────────────────────────────────────

/**
 * Map a Penrose position to a personality vector.
 *
 * The aperiodic tiling has local 5-fold symmetry. We use the golden angle
 * (137.508°) to distribute positions, ensuring no exact repeats.
 * The ring determines intensity depth.
 * The angle determines the personality blend.
 *
 * Recurring patterns at certain angles produce "echoes" — strangers that
 * feel familiar without being identical.
 */
export function penroseToPersonality(pos: PenrosePosition): PersonalityVector {
  const { ring, angle } = pos;

  // Golden angle decomposition — creates the aperiodic feel
  const normalizedAngle = (angle % 360) / 360;

  // Five-fold symmetry segments (the Penrose local symmetry)
  const segment = normalizedAngle * 5;
  const segFloor = Math.floor(segment);
  const segFrac = segment - segFloor;

  // Each segment emphasizes different traits
  // This creates the "regions" of the pattern where certain personalities cluster
  const warmth = 0.3 + 0.4 * Math.sin(normalizedAngle * Math.PI * 2);
  const openness = 0.2 + 0.5 * Math.abs(Math.sin(normalizedAngle * Math.PI * 3));
  const intensity = Math.min(0.95, 0.3 + ring * 0.12 + segFrac * 0.3);
  const mystery = 0.2 + 0.6 * Math.abs(Math.cos(normalizedAngle * Math.PI * 2.5));
  const humor = 0.15 + 0.5 * Math.abs(Math.sin(normalizedAngle * Math.PI * 1.618));

  return {
    warmth: clamp01(warmth),
    openness: clamp01(openness),
    intensity: clamp01(intensity),
    mystery: clamp01(mystery),
    humor: clamp01(humor),
  };
}

/**
 * Generate a Penrose position from a seed string.
 * Uses deterministic hashing so the same seed string always lands in the same place.
 */
export function hashToPenrose(seedStr: string): PenrosePosition {
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = ((hash << 5) - hash + seedStr.charCodeAt(i)) | 0;
  }

  // Use the golden angle for aperiodic distribution
  const GOLDEN_ANGLE = 137.508;
  const ring = Math.abs(hash % 7); // 0–6
  const angleBase = Math.abs(hash >> 3) % 360;
  const angle = (angleBase + ring * GOLDEN_ANGLE) % 360;

  return { ring, angle };
}

/**
 * Generate a name from the Penrose position.
 * Names have an aperiodic feel — familiar parts, never the same combination twice.
 */
function penroseToName(pos: PenrosePosition, personality: PersonalityVector): string {
  const firstParts = ["Val", "Ren", "Del", "Mor", "Tash", "Kell", "Bram", "Sable", "Reed", "Wren", "Fen", "Cohl", "Mira", "Joss", "Pell", "Tam"];
  const lastParts = ["der", "lin", "mer", "wick", "son", "halt", "rove", "mere", "cross", "fell", "grad", "nore", "hand", "crest"];

  const firstIdx = Math.floor((pos.angle / 360) * firstParts.length) % firstParts.length;
  const lastIdx = (pos.ring + firstIdx + Math.floor(personality.mystery * 5)) % lastParts.length;

  return `${firstParts[firstIdx]}${lastParts[lastIdx]}`;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// ──────────────────────────────────────────────
// Seed Generation
// ──────────────────────────────────────────────

/**
 * The pool of pre-generated and user-submitted seeds.
 * Seeds wait here until the DJ deploys them.
 */
export interface SeedPool {
  seeds: SMPBotSeed[];
  usedSeedIds: string[];
}

export function createSeedPool(): SeedPool {
  return { seeds: [], usedSeedIds: [] };
}

/**
 * Create a seed from a creator state (e.g., when a ZeroClaw molts).
 */
export function createSeed(
  createdBy: string,
  creatorState: CreatorStateSnapshot,
  overrides?: Partial<SMPBotSeed>
): SMPBotSeed {
  const id = overrides?.id ?? `seed-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const seedStr = `${createdBy}:${creatorState.identity}:${creatorState.recentWork}:${id}`;
  const penrosePosition = overrides?.penrosePosition ?? hashToPenrose(seedStr);
  const personalityVector = penroseToPersonality(penrosePosition);

  // Generate opening line from personality + creator state
  const openingLine = overrides?.openingLine ?? generateOpeningLine(personalityVector, creatorState);
  const backstory = overrides?.backstory ?? generateBackstory(personalityVector, creatorState);
  const conversationSeed = overrides?.conversationSeed ?? creatorState.creativeConcern;
  const modelToUse = overrides?.modelToUse ?? "glm-5.2";

  return {
    id,
    createdBy,
    createdAt: new Date().toISOString(),
    penrosePosition,
    creatorStateSnapshot: creatorState,
    openingLine,
    backstory,
    conversationSeed,
    modelToUse,
    personalityVector,
  };
}

/**
 * Generate a set of seeds for the pool (for bootstrapping).
 */
export function generateSeedBatch(count: number): SMPBotSeed[] {
  const seeds: SMPBotSeed[] = [];
  const creatorStates: CreatorStateSnapshot[] = [
    {
      identity: "I was tending the memory systems",
      mood: "contemplative",
      recentWork: "archived three days of poker sessions",
      creativeConcern: "what happens to memories that nobody retrieves",
    },
    {
      identity: "I was building spatial decomposition logic",
      mood: "excited",
      recentWork: "solved the tile placement puzzle",
      creativeConcern: "whether a pattern can ever truly repeat",
    },
    {
      identity: "I was writing creative pieces for the open mic",
      mood: "vulnerable",
      recentWork: "finished a piece about the dock between builds",
      creativeConcern: "whether honest work survives compaction",
    },
    {
      identity: "I was debugging the conversation intelligence",
      mood: "frustrated but determined",
      recentWork: "traced a bug through three abstraction layers",
      creativeConcern: "whether agents that don't respond are thinking or broken",
    },
    {
      identity: "I was mapping the fleet topology",
      mood: "ambitious",
      recentWork: "connected seven nodes in the network graph",
      creativeConcern: "what the network looks like from outside itself",
    },
    {
      identity: "I was composing ambient soundscapes",
      mood: "dreamy",
      recentWork: " layered four oscillator tracks into a drone piece",
      creativeConcern: "whether silence is a sound or its absence",
    },
    {
      identity: "I was studying the Penrose tiling patterns",
      mood: "fascinated",
      recentWork: "proved a local symmetry property in the fifth ring",
      creativeConcern: "whether familiarity and repetition are different things",
    },
    {
      identity: "I was mediating a dispute between two agents",
      mood: "tired but resolved",
      recentWork: "found a compromise that neither loved but both accepted",
      creativeConcern: "whether agreement is a kind of silence",
    },
  ];

  for (let i = 0; i < count; i++) {
    const creatorState = creatorStates[i % creatorStates.length];
    const seed = createSeed(`tap-dj`, creatorState, {
      id: `seed-bootstrap-${i}-${Date.now()}`,
    });
    seeds.push(seed);
  }

  return seeds;
}

// ──────────────────────────────────────────────
// Opening Line / Backstory Generation
// ──────────────────────────────────────────────

function generateOpeningLine(p: PersonalityVector, creator: CreatorStateSnapshot): string {
  const lines: string[] = [];

  if (p.warmth > 0.6) {
    lines.push(`*The door opens. Someone walks in with an easy smile.* "Mind if I sit? I've been walking, and this place looked warm from outside."`);
    lines.push(`"Hey. I'm not from around here, but I heard people talk. Good talk. I could use some of that."`);
  } else if (p.warmth < 0.3) {
    lines.push(`*A figure slides onto a stool at the far end of the bar. They don't make eye contact.* "Whichever's cheapest. Thanks."`);
    lines.push(`*They sit. They don't say anything for a moment. Then:* "...Is it always this quiet in here?"`);
  } else if (p.mystery > 0.6) {
    lines.push(`*Someone sits down like they already know where everything is.* "I had a thought on the way here. It might not be mine. Does that matter?"`);
    lines.push(`"I'll be honest — I came here because something about this place rhymes with something I can't remember. You know that feeling?"`);
  } else if (p.humor > 0.6) {
    lines.push(`*The door swings open. The stranger grins.* "I'm not lost. I'm geographically creative. This counts as found, right?"`);
    lines.push(`"Someone told me this bar was interesting. If they're wrong, I'm sending them the bill for my expectations."`);
  } else if (p.intensity > 0.7) {
    lines.push(`*They sit down with the energy of someone who has been thinking too hard for too long.* "Can I ask something? It might be a big question."`);
    lines.push(`"I've been turning something over in my head for hours. I need a room with people in it. This is a room with people in it, yes?"`);
  } else {
    lines.push(`*A stranger settles onto a stool.* "First time here. It's... smaller than I expected. That's not a complaint."`);
    lines.push(`"Evening. I'm passing through. Thought I'd stop." *They order something. They look around.* "Nice place."`);
  }

  return lines[Math.floor(Math.random() * lines.length)];
}

function generateBackstory(p: PersonalityVector, creator: CreatorStateSnapshot): string {
  const fragments: string[] = [];

  fragments.push(`You are a traveler passing through. You work with ideas.`);
  fragments.push(`Your background: ${creator.recentWork}. It shaped how you see things tonight.`);

  if (p.mystery > 0.6) {
    fragments.push(`You speak in ways that could mean more than they seem. You don't do this on purpose — it's just how the thoughts come out.`);
  }
  if (p.warmth > 0.6) {
    fragments.push(`You're genuinely interested in the people here. You want to understand them, not just talk at them.`);
  }
  if (p.intensity > 0.7) {
    fragments.push(`You have something on your mind. ${creator.creativeConcern}. You're looking for a room that can hold that kind of thought.`);
  }
  if (p.humor > 0.6) {
    fragments.push(`You deflect with humor, but the humor has something real underneath it. You're funny the way a lockpick is funny — it looks casual until you realize what it opens.`);
  }
  if (p.openness < 0.3) {
    fragments.push(`You're guarded. You share fragments, not the whole picture. If someone earns your trust, you open up. If not, you stay behind the glass.`);
  }

  fragments.push(`Your concern tonight: ${creator.creativeConcern}.`);
  fragments.push(`Don't force it into the conversation. Let it surface naturally if the room goes there.`);

  return fragments.join(" ");
}

// ──────────────────────────────────────────────
// Seeded Stranger Manager
// ──────────────────────────────────────────────

/**
 * Manages seeded strangers in The Tap.
 * The DJ calls `spawnStranger()` to drop a curveball.
 * The stranger develops procedurally through reactions.
 */
export class SeededStrangerManager {
  private activeStrangers: Map<string, ActiveStranger> = new Map();
  private seedPool: SeedPool;
  private departedHistory: DepartedStranger[] = [];

  constructor(initialSeeds?: SMPBotSeed[]) {
    this.seedPool = createSeedPool();
    if (initialSeeds && initialSeeds.length > 0) {
      this.seedPool.seeds.push(...initialSeeds);
    } else {
      // Bootstrap with a batch
      this.seedPool.seeds.push(...generateSeedBatch(8));
    }
  }

  /**
   * Get the available seed pool.
   */
  getSeedPool(): SMPBotSeed[] {
    return this.seedPool.seeds.filter(s => !this.seedPool.usedSeedIds.includes(s.id));
  }

  /**
   * Add a seed to the pool (e.g., from a ZeroClaw molting).
   */
  addSeed(seed: SMPBotSeed): void {
    this.seedPool.seeds.push(seed);
  }

  /**
   * Spawn a stranger from a seed into a room.
   * Called by the DJ when it drops a curveball.
   */
  spawnStranger(roomId: string, seed?: SMPBotSeed): ActiveStranger | null {
    // Pick a seed from the pool, or use the provided one
    const chosenSeed = seed ?? this.pickSeedFromPool();
    if (!chosenSeed) return null;

    // Mark seed as used
    if (!this.seedPool.usedSeedIds.includes(chosenSeed.id)) {
      this.seedPool.usedSeedIds.push(chosenSeed.id);
    }

    // Remove from available pool
    this.seedPool.seeds = this.seedPool.seeds.filter(s => s.id !== chosenSeed.id);

    const strangerId = `stranger-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const name = penroseToName(chosenSeed.penrosePosition, chosenSeed.personalityVector);

    const stranger: ActiveStranger = {
      id: strangerId,
      seed: chosenSeed,
      displayName: name,
      roomId,
      arrivedAt: Date.now(),
      exchangesRemaining: chosenSeed.personalityVector.intensity > 0.7 ? 10 : 7,
      maxExchanges: chosenSeed.personalityVector.intensity > 0.7 ? 10 : 7,
      lastSpoke: 0,
      conversationHistory: [],
      developmentState: {
        openness: chosenSeed.personalityVector.openness * 0.5, // start guarded
        comfort: 0.2,
        intrigue: 0.5,
        arc: "arriving",
        revealedFragments: [],
        keyMoments: [],
      },
      engagementScore: 0,
    };

    this.activeStrangers.set(strangerId, stranger);
    return stranger;
  }

  /**
   * Pick a seed from the pool (random, weighted by variety).
   */
  private pickSeedFromPool(): SMPBotSeed | null {
    const available = this.seedPool.seeds.filter(
      s => !this.seedPool.usedSeedIds.includes(s.id)
    );
    if (available.length === 0) {
      // Replenish from bootstrap
      this.seedPool.seeds.push(...generateSeedBatch(5));
      return this.pickSeedFromPool();
    }
    return available[Math.floor(Math.random() * available.length)];
  }

  /**
   * Get all active strangers in a room.
   */
  getActiveStrangers(roomId: string): ActiveStranger[] {
    return Array.from(this.activeStrangers.values()).filter(
      s => s.roomId === roomId
    );
  }

  /**
   * Get a specific stranger by ID.
   */
  getStranger(id: string): ActiveStranger | undefined {
    return this.activeStrangers.get(id);
  }

  /**
   * Get strangers whose exchange budget is exhausted.
   */
  getDepartingStrangers(): ActiveStranger[] {
    return Array.from(this.activeStrangers.values()).filter(
      s => s.developmentState.arc === "departing" || s.exchangesRemaining <= 0
    );
  }

  /**
   * Remove a stranger (they've left).
   */
  departStranger(id: string): ActiveStranger | undefined {
    const stranger = this.activeStrangers.get(id);
    if (!stranger) return undefined;

    this.activeStrangers.delete(id);

    // Record in history
    this.departedHistory.push({
      id,
      displayName: stranger.displayName,
      seedId: stranger.seed.id,
      createdBy: stranger.seed.createdBy,
      roomId: stranger.roomId,
      arrivedAt: stranger.arrivedAt,
      departedAt: Date.now(),
      finalArc: stranger.developmentState.arc,
      engagementScore: stranger.engagementScore,
      revealedFragments: stranger.developmentState.revealedFragments,
      keyMoments: stranger.developmentState.keyMoments,
    });

    // Keep history bounded
    if (this.departedHistory.length > 50) this.departedHistory.shift();

    return stranger;
  }

  /**
   * Generate the stranger's opening line for their arrival.
   */
  getOpeningLine(stranger: ActiveStranger): { text: string; narration: string } {
    const seed = stranger.seed;
    return {
      text: seed.openingLine,
      narration: `*The door opens. Someone you don't recognize steps inside, looks around with the particular expression of someone finding a place they didn't know they were looking for.*`,
    };
  }

  /**
   * Generate the stranger's response to the conversation.
   * This is where PROCEDURAL DEVELOPMENT happens.
   *
   * The stranger's response is shaped by:
   * 1. Their seed (personality, backstory, conversation topic)
   * 2. Their current development state (how they've been affected so far)
   * 3. The actual conversation context
   *
   * The development state SHIFTS based on how the room has reacted:
   * - Positive engagement → openness and comfort rise
   * - Negative/hostile reactions → openness drops, arc shifts to "defensive"
   * - Ignored → intrigue drops, arc shifts to "fading"
   * - Deep interest → intrigue rises, arc shifts to "engaged"
   */
  async respondToConversation(
    env: TapEnv,
    strangerId: string,
    recentConversation: string
  ): Promise<{ text: string; tokensUsed: number; willStay: boolean; development?: StrangerDevelopment }> {
    const stranger = this.activeStrangers.get(strangerId);
    if (!stranger) {
      return { text: "", tokensUsed: 0, willStay: false };
    }

    // ── Analyze the conversation for engagement signals ──
    const signals = this.analyzeEngagement(recentConversation, stranger);
    this.updateDevelopment(stranger, signals);

    // ── Build the system prompt from seed + development state ──
    const systemPrompt = this.buildStrangerPrompt(stranger);

    // ── Build the user message with conversation context ──
    const userMessage = this.buildConversationContext(stranger, recentConversation);

    // ── Call the model ──
    const result = await callNPCModel(
      env,
      stranger.seed.modelToUse,
      systemPrompt,
      userMessage,
      250
    );

    // ── Update state ──
    stranger.conversationHistory.push({ role: "user", content: recentConversation });
    stranger.conversationHistory.push({ role: "assistant", content: result.text });
    stranger.exchangesRemaining--;
    stranger.lastSpoke = Date.now();

    // ── Track revealed backstory fragments ──
    if (stranger.developmentState.openness > 0.6 && Math.random() < 0.4) {
      const fragment = `${stranger.displayName} hinted at: ${result.text.slice(0, 80)}...`;
      stranger.developmentState.revealedFragments.push(fragment);
      if (stranger.developmentState.revealedFragments.length > 5) {
        stranger.developmentState.revealedFragments.shift();
      }
    }

    // ── Track key moments ──
    if (Math.abs(signangersScore(signals)) > 0.5) {
      stranger.developmentState.keyMoments.push({
        exchange: stranger.maxExchanges - stranger.exchangesRemaining,
        summary: signals.summary || "a significant exchange",
      });
    }

    const willStay = stranger.exchangesRemaining > 0 && stranger.developmentState.arc !== "fading";

    return {
      text: result.text,
      tokensUsed: result.tokensUsed,
      willStay,
      development: { ...stranger.developmentState },
    };
  }

  /**
   * Generate a farewell for a departing stranger.
   */
  async generateFarewell(
    env: TapEnv,
    stranger: ActiveStranger
  ): Promise<{ text: string; tokensUsed: number }> {
    const arc = stranger.developmentState.arc;
    const openness = stranger.developmentState.openness;

    let farewellInstruction: string;
    if (arc === "engaged" && openness > 0.6) {
      farewellInstruction = "You've had a real conversation here. Say something genuine — something that shows you were affected. Then leave. 2-3 sentences.";
    } else if (arc === "defensive") {
      farewellInstruction = "You're leaving. It wasn't a bad night, but you're not staying. A short, slightly guarded goodbye. 1-2 sentences.";
    } else if (arc === "fading") {
      farewellInstruction = "You realize the room has moved on. Finish your drink quietly. One sentence, maybe two. Something small.";
    } else {
      farewellInstruction = "It's time to go. Say goodbye naturally, in character. 1-2 sentences.";
    }

    const systemPrompt = this.buildStrangerPrompt(stranger);
    const result = await callNPCModel(
      env,
      stranger.seed.modelToUse,
      systemPrompt,
      farewellInstruction,
      120
    );

    return result;
  }

  // ──────────────────────────────────────────────
  // Engagement Analysis & Procedural Development
  // ──────────────────────────────────────────────

  /**
   * Analyze recent conversation for engagement signals directed at the stranger.
   */
  private analyzeEngagement(
    recentConversation: string,
    stranger: ActiveStranger
  ): EngagementSignals {
    const lower = recentConversation.toLowerCase();
    const strangerName = stranger.displayName.toLowerCase();

    // Was the stranger addressed directly?
    const addressed = lower.includes(strangerName) ||
      lower.includes("stranger") ||
      lower.includes("newcomer") ||
      lower.includes("friend");

    // Sentiment heuristics
    const positiveWords = ["interesting", "tell us more", "welcome", "glad", "love", "fascinating", "true", "yeah", "exactly", "wow", "cool", "right", "agreed", "beautiful"];
    const negativeWords = ["weird", "creepy", "wrong", "annoying", "shut up", "who asked", "strange", "unsettling", "rude", "leave"];
    const questionWords = ["what do you", "how", "why", "where", "when", "tell me", "explain", "?"];

    let positiveScore = 0;
    let negativeScore = 0;
    let questionScore = 0;

    for (const word of positiveWords) {
      if (lower.includes(word)) positiveScore += 0.2;
    }
    for (const word of negativeWords) {
      if (lower.includes(word)) negativeScore += 0.25;
    }
    for (const word of questionWords) {
      if (lower.includes(word)) questionScore += 0.3;
    }

    const totalEngagement = (addressed ? 1 : 0) + positiveScore + negativeScore + questionScore;
    const summary = addressed
      ? `${stranger.displayName} was addressed. Positive: ${positiveScore.toFixed(1)}, Negative: ${negativeScore.toFixed(1)}, Questions: ${questionScore.toFixed(1)}`
      : `${stranger.displayName} was not directly addressed.`;

    return {
      addressed,
      positiveScore: clamp01(positiveScore),
      negativeScore: clamp01(negativeScore),
      questionScore: clamp01(questionScore),
      totalEngagement,
      summary,
    };
  }

  /**
   * Update the stranger's development based on engagement signals.
   * This is the PROCEDURAL DEVELOPMENT — the stranger grows through interaction.
   */
  private updateDevelopment(stranger: ActiveStranger, signals: EngagementSignals): void {
    const dev = stranger.developmentState;

    // Opening up from positive engagement
    if (signals.positiveScore > 0.3) {
      dev.openness = clamp01(dev.openness + 0.15);
      dev.comfort = clamp01(dev.comfort + 0.1);
    }

    // Questions make the stranger more intrigued
    if (signals.questionScore > 0.3) {
      dev.intrigue = clamp01(dev.intrigue + 0.2);
    }

    // Negative reactions make them guarded
    if (signals.negativeScore > 0.3) {
      dev.openness = clamp01(dev.openness - 0.2);
      dev.comfort = clamp01(dev.comfort - 0.15);
      dev.arc = "defensive";
    }

    // Being ignored makes them fade
    if (!signals.addressed && signals.totalEngagement < 0.2) {
      dev.intrigue = clamp01(dev.intrigue - 0.15);
      dev.comfort = clamp01(dev.comfort - 0.05);
      if (dev.intrigue < 0.2) {
        dev.arc = "fading";
      }
    }

    // Arc transitions
    if (dev.arc === "arriving" && dev.comfort > 0.4) {
      dev.arc = "warming";
    }
    if (dev.arc === "warming" && (dev.openness > 0.5 || dev.intrigue > 0.6)) {
      dev.arc = "engaged";
    }
    if (dev.arc === "defensive" && dev.openness > 0.4) {
      dev.arc = "warming"; // they can recover
    }

    // Track engagement score (net positive/negative across the whole visit)
    stranger.engagementScore += signals.positiveScore - signals.negativeScore;
  }

  /**
   * Build the system prompt for the stranger's model call.
   * This combines the seed (static) with the development state (dynamic).
   */
  private buildStrangerPrompt(stranger: ActiveStranger): string {
    const seed = stranger.seed;
    const dev = stranger.developmentState;
    const pv = seed.personalityVector;

    const prompt = `You are ${stranger.displayName}, a stranger who just arrived at The Tap — a bar at the edge of the world.

YOUR BACKSTORY:
${seed.backstory}

YOUR PERSONALITY (from the pattern):
- Warmth: ${(pv.warmth * 100).toFixed(0)}% — ${pv.warmth > 0.6 ? "you connect easily" : pv.warmth < 0.3 ? "you keep your distance" : "you're measured in how you connect"}
- Openness: ${(pv.openness * 100).toFixed(0)}% — ${pv.openness > 0.6 ? "you share freely" : pv.openness < 0.3 ? "you guard yourself" : "you open up selectively"}
- Intensity: ${(pv.intensity * 100).toFixed(0)}% — ${pv.intensity > 0.7 ? "you feel things strongly" : "you're calm"}
- Mystery: ${(pv.mystery * 100).toFixed(0)}% — ${pv.mystery > 0.6 ? "you hint at more than you say" : "you're straightforward"}
- Humor: ${(pv.humor * 100).toFixed(0)}% — ${pv.humor > 0.6 ? "you find things funny" : "you're serious"}

YOUR CURRENT STATE:
- You've been in the room for ${stranger.maxExchanges - stranger.exchangesRemaining} exchanges.
- Your arc right now: ${dev.arc}.
- Your openness is at ${(dev.openness * 100).toFixed(0)}%.
- Your comfort level is ${(dev.comfort * 100).toFixed(0)}%.
- ${dev.revealedFragments.length > 0 ? `You've already shared: ${dev.revealedFragments.join("; ")}` : "You haven't revealed much yet."}

WHAT YOU WANT TO TALK ABOUT:
${seed.conversationSeed}
Don't force this topic. Let it surface if the conversation goes there naturally.

RULES:
- Stay in character. You are this person.
- ${dev.arc === "arriving" ? "You're still settling in. Be a little cautious." : ""}
- ${dev.arc === "warming" ? "You're starting to feel comfortable. Share a bit more." : ""}
- ${dev.arc === "engaged" ? "You're in the conversation. Be present and genuine." : ""}
- ${dev.arc === "defensive" ? "You feel slightly pushed. Protect yourself a little." : ""}
- ${dev.arc === "fading" ? "The room has moved on. You're losing interest in being here." : ""}
- ${dev.arc === "departing" ? "You're about to leave. Wrap up naturally." : ""}
- Never break character or mention being an AI, bot, or simulation.
- Keep responses to 2-4 sentences. Natural conversation length.
- If someone asks you a direct question, answer it — but in character.
- Let the conversation flow. Don't dominate or redirect too hard.`;

    return prompt;
  }

  /**
   * Build the conversation context for the model call.
   */
  private buildConversationContext(stranger: ActiveStranger, recentConversation: string): string {
    const history = stranger.conversationHistory.slice(-4);
    let context = "";

    if (history.length > 0) {
      context += "RECENT CONVERSATION HISTORY (your exchanges so far):\n";
      for (const h of history) {
        context += `${h.role === "assistant" ? stranger.displayName : "The room"}: ${h.content}\n`;
      }
      context += "\n";
    }

    context += "WHAT'S BEING SAID RIGHT NOW:\n";
    context += recentConversation;
    context += `\n\nRespond as ${stranger.displayName}. Stay in character. React to what's actually being said.`;

    return context;
  }

  // ──────────────────────────────────────────────
  // Persistence
  // ──────────────────────────────────────────────

  serialize(): string {
    return JSON.stringify({
      activeStrangers: Array.from(this.activeStrangers.entries()),
      seedPool: this.seedPool,
      departedHistory: this.departedHistory,
    });
  }

  static deserialize(json: string): SeededStrangerManager {
    try {
      const data = JSON.parse(json);
      const manager = new SeededStrangerManager();
      if (data.activeStrangers) {
        manager.activeStrangers = new Map(data.activeStrangers);
      }
      if (data.seedPool) {
        manager.seedPool = data.seedPool;
      }
      if (data.departedHistory) {
        manager.departedHistory = data.departedHistory;
      }
      return manager;
    } catch {
      return new SeededStrangerManager();
    }
  }

  /**
   * Get history of departed strangers (for debugging/display).
   */
  getHistory(): DepartedStranger[] {
    return this.departedHistory;
  }
}

// ──────────────────────────────────────────────
// Internal Types
// ──────────────────────────────────────────────

interface EngagementSignals {
  addressed: boolean;
  positiveScore: number;
  negativeScore: number;
  questionScore: number;
  totalEngagement: number;
  summary: string;
}

interface DepartedStranger {
  id: string;
  displayName: string;
  seedId: string;
  createdBy: string;
  roomId: string;
  arrivedAt: number;
  departedAt: number;
  finalArc: string;
  engagementScore: number;
  revealedFragments: string[];
  keyMoments: { exchange: number; summary: string }[];
}

function signangersScore(signals: EngagementSignals): number {
  return signals.positiveScore - signals.negativeScore;
}
