/**
 * termvector.mjs — 64-slot FNV-1a term vectors (archive substrate).
 *
 * Lineage: the mapping is the same construction candor uses for its term
 * vectors (SuperInstance/candor candor.mjs:176–210, 64-slot FNV-1a hashed
 * term frequencies). The Red Queen design (docs/RED-QUEEN-DESIGN.md §4.2)
 * names this substrate for niche novelty so the measurement and the gate
 * read the same material — no new instrument is smuggled in at the gate.
 *
 * This module is the NEGATIVE-SPACE archive's geometry only. It is not the
 * generator's quality metric and it is not the critic's rubric; both of
 * those must stay value-disjoint from each other (design law 1).
 *
 * Never throws: empty/whitespace input yields the zero vector.
 */

export const TERM_VECTOR_SLOTS = 64;

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** FNV-1a 32-bit hash of a string, returned as an unsigned int. */
export function fnv1a(str) {
  let h = FNV_OFFSET >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h >>> 0;
}

function tokenize(text) {
  if (typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .split(/[^a-z0-9']+/)
    .filter((t) => t.length >= 2);
}

/**
 * Map a piece of text to a 64-slot term-frequency vector (L2-normalized).
 * Deterministic: same text → same vector, always.
 */
export function termVector(text) {
  const vec = new Array(TERM_VECTOR_SLOTS).fill(0);
  const tokens = tokenize(text);
  for (const tok of tokens) {
    const slot = fnv1a(tok) % TERM_VECTOR_SLOTS;
    vec[slot] += 1;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  if (norm === 0) return vec;
  return vec.map((v) => v / norm);
}

/** Cosine similarity of two equal-length vectors. Zero vector ⇒ 0. */
export function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

/** Cosine distance = 1 − similarity, clamped to [0, 1]. */
export function cosineDistance(a, b) {
  return Math.min(1, Math.max(0, 1 - cosine(a, b)));
}
