import type { Ai } from "@cloudflare/workers-types";

/**
 * embeddings — the ONE correct Workers AI embedding pattern.
 *
 * Landmine fix (was: `env.AI.embed(model, { text })` — not a real Workers AI
 * API; would TypeError at runtime on first call). The documented pattern is
 * `AI.run("@cf/baai/bge-small-en-v1.5", { text })`, which returns
 * `{ shape, data: number[][] }` — one 384-dim vector per input text.
 *
 * Never throws: returns null on any failure so callers can degrade
 * (skip vectorize write, ESCALATE the reflex decision, etc.).
 */

export const BGE_SMALL_MODEL = "@cf/baai/bge-small-en-v1.5";

export async function embedText(ai: Ai, text: string): Promise<number[] | null> {
  try {
    const result = await ai.run(BGE_SMALL_MODEL, { text });
    // Output type is a union incl. an async-response variant — read defensively.
    const vector = (result as { data?: number[][] }).data?.[0];
    if (!Array.isArray(vector) || vector.length === 0) return null;
    return vector;
  } catch {
    return null;
  }
}
