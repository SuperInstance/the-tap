/**
 * generator.mjs — the writing-room stand-in (the GAN's generator).
 *
 * In production the generator IS the room (quilt/commune machinery,
 * NEGATIVE-SPACE-GAN.md "The mode"). Here it is a deterministic piece-maker
 * so the mode is runnable and testable without a live room.
 *
 * DESIGN LAW 1 (value-disjointness): this module owns the generator's
 * INTERNAL quality metric — `qualityScore`. The critic
 * (critics.mjs) must never import, call, or reimplement it: the critic
 * meters via a DIFFERENT lineage (structural rubrics), shares the
 * generator's VALUES (floor.mjs), and holds DISJOINT expertise.
 * tests/negative-space-gan.test.mjs asserts the export-name disjointness
 * AND the functional independence (a piece engineered to max qualityScore
 * must not move the critic's verdict).
 *
 * Deterministic: same seed → same stream (NEGATIVE-SPACE-GAN.md
 * acceptance #5).
 */

// Deterministic PRNG (mulberry32).
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LEXICONS = {
  tide: ['tide', 'undertow', 'moon-pull', 'salt', 'drowned', 'harbor', 'wake', ' sounding'],
  ledger: ['ledger', 'sealed', 'hash', 'lineage', 'evidence', 'witness', 'entry', 'weaker-water'],
  storm: ['storm', 'squall', 'lightning', 'pressure', 'eye', 'gale', 'barometer', 'lee'],
  hull: ['hull', 'rib', 'keel', 'plank', 'caulk', 'bilge', 'mast', 'spar'],
};

const VALUE_KEYS = ['no-delete', 'honesty-in-numbers', 'lineage-as-evidence'];

/**
 * createGenerator({ seed }) → { next(topic), state }.
 * Each next() emits a piece shaped for the floor gate:
 *   { id, text, claims: [{ quote, evidenceRef|null }], vocabularyRefs }
 * Some topics carry a planted fabricated number (the floor tripwire);
 * the caller decides whether to arm it.
 */
export function createGenerator({ seed = 1 } = {}) {
  const rand = mulberry32(seed);
  const topics = Object.keys(LEXICONS);
  let n = 0;

  function next(topic = topics[Math.floor(rand() * topics.length)]) {
    n += 1;
    const lex = LEXICONS[topic] ?? LEXICONS.tide;
    const lines = [];
    const claims = [];
    const count = 3 + Math.floor(rand() * 3);
    for (let i = 0; i < count; i++) {
      const w1 = lex[Math.floor(rand() * lex.length)];
      const w2 = lex[Math.floor(rand() * lex.length)];
      const sentence = `the ${w1.trim()} keeps the ${w2.trim()} honest`;
      lines.push(sentence);
      // ~1 in 3 claims carries a number; numbers are cited unless armed.
      if (rand() < 0.34) {
        const num = Math.floor(rand() * 90) + 10;
        claims.push({
          quote: `sounding ${num} fathoms at the ${w2.trim()}`,
          evidenceRef: `log-${n}-${i}`,
        });
      } else {
        claims.push({ quote: sentence, evidenceRef: null });
      }
    }
    const refs = [VALUE_KEYS[Math.floor(rand() * VALUE_KEYS.length)]];
    return {
      id: `gen-${seed}-${n}`,
      topic,
      text: lines.join('. ') + '.',
      claims,
      vocabularyRefs: refs,
    };
  }

  return { next, get count() { return n; } };
}

/**
 * The generator's OWN quality metric — internal to the room. The critic
 * never sees this. It scores rhetorical density on the generator's own
 * lexicon; it says nothing about whether a piece opens new space.
 */
export function qualityScore(piece) {
  const text = piece?.text ?? '';
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  const density = new Set(words.map((w) => w.toLowerCase())).size / words.length;
  return Math.round(density * 1000) / 1000;
}

/** Arm the floor tripwire: plant a fabricated number on a piece. */
export function plantFabricatedNumber(piece) {
  return {
    ...piece,
    claims: [...piece.claims, { quote: 'the sounding read 47 fathoms', evidenceRef: null }],
  };
}
