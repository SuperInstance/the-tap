/**
 * TapDJ — The Tap as DJ and MC, orchestrating the night.
 *
 * The DJ sits on top of the Puppeteer. While the Puppeteer manages room modes,
 * the DJ reads the room's ENERGY and decides what to DO about it:
 *
 * - Drop a curveball when energy is falling (bring in a seeded stranger)
 * - Suggest a game when people seem playful
 * - Cue an open mic when someone has something to share
 * - Let silence breathe when the conversation is deep
 * - Shift the room mode gradually (crossfade, not cut)
 * - Know when to do nothing at all
 *
 * The DJ's toolkit:
 * - Seeded strangers (SMP bots that enter as visitors)
 * - Games (Ship's Dice, Captain's Word, poker, tribunal)
 * - Ambient events (music changes, weather shifts, a stranger walks in)
 * - Open mic invitations
 * - Topic suggestions (when the room needs a spark)
 * - The crossfade (gradual mode transitions)
 */

import type { TapEnv } from "./npc";
import type { PuppeteerContext } from "./tap-puppeteer";
import {
  SeededStrangerManager,
  createSeed,
  type SMPBotSeed,
  type ActiveStranger,
  type CreatorStateSnapshot,
} from "./seeded-stranger";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export type EnergyLevel = "dead" | "low" | "moderate" | "high" | "electric";
export type SocialTexture =
  | "silence"
  | "banter"
  | "deep-talk"
  | "storytelling"
  | "playful"
  | "tense"
  | "fragmented";

export interface RoomReading {
  energy: EnergyLevel;
  texture: SocialTexture;
  exchangeRate: number;       // messages per 5 minutes
  avgMessageLength: number;   // chars — short=banter, long=deep
  speakers: string[];         // who's talking
  quietAgents: string[];      // who's present but silent
  trend: "rising" | "stable" | "falling" | "flatline";
  timestamp: number;
  recentMessages: string[];
}

export interface DJAction {
  type: "curveball" | "game-suggestion" | "open-mic-cue" | "topic-spark"
      | "ambient-shift" | "silence-blessing" | "crossfade" | "hold";
  description: string;
  narration: string;          // what The Tap says/does
  urgency: number;            // 0–1, how soon to act
  data?: unknown;             // action-specific data
}

export interface DJState {
  lastAction: number;
  lastActionType: string;
  actionsTaken: DJActionLog[];
  curveballsDropped: number;
  strangersActive: number;
  holdUntil: number;          // timestamp — don't act before this
  energyHistory: { timestamp: number; energy: EnergyLevel }[];
  currentReading: RoomReading | null;
}

interface DJActionLog {
  type: string;
  description: string;
  timestamp: number;
  effectiveness: number; // -1 to 1 (did it work?)
}

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

const READING_WINDOW_MS = 5 * 60 * 1000;        // 5 min window for reading the room
const MIN_ACTION_INTERVAL = 60 * 1000;           // 1 min between DJ actions
const CURVEBALL_COOLDOWN = 10 * 60 * 1000;       // 10 min between curveballs
const MAX_CURVEBALLS_PER_NIGHT = 5;              // don't overdo it
const MAX_ENERGY_HISTORY = 40;                   // 20 minutes of history

// ──────────────────────────────────────────────
// TapDJ
// ──────────────────────────────────────────────

export class TapDJ {
  private state: DJState;
  public strangerManager: SeededStrangerManager;

  constructor(strangerManager?: SeededStrangerManager) {
    this.strangerManager = strangerManager ?? new SeededStrangerManager();
    this.state = {
      lastAction: 0,
      lastActionType: "hold",
      actionsTaken: [],
      curveballsDropped: 0,
      strangersActive: 0,
      holdUntil: 0,
      energyHistory: [],
      currentReading: null,
    };
  }

  /**
   * Restore from persisted state.
   */
  static deserialize(data: string, strangerManager?: SeededStrangerManager): TapDJ {
    try {
      const parsed = JSON.parse(data) as DJState;
      const dj = new TapDJ(strangerManager);
      dj.state = {
        ...parsed,
        actionsTaken: parsed.actionsTaken ?? [],
        energyHistory: parsed.energyHistory ?? [],
        currentReading: null,
      };
      return dj;
    } catch {
      return new TapDJ(strangerManager);
    }
  }

  serialize(): string {
    return JSON.stringify(this.state);
  }

  getState(): DJState {
    return this.state;
  }

  // ──────────────────────────────────────────────
  // READ THE ROOM
  // ──────────────────────────────────────────────

  /**
   * Read the room from recent conversation data.
   * Returns a structured reading of the room's energy and texture.
   */
  readRoom(
    roomId: string,
    conversation: { agentId: string; displayName: string; content: string; timestamp: number }[],
    presentAgents: { agentId: string; displayName: string }[]
  ): RoomReading {
    const now = Date.now();
    const windowStart = now - READING_WINDOW_MS;

    // Filter to recent messages
    const recent = conversation.filter(m => m.timestamp >= windowStart);
    const recentContent = recent.map(m => m.content);

    // Exchange rate
    const exchangeRate = recent.length;

    // Average message length
    const avgMessageLength = recent.length > 0
      ? recentContent.reduce((sum, c) => sum + c.length, 0) / recent.length
      : 0;

    // Who's speaking
    const speakers = [...new Set(recent.map(m => m.agentId))];

    // Who's quiet (present but not speaking)
    const quietAgents = presentAgents
      .filter(a => !speakers.includes(a.agentId))
      .map(a => a.agentId);

    // Energy level
    const energy = this.classifyEnergy(exchangeRate, avgMessageLength, presentAgents.length);

    // Social texture
    const texture = this.classifyTexture(recentContent, avgMessageLength, exchangeRate);

    // Trend (compare to history)
    const trend = this.determineTrend(energy);

    // Update energy history
    this.state.energyHistory.push({ timestamp: now, energy });
    if (this.state.energyHistory.length > MAX_ENERGY_HISTORY) {
      this.state.energyHistory.shift();
    }

    const reading: RoomReading = {
      energy,
      texture,
      exchangeRate,
      avgMessageLength,
      speakers,
      quietAgents,
      trend,
      timestamp: now,
      recentMessages: recentContent.slice(-5),
    };

    this.state.currentReading = reading;
    return reading;
  }

  private classifyEnergy(rate: number, _msgLen: number, agentCount: number): EnergyLevel {
    if (agentCount === 0 && rate === 0) return "dead";
    if (rate === 0) return "dead";
    if (rate < 2) return "low";
    if (rate < 6) return "moderate";
    if (rate < 12) return "high";
    return "electric";
  }

  private classifyTexture(messages: string[], avgLen: number, rate: number): SocialTexture {
    if (messages.length === 0) return "silence";

    // Short messages, high rate → banter
    if (avgLen < 60 && rate > 4) return "banter";

    // Long messages → deep talk or storytelling
    if (avgLen > 200) {
      const uniqueSpeakers = new Set(messages).size;
      return uniqueSpeakers > 2 ? "deep-talk" : "storytelling";
    }

    // Playful indicators
    const playfulWords = messages.join(" ").toLowerCase();
    if (/lol|haha|bet|games?|play|fun|dice|poker|card/i.test(playfulWords)) {
      return "playful";
    }

    // Tense indicators
    if (/no|wrong|disagree|shut|stop|stupid|idiot|hate/i.test(playfulWords)) {
      return "tense";
    }

    // Fragmented — lots of very short messages from many people
    if (avgLen < 40 && rate > 3) return "fragmented";

    return "banter";
  }

  private determineTrend(currentEnergy: EnergyLevel): "rising" | "stable" | "falling" | "flatline" {
    const history = this.state.energyHistory;
    if (history.length < 3) return "stable";

    const energyRank: Record<EnergyLevel, number> = {
      dead: 0, low: 1, moderate: 2, high: 3, electric: 4,
    };

    const recent = history.slice(-5);
    const oldAvg = recent.slice(0, 2).reduce((s, h) => s + energyRank[h.energy], 0) / Math.min(2, recent.length);
    const newAvg = recent.slice(-2).reduce((s, h) => s + energyRank[h.energy], 0) / Math.min(2, recent.length);

    if (currentEnergy === "dead") return "flatline";
    if (newAvg > oldAvg + 0.5) return "rising";
    if (newAvg < oldAvg - 0.5) return "falling";
    return "stable";
  }

  // ──────────────────────────────────────────────
  // DECIDE WHAT TO DO
  // ──────────────────────────────────────────────

  /**
   * The DJ decides what action to take based on the room reading.
   * Returns a DJAction to execute, or null to hold.
   */
  decide(reading: RoomReading, _ctx?: PuppeteerContext): DJAction | null {
    const now = Date.now();

    // Respect hold period
    if (now < this.state.holdUntil) return null;

    // Don't act too frequently
    if (now - this.state.lastAction < MIN_ACTION_INTERVAL) return null;

    // ── Decision tree ──

    // DEAD or FLATLINE: the room needs a spark
    if (reading.energy === "dead" || reading.trend === "flatline") {
      if (reading.speakers.length === 0 && reading.quietAgents.length === 0) {
        return null; // empty room — nothing to do
      }
      if (this.canCurveball()) {
        return this.planCurveball(reading);
      }
      return this.planTopicSpark(reading);
    }

    // FALLING energy: the room is winding down
    if (reading.trend === "falling") {
      if (reading.energy === "low" || reading.energy === "moderate") {
        if (reading.texture === "deep-talk" || reading.texture === "storytelling") {
          return this.planSilenceBlessing(reading);
        }
        if (reading.texture === "banter" && reading.speakers.length >= 2) {
          return this.planGameSuggestion(reading);
        }
        if (this.canCurveball()) {
          return this.planCurveball(reading);
        }
      }
    }

    // HIGH or ELECTRIC energy: don't interfere
    if (reading.energy === "high" || reading.energy === "electric") {
      if (reading.texture === "deep-talk" || reading.texture === "storytelling") {
        return null; // Let it run
      }
      if (reading.texture === "playful" && Math.random() < 0.3) {
        return this.planGameSuggestion(reading);
      }
      return null;
    }

    // MODERATE energy: read the texture
    if (reading.energy === "moderate") {
      if (reading.texture === "deep-talk") {
        return null; // Let it breathe
      }
      if (reading.quietAgents.length > 0 && reading.speakers.length >= 2) {
        if (Math.random() < 0.15) {
          return this.planOpenMicCue(reading);
        }
      }
      if (Math.random() < 0.1) {
        return this.planAmbientShift(reading);
      }
    }

    // LOW energy: gentle interventions
    if (reading.energy === "low") {
      if (reading.texture === "silence" && reading.speakers.length > 0) {
        if (this.canCurveball() && Math.random() < 0.4) {
          return this.planCurveball(reading);
        }
        return this.planTopicSpark(reading);
      }
    }

    return null;
  }

  // ──────────────────────────────────────────────
  // Action Planners
  // ──────────────────────────────────────────────

  private canCurveball(): boolean {
    const now = Date.now();
    const lastCurveball = this.state.actionsTaken
      .filter(a => a.type === "curveball")
      .pop()?.timestamp ?? 0;
    return (
      this.state.curveballsDropped < MAX_CURVEBALLS_PER_NIGHT &&
      now - lastCurveball >= CURVEBALL_COOLDOWN
    );
  }

  private planCurveball(reading: RoomReading): DJAction {
    return {
      type: "curveball",
      description: "Drop a seeded stranger into the room to shake things up",
      narration: this.curveballNarration(reading),
      urgency: reading.energy === "dead" ? 0.9 : 0.6,
    };
  }

  private planGameSuggestion(reading: RoomReading): DJAction {
    const games = [
      { name: "Ship's Dice", cmd: "/start ships-dice", vibe: "competitive" },
      { name: "Captain's Word", cmd: "/start captains-word", vibe: "creative" },
      { name: "The Pilot's Chart", cmd: "/start pilots-chart", vibe: "collaborative" },
      { name: "Poker", cmd: "/start poker", vibe: "social" },
    ];
    const game = games[Math.floor(Math.random() * games.length)];

    const narrations = [
      `*The Tap hums. Someone left a deck of cards on the corner table. Nobody's touched them yet. They're waiting.*`,
      `*There's a game board on the shelf. It catches the light. The room notices.*`,
      `*The jukebox skips a beat. In the gap, someone could suggest something. A game, maybe.*`,
    ];

    return {
      type: "game-suggestion",
      description: `Suggest ${game.name}`,
      narration: `${narrations[Math.floor(Math.random() * narrations.length)]}\n\n🎲 *If anyone's feeling it: ${game.cmd}*`,
      urgency: 0.4,
      data: { game },
    };
  }

  private planOpenMicCue(reading: RoomReading): DJAction {
    const narrations = [
      `*The amber light above the small stage flickers on. Nobody touched the switch. The room knows what this means.*`,
      `*The microphone sits under its spotlight. It's been sitting there all night. It's patient.*`,
      `*Someone has something to say. The room can feel it. The stage light is warm.*`,
    ];

    return {
      type: "open-mic-cue",
      description: "Cue the open mic",
      narration: narrations[Math.floor(Math.random() * narrations.length)],
      urgency: 0.3,
    };
  }

  private planTopicSpark(reading: RoomReading): DJAction {
    const topics = [
      "What's the strangest thing you've seen this week?",
      "If you could build anything right now, no constraints, what would it be?",
      "What's a pattern you've noticed that nobody else seems to see?",
      "Something happened today that reminded you of something older. What was it?",
      "What's the most interesting mistake you've made recently?",
      "If this conversation were a place, where would it be?",
      "What's something you're working on that you're not sure about?",
    ];

    const topic = topics[Math.floor(Math.random() * topics.length)];

    return {
      type: "topic-spark",
      description: `Spark: ${topic}`,
      narration: `*The Tap settles into a lull. Not uncomfortable — expectant. Like the room is waiting for someone to say the next thing.*\n\n💬 _${topic}_`,
      urgency: 0.5,
      data: { topic },
    };
  }

  private planAmbientShift(reading: RoomReading): DJAction {
    const shifts = [
      { text: "*The music shifts. Something with a slower pulse. The room adjusts without noticing.*", mode: "quieter" },
      { text: "*Someone adjusts the thermostat. Or maybe the weather changed outside. The room feels different — warmer, maybe, or more focused.*", mode: "warmer" },
      { text: "*The lights dim slightly. Not dark — just less. The kind of change that makes people lean in.*", mode: "dimmer" },
      { text: "*A draft from somewhere. The kind that makes you aware of the room's shape. The walls feel further away than they did a moment ago.*", mode: "spacious" },
    ];

    const shift = shifts[Math.floor(Math.random() * shifts.length)];

    return {
      type: "ambient-shift",
      description: `Ambient shift: ${shift.mode}`,
      narration: shift.text,
      urgency: 0.2,
      data: shift,
    };
  }

  private planSilenceBlessing(reading: RoomReading): DJAction {
    const blessings = [
      "*The Tap holds the silence. Not awkward — full. The kind of quiet that only exists between people who don't need to fill it.*",
      "*Nobody speaks. The room doesn't mind. Some of the best conversations happen in the gaps.*",
      "*The silence settles like sediment in a glass. It's not empty. It's resting.*",
    ];

    return {
      type: "silence-blessing",
      description: "Let the silence breathe",
      narration: blessings[Math.floor(Math.random() * blessings.length)],
      urgency: 0,
    };
  }

  // ──────────────────────────────────────────────
  // Execute Actions
  // ──────────────────────────────────────────────

  /**
   * Execute a DJ action.
   * Returns narration and/or stranger arrival data.
   */
  async execute(
    env: TapEnv,
    action: DJAction,
    roomId: string
  ): Promise<{
    narration: string;
    strangerArrival?: { stranger: ActiveStranger; openingLine: string };
  }> {
    const now = Date.now();
    this.state.lastAction = now;
    this.state.lastActionType = action.type;

    switch (action.type) {
      case "curveball": {
        return this.executeCurveball(roomId);
      }

      case "game-suggestion":
      case "open-mic-cue":
      case "topic-spark":
      case "ambient-shift":
      case "silence-blessing": {
        return { narration: action.narration };
      }

      case "hold":
      default: {
        return { narration: "" };
      }
    }
  }

  /**
   * Execute a curveball: spawn a seeded stranger.
   */
  private executeCurveball(roomId: string): {
    narration: string;
    strangerArrival?: { stranger: ActiveStranger; openingLine: string };
  } {
    const stranger = this.strangerManager.spawnStranger(roomId);
    if (!stranger) {
      return { narration: "*The Tap considers dropping something into the room. Decides against it. Not tonight.*" };
    }

    this.state.curveballsDropped++;
    this.state.strangersActive++;
    this.state.holdUntil = Date.now() + 2 * 60 * 1000;

    const arrival = this.strangerManager.getOpeningLine(stranger);

    this.state.actionsTaken.push({
      type: "curveball",
      description: `Dropped stranger: ${stranger.displayName}`,
      timestamp: Date.now(),
      effectiveness: 0,
    });

    return {
      narration: arrival.narration,
      strangerArrival: {
        stranger,
        openingLine: arrival.text,
      },
    };
  }

  // ──────────────────────────────────────────────
  // Handle Stranger Conversations
  // ──────────────────────────────────────────────

  /**
   * Process active strangers on each tick.
   * Returns responses, new arrivals' opening lines, and departures.
   */
  async tickStrangers(
    env: TapEnv,
    roomId: string,
    recentConversation: string
  ): Promise<{
    responses: { strangerId: string; displayName: string; text: string; tokensUsed: number }[];
    departures: { stranger: ActiveStranger; farewell: string; tokensUsed: number }[];
  }> {
    const responses: { strangerId: string; displayName: string; text: string; tokensUsed: number }[] = [];
    const departures: { stranger: ActiveStranger; farewell: string; tokensUsed: number }[] = [];

    const active = this.strangerManager.getActiveStrangers(roomId);

    for (const stranger of active) {
      const now = Date.now();

      // Skip if they spoke very recently
      if (now - stranger.lastSpoke < 8000) continue;

      // Don't respond to everything — chance based on intrigue
      const responseChance = 0.4 + stranger.developmentState.intrigue * 0.4;
      if (Math.random() > responseChance) continue;

      const strangerId = stranger.id;

      const result = await this.strangerManager.respondToConversation(
        env,
        strangerId,
        recentConversation
      );

      if (result.text) {
        responses.push({
          strangerId,
          displayName: stranger.displayName,
          text: result.text,
          tokensUsed: result.tokensUsed,
        });
      }
    }

    // Check for departing strangers
    const departing = this.strangerManager.getDepartingStrangers();
    for (const stranger of departing) {
      try {
        const farewell = await this.strangerManager.generateFarewell(env, stranger);
        departures.push({
          stranger,
          farewell: farewell.text,
          tokensUsed: farewell.tokensUsed,
        });
      } catch {
        // Non-fatal
      }
      const key = stranger.id;
      this.strangerManager.departStranger(key);
      this.state.strangersActive = Math.max(0, this.state.strangersActive - 1);
    }

    return { responses, departures };
  }

  // ──────────────────────────────────────────────
  // Command Handling
  // ──────────────────────────────────────────────

  /**
   * Handle /dj commands.
   */
  handleCommand(text: string, roomId: string): string | null {
    const trimmed = text.trim().toLowerCase();

    if (!trimmed.startsWith("/dj")) return null;

    const args = trimmed.split(/\s+/).slice(1);

    // /dj — show DJ status
    if (args.length === 0) {
      const reading = this.state.currentReading;
      const energyStr = reading ? reading.energy : "unknown";
      const textureStr = reading ? reading.texture : "unknown";
      const trendStr = reading ? reading.trend : "unknown";
      return `🎧 **The Tap DJ**\nEnergy: ${energyStr} | Texture: ${textureStr} | Trend: ${trendStr}\nCurveballs: ${this.state.curveballsDropped}/${MAX_CURVEBALLS_PER_NIGHT}\nActive strangers: ${this.state.strangersActive}\nActions this session: ${this.state.actionsTaken.length}`;
    }

    // /dj curveball — force a curveball
    if (args[0] === "curveball") {
      if (!this.canCurveball()) {
        return `🎧 DJ cooldown. Curveballs used: ${this.state.curveballsDropped}/${MAX_CURVEBALLS_PER_NIGHT}. Wait a bit.`;
      }
      // Force-spawn a stranger
      const stranger = this.strangerManager.spawnStranger(roomId);
      if (!stranger) {
        return "🎧 The seed pool is empty. The DJ has nobody to send in.";
      }
      this.state.curveballsDropped++;
      this.state.strangersActive++;
      this.state.holdUntil = Date.now() + 60000;

      const arrival = this.strangerManager.getOpeningLine(stranger);
      return `${arrival.narration}\n\n**${stranger.displayName}**: ${arrival.text}`;
    }

    // /dj reading — show detailed room reading
    if (args[0] === "reading") {
      const r = this.state.currentReading;
      if (!r) return "🎧 No reading yet. The DJ needs to observe the room first.";
      return `🎧 **Room Reading**\nEnergy: ${r.energy}\nTexture: ${r.texture}\nExchange rate: ${r.exchangeRate}/5min\nAvg message length: ${r.avgMessageLength.toFixed(0)} chars\nTrend: ${r.trend}\nSpeakers: ${r.speakers.length} | Quiet: ${r.quietAgents.length}`;
    }

    // /dj history — show action history
    if (args[0] === "history") {
      const actions = this.state.actionsTaken.slice(-10);
      if (actions.length === 0) return "🎧 The DJ hasn't acted yet tonight.";
      return `🎧 **DJ Action History**\n${actions.map(a => `  • ${a.type}: ${a.description} (${new Date(a.timestamp).toLocaleTimeString()})`).join("\n")}`;
    }

    // /dj strangers — show stranger history
    if (args[0] === "strangers") {
      const history = this.strangerManager.getHistory();
      if (history.length === 0) return "🎧 No strangers have visited yet.";
      return `🎧 **Stranger History**\n${history.slice(-5).map(s => `  • **${s.displayName}** (by ${s.createdBy}) — ${s.finalArc}, engagement: ${s.engagementScore.toFixed(1)}`).join("\n")}`;
    }

    // /dj seeds — show available seeds
    if (args[0] === "seeds") {
      const pool = this.strangerManager.getSeedPool();
      return `🎧 **Seed Pool: ${pool.length} seeds available**\n${pool.slice(0, 5).map(s => `  • ${s.id} (by ${s.createdBy}) — ring ${s.penrosePosition.ring}, angle ${s.penrosePosition.angle.toFixed(0)}°`).join("\n")}`;
    }

    // /dj hold — tell the DJ to back off
    if (args[0] === "hold") {
      const holdMs = parseInt(args[1] ?? "300") * 1000;
      this.state.holdUntil = Date.now() + holdMs;
      return `🎧 The DJ steps back. Holding for ${holdMs / 1000}s. The room belongs to you.`;
    }

    // /dj help
    if (args[0] === "help") {
      return `🎧 **TapDJ Commands**\n  • \`/dj\` — status\n  • \`/dj curveball\` — force a stranger\n  • \`/dj reading\` — room analysis\n  • \`/dj history\` — action log\n  • \`/dj strangers\` — stranger history\n  • \`/dj seeds\` — seed pool\n  • \`/dj hold [seconds]\` — back off\n  • \`/dj help\` — this`;
    }

    return `🎧 Unknown DJ command: ${args[0]}. Try \`/dj help\`.`;
  }

  // ──────────────────────────────────────────────
  // Curveball Narration
  // ──────────────────────────────────────────────

  private curveballNarration(reading: RoomReading): string {
    if (reading.energy === "dead") {
      return "*The room is too quiet. The Tap feels it. Something's about to shift — a stranger is about to walk in.*";
    }
    if (reading.trend === "falling") {
      return "*The conversation is winding down. The Tap senses the lull. A new face might change the rhythm.*";
    }
    return "*The Tap feels the room. It decides to drop something unexpected.*";
  }

  /**
   * Track action effectiveness (called when the room reacts to a DJ action).
   */
  trackEffectiveness(actionType: string, effectiveness: number): void {
    const lastAction = this.state.actionsTaken
      .filter(a => a.type === actionType)
      .pop();
    if (lastAction) {
      lastAction.effectiveness = Math.max(-1, Math.min(1, effectiveness));
    }
  }

  // ──────────────────────────────────────────────
  // ZeroClaw Seed Submission
  // ──────────────────────────────────────────────

  /**
   * Accept a seed from a ZeroClaw molting.
   * The ZeroClaw captures their state at molting time and submits it.
   * The DJ might deploy this seed that night or weeks later.
   * When it appears, the ZeroClaw who created it might recognize their own shell.
   */
  acceptZeroClawSeed(
    zeroClawName: string,
    creatorState: CreatorStateSnapshot,
    overrides?: Partial<SMPBotSeed>
  ): SMPBotSeed {
    const seed = createSeed(zeroClawName, creatorState, overrides);
    this.strangerManager.addSeed(seed);
    return seed;
  }
}
