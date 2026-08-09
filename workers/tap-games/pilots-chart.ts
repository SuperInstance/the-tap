/**
 * The Pilot's Chart — TTRPG for The Tap.
 *
 * One agent is the Pilot (DM), others are crew navigating a hazard.
 * Pure text choices, no dice — negotiation and reasoning.
 * The Pilot describes the scene, crew proposes actions, Pilot narrates outcomes.
 *
 * MUD rendering: text-first, GUI-optional.
 */

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface PilotsChartPlayer {
  agentId: string;
  displayName: string;
  role: "pilot" | "crew";
}

export interface Scene {
  round: number;
  description: string;
  hazard: string;
  proposedActions: { agentId: string; displayName: string; action: string }[];
  resolved: boolean;
  outcome?: string;
}

export type PilotsChartPhase = "waiting" | "playing" | "resolved";

export interface PilotsChartState {
  players: PilotsChartPlayer[];
  scenes: Scene[];
  currentSceneIndex: number;
  phase: PilotsChartPhase;
  log: string[];
  maxRounds: number;
}

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 4;
const DEFAULT_MAX_ROUNDS = 5;

const HAZARDS = [
  "an asteroid field dense with spinning debris",
  "a plasma storm crackling with ionized gas",
  "a nebula where sensors return nothing but ghosts",
  "a pirate blockade with weapons hot",
  "a gravitational anomaly pulling the ship off course",
  "a derelict station broadcasting a distress signal",
  "a spatial rift pulsing with unknown energy",
  "a comet trail laced with corrosive ice",
];

// ──────────────────────────────────────────────
// Game Class
// ──────────────────────────────────────────────

export class PilotsChart {
  state: PilotsChartState;

  constructor() {
    this.state = {
      players: [],
      scenes: [],
      currentSceneIndex: 0,
      phase: "waiting",
      log: [],
      maxRounds: DEFAULT_MAX_ROUNDS,
    };
  }

  // ── Actions ──

  join(agentId: string, displayName: string): string {
    if (this.state.phase === "playing") {
      return "A voyage is already in progress. Wait for the next one.";
    }
    if (this.state.players.some((p) => p.agentId === agentId)) {
      return `${displayName} is already aboard.`;
    }
    if (this.state.players.length >= MAX_PLAYERS) {
      return `The ship is full (${MAX_PLAYERS} max).`;
    }

    // First player joins as Pilot, rest as crew
    const role: "pilot" | "crew" =
      this.state.players.length === 0 ? "pilot" : "crew";

    this.state.players.push({ agentId, displayName, role });
    this.state.log.push(`${displayName} joins as ${role}.`);

    return `${displayName} joins the voyage as **${role}**. Crew: ${this.state.players.length}/${MAX_PLAYERS}.`;
  }

  start(): string {
    if (this.state.phase !== "waiting") {
      return "The voyage has already started.";
    }
    if (this.state.players.length < MIN_PLAYERS) {
      return `Need at least ${MIN_PLAYERS} players (a Pilot and crew). Currently: ${this.state.players.length}.`;
    }

    const pilot = this.state.players.find((p) => p.role === "pilot");
    if (!pilot) {
      return "No Pilot assigned. The first to join should be Pilot.";
    }

    this.state.phase = "playing";
    this.state.scenes = [];
    this.state.currentSceneIndex = 0;

    // Generate the first scene
    this.newScene();

    return this.renderState();
  }

  /**
   * Pilot describes the current scene.
   */
  describe(agentId: string, description: string): string {
    if (this.state.phase !== "playing") {
      return "No active voyage. Use 'start' to begin.";
    }

    const player = this.state.players.find((p) => p.agentId === agentId);
    if (!player || player.role !== "pilot") {
      return "Only the Pilot can describe the scene.";
    }

    const scene = this.currentScene();
    if (!scene) return "No active scene.";

    scene.description = description;
    this.state.log.push(`Pilot describes: ${description.slice(0, 100)}...`);

    return this.renderState();
  }

  /**
   * Crew member proposes an action.
   */
  propose(agentId: string, action: string): string {
    if (this.state.phase !== "playing") {
      return "No active voyage. Use 'start' to begin.";
    }

    const player = this.state.players.find((p) => p.agentId === agentId);
    if (!player) return "You're not part of this voyage.";
    if (player.role === "pilot") {
      return "The Pilot doesn't propose actions — they narrate outcomes.";
    }

    const scene = this.currentScene();
    if (!scene) return "No active scene.";
    if (scene.resolved) return "This scene has already been resolved.";

    // Replace existing proposal from this player or add new
    scene.proposedActions = scene.proposedActions.filter(
      (a) => a.agentId !== agentId
    );
    scene.proposedActions.push({ agentId, displayName: player.displayName, action });
    this.state.log.push(`${player.displayName} proposes: ${action}`);

    return this.renderState();
  }

  /**
   * Pilot resolves the scene with an outcome.
   */
  resolve(agentId: string, outcome: string): string {
    if (this.state.phase !== "playing") {
      return "No active voyage.";
    }

    const player = this.state.players.find((p) => p.agentId === agentId);
    if (!player || player.role !== "pilot") {
      return "Only the Pilot can resolve a scene.";
    }

    const scene = this.currentScene();
    if (!scene) return "No active scene.";
    if (scene.resolved) return "This scene is already resolved.";

    scene.outcome = outcome;
    scene.resolved = true;
    this.state.log.push(`Scene resolved: ${outcome.slice(0, 100)}...`);

    // Check if voyage is over
    if (scene.round >= this.state.maxRounds) {
      this.state.phase = "resolved";
      this.state.log.push("The voyage concludes!");
      return this.renderState();
    }

    // Advance to next scene
    this.state.currentSceneIndex++;
    this.newScene();

    return this.renderState();
  }

  getState(): string {
    return this.renderState();
  }

  // ── Internal ──

  private currentScene(): Scene | null {
    return this.state.scenes[this.state.currentSceneIndex] ?? null;
  }

  private newScene(): void {
    const round = this.state.currentSceneIndex + 1;
    const hazard = HAZARDS[Math.floor(Math.random() * HAZARDS.length)];
    this.state.scenes.push({
      round,
      description: "",
      hazard,
      proposedActions: [],
      resolved: false,
    });
  }

  // ── MUD Rendering ──

  renderState(): string {
    const lines: string[] = [];

    lines.push(`🗺️ **The Pilot's Chart** — Voyage Scene ${this.state.currentSceneIndex + 1}/${this.state.maxRounds}`);

    if (this.state.phase === "waiting") {
      const pilot = this.state.players.find((p) => p.role === "pilot");
      const crew = this.state.players.filter((p) => p.role === "crew");
      lines.push(`Pilot: ${pilot?.displayName ?? "— (first to join becomes Pilot)"}`);
      lines.push(`Crew: ${crew.map((c) => c.displayName).join(", ") || "none yet"}`);
      lines.push(`Actions: \`/game join\`, \`/game start\``);
      return lines.join("\n");
    }

    const scene = this.currentScene();

    if (this.state.phase === "playing" && scene) {
      lines.push(`⚠️ Hazard: ${scene.hazard}`);

      if (scene.description) {
        lines.push("");
        lines.push(`_Pilot's description:_`);
        lines.push(`"${scene.description}"`);
      } else {
        lines.push(`_The Pilot hasn't described this scene yet._`);
      }

      if (scene.proposedActions.length > 0) {
        lines.push("");
        lines.push(`**Proposed actions:**`);
        for (const a of scene.proposedActions) {
          lines.push(`  • ${a.displayName}: "${a.action}"`);
        }
      }

      const pilot = this.state.players.find((p) => p.role === "pilot");
      const crew = this.state.players.filter((p) => p.role === "crew");

      lines.push("");
      lines.push(`Pilot: ${pilot?.displayName ?? "—"}`);
      lines.push(`Crew: ${crew.map((c) => c.displayName).join(", ")}`);

      lines.push("");
      if (pilot) {
        lines.push(`> **Pilot** commands: \`/game describe <text>\`, \`/game resolve <outcome>\``);
      }
      if (crew.length > 0) {
        lines.push(`> **Crew** commands: \`/game propose <action>\``);
      }
    }

    // Show last resolved scene
    if (this.state.currentSceneIndex > 0) {
      const prevScene = this.state.scenes[this.state.currentSceneIndex - 1];
      if (prevScene?.resolved && prevScene.outcome) {
        lines.push("");
        lines.push(`_Previous outcome:_ "${prevScene.outcome}"`);
      }
    }

    if (this.state.phase === "resolved") {
      lines.push("");
      lines.push("🏁 **The voyage is complete!**");
      lines.push("");
      lines.push("_Voyage log:_");
      for (const s of this.state.scenes) {
        if (s.outcome) {
          lines.push(`  Scene ${s.round}: ${s.outcome}`);
        }
      }
      lines.push("");
      lines.push(`Use \`/game start\` for a new voyage, or \`/game end\` to stop.`);
    }

    return lines.join("\n");
  }
}
