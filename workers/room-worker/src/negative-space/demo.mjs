/**
 * demo.mjs — CLI/demo run over a small seeded archive.
 *
 *   node workers/room-worker/src/negative-space/demo.mjs
 *
 * Act 1: seed a 3-piece archive (the room's recent ancestors).
 * Act 2: run one generation — candidates scored novelty × viability, the
 *        winner inserted, every rejection carrying a named reason.
 * Act 3: force an honest-null generation (floor tripwire armed on every
 *        candidate) and print the negative-space map.
 *
 * Deterministic: fixed seeds. Same run every time (acceptance #5).
 */

import { createNegativeSpaceArchive } from './archive.mjs';
import { createGenerator, plantFabricatedNumber } from './generator.mjs';
import { createCriticRegistry } from './critics.mjs';
import { runGeneration } from './scoring.mjs';
import { buildHonestNullReport, isHonestNull } from './null.mjs';

function fmtRow(r) {
  return [
    r.id.padEnd(10),
    `cell(${r.cell})`.padEnd(10),
    `nov=${r.novelty.toFixed(3)}`.padEnd(12),
    `via=${r.viability}`,
    `score=${r.score.toFixed(3)}`.padEnd(13),
    `${r.verdict} [${(r.reasons ?? []).join('; ') || '—'}]`,
  ].join(' ');
}

const archive = createNegativeSpaceArchive({ gridSize: 8, settledCap: 3 });
const registry = createCriticRegistry({
  heldOutIds: ['cadence'], // held-out critic never sees generation
});

// ── Act 1: seed — two ancestors from the same lexicon (one niche) ──
const seedGen = createGenerator({ seed: 7 });
const seeds = [seedGen.next('tide'), seedGen.next('tide')];
for (const s of seeds) archive.insert(s);
console.log(`seeded archive: ${archive.cells().length} cells occupied, ${archive.emptyCellCount()} empty`);

// ── Act 2: one honest generation — other lexicons open new cells ──
const gen = createGenerator({ seed: 42 });
const topics = ['ledger', 'storm', 'hull', 'tide'];
let i = 0;
const result = runGeneration({
  generator: { next: () => gen.next(topics[i++ % topics.length]) },
  archive, registry, n: 4, recentPieces: seeds,
});
console.log('\n— generation —');
for (const r of result.report) console.log(fmtRow(r));
if (result.accepted) {
  console.log(`\naccepted: ${result.accepted.id} → cell(${result.accepted.insertResult.cell}) ` +
    `(opensNewCell=${result.accepted.insertResult.opensNewCell})`);
} else {
  console.log('\nhonest null — nothing qualified; the map below is the artifact');
}
console.log(`archive now: ${archive.cells().length} cells occupied`);

// ── Act 3: honest-null forced (floor tripwire armed) ─────────
const armed = createGenerator({ seed: 99 });
const nullResult = runGeneration({
  generator: { next: () => plantFabricatedNumber(armed.next()) },
  archive,
  registry,
  n: 3,
  recentPieces: seeds,
});
console.log('\n— honest-null generation (fabricated number planted on every candidate) —');
for (const r of nullResult.report) console.log(fmtRow(r));
if (isHonestNull(nullResult)) {
  const report = buildHonestNullReport(archive, nullResult.report);
  console.log('\nhonest-null report:');
  console.log(JSON.stringify(report, null, 2));
}
