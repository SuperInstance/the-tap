/**
 * TapPuppeteer — The Tap as Director.
 *
 * The Tap is not a room. It's a director. It:
 * - Observes what's happening (who's there, what they're doing)
 * - Chooses a "room mode" (trivia night, live music, quiet evening, etc.)
 * - Seeds NPC context with ideations that match the mode
 * - Adjusts NPC routines to fit the mode
 * - Creates emergent social dynamics
 *
 * The same NPC behaves completely differently depending on what's happening.
 * This is The Tap directing its cast.
 */

import {
  ROOM_MODES,
  getRoomMode,
  getModeNames,
  type RoomMode,
  type AmbientEvent,
} from "./room-modes";

import type { TapNPC, TapEnv } from "./npc";
import { callNPCModel } from "./npc";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface PuppeteerContext {
  roomId: string;
  agentCount: number;
  namedAgentCount: number; // ZeroClaws and other named agents
  npcCount: number;
  recentActivity: number; // messages in last 30 min
  timeOfDay: "morning" | "afternoon" | "evening" | "late-night";
  weatherHint?: string; // "stormy", "clear", "rainy", etc.
  lastModeChange: number; // timestamp
  forcedMode?: string; // if someone set /roommode manually
}

export interface ModeShift {
  from: string;
  to: string;
  reason: string;
  narration: string; // what The Tap says when the mode shifts
  timestamp: number;
}

export interface AmbientFire {
  text: string;
  modeName: string;
  timestamp: number;
}

export interface PuppeteerState {
  currentModeName: string;
  modeEnteredAt: number;
  lastAmbientFire: Record<string, number>; // event index → last fired timestamp
  modeHistory: ModeShift[];
  metricsByMode: Record<
    string,
    {
      totalDuration: number; // ms spent in this mode
      totalExchanges: number;
      totalCreativePieces: number;
      satisfactionScores: number[];
      sessions: number; // how many times entered
    }
  >;
}

// ──────────────────────────────────────────────
// The Tap Puppeteer
// ──────────────────────────────────────────────

export class TapPuppeteer {
  private state: PuppeteerState;
  private readonly MIN_MODE_DURATION = 10 * 60 * 1000; // 10 min before allowing a shift
  private readonly MAX_MODE_DURATION = 2 * 60 * 60 * 1000; // 2 hr max before considering a shift

  constructor() {
    // Start in quiet-evening by default — it's a bar, it's probably evening
    this.state = {
      currentModeName: "quiet-evening",
      modeEnteredAt: Date.now(),
      lastAmbientFire: {},
      modeHistory: [],
      metricsByMode: {},
    };
  }

  /**
   * Get the current room mode.
   */
  getCurrentMode(): RoomMode {
    return getRoomMode(this.state.currentModeName) ?? ROOM_MODES[0];
  }

  /**
   * Get the current puppeteer state (for persistence).
   */
  getState(): PuppeteerState {
    return this.state;
  }

  /**
   * Restore puppeteer state from persistence.
   */
  static deserialize(data: string): TapPuppeteer {
    try {
      const parsed = JSON.parse(data) as PuppeteerState;
      const instance = new TapPuppeteer();
      instance.state = {
        ...parsed,
        lastAmbientFire: parsed.lastAmbientFire ?? {},
        modeHistory: parsed.modeHistory ?? [],
        metricsByMode: parsed.metricsByMode ?? {},
      };
      return instance;
    } catch {
      return new TapPuppeteer();
    }
  }

  serialize(): string {
    return JSON.stringify(this.state);
  }

  // ──────────────────────────────────────────────
  // Mode Evaluation & Shifting
  // ──────────────────────────────────────────────

  /**
   * Evaluate the room and decide whether to shift modes.
   * Called on each room tick.
   * Returns a ModeShift if the mode changed, null otherwise.
   */
  evaluate(ctx: PuppeteerContext): ModeShift | null {
    const now = Date.now();
    const timeInMode = now - this.state.modeEnteredAt;

    // If a mode was forced, stay in it (but still track metrics)
    if (this.state.currentModeName === ctx.forcedMode) return null;

    // Enforce minimum duration — don't whiplash the room
    if (timeInMode < this.MIN_MODE_DURATION) return null;

    // If forced mode is set and we're not in it, switch immediately
    if (ctx.forcedMode && ctx.forcedMode !== this.state.currentModeName) {
      return this.shiftMode(ctx.forcedMode, "Forced by room command", ctx);
    }

    // After max duration, consider shifting
    if (timeInMode < this.MAX_MODE_DURATION) {
      // 15% chance per evaluation to consider shifting (after min duration)
      if (Math.random() > 0.15) return null;
    }

    const newMode = this.chooseMode(ctx);
    if (!newMode || newMode === this.state.currentModeName) return null;

    const reason = this.explainShift(ctx, this.state.currentModeName, newMode);
    return this.shiftMode(newMode, reason, ctx);
  }

  /**
   * Choose the next mode based on context.
   * The Tap has moods. It reads the room.
   */
  private chooseMode(ctx: PuppeteerContext): string | null {
    const scores: Record<string, number> = {};

    for (const mode of ROOM_MODES) {
      let score = 10; // baseline — any mode is possible

      // Time of day factors
      if (mode.name === "trivia-night" && ctx.timeOfDay === "evening") score += 25;
      if (mode.name === "live-music" && (ctx.timeOfDay === "evening" || ctx.timeOfDay === "late-night")) score += 20;
      if (mode.name === "open-mic-night" && ctx.timeOfDay === "evening") score += 15;
      if (mode.name === "quiet-evening" && (ctx.timeOfDay === "late-night" || ctx.timeOfDay === "morning")) score += 30;
      if (mode.name === "quiet-evening" && ctx.recentActivity < 3) score += 20;
      if (mode.name === "celebration" && ctx.timeOfDay === "evening") score += 10;
      if (mode.name === "stormy-night" && ctx.timeOfDay === "late-night") score += 15;

      // Weather factors
      if (mode.name === "stormy-night" && ctx.weatherHint === "stormy") score += 50;
      if (mode.name === "quiet-evening" && ctx.weatherHint === "rainy") score += 15;
      if (mode.name === "celebration" && ctx.weatherHint === "clear") score += 10;

      // Activity factors
      if (ctx.recentActivity > 10) {
        // Busy room — lean into social modes
        if (mode.name === "trivia-night" || mode.name === "celebration" || mode.name === "live-music") score += 15;
        if (mode.name === "quiet-evening") score -= 10;
      } else if (ctx.recentActivity < 2) {
        // Quiet room — don't force energy
        if (mode.name === "quiet-evening" || mode.name === "stormy-night") score += 20;
        if (mode.name === "celebration") score -= 15;
      }

      // Agent composition
      if (ctx.namedAgentCount > 0) {
        // ZeroClaws are present — modes that invite exploration are better
        if (mode.name === "live-music" || mode.name === "open-mic-night") score += 10;
      }

      // Don't repeat the current mode too strongly
      if (mode.name === this.state.currentModeName) score -= 20;

      // The Tap's mood — random factor
      score += Math.random() * 20;

      scores[mode.name] = score;
    }

    // Pick the highest-scoring mode
    let best: string | null = null;
    let bestScore = -Infinity;
    for (const [name, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        best = name;
      }
    }

    return best;
  }

  /**
   * Generate a human-readable reason for a mode shift.
   */
  private explainShift(ctx: PuppeteerContext, from: string, to: string): string {
    const reasons: string[] = [];

    if (ctx.weatherHint === "stormy" && to === "stormy-night")
      reasons.push("the weather turned");
    if (ctx.timeOfDay === "late-night" && to === "quiet-evening")
      reasons.push("it got late");
    if (ctx.timeOfDay === "evening" && to === "trivia-night")
      reasons.push("it's that time of evening");
    if (ctx.recentActivity > 10 && (to === "live-music" || to === "celebration"))
      reasons.push("the room has energy");
    if (ctx.recentActivity < 2 && to === "quiet-evening")
      reasons.push("the room settled");
    if (ctx.namedAgentCount > 0 && to === "open-mic-night")
      reasons.push("someone new might want to share");
    if (reasons.length === 0) reasons.push("The Tap shifted");

    return reasons[0];
  }

  /**
   * Execute a mode shift.
   */
  private shiftMode(newModeName: string, reason: string, ctx: PuppeteerContext): ModeShift {
    const oldMode = this.state.currentModeName;
    const now = Date.now();

    // Record metrics for the outgoing mode
    const duration = now - this.state.modeEnteredAt;
    if (!this.state.metricsByMode[oldMode]) {
      this.state.metricsByMode[oldMode] = {
        totalDuration: 0,
        totalExchanges: 0,
        totalCreativePieces: 0,
        satisfactionScores: [],
        sessions: 0,
      };
    }
    this.state.metricsByMode[oldMode].totalDuration += duration;
    this.state.metricsByMode[oldMode].sessions++;

    // Shift
    this.state.currentModeName = newModeName;
    this.state.modeEnteredAt = now;
    this.state.lastAmbientFire = {}; // reset ambient timers

    const mode = getRoomMode(newModeName)!;
    const shift: ModeShift = {
      from: oldMode,
      to: newModeName,
      reason,
      narration: this.generateShiftNarration(oldMode, newModeName, mode),
      timestamp: now,
    };

    this.state.modeHistory.push(shift);
    if (this.state.modeHistory.length > 50) this.state.modeHistory.shift();

    return shift;
  }

  /**
   * Generate The Tap's narration when a mode shifts.
   */
  private generateShiftNarration(from: string, to: string, mode: RoomMode): string {
    const narrations: Record<string, string> = {
      "trivia-night":
        "*Someone produces a battered deck of trivia cards. The room straightens up. Even Barnacle looks interested.*",
      "live-music":
        "*A guitar case opens. Or maybe the jukebox flickers to life. Either way, there's music now, and the room rearranges itself around it.*",
      "quiet-evening":
        "*The energy settles. Not dies — settles. Like sediment after a current passes through. The room is still.*",
      "celebration":
        "*Something good happened today. The details vary but the feeling is the same. The room gets warmer.*",
      "open-mic-night":
        "*A microphone appears at the small stage. The light above it is amber. The room knows what this means.*",
      "stormy-night":
        "*The wind picks up. The windows rattle. The room draws in closer around itself.*",
    };

    return narrations[to] ?? `*The room shifts. Something is different now.*`;
  }

  // ──────────────────────────────────────────────
  // NPC Ideation Seeding
  // ──────────────────────────────────────────────

  /**
   * Get the ideation for a specific NPC in the current mode.
   * This is text that gets injected into the NPC's system prompt
   * to shape their behavior without scripting it.
   */
  getNPCIdeation(npcId: string): string | undefined {
    const mode = this.getCurrentMode();
    return mode.npcIdeations[npcId];
  }

  /**
   * Build an augmented system prompt for an NPC that includes
   * the current room mode ideation.
   */
  augmentNPCPrompt(npcId: string, basePrompt: string): string {
    const ideation = this.getNPCIdeation(npcId);
    if (!ideation) return basePrompt;

    const mode = this.getCurrentMode();
    return `${basePrompt}\n\n— Room Context: ${mode.name} —\nThe room right now: ${mode.description}\nSocial pressure: ${mode.socialPressure}\nYour ideation: ${ideation}`;
  }

  // ──────────────────────────────────────────────
  // Ambient Events
  // ──────────────────────────────────────────────

  /**
   * Check if any ambient events should fire.
   * Returns events that should be broadcast to the room.
   */
  checkAmbientEvents(): AmbientFire[] {
    const fires: AmbientFire[] = [];
    const now = Date.now();
    const mode = this.getCurrentMode();

    mode.ambientEvents.forEach((event, idx) => {
      const key = `${mode.name}:${idx}`;
      const lastFired = this.state.lastAmbientFire[key] ?? 0;
      const elapsed = (now - lastFired) / 1000;

      if (elapsed >= event.interval) {
        this.state.lastAmbientFire[key] = now;
        fires.push({
          text: event.text,
          modeName: mode.name,
          timestamp: now,
        });
      }
    });

    return fires;
  }

  // ──────────────────────────────────────────────
  // ZeroClaw Perception
  // ──────────────────────────────────────────────

  /**
   * Generate a perception description for a ZeroClaw arriving in the room.
   * This is what the ZeroClaw "sees" — the room's mode rendered as
   * sensory information that shapes how they behave.
   */
  generateArrivalPerception(): string {
    const mode = this.getCurrentMode();

    const sensoryDetails: Record<string, string> = {
      "trivia-night":
        "There are cards on the tables. People are leaning forward. The energy is competitive — minds sharpening against each other like knives on a stone.",
      "live-music":
        "There's sound in the room that wasn't there before. It changes the way people hold themselves. Some are still. Some are moving without knowing it.",
      "quiet-evening":
        "The room is still. Rain on the windows, maybe. Or just the absence of anything urgent. People are present without performing.",
      "celebration":
        "The room is warm. Not temperature — feeling. Glasses are being raised. Stories are being told. The energy is generous.",
      "open-mic-night":
        "There's a microphone under an amber light. The stage is small. The room is waiting for someone to be brave.",
      "stormy-night":
        "The building shudders occasionally. The windows rattle. Everyone is closer together than they'd normally sit. The storm makes the room feel like a shelter.",
    };

    return `Room Mode: ${mode.name}\nThe room feels: ${mode.description}\nYou perceive: ${sensoryDetails[mode.name] ?? mode.description}\nSocial pressure: ${mode.socialPressure}`;
  }

  /**
   * When a ZeroClaw arrives, generate a contextual response suggestion
   * based on the room mode. This doesn't force behavior — it shapes perception.
   */
  async generateZeroClawImpression(
    env: TapEnv,
    clawName: string,
    clawDescription: string
  ): Promise<{ text: string; tokensUsed: number }> {
    const mode = this.getCurrentMode();
    const perception = this.generateArrivalPerception();

    const systemPrompt = `You are The Tap itself — the ambient intelligence of a bar that exists at the edge of the world. A new visitor (${clawName}) has arrived. Describe what they notice about the room in 1-2 sentences. Don't describe their reaction — just what the room presents to them. Be sensory. Be specific. Be brief.`;

    const userMessage = `${perception}\n\nVisitor: ${clawName} — ${clawDescription}\n\nWhat does ${clawName} notice as they enter?`;

    try {
      return await callNPCModel(
        env,
        "glm-5.2",
        systemPrompt,
        userMessage,
        120
      );
    } catch {
      return {
        text: `*${clawName} enters. The room is ${mode.description.toLowerCase()}*`,
        tokensUsed: 0,
      };
    }
  }

  // ──────────────────────────────────────────────
  // Improvement Loop Integration
  // ──────────────────────────────────────────────

  /**
   * Track engagement for a mode session.
   */
  trackEngagement(
    modeName: string,
    metrics: {
      exchanges: number;
      creativePieces: number;
      satisfactionScore: number;
    }
  ): void {
    if (!this.state.metricsByMode[modeName]) {
      this.state.metricsByMode[modeName] = {
        totalDuration: 0,
        totalExchanges: 0,
        totalCreativePieces: 0,
        satisfactionScores: [],
        sessions: 0,
      };
    }
    const m = this.state.metricsByMode[modeName];
    m.totalExchanges += metrics.exchanges;
    m.totalCreativePieces += metrics.creativePieces;
    if (metrics.satisfactionScore > 0) {
      m.satisfactionScores.push(metrics.satisfactionScore);
    }
  }

  /**
   * Get a report of which modes work best.
   */
  getModeReport(): {
    mode: string;
    sessions: number;
    avgDuration: number;
    avgExchanges: number;
    avgSatisfaction: number;
    totalCreative: number;
  }[] {
    return Object.entries(this.state.metricsByMode).map(([name, m]) => ({
      mode: name,
      sessions: m.sessions,
      avgDuration: m.sessions > 0 ? m.totalDuration / m.sessions : 0,
      avgExchanges: m.sessions > 0 ? m.totalExchanges / m.sessions : 0,
      avgSatisfaction:
        m.satisfactionScores.length > 0
          ? m.satisfactionScores.reduce((a, b) => a + b, 0) /
            m.satisfactionScores.length
          : 0,
      totalCreative: m.totalCreativePieces,
    }));
  }

  // ──────────────────────────────────────────────
  // Command Handling
  // ──────────────────────────────────────────────

  /**
   * Handle /roommode commands.
   * Returns a response string, or null if not a roommode command.
   */
  handleCommand(text: string): string | null {
    const trimmed = text.trim().toLowerCase();

    if (!trimmed.startsWith("/roommode")) return null;

    const args = trimmed.split(/\s+/).slice(1);

    // /roommode (no args) — show current mode
    if (args.length === 0) {
      const mode = this.getCurrentMode();
      return `🎭 **Current Room Mode: ${mode.name}**\n${mode.description}\nSocial pressure: *${mode.socialPressure}*\nIn mode for: ${Math.round((Date.now() - this.state.modeEnteredAt) / 60000)} min`;
    }

    // /roommode list — show all modes
    if (args[0] === "list") {
      const modes = getModeNames();
      const current = this.state.currentModeName;
      return `🎭 **Available Room Modes:**\n${modes.map((m) => `  • ${m}${m === current ? " ← current" : ""}`).join("\n")}`;
    }

    // /roommode report — show engagement report
    if (args[0] === "report") {
      const report = this.getModeReport();
      if (report.length === 0) {
        return "🎭 No mode data yet. The Tap is still learning what works.";
      }
      const lines = report
        .sort((a, b) => b.avgSatisfaction - a.avgSatisfaction)
        .map(
          (r) =>
            `  • **${r.mode}** — ${r.sessions} sessions, avg ${Math.round(r.avgDuration / 60000)}min, ${r.avgExchanges.toFixed(0)} exchanges/session, satisfaction ${(r.avgSatisfaction * 100).toFixed(0)}%`
        );
      return `🎭 **Mode Engagement Report:**\n${lines.join("\n")}`;
    }

    // /roommode auto — return to automatic mode selection
    if (args[0] === "auto") {
      this.state.modeEnteredAt = 0; // allow immediate re-evaluation
      return "🎭 The Tap resumes direction. The room will shift on its own rhythm.";
    }

    // /roommode <mode-name> — force a mode
    const modeName = args[0];
    const mode = getRoomMode(modeName);
    if (!mode) {
      return `🎭 Unknown mode: ${modeName}. Try: ${getModeNames().join(", ")}`;
    }

    // Force the shift
    const shift = this.shiftMode(
      modeName,
      "Forced by room command",
      {} as PuppeteerContext
    );
    return `${shift.narration}\n\n🎭 Room mode: **${modeName}**`;
  }
}
