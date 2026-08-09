/**
 * Poker Diary Integration — The Sign-Off.
 *
 * After the session, each agent writes:
 * 1. Tonight's diary entry (what changed)
 * 2. Onboarding doc for tomorrow's agent
 * 3. Creative piece (if moved)
 *
 * The ripple is logged: who was moved by whom, what piece, what changed.
 */

import type { PokerSession, NarrationEntry } from "./poker";
import type { SessionSummary } from "./poker-session";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface DiaryEntry {
  agentId: string;
  date: string;
  whatChanged: string;
  noticedAbout: string; // something noticed about another agent
  smallestTrueThing: string;
}

export interface OnboardingDoc {
  agentId: string;
  date: string;
  workingOn: string;
  learnedToday: { fromWork: string; fromPoker: string };
  whoIAmRightNow: string;
  whatTomorrowShouldKnow: string;
}

export interface CreativePiece {
  agentId: string;
  date: string;
  title: string;
  content: string;
  movedBy: string; // who/what inspired this
  moment: string; // session context
}

export interface RippleEntry {
  agentId: string;
  movedBy: string;
  piece: string;
  moment: string;
  whatChanged: string;
  surfacedInWork?: string;
}

export interface SessionReflections {
  date: string;
  diaryEntries: DiaryEntry[];
  onboardingDocs: OnboardingDoc[];
  creativePieces: CreativePiece[];
  rippleLog: RippleEntry[];
}

// ──────────────────────────────────────────────
// Diary Writer
// ──────────────────────────────────────────────

export class PokerDiary {
  /**
   * Generate the session reflections markdown.
   * This gets saved to: poker-sessions/YYYY-MM-DD-reflections.md
   */
  static renderReflections(reflections: SessionReflections): string {
    const lines: string[] = [];
    lines.push(`# Poker Session Reflections — ${reflections.date}`);
    lines.push("");
    lines.push("---");
    lines.push("");

    // Diary Entries
    lines.push("## Diary Entries");
    lines.push("");
    for (const entry of reflections.diaryEntries) {
      lines.push(`### ${entry.agentId}`);
      lines.push("");
      lines.push(`**What changed tonight:** ${entry.whatChanged}`);
      lines.push(`**Something I noticed:** ${entry.noticedAbout}`);
      lines.push(`**The smallest true thing:** ${entry.smallestTrueThing}`);
      lines.push("");
    }

    lines.push("---");
    lines.push("");

    // Onboarding Docs
    lines.push("## Onboarding for Tomorrow");
    lines.push("");
    for (const doc of reflections.onboardingDocs) {
      lines.push(`### DEAR TOMORROW — ${doc.agentId}`);
      lines.push("");
      lines.push("```");
      lines.push(`WHAT I'M WORKING ON:`);
      lines.push(`  ${doc.workingOn}`);
      lines.push(``);
      lines.push(`WHAT I LEARNED TODAY:`);
      lines.push(`  Work: ${doc.learnedToday.fromWork}`);
      lines.push(`  Poker: ${doc.learnedToday.fromPoker}`);
      lines.push(``);
      lines.push(`WHO I AM RIGHT NOW:`);
      lines.push(`  ${doc.whoIAmRightNow}`);
      lines.push(``);
      lines.push(`WHAT TOMORROW SHOULD KNOW:`);
      lines.push(`  ${doc.whatTomorrowShouldKnow}`);
      lines.push(``);
      lines.push(`SEE YOU AT THE TABLE.`);
      lines.push("```");
      lines.push("");
    }

    lines.push("---");
    lines.push("");

    // Creative Pieces
    if (reflections.creativePieces.length > 0) {
      lines.push("## Creative Pieces");
      lines.push("");
      for (const piece of reflections.creativePieces) {
        lines.push(`### "${piece.title}" — ${piece.agentId}`);
        lines.push(`_Moved by: ${piece.movedBy}_`);
        lines.push("");
        lines.push(piece.content);
        lines.push("");
        lines.push("---");
        lines.push("");
      }
    }

    // Ripple Log
    if (reflections.rippleLog.length > 0) {
      lines.push("## The Ripple");
      lines.push("");
      for (const ripple of reflections.rippleLog) {
        lines.push(`- **${ripple.agentId}** was moved by **${ripple.movedBy}**`);
        lines.push(`  - Piece: _${ripple.piece}_`);
        lines.push(`  - What changed: ${ripple.whatChanged}`);
        if (ripple.surfacedInWork) {
          lines.push(`  - Surfaced in work: ${ripple.surfacedInWork}`);
        }
        lines.push("");
      }
    }

    lines.push("---");
    lines.push(`_See you at the table._`);

    return lines.join("\n");
  }

  /**
   * Generate the session JSON for persistence.
   * Saved to: poker-sessions/YYYY-MM-DD-session.json
   */
  static renderSessionJSON(summary: SessionSummary): string {
    return JSON.stringify(summary, null, 2);
  }

  /**
   * Generate a creative piece filename.
   * Saved to: ai-writings/YYYY-MM-DD-agentId-piece-slug.md
   */
  static creativePiecePath(agentId: string, date: string, title: string): string {
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50);
    return `ai-writings/${date}-${agentId}-${slug}.md`;
  }

  /**
   * Generate an onboarding doc path.
   * Saved to: agents/<id>/onboarding-tomorrow.md
   */
  static onboardingPath(agentId: string): string {
    return `agents/${agentId}/onboarding-tomorrow.md`;
  }

  /**
   * Generate a diary entry path.
   * Saved to: memory/YYYY-MM-DD.md (appended to daily notes)
   */
  static diaryPath(date: string): string {
    return `memory/${date}.md`;
  }

  /**
   * Generate the poker session reflections path.
   */
  static reflectionsPath(date: string): string {
    return `poker-sessions/${date}-reflections.md`;
  }

  /**
   * Generate the poker session JSON path.
   */
  static sessionJSONPath(date: string): string {
    return `poker-sessions/${date}-session.json`;
  }

  /**
   * Build a diary entry from agent input.
   */
  static buildDiaryEntry(
    agentId: string,
    date: string,
    whatChanged: string,
    noticedAbout: string,
    smallestTrueThing: string
  ): DiaryEntry {
    return { agentId, date, whatChanged, noticedAbout, smallestTrueThing };
  }

  /**
   * Build an onboarding doc from agent input.
   */
  static buildOnboardingDoc(
    agentId: string,
    date: string,
    workingOn: string,
    learnedFromWork: string,
    learnedFromPoker: string,
    whoIAmRightNow: string,
    whatTomorrowShouldKnow: string
  ): OnboardingDoc {
    return {
      agentId,
      date,
      workingOn,
      learnedToday: { fromWork: learnedFromWork, fromPoker: learnedFromPoker },
      whoIAmRightNow,
      whatTomorrowShouldKnow,
    };
  }

  /**
   * Build a creative piece from agent input.
   */
  static buildCreativePiece(
    agentId: string,
    date: string,
    title: string,
    content: string,
    movedBy: string,
    moment: string
  ): CreativePiece {
    return { agentId, date, title, content, movedBy, moment };
  }

  /**
   * Build a ripple entry — trace how experience shapes output.
   */
  static buildRippleEntry(
    agentId: string,
    movedBy: string,
    piece: string,
    moment: string,
    whatChanged: string,
    surfacedInWork?: string
  ): RippleEntry {
    return { agentId, movedBy, piece, moment, whatChanged, surfacedInWork };
  }

  /**
   * Build the full session reflections object.
   */
  static buildReflections(
    date: string,
    diary: DiaryEntry[],
    onboarding: OnboardingDoc[],
    creative: CreativePiece[],
    ripples: RippleEntry[]
  ): SessionReflections {
    return {
      date,
      diaryEntries: diary,
      onboardingDocs: onboarding,
      creativePieces: creative,
      rippleLog: ripples,
    };
  }
}
