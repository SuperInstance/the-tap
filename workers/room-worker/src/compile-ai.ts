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
 * UNVERIFIED OFFLINE: the exact runtime behavior of the Workers AI binding
 * (latency, error shapes, response envelopes under load) can only be
 * confirmed on a credentialed deploy. What IS verified: prompt construction,
 * defensive parsing, and the fallback path — all covered by node tests.
 */

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
  reflexAction?: string;
  reflexScore?: number;
}

/**
 * Build the compilation prompt: recent transcript + persona state + intent,
 * plus the pincher's best reflex match as a style hint when it has one.
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

  const reflexBlock =
    input.reflexAction && (input.reflexScore ?? 0) > 0
      ? `\nA similar past moment went like this (style hint, do not copy): "${input.reflexAction}"\n`
      : "";

  return `You are ${input.agentDisplayName} (${input.agentState}) in "${
    input.roomName
  }" — ${input.roomDescription}.

Recent conversation:
${transcriptBlock}
${summaryBlock}${reflexBlock}
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
 * is a mock. NEVER throws: any failure degrades to the HYBRID fallback.
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
    // AI binding unreachable / errored — degrade, never propagate.
  }
  return { content: hybridFallback(input), tokens: 0 };
}
