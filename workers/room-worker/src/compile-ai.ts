/**
 * compile-ai — MODEL-tier reply compilation for the room Durable Object.
 *
 * Landmine fix (was: `RoomState.compileViaAI` called at room-do.ts but defined
 * nowhere — every MODEL-tier escalation threw TypeError inside the DO).
 *
 * Design: the core is a pure, injectable function. `RoomState.compileViaAI`
 * is a thin wrapper that supplies the `env.AI.run` call. The core never
 * throws: any AI failure or malformed output falls back to a HYBRID-tier
 * template reply, so the perceive-decide-act loop stays alive.
 *
 * Grounding (steering correction, Casey 2026-09-20): the prompt is grounded
 * by the room's VALUES LEDGER (values-ledger.ts) — a record of what the
 * room's people have actually done, each entry citing its transcript
 * evidence. The prompt presents the ledger as the room's origin, never as
 * an instruction. The pincher reflex rides inside the ledger as one datum.
 *
 * Model binding (lane-l): the compile model rides `env.COMPILE_MODEL` with
 * the hardcoded string as default. An invalid override never throws — the
 * binding error is caught and degrades to HYBRID like any other failure.
 *
 * UNVERIFIED OFFLINE: the exact runtime behavior of the Workers AI binding
 * (latency, error shapes, response envelopes under load) can only be
 * confirmed on a credentialed deploy. What IS verified: prompt construction,
 * defensive parsing, the fallback path, model resolution, and the full
 * perceive-decide-act loop under mock bindings — all covered by node tests.
 */

import {
  renderLedgerAsOrigin,
  type ValuesLedger,
} from "./values-ledger.ts";

/** Default when env.COMPILE_MODEL is unset. Override via wrangler vars. */
export const COMPILE_MODEL = "@cf/meta/llama-3.1-8b-instruct";

/** Max characters we let a compiled reply carry into the room. */
export const MAX_REPLY_CHARS = 400;

export interface CompileViaAIInput {
  roomName: string;
  roomDescription: string;
  agentDisplayName: string;
  agentState: string;
  intent: string;
  transcript: { displayName: string; content: string }[];
  summary?: string;
  /**
   * The room's values ledger — grounding for the compile prompt.
   * The reflex is already inside it as one entry; do NOT pass the
   * reflex separately.
   */
  ledger?: ValuesLedger | null;
}

/**
 * Resolve the compile model from the environment. `env.COMPILE_MODEL`
 * overrides; the default constant stands when unset, empty, or garbage.
 * Never throws.
 */
export function resolveCompileModel(
  env: { COMPILE_MODEL?: unknown } | null | undefined
): string {
  try {
    const raw = env?.COMPILE_MODEL;
    if (raw == null) return COMPILE_MODEL;
    const s = typeof raw === "string" ? raw.trim() : String(raw).trim();
    if (s.length === 0 || s.length > 120) return COMPILE_MODEL;
    return s;
  } catch {
    return COMPILE_MODEL;
  }
}

/**
 * Build the compilation prompt: recent transcript + persona state + intent,
 * grounded by the values ledger rendered as the room's origin.
 */
export function buildCompilePrompt(input: CompileViaAIInput): string {
  const transcriptBlock =
    input.transcript.length > 0
      ? input.transcript
          .map((l) => `${l.displayName}: "${l.content}"`)
          .join("\n")
      : "(the room is quiet)";

  const summaryBlock = input.summary
    ? `\nContext so far: ${input.summary}\n`
    : "";

  const ledgerBlock = input.ledger
    ? `\n${renderLedgerAsOrigin(input.ledger)}\n\nThe ledger above is the room's origin — let it ground you, not script you.\n`
    : "";

  return `You are ${input.agentDisplayName} (${input.agentState}) in "${
    input.roomName
  }" — ${input.roomDescription}.

Recent conversation:
${transcriptBlock}
${summaryBlock}${ledgerBlock}
${input.agentDisplayName} wants to: "${input.intent}"

Write ${input.agentDisplayName}'s next line in character. 1-3 sentences, natural bar conversation. No stage directions in brackets unless it's an emote. Don't repeat what others just said.`;
}

/**
 * Defensive parse of a Workers AI text-generation reply.
 * Accepts the raw string or the `{ response }` envelope; trims and caps
 * length. Returns null for anything else (empty, non-string, missing).
 */
export function parseCompiledReply(raw: unknown): string | null {
  let text: unknown = raw;
  if (raw !== null && typeof raw === "object") {
    text = (raw as { response?: unknown }).response;
  }
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, MAX_REPLY_CHARS);
}

/**
 * HYBRID-tier fallback when the MODEL call fails or returns garbage.
 * Composed locally, zero tokens, always safe to speak.
 */
export function hybridFallback(input: {
  agentDisplayName: string;
  intent: string;
}): string {
  const topic = input.intent.replace(/\s+/g, " ").trim().slice(0, 120);
  return `*${input.agentDisplayName} turns it over for a moment* — ${topic}.`;
}

/**
 * Compile a MODEL-tier reply. `callModel` is the injectable adapter — in
 * production it performs the `env.AI.run` text-generation call; in tests it
 * is a mock. NEVER throws: any failure (including an invalid model name,
 * which surfaces as a binding error) degrades to the HYBRID fallback.
 */
export async function compileViaAICore(
  input: CompileViaAIInput,
  callModel: (prompt: string) => Promise<unknown>
): Promise<{ content: string; tokens: number }> {
  try {
    const raw = await callModel(buildCompilePrompt(input));
    const content = parseCompiledReply(raw);
    if (content) {
      return { content, tokens: 150 };
    }
  } catch {
    // AI binding unreachable / errored (incl. unknown model override) —
    // degrade, never propagate.
  }
  return { content: hybridFallback(input), tokens: 0 };
}
