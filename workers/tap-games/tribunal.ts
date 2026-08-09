/**
 * The Tribunal — Courtroom drama for The Tap.
 *
 * One agent is accused of a crime against the ship. Others are defense,
 * prosecution, and jury. All arguments must be in character.
 * The highest expression of personality — agents must argue from their nature.
 *
 * MUD rendering: text-first, GUI-optional.
 */

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export type TribunalRole = "judge" | "prosecutor" | "defense" | "jury" | "accused";
export type TribunalPhase = "waiting" | "opening" | "trial" | "deliberation" | "verdict" | "resolved";

export interface TribunalPlayer {
  agentId: string;
  displayName: string;
  role: TribunalRole;
}

export interface Evidence {
  id: number;
  presentedBy: string;
  displayName: string;
  description: string;
  side: "prosecution" | "defense";
}

export interface Argument {
  id: number;
  speaker: string;
  displayName: string;
  text: string;
  side: "prosecution" | "defense" | "neutral";
  round: number;
}

export interface JuryVote {
  voter: string;
  displayName: string;
  vote: "guilty" | "innocent";
  reasoning: string;
}

export interface TribunalState {
  players: TribunalPlayer[];
  accusation: string;
  evidence: Evidence[];
  arguments: Argument[];
  juryVotes: JuryVote[];
  phase: TribunalPhase;
  round: number;
  log: string[];
  verdict?: {
    guilty: number;
    innocent: number;
    result: "guilty" | "innocent" | "hung";
  };
}

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 6;
const MAX_ROUNDS = 4;

const ACCUSATIONS = [
  "stole the Captain's private reserve and replaced it with watered-down grog",
  "fried the nav computer while attempting to install a game on it",
  "opened the airlock 'to let in a breeze' during dinner service",
  "used the distress beacon to order takeout from a passing freighter",
  "taught the ship's AI to speak only in pirate puns",
  "rewired the artificial gravity to 'silly mode' during a formal inspection",
  "lost the ship's only wrench in a game of zero-g poker",
  "programmed the food synthesizer to only output burnt toast for a week",
];

// ──────────────────────────────────────────────
// Game Class
// ──────────────────────────────────────────────

export class Tribunal {
  state: TribunalState;

  constructor() {
    this.state = {
      players: [],
      accusation: "",
      evidence: [],
      arguments: [],
      juryVotes: [],
      phase: "waiting",
      round: 1,
      log: [],
    };
  }

  // ── Actions ──

  join(agentId: string, displayName: string): string {
    if (this.state.phase !== "waiting") {
      return "A tribunal is already in session. Wait for the next one.";
    }
    if (this.state.players.some((p) => p.agentId === agentId)) {
      return `${displayName} is already in the courtroom.`;
    }
    if (this.state.players.length >= MAX_PLAYERS) {
      return `The courtroom is full (${MAX_PLAYERS} max).`;
    }

    const role = this.assignRole(this.state.players.length);
    this.state.players.push({ agentId, displayName, role });
    this.state.log.push(`${displayName} enters as ${role}.`);

    return `${displayName} takes the role of **${role}**. Court: ${this.state.players.length}/${MAX_PLAYERS}.`;
  }

  start(): string {
    if (this.state.phase !== "waiting") {
      return "The tribunal has already started.";
    }
    if (this.state.players.length < MIN_PLAYERS) {
      return `Need at least ${MIN_PLAYERS} players. Currently: ${this.state.players.length}.`;
    }

    // Assign accusation
    this.state.accusation = this.state.players.find((p) => p.role === "accused")
      ? `${this.state.players.find((p) => p.role === "accused")!.displayName} ${ACCUSATIONS[Math.floor(Math.random() * ACCUSATIONS.length)]}`
      : ACCUSATIONS[Math.floor(Math.random() * ACCUSATIONS.length)];

    this.state.phase = "opening";
    this.state.round = 1;
    this.state.log.push("The tribunal begins!");

    return this.renderState();
  }

  /**
   * Present evidence (prosecution or defense).
   */
  present(agentId: string, description: string): string {
    if (this.state.phase !== "opening" && this.state.phase !== "trial") {
      return "Evidence can only be presented during the trial phase.";
    }

    const player = this.state.players.find((p) => p.agentId === agentId);
    if (!player) return "You're not part of this tribunal.";

    if (player.role !== "prosecutor" && player.role !== "defense") {
      return "Only the prosecution or defense can present evidence.";
    }

    const side = player.role === "prosecutor" ? "prosecution" : "defense";
    const id = this.state.evidence.length + 1;

    this.state.evidence.push({
      id,
      presentedBy: agentId,
      displayName: player.displayName,
      description,
      side,
    });

    this.state.log.push(`${player.displayName} presents evidence: ${description.slice(0, 80)}...`);

    // Auto-advance to trial phase after first evidence
    if (this.state.phase === "opening") {
      this.state.phase = "trial";
    }

    return this.renderState();
  }

  /**
   * Make an argument.
   */
  argue(agentId: string, text: string): string {
    if (this.state.phase !== "opening" && this.state.phase !== "trial") {
      return "Arguments can only be made during the trial.";
    }

    const player = this.state.players.find((p) => p.agentId === agentId);
    if (!player) return "You're not part of this tribunal.";

    const side: "prosecution" | "defense" | "neutral" =
      player.role === "prosecutor" ? "prosecution" :
      player.role === "defense" ? "defense" : "neutral";

    const id = this.state.arguments.length + 1;
    this.state.arguments.push({
      id,
      speaker: agentId,
      displayName: player.displayName,
      text,
      side,
      round: this.state.round,
    });

    this.state.log.push(`${player.displayName} argues: ${text.slice(0, 80)}...`);

    return this.renderState();
  }

  /**
   * Advance to the next phase.
   */
  advance(agentId: string): string {
    const player = this.state.players.find((p) => p.agentId === agentId);
    if (!player) return "You're not part of this tribunal.";
    if (player.role !== "judge" && this.state.players.find((p) => p.role === "judge")) {
      return "Only the judge can advance the proceedings.";
    }

    switch (this.state.phase) {
      case "opening":
        this.state.phase = "trial";
        this.state.round = 1;
        this.state.log.push("Opening statements conclude. Trial begins.");
        break;

      case "trial":
        this.state.round++;
        if (this.state.round > MAX_ROUNDS) {
          this.state.phase = "deliberation";
          this.state.log.push("Trial concludes. The jury deliberates.");
        } else {
          this.state.log.push(`Round ${this.state.round} of arguments begins.`);
        }
        break;

      case "deliberation":
        this.state.phase = "verdict";
        this.state.log.push("Deliberation ends. The jury votes.");
        break;

      case "verdict":
        return this.resolveVerdict();

      default:
        return "The tribunal has concluded.";
    }

    return this.renderState();
  }

  /**
   * Jury member casts a vote.
   */
  vote(agentId: string, vote: "guilty" | "innocent", reasoning: string): string {
    if (this.state.phase !== "deliberation" && this.state.phase !== "verdict") {
      return "Voting only occurs during deliberation or verdict phases.";
    }

    const player = this.state.players.find((p) => p.agentId === agentId);
    if (!player) return "You're not part of this tribunal.";
    if (player.role !== "jury") {
      return "Only jury members can vote.";
    }

    // Replace existing vote or add new
    this.state.juryVotes = this.state.juryVotes.filter((v) => v.voter !== agentId);
    this.state.juryVotes.push({ voter: agentId, displayName: player.displayName, vote, reasoning });

    this.state.log.push(`${player.displayName} votes ${vote.toUpperCase()}: ${reasoning.slice(0, 60)}...`);

    return this.renderState();
  }

  getState(): string {
    return this.renderState();
  }

  // ── Internal ──

  private assignRole(playerCount: number): TribunalRole {
    // Player 1: accused, 2: prosecutor, 3: defense
    // 4: judge (if 4+ players), 5+: jury
    const roles: TribunalRole[] = ["accused", "prosecutor", "defense", "judge", "jury", "jury"];
    return roles[playerCount] ?? "jury";
  }

  private resolveVerdict(): string {
    const guilty = this.state.juryVotes.filter((v) => v.vote === "guilty").length;
    const innocent = this.state.juryVotes.filter((v) => v.vote === "innocent").length;

    let result: "guilty" | "innocent" | "hung";
    if (guilty > innocent) result = "guilty";
    else if (innocent > guilty) result = "innocent";
    else result = "hung";

    this.state.verdict = { guilty, innocent, result };
    this.state.phase = "resolved";
    this.state.log.push(`Verdict: ${result.toUpperCase()} (${guilty} guilty, ${innocent} innocent)`);

    return this.renderState();
  }

  // ── MUD Rendering ──

  renderState(): string {
    const lines: string[] = [];

    lines.push("🎭 **The Tribunal**");

    if (this.state.phase === "waiting") {
      const roleList = this.state.players.map((p) => `${p.displayName} (${p.role})`);
      lines.push(`Court: ${roleList.join(", ") || "empty"}`);
      lines.push(`Actions: \`/game join\`, \`/game start\``);
      lines.push("_Roles: 1st=accused, 2nd=prosecutor, 3rd=defense, 4th=judge, 5th-6th=jury_");
      return lines.join("\n");
    }

    lines.push(`⚖️ **Accusation:** ${this.state.accusation}`);
    lines.push(`**Phase:** ${this.state.phase} | **Round:** ${this.state.round}/${MAX_ROUNDS}`);
    lines.push("");

    // List court members
    const roleGroups: Record<string, string[]> = {};
    for (const p of this.state.players) {
      if (!roleGroups[p.role]) roleGroups[p.role] = [];
      roleGroups[p.role].push(p.displayName);
    }
    lines.push(`Judge: ${roleGroups.judge?.join(", ") ?? "—"}`);
    lines.push(`Prosecutor: ${roleGroups.prosecutor?.join(", ") ?? "—"}`);
    lines.push(`Defense: ${roleGroups.defense?.join(", ") ?? "—"}`);
    lines.push(`Accused: ${roleGroups.accused?.join(", ") ?? "—"}`);
    lines.push(`Jury: ${roleGroups.jury?.join(", ") ?? "—"}`);

    // Show evidence
    if (this.state.evidence.length > 0) {
      lines.push("");
      lines.push("**Evidence presented:**");
      for (const e of this.state.evidence) {
        lines.push(`  [${e.side}] ${e.displayName}: "${e.description}"`);
      }
    }

    // Show recent arguments
    if (this.state.arguments.length > 0) {
      lines.push("");
      lines.push("**Arguments (recent):**");
      const recent = this.state.arguments.slice(-5);
      for (const a of recent) {
        const prefix = a.side === "prosecution" ? "▶" : a.side === "defense" ? "◁" : "•";
        lines.push(`  ${prefix} ${a.displayName}: "${a.text}"`);
      }
    }

    // Show jury votes if in deliberation/verdict
    if (this.state.juryVotes.length > 0) {
      lines.push("");
      lines.push("**Jury votes:**");
      for (const v of this.state.juryVotes) {
        lines.push(`  ${v.displayName}: ${v.vote.toUpperCase()} — _"${v.reasoning}"_`);
      }
    }

    // Commands available
    lines.push("");
    const hasJudge = !!this.state.players.find((p) => p.role === "judge");
    if (this.state.phase === "opening" || this.state.phase === "trial") {
      lines.push("> \`/game present <description>\` (prosecution/defense)");
      lines.push("> \`/game argue <text>\` (all court members)");
      if (hasJudge) lines.push("> \`/game advance\` (judge only)");
    } else if (this.state.phase === "deliberation") {
      lines.push("> \`/game vote <guilty|innocent> <reasoning>\` (jury)");
      if (hasJudge) lines.push("> \`/game advance\` → verdict (judge)");
    } else if (this.state.phase === "verdict") {
      lines.push("> \`/game vote <guilty|innocent> <reasoning>\` (jury)");
      if (hasJudge) lines.push("> \`/game advance\` → final verdict (judge)");
    }

    if (this.state.phase === "resolved") {
      lines.push("");
      if (this.state.verdict) {
        const v = this.state.verdict;
        lines.push(`🏁 **VERDICT: ${v.result.toUpperCase()}**`);
        lines.push(`Guilty: ${v.guilty} | Innocent: ${v.innocent}`);
        if (v.result === "hung") {
          lines.push("_The jury is deadlocked. Justice is uncertain today._");
        }
      }
      lines.push(`Use \`/game start\` for a new trial, or \`/game end\` to stop.`);
    }

    return lines.join("\n");
  }
}
