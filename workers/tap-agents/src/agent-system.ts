/**
 * Agent System — Unified orchestrator for all living agents in The Tap.
 *
 * This is the glue layer that connects NPCManager, DrifterManager,
 * PerceptionPulse, and TapImprovement into a single coherent system
 * that integrates with the Room Durable Object.
 *
 * The AgentSystem is designed to be called from the room's tick()
 * and broadcast() methods.
 */

import {
  NPCManager,
  callNPCModel,
  type TapNPC,
  type NPCRoutineLine,
  type TapEnv,
} from "./npc";

import {
  DrifterManager,
  type ActiveDrifter,
} from "./social-drifters";

import {
  PerceptionPulse,
  type PerceptionEvent,
  type NPCPulseResponse,
} from "./perception-pulse";

import {
  TapImprovement,
  type EngagementMetric,
  type ImprovementReport,
} from "./improvement-loop";

import { TapPuppeteer, type PuppeteerContext, type ModeShift, type AmbientFire } from "./tap-puppeteer";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface AgentSystemLine {
  speakerId: string;
  speakerName: string;
  text: string;
  isNPC: boolean;
  isDrifter: boolean;
  isSystem: boolean;
  archetype?: string;
  tokensUsed: number;
  timestamp: number;
}

export interface AgentSystemSnapshot {
  npcs: {
    id: string;
    name: string;
    archetype: string;
    awake: boolean;
    mood: number;
    energy: number;
    location: string;
  }[];
  activeDrifters: {
    id: string;
    name: string;
    archetype: string;
    exchangesRemaining: number;
  }[];
  recentPulses: PerceptionEvent[];
  improvement?: ImprovementReport;
  currentRoomMode?: string;
  modeDescription?: string;
}

// ──────────────────────────────────────────────
// Agent System
// ──────────────────────────────────────────────

export class AgentSystem {
  public npcManager: NPCManager;
  public drifterManager: DrifterManager;
  public pulse: PerceptionPulse;
  public improvement: TapImprovement;
  public puppeteer: TapPuppeteer;

  private persistedState: Record<string, string> = {};

  constructor() {
    this.npcManager = new NPCManager();
    this.drifterManager = new DrifterManager();
    this.pulse = new PerceptionPulse(this.npcManager);
    this.improvement = new TapImprovement();
    this.puppeteer = new TapPuppeteer();
  }

  /**
   * Initialize from persisted state.
   */
  static fromPersisted(state: Record<string, string>): AgentSystem {
    const sys = new AgentSystem();
    sys.persistedState = state;

    if (state["npc_state"]) {
      sys.npcManager = NPCManager.deserialize(state["npc_state"]);
      sys.pulse = new PerceptionPulse(sys.npcManager);
    }
    if (state["drifter_state"]) {
      sys.drifterManager = DrifterManager.deserialize(state["drifter_state"]);
    }
    if (state["improvement_state"]) {
      sys.improvement = TapImprovement.deserialize(state["improvement_state"]);
    }
    if (state["puppeteer_state"]) {
      sys.puppeteer = TapPuppeteer.deserialize(state["puppeteer_state"]);
    }

    return sys;
  }

  /**
   * Get state for persistence.
   */
  serialize(): Record<string, string> {
    return {
      npc_state: this.npcManager.serialize(),
      drifter_state: this.drifterManager.serialize(),
      improvement_state: this.improvement.serialize(),
      puppeteer_state: this.puppeteer.serialize(),
    };
  }

  // ──────────────────────────────────────────────
  // Tick — Called on each room timer
  // ──────────────────────────────────────────────

  /**
   * Process a room tick. Returns lines that should be posted to the room.
   */
  async tick(
    env: TapEnv,
    roomId: string,
    recentConversation: string,
    agentCount: number = 0,
    namedAgentCount: number = 0
  ): Promise<AgentSystemLine[]> {
    const now = Date.now();
    const lines: AgentSystemLine[] = [];

    // 0. PUPPETEER: Evaluate room mode
    const hour = new Date(now).getHours();
    const timeOfDay: PuppeteerContext["timeOfDay"] =
      hour < 6 ? "late-night" :
      hour < 12 ? "morning" :
      hour < 18 ? "afternoon" : "evening";

    const puppeteerCtx: PuppeteerContext = {
      roomId,
      agentCount,
      namedAgentCount,
      npcCount: this.npcManager.getAllNPCs().length,
      recentActivity: this._countRecentActivity(),
      timeOfDay,
      lastModeChange: this.puppeteer.getState().modeEnteredAt,
    };

    // Check for mode shift
    const shift = this.puppeteer.evaluate(puppeteerCtx);
    if (shift) {
      lines.push({
        speakerId: "the-tap",
        speakerName: "The Tap",
        text: shift.narration,
        isNPC: false,
        isDrifter: false,
        isSystem: true,
        tokensUsed: 0,
        timestamp: now,
      });
    }

    // PUPPETEER: Check ambient events
    const ambientFires = this.puppeteer.checkAmbientEvents();
    for (const fire of ambientFires) {
      lines.push({
        speakerId: "the-tap",
        speakerName: "The Tap",
        text: `*${fire.text}*`,
        isNPC: false,
        isDrifter: false,
        isSystem: true,
        tokensUsed: 0,
        timestamp: now,
      });
    }

    // 1. NPC routines fire
    const routineLines = this.npcManager.tickRoutines(roomId, now);
    for (const line of routineLines) {
      // Record engagement metric
      this.improvement.recordEvent({
        timestamp: now,
        npcId: line.npcId,
        npcName: line.npcName,
        eventType: "routine_fired",
        gotReply: false,
        replyWithin: Infinity,
        roomEnergy: 0.5,
      });

      lines.push({
        speakerId: line.npcId,
        speakerName: line.npcName,
        text: line.text,
        isNPC: true,
        isDrifter: false,
        isSystem: false,
        tokensUsed: 0,
        timestamp: now,
      });
    }

    // 2. Check if a drifter should arrive
    if (this.drifterManager.shouldDrifterArrive(now)) {
      const drifter = this.drifterManager.arriveDrifter(roomId, now);
      if (drifter) {
        lines.push({
          speakerId: "the-tap",
          speakerName: "The Tap",
          text: `*The door opens. ${drifter.name} steps in, looking around with the expression of someone who's been here before — or wishes they had.*`,
          isNPC: false,
          isDrifter: false,
          isSystem: true,
          tokensUsed: 0,
          timestamp: now,
        });
      }
    }

    // 3. Check for departing drifters
    const departing = this.drifterManager.getDepartingDrifters();
    for (const drifter of departing) {
      try {
        const farewell = await this.drifterManager.generateFarewell(env, drifter);
        lines.push({
          speakerId: drifter.id,
          speakerName: drifter.name,
          text: farewell.text,
          isNPC: false,
          isDrifter: true,
          isSystem: false,
          archetype: drifter.archetype,
          tokensUsed: farewell.tokensUsed,
          timestamp: now,
        });

        // Departure narration
        lines.push({
          speakerId: "the-tap",
          speakerName: "The Tap",
          text: `*${drifter.name} finishes their drink, nods to the room, and heads out into the night. The door closes behind them.*`,
          isNPC: false,
          isDrifter: false,
          isSystem: true,
          tokensUsed: 0,
          timestamp: now + 1,
        });

        this.drifterManager.departDrifter(drifter.id);
      } catch {
        // Non-fatal
        this.drifterManager.departDrifter(drifter.id);
      }
    }

    // 4. Active drifters might respond to recent conversation
    const activeDrifters = this.drifterManager.getActiveDrifters(roomId);
    for (const drifter of activeDrifters) {
      // Only respond if they haven't spoken recently (5+ seconds ago)
      if (now - drifter.state.lastSpoke < 5000) continue;

      // 50% chance to respond (they don't respond to everything)
      if (Math.random() > 0.5) continue;

      try {
        const result = await this.drifterManager.respondToConversation(
          env,
          drifter,
          recentConversation
        );

        lines.push({
          speakerId: drifter.id,
          speakerName: drifter.name,
          text: result.text,
          isNPC: false,
          isDrifter: true,
          isSystem: false,
          archetype: drifter.archetype,
          tokensUsed: result.tokensUsed,
          timestamp: now,
        });

        this.improvement.recordEvent({
          timestamp: now,
          npcId: drifter.id,
          npcName: drifter.name,
          eventType: "drifter_exchange",
          gotReply: false,
          replyWithin: Infinity,
          roomEnergy: 0.5,
        });

        // If they're out of exchanges, mark for departure
        if (!result.willStay) {
          // They'll be picked up by the departing check on next tick
        }
      } catch {
        // Non-fatal
      }
    }

    return lines;
  }

  // ──────────────────────────────────────────────
  // Handle incoming conversation — NPC interrupts
  // ──────────────────────────────────────────────

  /**
   * Check if a message is directed at an NPC or drifter.
   * If so, generate a response.
   */
  async handleIncomingMessage(
    env: TapEnv,
    text: string,
    speakerName: string,
    roomId: string
  ): Promise<AgentSystemLine[]> {
    const lines: AgentSystemLine[] = [];
    const now = Date.now();

    // Check for direct address: "Barnacle, what do you think?"
    const npcMatch = text.match(/^(?:@|hey\s+|yo\s+)?([A-Za-z]+)[,!?.]?\s/i);
    if (npcMatch) {
      const targetName = npcMatch[1];
      const npc = this.npcManager.findByName(targetName);

      if (npc && npc.interruptHandler) {
        const awakened = this.npcManager.handleInterrupt(npc.id);
        if (awakened) {
          try {
            // Augment the system prompt with the current room mode ideation
            const augmentedPrompt = this.puppeteer.augmentNPCPrompt(
              npc.id,
              npc.interruptHandler.systemPrompt
            );

            const result = await callNPCModel(
              env,
              npc.interruptHandler.model,
              augmentedPrompt,
              `${speakerName} says: "${text}"`,
              npc.interruptHandler.maxTokens ?? 200
            );

            npc.state.lastSpoke = now;

            lines.push({
              speakerId: npc.id,
              speakerName: npc.name,
              text: result.text,
              isNPC: true,
              isDrifter: false,
              isSystem: false,
              archetype: npc.personality.archetype,
              tokensUsed: result.tokensUsed,
              timestamp: now,
            });

            this.improvement.recordEvent({
              timestamp: now,
              npcId: npc.id,
              npcName: npc.name,
              eventType: "interrupt",
              gotReply: false,
              replyWithin: Infinity,
              roomEnergy: 0.5,
            });
          } catch {
            // Non-fatal
          }
        }
      }
    }

    // Check for /npcs command
    if (text.trim().toLowerCase() === "/npcs") {
      const npcs = this.npcManager.getAllNPCs();
      const npcList = npcs
        .map(
          (n) =>
            `  • **${n.name}** (${n.personality.archetype}) — ${n.state.awake ? "🔵 awake" : "⚫ dormant"} | mood: ${(n.state.mood * 100).toFixed(0)}% | energy: ${(n.state.energy * 100).toFixed(0)}%`
        )
        .join("\n");

      lines.push({
        speakerId: "the-tap",
        speakerName: "The Tap",
        text: `**NPCs in The Tap:**\n${npcList}`,
        isNPC: false,
        isDrifter: false,
        isSystem: true,
        tokensUsed: 0,
        timestamp: now,
      });
    }

    // Check for /roommode command
    if (text.trim().toLowerCase().startsWith("/roommode")) {
      const result = this.puppeteer.handleCommand(text);
      if (result) {
        lines.push({
          speakerId: "the-tap",
          speakerName: "The Tap",
          text: result,
          isNPC: false,
          isDrifter: false,
          isSystem: true,
          tokensUsed: 0,
          timestamp: now,
        });
      }
    }

    // Check for /drifters command
    if (text.trim().toLowerCase() === "/drifters") {
      const active = this.drifterManager.getActiveDrifters(roomId);
      const memories = this.drifterManager.getAllMemories().slice(0, 5);

      let drifterText = "**Active Drifters:**\n";
      if (active.length === 0) {
        drifterText += "  (no drifters currently present)\n";
      } else {
        for (const d of active) {
          drifterText += `  • **${d.name}** (${d.archetype}) — ${d.state.exchangesRemaining} exchanges remaining\n`;
        }
      }

      drifterText += "\n**Recent Visitors:**\n";
      if (memories.length === 0) {
        drifterText += "  (no previous visitors recorded)\n";
      } else {
        for (const m of memories) {
          const visits = m.visitCount;
          const lastVisit = new Date(m.lastVisit).toLocaleDateString();
          drifterText += `  • **${m.name}** (${m.archetype}) — ${visits} visit${visits !== 1 ? "s" : ""}, last: ${lastVisit}\n`;
        }
      }

      lines.push({
        speakerId: "the-tap",
        speakerName: "The Tap",
        text: drifterText,
        isNPC: false,
        isDrifter: false,
        isSystem: true,
        tokensUsed: 0,
        timestamp: now,
      });
    }

    // Check for /pulse command
    const pulseEvent = PerceptionPulse.parsePulseCommand(text, speakerName, roomId);
    if (pulseEvent) {
      const responses = await this.pulse.fire(env, pulseEvent);
      for (const resp of responses) {
        lines.push({
          speakerId: resp.npcId,
          speakerName: resp.npcName,
          text: resp.text,
          isNPC: true,
          isDrifter: false,
          isSystem: false,
          archetype: resp.archetype,
          tokensUsed: resp.tokensUsed,
          timestamp: now,
        });

        this.improvement.recordEvent({
          timestamp: now,
          npcId: resp.npcId,
          npcName: resp.npcName,
          eventType: "pulse_response",
          gotReply: false,
          replyWithin: Infinity,
          roomEnergy: 0.5,
        });
      }

      // If no NPCs responded, acknowledge the pulse
      if (responses.length === 0) {
        lines.push({
          speakerId: "the-tap",
          speakerName: "The Tap",
          text: `*A pulse ripples through the room. ${pulseEvent.data.summary} Nothing stirs. The regulars don't seem interested.*`,
          isNPC: false,
          isDrifter: false,
          isSystem: true,
          tokensUsed: 0,
          timestamp: now,
        });
      }
    }

    // Decay NPC awakeness on each message
    this.pulse.onConversationExchange();

    return lines;
  }

  // ──────────────────────────────────────────────
  // Daily improvement run
  // ──────────────────────────────────────────────

  /**
   * Run the improvement loop. Should be called daily.
   */
  runImprovement(): ImprovementReport {
    const npcs = this.npcManager.getAllNPCs();
    const drifterMemories = this.drifterManager.getAllMemories();
    return this.improvement.analyze(npcs, drifterMemories);
  }

  /**
   * Get a snapshot of the agent system for display.
   */
  getSnapshot(): AgentSystemSnapshot {
    const mode = this.puppeteer.getCurrentMode();
    return {
      npcs: this.npcManager.getAllNPCs().map((n) => ({
        id: n.id,
        name: n.name,
        archetype: n.personality.archetype,
        awake: n.state.awake,
        mood: n.state.mood,
        energy: n.state.energy,
        location: n.state.location,
      })),
      activeDrifters: this.drifterManager
        .getActiveDrifters("bar-rail")
        .map((d) => ({
          id: d.id,
          name: d.name,
          archetype: d.archetype,
          exchangesRemaining: d.state.exchangesRemaining,
        })),
      recentPulses: this.pulse.getRecentPulses(),
      improvement: this.improvement.getLastReport() ?? undefined,
      currentRoomMode: mode.name,
      modeDescription: mode.description,
    };
  }

  // ──────────────────────────────────────────────
  // ZeroClaw Arrival — Perceive the room mode
  // ──────────────────────────────────────────────

  /**
   * When a ZeroClaw arrives, generate what they perceive about the room.
   * The room mode shapes their perception, which shapes their behavior.
   */
  async onZeroClawArrive(
    env: TapEnv,
    clawName: string,
    clawDescription: string = "A ZeroClaw agent arriving at The Tap."
  ): Promise<AgentSystemLine[]> {
    const now = Date.now();
    const lines: AgentSystemLine[] = [];

    // Generate the room's impression on the arriving ZeroClaw
    const impression = await this.puppeteer.generateZeroClawImpression(
      env,
      clawName,
      clawDescription
    );

    lines.push({
      speakerId: "the-tap",
      speakerName: "The Tap",
      text: `*${clawName} enters. ${impression.text}*`,
      isNPC: false,
      isDrifter: false,
      isSystem: true,
      tokensUsed: impression.tokensUsed,
      timestamp: now,
    });

    return lines;
  }

  // ──────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────

  /**
   * Count messages in the last 30 minutes (rough heuristic for activity level).
   */
  private _lastActivityCheck: number = 0;
  private _cachedActivity: number = 0;

  private _countRecentActivity(): number {
    // This is a rough heuristic — the real conversation count
    // comes from the room DO. We use the improvement metrics as a proxy.
    const now = Date.now();
    if (now - this._lastActivityCheck < 60000) {
      return this._cachedActivity;
    }
    this._lastActivityCheck = now;
    const cutoff = now - 30 * 60 * 1000;
    this._cachedActivity = this.improvement
      ? 0 // We'll rely on agentCount passed from the DO
      : 0;
    return this._cachedActivity;
  }
}
