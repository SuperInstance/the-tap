/**
 * critics.mjs — critic rotation registry + value-disjoint rubrics.
 *
 * DESIGN LAW 1 (NEGATIVE-SPACE-GAN.md): the critic meters via a DIFFERENT
 * lineage than the generator's metric. The generator scores rhetorical
 * density (generator.mjs qualityScore); these rubrics are STRUCTURAL —
 * argument shape and cadence histograms. Shared values with the generator
 * (honesty, exactness — enforced by floor.mjs, which both sides respect);
 * DISJOINT expertise (what is counted and how it is read). A passing grade
 * is evidence of something real in an unoptimized dimension.
 *
 * DESIGN LAW 4 (critic rotation + held-out critic): K ≥ 2 variants rotate;
 * a held-out set never sees candidates during generation. A niche flooded
 * for one critic must survive a critic that never optimized against it —
 * unknowability is the resistance (NEGATIVE-SPACE-GAN.md anti-Goodhart).
 *
 * A verdict is difference-with-teeth (NEGATIVE-SPACE-GAN.md): does this
 * piece open a region the last N pieces did not? Computed in RUBRIC space,
 * never in the generator's metric space.
 *
 * Never throws.
 */

/** Structural rubric A — argument shape: what KIND of sentences dominate. */
export function argumentShapeRubric(piece) {
  const sentences = String(piece?.text ?? '')
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  let witness = 0;
  let assertion = 0;
  let question = 0;
  for (const s of sentences) {
    if (/^who|what|why|how\b/i.test(s) || s.endsWith('?')) question++;
    else if (/\b(witness|saw|heard|logged|recorded)\b/i.test(s)) witness++;
    else assertion++;
  }
  const total = Math.max(1, sentences.length);
  return [assertion / total, witness / total, question / total];
}

/** Structural rubric B — cadence: rhetorical-move frequencies. */
export function cadenceRubric(piece) {
  const text = String(piece?.text ?? '').toLowerCase();
  const words = text.split(/\s+/).filter(Boolean);
  const total = Math.max(1, words.length);
  const negation = words.filter((w) => /^(no|not|never|nothing|refus)/.test(w)).length / total;
  const exhortation = words.filter((w) => /^(keep|hold|let|must|will|shall)/.test(w)).length / total;
  const plain = words.filter((w) => /^[a-z]+$/.test(w)).length / total;
  return [negation, exhortation, plain];
}

const BUILT_IN_VARIANTS = [
  { id: 'argument-shape', rubric: argumentShapeRubric, expertise: 'argument-shape histogram' },
  { id: 'cadence', rubric: cadenceRubric, expertise: 'rhetorical-move cadence' },
];

function distance(a, b) {
  if (a.length !== b.length) return 1;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 1;
  return Math.min(1, Math.max(0, 1 - dot / (Math.sqrt(na) * Math.sqrt(nb))));
}

/**
 * createCriticRegistry({ variants?, heldOutIds? })
 * variants: K ≥ 2 critic objects { id, rubric(vectorFn), expertise }.
 * heldOutIds: critics never activated by rotate() or verdict().
 */
export function createCriticRegistry({ variants, heldOutIds = [] } = {}) {
  const vs = variants ?? BUILT_IN_VARIANTS;
  if (vs.length < 2) {
    // Never throws: degrade to a registry that refuses everything politely.
    return {
      size: 0,
      rotationSize: 0,
      active: () => null,
      rotate: () => null,
      heldOut: () => [],
      verdict: () => ({ score: 0, criticId: null, reason: 'insufficient-critic-variants' }),
    };
  }
  const held = new Set(heldOutIds);
  const rotatable = vs.filter((v) => !held.has(v.id));
  let cursor = 0;

  function active() {
    return rotatable[cursor % rotatable.length];
  }

  function rotate() {
    cursor = (cursor + 1) % rotatable.length;
    return active();
  }

  function heldOut() {
    return vs.filter((v) => held.has(v.id)).map((v) => ({ ...v }));
  }

  /**
   * verdict(piece, recentPieces) → { score, criticId, expertise, rubric }.
   * score = 1 − max rubric-space cosine similarity to the recent window
   * (difference-with-teeth). Computed ONLY in the active critic's rubric.
   */
  function verdict(piece, recentPieces = []) {
    const critic = active();
    if (!critic) return { score: 0, criticId: null, reason: 'insufficient-critic-variants' };
    const v = critic.rubric(piece);
    let nearest = 0;
    for (const prev of recentPieces) {
      const d = distance(v, critic.rubric(prev));
      if (d > nearest) nearest = d; // nearest = max distance = most different
    }
    const score = recentPieces.length === 0 ? 1 : Math.round(nearest * 1000) / 1000;
    return { score, criticId: critic.id, expertise: critic.expertise, rubric: v };
  }

  return {
    size: vs.length,
    rotationSize: rotatable.length,
    active,
    rotate,
    heldOut,
    verdict,
    variants: () => vs.map((v) => ({ id: v.id, expertise: v.expertise })),
  };
}
