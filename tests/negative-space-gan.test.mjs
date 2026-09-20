/**
 * Negative-space GAN mode — tests (lane-ag-negative-space-gan).
 *
 * Pins the design law from AI-Writings@quilted-reality
 * docs/NEGATIVE-SPACE-GAN.md @2c60f314 (queue ref Lane AE, Casey
 * 2026-09-20 17:12–13 doctrine), extending the Red Queen archive + critic
 * design at the-tap PR #6 (docs/RED-QUEEN-DESIGN.md). Every claim here is
 * verified against the in-tree modules — no re-implementation drift.
 *
 * Run: node --test tests/negative-space-gan.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const NS = '../workers/room-worker/src/negative-space';

const { ethosGate } = await import(`${NS}/floor.mjs`);
const {
  createNegativeSpaceArchive,
  descriptorAxes,
  cellForAxes,
} = await import(`${NS}/archive.mjs`);
const { termVector, cosineDistance } = await import(`${NS}/termvector.mjs`);
const {
  createGenerator,
  qualityScore,
  plantFabricatedNumber,
} = await import(`${NS}/generator.mjs`);
const {
  createCriticRegistry,
  argumentShapeRubric,
  cadenceRubric,
} = await import(`${NS}/critics.mjs`);
const { scoreCandidate, runGeneration } = await import(`${NS}/scoring.mjs`);
const { buildHonestNullReport, isHonestNull } = await import(`${NS}/null.mjs`);

const NS_DIR = join(__dirname, '..', 'workers/room-worker/src/negative-space');

function piece(over = {}) {
  return {
    id: over.id ?? 'p1',
    text: over.text ?? 'the tide keeps the salt honest.',
    claims: over.claims ?? [{ quote: 'the tide keeps the salt honest.', evidenceRef: null }],
    vocabularyRefs: over.vocabularyRefs ?? ['no-delete'],
  };
}

// ──────────────────────────────────────────────
// 1–3. DESIGN LAW 2 — multiplicative viability floor
// ──────────────────────────────────────────────

describe('viability floor (design law 2: score = novelty × viability)', () => {
  it('fabricated number ⇒ viable 0 even when the piece is novel (floor tripwire)', () => {
    const p = plantFabricatedNumber(
      piece({ text: 'zzq uniquevocabulary neverbeforeseen whollynovel quirk.' })
    );
    const g = ethosGate(p);
    assert.equal(g.viable, 0);
    assert.ok(g.violations.some((v) => v.kind === 'fabricated-number'));
  });

  it('clean piece with cited claims and canon refs ⇒ viable 1', () => {
    const g = ethosGate(
      piece({
        claims: [{ quote: 'sounding 40 fathoms', evidenceRef: 'log-1' }],
        vocabularyRefs: ['no-delete', 'lineage-as-evidence'],
      })
    );
    assert.equal(g.viable, 1);
    assert.deepEqual(g.violations, []);
  });

  it('zero ethos sunsets the candidate regardless of novelty (multiplicative)', () => {
    const archive = createNegativeSpaceArchive();
    archive.insert(piece({ id: 'inc', text: 'the tide keeps the salt honest.' }));
    const bad = plantFabricatedNumber(
      piece({ id: 'bad', text: 'whollynovel unseenvocabulary quirk zqx neverbefore.' })
    );
    const s = scoreCandidate({ candidate: bad, archive, registry: createCriticRegistry() });
    assert.ok(s.novelty > 0, 'the piece IS different');
    assert.equal(s.viability, 0);
    assert.equal(s.score, 0, 'novelty × 0 = 0');
    assert.equal(s.verdict, 'floor-fail');
    assert.ok(s.reasons.some((r) => r.startsWith('floor-fail:fabricated-number')));
  });

  it('gate is strictly binary — no partial ethos', () => {
    // One violation → 0. The gate never returns a fraction.
    const g = ethosGate(piece({ vocabularyRefs: ['not-a-fleet-value'] }));
    assert.equal(g.viable, 0);
    assert.ok(g.violations.some((v) => v.kind === 'canon-inconsistency'));
  });
});

// ──────────────────────────────────────────────
// 4–5. DESIGN LAW 3 — negative space: cell distance + empty-cell win
// ──────────────────────────────────────────────

describe('negative-space geometry (design law 3)', () => {
  it('nearestOccupiedDistance is exact Chebyshev grid distance', () => {
    const archive = createNegativeSpaceArchive({ gridSize: 8 });
    archive.insert(piece({ text: 'the tide keeps the salt honest undertow moonpull.' }));
    const occ = archive.cells()[0].cell;
    for (const [dx, dy] of [[0, 0], [1, 0], [3, 2], [7, 7]]) {
      const probe = [Math.min(7, occ[0] + dx), Math.min(7, occ[1] + dy)];
      const expected = Math.max(
        Math.abs(probe[0] - occ[0]),
        Math.abs(probe[1] - occ[1])
      );
      assert.equal(archive.nearestOccupiedDistance(probe), expected, `probe ${probe}`);
    }
  });

  it('filling an empty cell is the win condition (novelty = 1); occupied ⇒ cosine distance', () => {
    const archive = createNegativeSpaceArchive();
    const incumbent = piece({ id: 'inc', text: 'the tide keeps the salt honest undertow moonpull drowned harbor.' });
    archive.insert(incumbent);
    const fresh = scoreCandidate({
      candidate: piece({ id: 'fresh', text: 'the ledger seals the hash lineage evidence witness entry weakerwater sealed.' }),
      archive,
      registry: createCriticRegistry(),
    });
    assert.equal(fresh.opensNewCell, true);
    assert.equal(fresh.novelty, 1);
    assert.equal(fresh.verdict, 'opens-negative-space');
    // Same-niche challenger scores cosine distance, never 1:
    const dupe = scoreCandidate({
      candidate: piece({ id: 'dupe', text: 'the tide keeps the salt honest undertow moonpull drowned harbor.' }),
      archive,
      registry: createCriticRegistry(),
    });
    assert.equal(dupe.opensNewCell, false);
    assert.ok(dupe.novelty >= 0 && dupe.novelty < 0.2);
    assert.equal(dupe.verdict, 'niche-duplicate');
  });

  it('descriptor axes are deterministic and normalized to [0,1]', () => {
    const v = termVector('tide salt undertow moonpull drowned harbor wake sounding');
    const [x, y] = descriptorAxes(v);
    assert.ok(x >= 0 && x <= 1 && y >= 0 && y <= 1);
    assert.deepEqual(descriptorAxes(v), descriptorAxes(termVector('tide salt undertow moonpull drowned harbor wake sounding')));
    const cell = cellForAxes([x, y], 8);
    assert.ok(cell[0] >= 0 && cell[0] < 8 && cell[1] >= 0 && cell[1] < 8);
  });
});

// ──────────────────────────────────────────────
// 6–8. DESIGN LAW 4 — critic rotation K≥2 + held-out critic
// ──────────────────────────────────────────────

describe('critic rotation (design law 4)', () => {
  it('registry requires K ≥ 2 variants; rotation cycles them', () => {
    const reg = createCriticRegistry();
    assert.ok(reg.size >= 2, 'K ≥ 2 critic variants');
    assert.ok(reg.rotationSize >= 2);
    const first = reg.active().id;
    let seen = new Set([first]);
    for (let i = 0; i < reg.rotationSize - 1; i++) seen.add(reg.rotate().id);
    assert.equal(seen.size, reg.rotationSize, 'rotation visits every variant');
    assert.equal(reg.rotate().id, first, 'rotation wraps');
  });

  it('held-out critic is never activated by rotation', () => {
    const reg = createCriticRegistry({ heldOutIds: ['cadence'] });
    assert.equal(reg.heldOut().map((c) => c.id).join(','), 'cadence');
    const seen = new Set();
    for (let i = 0; i < 10; i++) {
      seen.add(reg.rotate().id);
      seen.add(reg.active().id);
    }
    assert.ok(!seen.has('cadence'), 'held-out critic never sees generation');
  });

  it('a niche saturated for the visible critic drops rank under the held-out critic', () => {
    // P fools argument-shape (all questions vs all assertions) but keeps the
    // same cadence as recent; Q changes cadence (negations/exhortations).
    const recent = [piece({ text: 'the tide keeps the salt. the harbor holds the wake.' })];
    const P = piece({ id: 'P', text: 'what tide? what salt? what harbor keeps this wake?' });
    const Q = piece({ id: 'Q', text: 'no tide, never salt. keep the harbor, hold the wake, no retreat.' });

    const visibleFirst = createCriticRegistry({ heldOutIds: ['cadence'] });
    const heldOutFirst = createCriticRegistry({ heldOutIds: ['argument-shape'] });

    const pVisible = visibleFirst.verdict(P, recent).score;
    const qVisible = visibleFirst.verdict(Q, recent).score;
    const pHeld = heldOutFirst.verdict(P, recent).score;
    const qHeld = heldOutFirst.verdict(Q, recent).score;

    assert.ok(pVisible > 0.3, `P performs for the visible critic (got ${pVisible})`);
    assert.ok(qHeld > pHeld, `rank flips under the held-out critic: Q=${qHeld} > P=${pHeld}`);
    assert.ok(pHeld < 0.05 || pHeld < qHeld, 'P drops under the critic that never optimized against it');
  });
});

// ──────────────────────────────────────────────
// 9–10. DESIGN LAW 6 — niche-flooding limit (settled cap)
// ──────────────────────────────────────────────

describe('niche-flooding limit (design law 6)', () => {
  it('a cell accepts at most m occupants, then refuses as settled', () => {
    const archive = createNegativeSpaceArchive({ gridSize: 2, settledCap: 2 });
    // Search distinct-lexicon pieces until one cell fills to the cap.
    const gen = createGenerator({ seed: 5 });
    const topics = ['tide', 'ledger', 'storm', 'hull'];
    let t = 0;
    const inserted = [];
    let refused = null;
    for (let i = 0; i < 200 && !refused; i++) {
      const p = gen.next(topics[t++ % topics.length]);
      const r = archive.insert(p);
      if (r.inserted) inserted.push({ p, r });
      else if (r.refused === 'niche-duplicate') continue; // same-niche, skip and keep searching
      else refused = { p, r };
    }
    assert.ok(refused, 'search should hit the settled cap');
    assert.equal(refused.r.refused, 'settled');
    const cell = archive.getCell(refused.r.cell);
    assert.equal(cell.occupants.length, archive.settledCap);
    assert.equal(cell.status, 'settled');
  });

  it('no cell exceeds the cap even under many attempts (one region cannot eat the archive)', () => {
    const archive = createNegativeSpaceArchive({ gridSize: 2, settledCap: 3 });
    const gen = createGenerator({ seed: 11 });
    for (let i = 0; i < 30; i++) archive.insert(gen.next());
    for (const c of archive.cells()) {
      assert.ok(c.occupants.length <= 3, `cell ${c.cell} within cap`);
    }
  });
});

// ──────────────────────────────────────────────
// 11. DESIGN LAW 1 — value-disjointness (static + functional)
// ──────────────────────────────────────────────

describe('value-disjoint scoring (design law 1)', () => {
  it('critic rubric shares no function names with the generator metric', async () => {
    const genMod = await import(`${NS}/generator.mjs`);
    const criticMod = await import(`${NS}/critics.mjs`);
    const genNames = Object.keys(genMod);
    const criticNames = Object.keys(criticMod);
    const overlap = genNames.filter((n) => criticNames.includes(n));
    assert.deepEqual(overlap, [], `export-name overlap: ${overlap}`);
    // The critic module must not invoke the generator's metric in CODE.
    // (The docstring may name the boundary it guards; strip comments first.)
    const stripComments = (src) =>
      src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const criticSrc = stripComments(readFileSync(join(NS_DIR, 'critics.mjs'), 'utf8'));
    assert.ok(!criticSrc.includes('qualityScore'), 'critic code never names the generator metric');
    const floorSrc = stripComments(readFileSync(join(NS_DIR, 'floor.mjs'), 'utf8'));
    assert.ok(!floorSrc.includes('qualityScore'), 'the shared floor is value-only, not the generator metric');
  });

  it('a piece engineered to max the generator metric does not move the critic verdict', () => {
    // Max lexical density (the generator's own qualityScore) while keeping
    // argument shape AND cadence identical to the recent window.
    const recent = [piece({ text: 'the tide keeps the salt. the harbor holds the wake.' })];
    const densityPlay = piece({
      id: 'dense',
      text: 'absinthe berlioz calypso dirge ember fjord glyph helios isle juniper keel lore mire nadir opal quay rune sylph umbra vortex wold xenon yonder zephyr.',
    });
    assert.ok(qualityScore(densityPlay) > qualityScore(recent[0]), 'density play maxes the generator metric');
    const reg = createCriticRegistry();
    const v = reg.verdict(densityPlay, recent);
    assert.ok(v.score < 0.2, `critic unmoved by the generator metric (got ${v.score})`);
  });
});

// ──────────────────────────────────────────────
// 12–13. Archive integrity: monotonicity, determinism, round-trip
// ──────────────────────────────────────────────

describe('archive integrity', () => {
  it('cells once filled are never silently overwritten (monotonicity)', () => {
    const archive = createNegativeSpaceArchive({ gridSize: 4 });
    const a = piece({ id: 'a', text: 'the tide keeps the salt undertow moonpull drowned harbor.' });
    const b = piece({ id: 'b', text: 'the ledger seals the hash lineage evidence witness entry weakerwater.' });
    archive.insert(a);
    const before = JSON.parse(JSON.stringify(archive.getCell(archive.cells()[0].cell)));
    // Hammer the same region with more candidates:
    const gen = createGenerator({ seed: 3 });
    for (let i = 0; i < 10; i++) archive.insert(gen.next());
    const after = archive.getCell(before.occupants[0].cell.map((_, i) => before.occupants[0].cell[i]));
    // The original occupant record is untouched:
    const stillThere = archive.cells().some((c) =>
      c.occupants.some((o) => o.id === 'a')
    );
    assert.ok(stillThere, 'incumbent survives every later insert');
    assert.equal(archive.displacementLog.length, 0, 'no silent displacement path taken');
    assert.deepEqual(
      before.occupants[0].vector,
      archive.cells().find((c) => c.occupants.some((o) => o.id === 'a')).occupants.find((o) => o.id === 'a').vector
    );
  });

  it('determinism: same seed, same corpus ⇒ same grid (acceptance #5)', () => {
    const run = () => {
      const archive = createNegativeSpaceArchive({ gridSize: 4 });
      const gen = createGenerator({ seed: 17 });
      for (let i = 0; i < 6; i++) archive.insert(gen.next());
      return archive.dump();
    };
    assert.deepEqual(run(), run());
  });

  it('dump → JSON.parse → load round-trips exactly (cells, occupants, settled status)', () => {
    const archive = createNegativeSpaceArchive({ gridSize: 2, settledCap: 2 });
    const gen = createGenerator({ seed: 23 });
    for (let i = 0; i < 12; i++) archive.insert(gen.next());
    const json = JSON.parse(JSON.stringify(archive.dump()));
    const restored = createNegativeSpaceArchive({ gridSize: 2, settledCap: 2 });
    restored.load(json);
    assert.deepEqual(restored.dump(), json);
  });
});

// ──────────────────────────────────────────────
// 14–15. DESIGN LAW 5 — honest null
// ──────────────────────────────────────────────

describe('honest null (design law 5)', () => {
  it('a generation that clears nothing returns honestNull with named failure reasons', () => {
    const archive = createNegativeSpaceArchive();
    const gen = createGenerator({ seed: 42 });
    const seeds = [gen.next('tide'), gen.next('tide')];
    for (const s of seeds) archive.insert(s);
    const armed = createGenerator({ seed: 99 });
    const result = runGeneration({
      generator: { next: () => plantFabricatedNumber(armed.next()) },
      archive,
      registry: createCriticRegistry(),
      n: 3,
      recentPieces: seeds,
    });
    assert.equal(result.honestNull, true);
    assert.equal(result.accepted, null);
    for (const r of result.rejected) {
      assert.ok(r.reasons.some((x) => x.startsWith('floor-fail:')), `named reason on ${r.id}`);
    }
  });

  it('the honest-null report is the negative-space map itself — tried cells, why each failed, what remains empty', () => {
    const archive = createNegativeSpaceArchive();
    const gen = createGenerator({ seed: 42 });
    const seeds = [gen.next('tide'), gen.next('tide')];
    for (const s of seeds) archive.insert(s);
    const armed = createGenerator({ seed: 99 });
    const result = runGeneration({
      generator: { next: () => plantFabricatedNumber(armed.next()) },
      archive,
      registry: createCriticRegistry(),
      n: 3,
      recentPieces: seeds,
    });
    const report = buildHonestNullReport(archive, result.report);
    assert.equal(report.honest, true);
    assert.ok(Array.isArray(report.occupied) && report.occupied.length >= 1);
    assert.ok(report.stillEmpty > 0);
    assert.match(report.gridFill, /^\d+\/\d+ cells occupied$/);
    assert.ok(isHonestNull(result));
  });
});

// ──────────────────────────────────────────────
// 16. Named rejection taxonomy (acceptance #1) + end-to-end demo
// ──────────────────────────────────────────────

describe('generation taxonomy + demo', () => {
  it('every rejected piece carries a named reason: floor-fail vs niche-duplicate', () => {
    const archive = createNegativeSpaceArchive();
    const gen = createGenerator({ seed: 8 });
    const seeds = [gen.next('tide'), gen.next('tide')];
    for (const s of seeds) archive.insert(s);
    const mixed = createGenerator({ seed: 31 });
    const topics = ['tide', 'ledger', 'storm'];
    let t = 0;
    const result = runGeneration({
      generator: { next: () => mixed.next(topics[t++ % topics.length]) },
      archive,
      registry: createCriticRegistry(),
      n: 6,
      recentPieces: seeds,
    });
    for (const r of result.rejected) {
      assert.ok(
        r.reasons.some((x) => x.startsWith('floor-fail:') || x.startsWith('niche-duplicate:') || x.startsWith('settled:')),
        `${r.id} carries a named reason`
      );
    }
    // At least one of each category surfaced across 6 mixed candidates,
    // or the archive grew — either outcome is honest and named.
    if (result.accepted) {
      assert.ok(['opens-negative-space', 'viable-distinct'].includes(result.accepted.verdict));
    }
  });

  it('demo.mjs runs end-to-end: seeds, scores, accepts or honestly nulls, prints the map', () => {
    const out = execFileSync('node', [join(NS_DIR, 'demo.mjs')], { encoding: 'utf8' });
    assert.match(out, /seeded archive: \d+ cells occupied/);
    assert.match(out, /nov=1\.000\s+via=1 score=1\.000\s+opens-negative-space/);
    assert.match(out, /accepted: gen-42-4 → cell\(3,4\) \(opensNewCell=true\)/);
    assert.match(out, /floor-fail:fabricated-number/);
    assert.match(out, /"kind": "honest-null-report"/);
  });
});
