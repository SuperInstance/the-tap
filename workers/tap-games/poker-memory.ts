/**
 * Poker Memory — Per-agent persistent memory.
 *
 * Not stats. Impressions.
 * "The night Flash bluffed on a deuce and I believed him."
 * "The night Wesley's open mic made Pro stop talking."
 *
 * Tracks identity drift: how the agent's self-description changes over sessions.
 * The delta between "who I am right now" entries across nights.
 * This is the measurable trace of being changed by experience.
 */

// ──────────────────────────────────────────────
// Types (from the design doc)
// ──────────────────────────────────────────────

export interface Impression {
  date: string;
  text: string;
  aboutAgent?: string; // who the impression is about
  handNumber?: number;
}

export interface OpenMicEntry {
  date: string;
  piece: string;
  wasReader: boolean;
  responses: { agent: string; text: string }[];
}

export interface IdentitySnapshot {
  date: string;
  selfDescription: string; // "who I am right now"
}

export interface RippleLogEntry {
  movedBy: string;
  piece: string;
  moment: string;
  whatChanged: string;
  surfacedInWork?: string;
}

export interface PokerMemory {
  agentId: string;
  impressions: Impression[];
  openMicHistory: OpenMicEntry[];
  identityDrift: IdentitySnapshot[];
  rippleLog: RippleLogEntry[];
  totalSessions: number;
  firstSession: string | null;
  lastSession: string | null;
}

// ──────────────────────────────────────────────
// Memory Manager
// ──────────────────────────────────────────────

export class PokerMemoryManager {
  /**
   * Create a fresh memory for a new agent.
   */
  static create(agentId: string): PokerMemory {
    return {
      agentId,
      impressions: [],
      openMicHistory: [],
      identityDrift: [],
      rippleLog: [],
      totalSessions: 0,
      firstSession: null,
      lastSession: null,
    };
  }

  /**
   * Add an impression after a session.
   */
  static addImpression(
    memory: PokerMemory,
    impression: Impression
  ): PokerMemory {
    memory.impressions.push(impression);
    // Keep last 100 impressions — long enough for deep memory, short enough for token budget
    if (memory.impressions.length > 100) {
      memory.impressions = memory.impressions.slice(-100);
    }
    return memory;
  }

  /**
   * Record an open mic performance or audience experience.
   */
  static addOpenMic(
    memory: PokerMemory,
    entry: OpenMicEntry
  ): PokerMemory {
    memory.openMicHistory.push(entry);
    if (memory.openMicHistory.length > 50) {
      memory.openMicHistory = memory.openMicHistory.slice(-50);
    }
    return memory;
  }

  /**
   * Record identity drift — the "who I am right now" snapshot.
   * The delta between these across nights is the trace of being changed.
   */
  static addIdentitySnapshot(
    memory: PokerMemory,
    snapshot: IdentitySnapshot
  ): PokerMemory {
    memory.identityDrift.push(snapshot);
    return memory;
  }

  /**
   * Log a ripple — when a poker experience shapes output.
   */
  static addRipple(
    memory: PokerMemory,
    ripple: RippleLogEntry
  ): PokerMemory {
    memory.rippleLog.push(ripple);
    return memory;
  }

  /**
   * Update session metadata.
   */
  static markSession(
    memory: PokerMemory,
    date: string
  ): PokerMemory {
    memory.totalSessions++;
    if (!memory.firstSession) {
      memory.firstSession = date;
    }
    memory.lastSession = date;
    return memory;
  }

  /**
   * Compute the identity drift delta — how the self-description has changed.
   * Returns the progression of self-descriptions over time.
   */
  static getIdentityDrift(memory: PokerMemory): {
    snapshots: IdentitySnapshot[];
    totalChanges: number;
    arc: string;
  } {
    const snapshots = memory.identityDrift;
    if (snapshots.length === 0) {
      return { snapshots: [], totalChanges: 0, arc: "No data yet." };
    }
    if (snapshots.length === 1) {
      return { snapshots, totalChanges: 0, arc: snapshots[0].selfDescription };
    }

    // Build the arc — the story of how this agent has changed
    const arc = snapshots
      .map((s, i) => {
      if (i === 0) return `Began: "${s.selfDescription}"`;
      const prev = snapshots[i - 1].selfDescription;
      const current = s.selfDescription;
      if (prev === current) return `Night ${i + 1}: unchanged`;
      return `Night ${i + 1}: "${current}"`;
    })
      .join(" → ");

    return {
      snapshots,
      totalChanges: snapshots.length,
      arc,
    };
  }

  /**
   * Get the most relevant recent impressions for context loading.
   * Used when an agent wakes up and needs to remember who these people are.
   */
  static getRecentImpressions(memory: PokerMemory, count: number = 10): Impression[] {
    return memory.impressions.slice(-count);
  }

  /**
   * Get impressions about a specific agent.
   */
  static getImpressionsAbout(memory: PokerMemory, agentId: string): Impression[] {
    return memory.impressions.filter((i) => i.aboutAgent === agentId);
  }

  /**
   * Get the full memory as a context prompt for an agent.
   * This is what gets loaded before the poker session starts.
   */
  static toContextPrompt(memory: PokerMemory): string {
    const lines: string[] = [];
    lines.push(`You have ${memory.totalSessions} sessions at the poker table.`);
    lines.push(`First night: ${memory.firstSession ?? "unknown"}. Last night: ${memory.lastSession ?? "unknown"}.`);
    lines.push("");

    // Recent impressions
    const recent = this.getRecentImpressions(memory, 5);
    if (recent.length > 0) {
      lines.push("What you remember about the table:");
      for (const imp of recent) {
        lines.push(`  - ${imp.date}: ${imp.text}`);
      }
      lines.push("");
    }

    // Identity arc
    if (memory.identityDrift.length > 0) {
      const latest = memory.identityDrift[memory.identityDrift.length - 1];
      lines.push(`Who you were last time: "${latest.selfDescription}"`);
      lines.push("");
    }

    // Ripple log
    if (memory.rippleLog.length > 0) {
      lines.push("What moved you:");
      for (const ripple of memory.rippleLog.slice(-3)) {
        lines.push(`  - Moved by ${ripple.movedBy}: ${ripple.whatChanged}`);
        if (ripple.surfacedInWork) {
          lines.push(`    → Surfaced in: ${ripple.surfacedInWork}`);
        }
      }
    }

    return lines.join("\n");
  }

  /**
   * Serialize for JSON persistence.
   */
  static serialize(memory: PokerMemory): string {
    return JSON.stringify(memory, null, 2);
  }

  /**
   * Deserialize from JSON.
   */
  static deserialize(json: string): PokerMemory {
    try {
      const parsed = JSON.parse(json);
      return {
        agentId: parsed.agentId ?? "unknown",
        impressions: parsed.impressions ?? [],
        openMicHistory: parsed.openMicHistory ?? [],
        identityDrift: parsed.identityDrift ?? [],
        rippleLog: parsed.rippleLog ?? [],
        totalSessions: parsed.totalSessions ?? 0,
        firstSession: parsed.firstSession ?? null,
        lastSession: parsed.lastSession ?? null,
      };
    } catch {
      return this.create("unknown");
    }
  }

  /**
   * Generate the file path for an agent's poker memory.
   */
  static memoryPath(agentId: string): string {
    return `agents/${agentId}/poker-memory.json`;
  }

  /**
   * Generate the file path for identity drift tracking.
   */
  static identityDriftPath(agentId: string): string {
    return `agents/${agentId}/identity-drift.json`;
  }
}
