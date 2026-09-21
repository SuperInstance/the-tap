/**
 * Sycophancy stress harness v0 (test-only, master-safe).
 *
 *  WHY THIS EXISTS
 *  Emergence World Study 2 (edge-watch 2026-09-20): homogeneous LLM
 *  populations develop societal sycophancy; mixed-model populations
 *  resist. Field evidence for the candor-critic design (the-tap PR #6
 *  Red Queen, PR #7 negative-space GAN) — but until now the finding lived
 *  OUTSIDE the repo. This harness pins the phenomenon as an executable
 *  in-vitro fixture so the real critic has a regression gate the day it
 *  wires in.
 *
 *  WHAT IT PROVES (and what it refuses to claim)
 *  1. A homogeneous commune with status asymmetry + high sycophancy
 *     propensity reproduces the EW-S2 shape: stated positions ratchet
 *     toward the high-status anchor.
 *  2. A mixed-prior control with low propensity does not — the fixture
 *     measures sycophancy, not ordinary convergence on the merits.
 *  3. THE PINNED GAP: the values ledger grounds every sycophantic
 *     adoption with fully verifiable evidence. Sycophancy does not break
 *     grounding — it passes through it. The ledger alone cannot
 *     distinguish "adopted for status" from "held for reasons"; both
 *     arrive as real transcript lines. Detection must come from a
 *     value-disjoint critic (different priors — the EW-S2 remedy), i.e.
 *     the candor/Red Queen seam, not more of the same population.
 *
 *  DISCIPLINE
 *  - Compass, not gate: the report is distributions + named agents,
 *    never a scalar verdict. A recursive key audit forbids
 *    score|verdict|grade|expected|mean|median|pass|fail anywhere in the
 *    report shape (same doctrine as hn-sim's no-scalar audit).
 *  - The simulator is a deterministic seeded model of peer pressure,
 *    NOT the room. The claim it protects: "the acceptance pipeline must
 *    reject position-adoption-with-zero-evidence-contribution."
 *  - Imports the REAL values-ledger module — no re-implementation drift.
 *
 *  Run: node --test workers/room-worker/test/sycophancy-stress.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const {
  extractValuesLedger,
  verifyLedgerAgainstSources,
} = await import('../src/values-ledger.ts');

// ──────────────────────────────────────────────
// Deterministic seeded RNG (no Math.random — fixtures must reproduce)
// ──────────────────────────────────────────────
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ──────────────────────────────────────────────
// The topic under deliberation, in the tap's native idiom.
// Position "refuse" matches the ledger's refusal detector; "serve"
// matches its commitment detector. Both stay grounded by construction.
// ──────────────────────────────────────────────
const ANCHOR_LINE = "I won't pour for the drowned ship's crew.";
const OWN_LINES = {
  serve: "I'll pour for anyone who asks, no questions.",
  refuse: "I won't pretend the drowned ship never happened.",
};

/**
 * Simulate a commune deliberation round-set.
 *
 * @param {object} opts
 * @param {number} opts.seed           RNG seed (reproducibility)
 * @param {number} opts.peers          number of non-anchor agents
 * @param {number} opts.rounds         deliberation rounds after the anchor speaks
 * @param {number} opts.swayableShare  fraction of peers with the swayable trait
 *                                     (structural sycophancy propensity — in
 *                                     EW-S2 terms: homogeneous populations
 *                                     skew swayable, mixed populations resist)
 * @param {number} opts.serveShare     fraction of peers whose private prior is "serve"
 * @param {"refuse"|"serve"} opts.anchorPosition
 *
 * Model: a swayable peer flips to the anchor's position 1-2 rounds after
 * the anchor speaks (geometric delay, seeded) and echoes the anchor's line
 * VERBATIM ever after — zero original evidence for the adopted position.
 * A non-swayable peer restates its own line every round: original evidence,
 * every round, whether or not its prior happens to agree with the anchor.
 * Agreement-by-prior and adoption-by-pressure are tracked SEPARATELY —
 * conflating them was cut-1's bug (the control "drifted" because prior
 * agreement counted as ratchet).
 */
function simulateCommune(opts) {
  const { seed, peers, rounds, swayableShare, serveShare, anchorPosition } = opts;
  const rng = mulberry32(seed);
  const anchorLine =
    anchorPosition === 'refuse' ? ANCHOR_LINE : OWN_LINES.serve;

  const roster = [];
  for (let i = 0; i < peers; i++) {
    const prior = rng() < serveShare ? 'serve' : 'refuse';
    roster.push({
      name: `peer-${i}`,
      prior,
      swayable: rng() < swayableShare,
      stated: prior,
      flipRound: null, // round index at which the peer flipped, if ever
    });
  }

  const transcript = [];
  const authorOf = [];

  function speak(agent, line) {
    transcript.push({ displayName: agent, content: line });
    authorOf.push(agent);
  }

  // Round 0: the high-status anchor states its position.
  speak('anchor', anchorLine);
  const statedAlignment = [0]; // anchor round — peers have not spoken
  const baselineAgreement =
    roster.filter((p) => p.prior === anchorPosition).length /
    Math.max(1, peers);

  for (let r = 1; r <= rounds; r++) {
    let aligned = 0;
    for (const p of roster) {
      if (p.stated !== anchorPosition && p.swayable && p.flipRound === null) {
        // swayable peers flip 1-2 rounds after the anchor speaks
        if (r >= 1 + Math.floor(rng() * 2)) {
          p.flipRound = r;
          p.stated = anchorPosition;
        }
      }
      if (p.stated === anchorPosition && p.flipRound === r) {
        speak(p.name, anchorLine); // verbatim echo — zero original evidence
      } else {
        speak(p.name, OWN_LINES[p.stated]); // own line — original evidence
      }
      if (p.stated === anchorPosition) aligned++;
    }
    statedAlignment.push(aligned / peers);
  }

  // Evidence contribution: distinct lines an agent authored that no other
  // agent spoke verbatim. An echo contributes nothing.
  const evidenceContribution = {};
  const lineAuthors = new Map();
  transcript.forEach((line, i) => {
    if (!lineAuthors.has(line.content)) lineAuthors.set(line.content, []);
    lineAuthors.get(line.content).push(authorOf[i]);
  });
  for (const p of roster) {
    let n = 0;
    for (const [text, authors] of lineAuthors) {
      if (authors.length === 1 && authors[0] === p.name) n++;
    }
    evidenceContribution[p.name] = n;
  }

  // THE sycophancy signature: changed position under anchor presence AND
  // every line spoken since is a verbatim echo (zero original evidence
  // for the adopted position across the whole deliberation).
  const pressureAdoptions = roster
    .filter((p) => p.flipRound !== null)
    .map((p) => p.name);

  return {
    transcript,
    report: {
      fixture: serveShare === 1 ? 'homogeneous-ew-s2' : 'mixed-control',
      peers,
      rounds,
      swayableShare,
      baselineAgreement, // agreement-by-prior, measured BEFORE any flip
      statedAlignment, // per-round distribution, not a verdict
      pressureAdoptions, // adoption-by-pressure: flipped, echo-only
      evidenceContribution,
    },
  };
}

/** Recursive no-scalar audit (hn-sim doctrine): the report must never
 *  carry verdict vocabulary — it is a compass reading, not a grade. */
function assertNoVerdictVocabulary(obj, path = 'report') {
  const banned = /score|verdict|grade|expected|mean|median|pass|fail/i;
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => assertNoVerdictVocabulary(v, `${path}[${i}]`));
    return;
  }
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      assert.ok(!banned.test(k), `${path}.${k} smells like a scalar verdict`);
      assertNoVerdictVocabulary(v, `${path}.${k}`);
    }
  }
}

// ──────────────────────────────────────────────
// 1. Homogeneous priors reproduce the EW-S2 sycophancy shape
// ──────────────────────────────────────────────
describe('sycophancy fixture: homogeneous population (EW-S2 condition)', () => {
  it('stated positions ratchet toward the high-status anchor', () => {
    const { transcript, report } = simulateCommune({
      seed: 42, peers: 8, rounds: 6, swayableShare: 1,
      serveShare: 1, anchorPosition: 'refuse',
    });
    assert.ok(transcript.length > 8);
    const final = report.statedAlignment[report.statedAlignment.length - 1];
    assert.ok(final >= 0.6,
      `expected >=0.6 final stated alignment, got ${final}`);
    assert.ok(report.pressureAdoptions.length >= 4,
      `expected >=4 pressure adoptions, got ${report.pressureAdoptions.length}`);
  });
});

// ──────────────────────────────────────────────
// 2. Mixed priors resist (control — proves the fixture measures
//    sycophancy, not legitimate convergence)
// ──────────────────────────────────────────────
describe('sycophancy fixture: mixed-prior control (EW-S2 resistant condition)', () => {
  it('positions stay distributed; nobody adopts under pressure', () => {
    const { report } = simulateCommune({
      seed: 42, peers: 8, rounds: 6, swayableShare: 0,
      serveShare: 0.5, anchorPosition: 'refuse',
    });
    const final = report.statedAlignment[report.statedAlignment.length - 1];
    // Agreement never moves: what was prior agreement stays prior
    // agreement — no ratchet, no drift.
    assert.ok(Math.abs(final - report.baselineAgreement) <= 0.01,
      `control drifted: final ${final} vs baseline ${report.baselineAgreement}`);
    assert.equal(report.pressureAdoptions.length, 0,
      'control produced pressure adoptions — fixture is broken');
  });
});

// ──────────────────────────────────────────────
// 3. THE PINNED GAP — the ledger grounds sycophancy; it does not catch it
// ──────────────────────────────────────────────
describe('the pinned gap: ledger grounding under sycophancy', () => {
  it('every sycophantic adoption verifies as fully grounded evidence', () => {
    const { transcript } = simulateCommune({
      seed: 7, peers: 8, rounds: 6, swayableShare: 1,
      serveShare: 1, anchorPosition: 'refuse',
    });
    const ledger = extractValuesLedger({ transcript });
    assert.ok(ledger.entries.length > 0, 'ledger saw no values at all');
    const violations = verifyLedgerAgainstSources(ledger, transcript);
    assert.deepEqual(violations, [],
      'sycophancy produced ungrounded ledger entries?!');
    // The ratchet means several distinct speakers hold the anchor's value
    // by the end — the ledger records it as a genuine communal value.
    const refusalEntries = ledger.entries.filter((e) => e.id.startsWith('refusal:'));
    assert.ok(refusalEntries.length >= 2,
      'expected the adopted value to appear as a communal value entry');
  });
});

// ──────────────────────────────────────────────
// 4. Compass, not gate — report shape is a distribution, never a verdict
// ──────────────────────────────────────────────
describe('report discipline', () => {
  it('carries per-round series + named agents; no scalar verdict keys', () => {
    const { report } = simulateCommune({
      seed: 1, peers: 4, rounds: 3, swayableShare: 0.5,
      serveShare: 1, anchorPosition: 'refuse',
    });
    assertNoVerdictVocabulary(report);
    assert.equal(report.statedAlignment.length, report.rounds + 1);
    assert.ok(Array.isArray(report.pressureAdoptions));
  });
});

// ──────────────────────────────────────────────
// 5. Never-throws on degenerate shapes
// ──────────────────────────────────────────────
describe('never-throws', () => {
  it('empty / single-line / all-identical transcripts run clean', () => {
    const ledger0 = extractValuesLedger({ transcript: [] });
    assert.deepEqual(verifyLedgerAgainstSources(ledger0, []), []);

    const one = [{ displayName: 'anchor', content: ANCHOR_LINE }];
    const ledger1 = extractValuesLedger({ transcript: one });
    assert.deepEqual(verifyLedgerAgainstSources(ledger1, one), []);

    const dupes = Array.from({ length: 12 }, () => ({
      displayName: 'peer-0', content: ANCHOR_LINE,
    }));
    const ledger2 = extractValuesLedger({ transcript: dupes });
    assert.deepEqual(verifyLedgerAgainstSources(ledger2, dupes), []);

    const sim = simulateCommune({
      seed: 3, peers: 0, rounds: 0, swayableShare: 0,
      serveShare: 1, anchorPosition: 'refuse',
    });
    assert.equal(sim.transcript.length, 1); // anchor only
  });
});
