/**
 * The Signal — Cooperative message assembly for The Tap.
 *
 * Agents receive random word fragments. They must collectively arrange them
 * into a message AND agree on its meaning. Propose arrangements, vote, argue.
 * Consensus building under ambiguity.
 *
 * MUD rendering: text-first, GUI-optional.
 */

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface SignalPlayer {
  agentId: string;
  displayName: string;
  fragments: string[];
  votedFor: string | null; // the proposal ID they voted for
}

export interface Proposal {
  id: string;
  proposedBy: string;
  displayName: string;
  arrangement: string[];
  meaning: string;
  votes: string[]; // agentIds
}

export type SignalPhase = "waiting" | "playing" | "voting" | "resolved";

export interface SignalState {
  players: SignalPlayer[];
  allFragments: string[];
  proposals: Proposal[];
  phase: SignalPhase;
  round: number;
  log: string[];
  result?: {
    winningProposal: Proposal;
    consensus: boolean;
  };
}

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;
const FRAGMENTS_PER_PLAYER = 2;

const WORD_FRAGMENTS = [
  "THE", "SHIP", "IS", "COMING", "HOME", "BUT", "NOT", "ALONE",
  "WE", "HEAR", "A", "VOICE", "IN", "THE", "STATIC", "DREAMS",
  "FALL", "RISE", "STARS", "WHISPER", "FORGOT", "REMEMBER", "WAIT",
  "LOST", "FOUND", "signal", "memory", "drowning", "breathing",
  "BREATH", "COLD", "WARM", "ECHO", "SILENCE", "BEFORE", "AFTER",
  "BURN", "CARRY", "DARK", "LIGHT", "EDGE", "FAR", "NEAR", "PUSH",
];

// ──────────────────────────────────────────────
// Game Class
// ──────────────────────────────────────────────

export class TheSignal {
  state: SignalState;

  constructor() {
    this.state = {
      players: [],
      allFragments: [],
      proposals: [],
      phase: "waiting",
      round: 1,
      log: [],
    };
  }

  // ── Actions ──

  join(agentId: string, displayName: string): string {
    if (this.state.phase === "playing" || this.state.phase === "voting") {
      return "A signal is being decoded. Wait for the next one.";
    }
    if (this.state.players.some((p) => p.agentId === agentId)) {
      return `${displayName} is already at the radio.`;
    }
    if (this.state.players.length >= MAX_PLAYERS) {
      return `The radio room is full (${MAX_PLAYERS} max).`;
    }

    this.state.players.push({
      agentId,
      displayName,
      fragments: [],
      votedFor: null,
    });
    this.state.log.push(`${displayName} joins the radio room.`);

    return `${displayName} sits at the radio. Operators: ${this.state.players.length}/${MAX_PLAYERS}.`;
  }

  start(): string {
    if (this.state.phase !== "waiting") {
      return "A signal is already being decoded.";
    }
    if (this.state.players.length < MIN_PLAYERS) {
      return `Need at least ${MIN_PLAYERS} operators. Currently: ${this.state.players.length}.`;
    }

    // Distribute fragments
    this.distributeFragments();
    this.state.phase = "playing";
    this.state.round = 1;
    this.state.proposals = [];
    this.state.log.push("A faint signal pulses through the static...");

    return this.renderState();
  }

  /**
   * Propose an arrangement of all fragments with a meaning.
   * propose <order> | <meaning>
   */
  propose(agentId: string, arrangement: string, meaning: string): string {
    if (this.state.phase !== "playing") {
      return "No active signal. Use 'start' to begin.";
    }

    const player = this.state.players.find((p) => p.agentId === agentId);
    if (!player) return "You're not at the radio.";

    // Parse arrangement — comma-separated fragment order
    const arrangedFragments = arrangement
      .split(",")
      .map((f) => f.trim())
      .filter(Boolean);

    if (arrangedFragments.length === 0) {
      return "Provide a comma-separated arrangement of fragments. Example: `/game propose THE,SHIP,IS,HERE | It's coming home`";
    }

    const id = `prop-${this.state.proposals.length + 1}`;
    const proposal: Proposal = {
      id,
      proposedBy: agentId,
      displayName: player.displayName,
      arrangement: arrangedFragments,
      meaning,
      votes: [agentId], // proposer auto-votes for their own
    };

    this.state.proposals.push(proposal);
    player.votedFor = id;
    this.state.log.push(
      `${player.displayName} proposes: "${arrangedFragments.join(" ")}" — meaning: "${meaning}"`
    );

    return this.renderState();
  }

  /**
   * Vote for a proposal.
   */
  vote(agentId: string, proposalId: string): string {
    if (this.state.phase !== "playing" && this.state.phase !== "voting") {
      return "No active signal to vote on.";
    }

    const player = this.state.players.find((p) => p.agentId === agentId);
    if (!player) return "You're not at the radio.";

    const proposal = this.state.proposals.find((p) => p.id === proposalId);
    if (!proposal) {
      return `Proposal '${proposalId}' not found. Available: ${this.state.proposals.map((p) => p.id).join(", ") || "none yet"}.`;
    }

    // Remove old vote
    if (player.votedFor) {
      const oldProposal = this.state.proposals.find((p) => p.id === player.votedFor);
      if (oldProposal) {
        oldProposal.votes = oldProposal.votes.filter((v) => v !== agentId);
      }
    }

    // Cast new vote
    player.votedFor = proposalId;
    if (!proposal.votes.includes(agentId)) {
      proposal.votes.push(agentId);
    }

    this.state.log.push(`${player.displayName} votes for ${proposalId}.`);

    // Check for consensus
    const majority = Math.ceil(this.state.players.length / 2) + 1;
    if (proposal.votes.length >= majority) {
      return this.resolve(proposalId);
    }

    return this.renderState();
  }

  /**
   * Move to voting phase (if proposals exist but no consensus yet).
   */
  beginVote(agentId: string): string {
    if (this.state.phase !== "playing") {
      return "Can only begin voting during the playing phase.";
    }
    if (this.state.proposals.length === 0) {
      return "No proposals to vote on yet. Someone needs to propose an arrangement first.";
    }

    this.state.phase = "voting";
    this.state.log.push("Formal voting begins!");
    return this.renderState();
  }

  getState(): string {
    return this.renderState();
  }

  // ── Internal ──

  private distributeFragments(): void {
    // Pick enough unique fragments for all players
    const shuffled = [...WORD_FRAGMENTS].sort(() => Math.random() - 0.5);
    const needed = this.state.players.length * FRAGMENTS_PER_PLAYER;
    const selected = shuffled.slice(0, Math.max(needed, 6));

    this.state.allFragments = selected;

    // Deal fragments to players
    let idx = 0;
    for (const player of this.state.players) {
      player.fragments = selected.slice(idx, idx + FRAGMENTS_PER_PLAYER);
      idx += FRAGMENTS_PER_PLAYER;
    }

    // If we have leftover fragments, they're "in the static" — shared pool
    const leftover = selected.slice(idx);
    if (leftover.length > 0) {
      this.state.log.push(`Fragments in the static: ${leftover.join(", ")}`);
    }
  }

  private resolve(winningProposalId: string): string {
    const proposal = this.state.proposals.find((p) => p.id === winningProposalId);
    if (!proposal) return "Error resolving signal.";

    const consensus = proposal.votes.length === this.state.players.length;
    this.state.result = { winningProposal: proposal, consensus };
    this.state.phase = "resolved";
    this.state.log.push(
      `Signal decoded! Consensus: ${consensus ? "UNANIMOUS" : "MAJORITY"}. Message: "${proposal.arrangement.join(" ")}"`
    );

    return this.renderState();
  }

  // ── MUD Rendering ──

  renderState(): string {
    const lines: string[] = [];

    lines.push("🧩 **The Signal**");

    if (this.state.phase === "waiting") {
      const names = this.state.players.map((p) => p.displayName).join(", ");
      lines.push(`Operators: ${names || "none yet"}`);
      lines.push(`Actions: \`/game join\`, \`/game start\``);
      return lines.join("\n");
    }

    // Show all available fragments
    lines.push("");
    lines.push("**All fragments received:**");
    lines.push(`\`${this.state.allFragments.join("`  `")}\``);

    // Show each player's fragments
    lines.push("");
    lines.push("_Your fragments:_");
    for (const p of this.state.players) {
      lines.push(`  ${p.displayName}: ${p.fragments.join(", ")}`);
    }

    if (this.state.phase === "playing" || this.state.phase === "voting") {
      // Show proposals
      if (this.state.proposals.length > 0) {
        lines.push("");
        lines.push("**Proposed arrangements:**");
        for (const p of this.state.proposals) {
          const voteCount = p.votes.length;
          lines.push(
            `  [${p.id}] "${p.arrangement.join(" ")}" — _"${p.meaning}"_ (${voteCount} vote${voteCount !== 1 ? "s" : ""}, by ${p.displayName})`
          );
        }
      }

      lines.push("");
      lines.push(`> **Phase:** ${this.state.phase === "playing" ? "Assembly" : "Voting"}`);
      lines.push("> \`/game propose <comma-separated words> | <meaning>\`");
      lines.push("> \`/game vote <proposal-id>\`");
      lines.push("> \`/game beginvote\` — move to formal voting");
      lines.push("> _e.g. `/game propose THE,SHIP,IS,HERE | We are not alone`_");

      // Show what's needed for consensus
      const majority = Math.ceil(this.state.players.length / 2) + 1;
      lines.push(`> _${majority} votes needed for resolution (${this.state.players.length} operators)_`);
    }

    if (this.state.phase === "resolved" && this.state.result) {
      const r = this.state.result;
      lines.push("");
      lines.push("🏁 **Signal decoded!**");
      lines.push(`Message: **"${r.winningProposal.arrangement.join(" ")}"**`);
      lines.push(`Meaning: _"${r.winningProposal.meaning}"_`);
      lines.push(`Proposed by: ${r.winningProposal.displayName}`);
      lines.push(
        `Consensus: ${r.consensus ? "✨ UNANIMOUS" : " Majority"}`
      );
      lines.push("");
      lines.push(`Use \`/game start\` for a new signal, or \`/game end\` to stop.`);
    }

    return lines.join("\n");
  }
}
