/**
 * values-ledger — the room's constitution.
 *
 * Casey's doctrine: "There's more to the syntax than choice. Styles have
 * origins with subtexts and values." A hint string is costume; a ledger
 * is a constitution. Style is genealogical, not parametric — it is read
 * off the record of what actually happened in this room, never invented.
 *
 * Design:
 *  - PURE, injectable extractor. No Cloudflare bindings, no I/O. Inputs
 *    are plain data: the transcript (last N turns), the room summary,
 *    WAL-derived facts, and reflex events (the pincher firing).
 *  - GROUNDED. Every ledger entry cites its evidence: the actual
 *    transcript line, refusal, commitment, pour, or reflex it comes from.
 *    An entry without verifiable evidence is a bug — see
 *    verifyLedgerAgainstSources() and the no-invention fuzz test.
 *  - MONOTONIC. Values accrete, they don't flicker. A previous ledger is
 *    merged in; entries only gain evidence and strength, never disappear
 *    except by cap eviction (and eviction is reported, not silent).
 *  - NEVER THROWS. A dead WAL or a malformed fact degrades to a
 *    transcript-only ledger. Extraction failing entirely returns the
 *    previous ledger unchanged — the constitution persists even when
 *    the clerk is sick.
 *
 * The pincher reflex, when it fires, becomes ONE entry in the ledger —
 * demoted from costume (a style hint) to datum (a fact about this room).
 */

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

/** Minimal transcript line shape — matches intelligence.ts ConversationLine. */
export interface TranscriptLine {
  displayName: string;
  content: string;
  timestamp?: number;
}

/**
 * A fact derived from the room's write-ahead log (or any external record).
 * `transcriptRef` optionally pins the fact to a transcript index so the
 * ledger can cite both the fact and the line it came from.
 */
export interface WalFact {
  id: string;
  kind: string;
  text: string;
  transcriptRef?: number;
}

/** A pincher reflex firing — the moment instinct became part of the record. */
export interface ReflexEvent {
  /** The action string the pincher returned (what was actually done). */
  action: string;
  /** Transcript index of the line that triggered the reflex, if known. */
  triggerLineIndex?: number;
  /** Turn index at which the reflex fired. */
  atTurn: number;
}

export type EvidenceSource = "transcript" | "wal" | "reflex";

export interface LedgerEvidence {
  source: EvidenceSource;
  /** transcript: index into the transcript array; wal: WalFact.id; reflex: action string. */
  ref: string;
  /** The exact text — must match the cited source verbatim. */
  quote: string;
}

export interface LedgerEntry {
  /** Stable id for monotonic merge: "{kind}:{speakerKey}:{topicKey}". */
  id: string;
  /** The grounded value statement, e.g. "refuses to name the drowned ship". */
  value: string;
  /** Every piece of evidence this entry rests on. Never empty. */
  evidence: LedgerEvidence[];
  /** Turn index of first observation. */
  firstSeenTurn: number;
  /** Turn index of most recent observation. */
  lastSeenTurn: number;
  /** 0..1 — accretes with repeated evidence, never decreases on merge. */
  strength: number;
}

export interface ValuesLedger {
  entries: LedgerEntry[];
  /** True when cap eviction dropped entries — the ledger is lossy by force. */
  truncated: boolean;
}

export interface ExtractLedgerInput {
  /** The transcript to mine — pass the last N turns. */
  transcript: TranscriptLine[];
  /** Current turn index (monotonic clock of the room). Defaults to transcript length. */
  turn?: number;
  /** Rolling room summary — consulted, never invented from. */
  summary?: string;
  /** WAL-derived facts. Dead/missing WAL → transcript-only ledger. */
  walFacts?: WalFact[];
  /** Pincher reflex firings to record as data. */
  reflexEvents?: ReflexEvent[];
  /** Previous ledger for monotonic accretion. Omit → fresh ledger. */
  previous?: ValuesLedger;
  /** Max entries before eviction. Default 12. */
  maxEntries?: number;
}

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

export const DEFAULT_MAX_LEDGER_ENTRIES = 12;

const REFUSAL_RE =
  /\b(won't|will not|can't|cannot|refuse|not saying|won't say|can't say|never|i'd rather not|i would rather not|none of your business|that's my own|stay out of)\b/i;

const COMMITMENT_RE =
  /\b(i will|i'll|i promise|count on me|you have my word|my word on it|from now on|next time (i|i'll)|mark my words|so help me)\b/i;

const POUR_RE =
  /\b(pour\w*|refill\w*|top\w* off|slide\w* (a|the|another|one more)|set\w* down (a|the|another)|bring\w* (a|the|another)|draw\w* (a|the|another))\b.{0,40}\b(glass|mug|drink|beer|ale|whiskey|rum|wine|cup|bottle|round)\b/i;

/** Words too common to count as a topic. */
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "if", "then", "else", "when",
  "at", "by", "for", "with", "about", "into", "through", "during",
  "before", "after", "above", "below", "to", "from", "up", "down",
  "in", "out", "on", "off", "over", "under", "again", "further", "then",
  "once", "here", "there", "all", "any", "both", "each", "few", "more",
  "most", "other", "some", "such", "no", "nor", "not", "only", "own",
  "same", "so", "than", "too", "very", "can", "will", "just", "should",
  "now", "i", "you", "he", "she", "it", "we", "they", "me", "him", "her",
  "us", "them", "my", "your", "his", "their", "our", "this", "that",
  "these", "those", "am", "is", "are", "was", "were", "be", "been",
  "being", "have", "has", "had", "having", "do", "does", "did", "doing",
  "of", "it", "its", "don't", "won't", "can't", "i'm", "it's",
]);

// ──────────────────────────────────────────────
// Pure helpers
// ──────────────────────────────────────────────

function topicKey(text: string): string {
  const words = text
    .toLowerCase()
    .replace(/[*_"]/g, " ")
    .split(/[^a-z0-9']+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  if (words.length === 0) return "silence";
  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
  const top = [...freq.entries()].sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : "silence";
}

function speakerKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";
}

function mkEvidence(
  source: EvidenceSource,
  ref: string,
  quote: string
): LedgerEvidence {
  return { source, ref, quote };
}

function pushEvidence(
  entry: LedgerEntry,
  ev: LedgerEvidence,
  turn: number
): void {
  // Dedupe by (source, ref) — the same line cited twice is one citation.
  if (!entry.evidence.some((e) => e.source === ev.source && e.ref === ev.ref)) {
    entry.evidence.push(ev);
    entry.strength = Math.min(1, entry.strength + 0.15);
  }
  entry.lastSeenTurn = Math.max(entry.lastSeenTurn, turn);
}

// ──────────────────────────────────────────────
// Detectors — each returns candidate entries grounded in real lines
// ──────────────────────────────────────────────

type Candidate = Omit<LedgerEntry, "firstSeenTurn" | "lastSeenTurn">;

function addCandidateEvidence(
  byKey: Map<string, Candidate>,
  id: string,
  value: string,
  ev: LedgerEvidence
): void {
  const existing = byKey.get(id);
  if (existing) {
    if (!existing.evidence.some((e) => e.source === ev.source && e.ref === ev.ref)) {
      existing.evidence.push(ev);
      existing.strength = Math.min(1, existing.strength + 0.15);
    }
  } else {
    byKey.set(id, { id, value, evidence: [ev], strength: 0.5 });
  }
}

function detectRefusals(
  transcript: TranscriptLine[],
  _turn: number
): Candidate[] {
  const byKey = new Map<string, Candidate>();
  transcript.forEach((line, i) => {
    if (!REFUSAL_RE.test(line.content)) return;
    const tk = topicKey(line.content);
    addCandidateEvidence(
      byKey,
      `refusal:${speakerKey(line.displayName)}:${tk}`,
      `refuses to speak of ${tk}`,
      mkEvidence("transcript", String(i), line.content)
    );
  });
  return [...byKey.values()];
}

function detectCommitments(
  transcript: TranscriptLine[],
  _turn: number
): Candidate[] {
  const byKey = new Map<string, Candidate>();
  transcript.forEach((line, i) => {
    if (!COMMITMENT_RE.test(line.content)) return;
    const tk = topicKey(line.content);
    addCandidateEvidence(
      byKey,
      `commitment:${speakerKey(line.displayName)}:${tk}`,
      `gave their word on ${tk}`,
      mkEvidence("transcript", String(i), line.content)
    );
  });
  return [...byKey.values()];
}

function detectPours(transcript: TranscriptLine[], _turn: number): Candidate[] {
  const byKey = new Map<string, Candidate>();
  transcript.forEach((line, i) => {
    if (!POUR_RE.test(line.content)) return;
    addCandidateEvidence(
      byKey,
      `pour:${speakerKey(line.displayName)}`,
      "pours before being asked",
      mkEvidence("transcript", String(i), line.content)
    );
  });
  return [...byKey.values()];
}

function detectRecurringTopics(
  transcript: TranscriptLine[]
): Candidate[] {
  // A content word carried by ≥3 lines across the room → the room
  // "keeps returning to" that topic. Grounded in every carrying line.
  const freq = new Map<string, number[]>();
  transcript.forEach((line, i) => {
    for (const w of new Set(
      line.content
        .toLowerCase()
        .replace(/[*_"]/g, " ")
        .split(/[^a-z0-9']+/)
        .filter((w2) => w2.length > 2 && !STOPWORDS.has(w2))
    )) {
      if (!freq.has(w)) freq.set(w, []);
      freq.get(w)!.push(i);
    }
  });

  const candidates: Candidate[] = [];
  for (const [word, lineIdxs] of freq) {
    if (lineIdxs.length < 3) continue;
    const id = `returns:room:${word}`;
    candidates.push({
      id,
      value: `keeps returning to ${word}`,
      evidence: lineIdxs.map((i) =>
        mkEvidence("transcript", String(i), transcript[i].content)
      ),
      strength: Math.min(0.9, 0.3 + lineIdxs.length * 0.1),
    });
  }
  return candidates;
}

function reflexCandidates(events: ReflexEvent[], transcript: TranscriptLine[]): Candidate[] {
  // One entry per reflex firing — demoted from costume to datum.
  return events.map((ev, i) => {
    const evidence: LedgerEvidence[] = [
      mkEvidence("reflex", ev.action, ev.action),
    ];
    if (
      typeof ev.triggerLineIndex === "number" &&
      ev.triggerLineIndex >= 0 &&
      ev.triggerLineIndex < transcript.length
    ) {
      evidence.push(
        mkEvidence(
          "transcript",
          String(ev.triggerLineIndex),
          transcript[ev.triggerLineIndex].content
        )
      );
    }
    return {
      id: `reflex:${speakerKey("room")}:${ev.atTurn}:${i}`,
      value: `acts on instinct: ${ev.action.slice(0, 60)}`,
      evidence,
      strength: 0.4,
    };
  });
}

function walCandidates(facts: WalFact[], transcript: TranscriptLine[]): Candidate[] {
  // WAL facts ride in as-is: each becomes an entry citing the fact AND,
  // when the fact pins a transcript line, that line too.
  return facts
    .filter((f) => typeof f.text === "string" && f.text.trim().length > 0)
    .map((f) => {
      const evidence: LedgerEvidence[] = [mkEvidence("wal", f.id, f.text)];
      if (
        typeof f.transcriptRef === "number" &&
        f.transcriptRef >= 0 &&
        f.transcriptRef < transcript.length
      ) {
        evidence.push(
          mkEvidence(
            "transcript",
            String(f.transcriptRef),
            transcript[f.transcriptRef].content
          )
        );
      }
      return {
        id: `wal:${speakerKey(f.kind)}:${topicKey(f.text)}:${f.id.slice(0, 8)}`,
        value: `the record shows: ${f.text.slice(0, 80)}`,
        evidence,
        strength: 0.6,
      };
    });
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

/**
 * Extract (or accrete) the room's values ledger. NEVER throws.
 *
 * Monotonic: pass the previous ledger; entries persist across calls and
 * only gain evidence/strength. A totally dead input yields the previous
 * ledger unchanged; no previous ledger yields an empty one.
 */
export function extractValuesLedger(input: ExtractLedgerInput): ValuesLedger {
  const maxEntries = input.maxEntries ?? DEFAULT_MAX_LEDGER_ENTRIES;
  try {
    const turn = input.turn ?? input.transcript.length;
    const transcript = Array.isArray(input.transcript) ? input.transcript : [];
    const walFacts = Array.isArray(input.walFacts) ? input.walFacts : [];
    const reflexEvents = Array.isArray(input.reflexEvents)
      ? input.reflexEvents
      : [];

    let candidates: Candidate[] = [];
    try {
      candidates = [
        ...detectRefusals(transcript, turn),
        ...detectCommitments(transcript, turn),
        ...detectPours(transcript, turn),
        ...detectRecurringTopics(transcript),
        ...reflexCandidates(reflexEvents, transcript),
        ...walCandidates(walFacts, transcript),
      ];
    } catch {
      // Detector-level failure: partial candidates are still grounded.
    }

    // Defensive: drop any candidate that somehow has empty evidence —
    // an ungrounded entry must never reach the ledger.
    candidates = candidates.filter((c) => c.evidence.length > 0);

    // Merge with previous ledger (monotonic accretion).
    const merged = new Map<string, LedgerEntry>();
    if (input.previous && Array.isArray(input.previous.entries)) {
      for (const old of input.previous.entries) {
        if (old && old.id && Array.isArray(old.evidence) && old.evidence.length > 0) {
          merged.set(old.id, { ...old, evidence: [...old.evidence] });
        }
      }
    }
    for (const c of candidates) {
      const existing = merged.get(c.id);
      if (existing) {
        for (const ev of c.evidence) pushEvidence(existing, ev, turn);
        existing.strength = Math.max(existing.strength, c.strength);
        existing.lastSeenTurn = Math.max(existing.lastSeenTurn, turn);
      } else {
        merged.set(c.id, {
          id: c.id,
          value: c.value,
          evidence: [...c.evidence],
          firstSeenTurn: turn,
          lastSeenTurn: turn,
          strength: c.strength,
        });
      }
    }

    // Sort: strongest first, then oldest first. Cap with reported eviction.
    const all = [...merged.values()].sort(
      (a, b) =>
        b.strength - a.strength || a.firstSeenTurn - b.firstSeenTurn
    );
    const truncated = all.length > maxEntries;
    const entries = all.slice(0, maxEntries);
    return { entries, truncated };
  } catch {
    // Total failure — the constitution persists even when the clerk is sick.
    return input.previous
      ? { entries: [...input.previous.entries], truncated: input.previous.truncated }
      : { entries: [], truncated: false };
  }
}

/**
 * Grounding check: every piece of evidence must be verifiable against the
 * sources it claims. Returns the list of violations (empty = grounded).
 * This is the invariant the no-invention fuzz test hammers.
 */
export function verifyLedgerAgainstSources(
  ledger: ValuesLedger,
  transcript: TranscriptLine[],
  walFacts: WalFact[] = [],
  reflexEvents: ReflexEvent[] = []
): string[] {
  const violations: string[] = [];
  const walById = new Map(walFacts.map((f) => [f.id, f]));
  const reflexActions = new Set(reflexEvents.map((e) => e.action));

  for (const entry of ledger.entries) {
    if (!entry.evidence || entry.evidence.length === 0) {
      violations.push(`${entry.id}: entry has no evidence`);
      continue;
    }
    for (const ev of entry.evidence) {
      if (ev.source === "transcript") {
        const i = Number(ev.ref);
        if (
          !Number.isInteger(i) ||
          i < 0 ||
          i >= transcript.length ||
          transcript[i].content !== ev.quote
        ) {
          violations.push(
            `${entry.id}: transcript evidence ref=${ev.ref} does not match quote`
          );
        }
      } else if (ev.source === "wal") {
        const fact = walById.get(ev.ref);
        if (!fact || fact.text !== ev.quote) {
          violations.push(
            `${entry.id}: wal evidence ref=${ev.ref} does not match quote`
          );
        }
      } else if (ev.source === "reflex") {
        if (!reflexActions.has(ev.ref) || ev.ref !== ev.quote) {
          violations.push(
            `${entry.id}: reflex evidence ref=${ev.ref} does not match quote`
          );
        }
      } else {
        violations.push(`${entry.id}: unknown evidence source ${ev.source}`);
      }
    }
  }
  return violations;
}

/**
 * Render the ledger for a compile prompt — ORIGIN framing, never
 * instruction framing. "What this room is, from its record." The model
 * reads the constitution; it is not told to wear a costume.
 */
export function renderLedgerAsOrigin(ledger: ValuesLedger): string {
  if (!ledger.entries || ledger.entries.length === 0) return "";
  const lines = ledger.entries
    .slice(0, 8)
    .map((e) => {
      const cites = e.evidence
        .slice(0, 3)
        .map((ev) => `"${ev.quote.slice(0, 60)}"`)
        .join("; ");
      return `- ${e.value} (from the record: ${cites})`;
    })
    .join("\n");
  return (
    `This room's record — what it is, from what happened here (origins, not instructions):\n${lines}\n` +
    `Speak from this record. Never announce it, never apologize for it.`
  );
}
