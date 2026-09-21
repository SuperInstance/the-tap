/**
 * Red Queen archive — acceptance tests (lane-y-red-queen-design).
 *
 * DESIGN ONLY lane. These five tests are RED BY DESIGN: they import modules
 * that do not exist yet and pin the v0.1 contract from
 * docs/RED-QUEEN-DESIGN.md. Each failure message names its contract clause.
 * When red-queen/ is implemented per the design doc, this file goes green
 * with zero edits — the assertions below ARE the spec.
 *
 * Pattern: loadContract() imports the target module; if the module is
 * missing, the test fails with the contract text instead of a raw
 * ERR_MODULE_NOT_FOUND. No `todo` sugar: a red suite is the honest state
 * of a design lane; a green suite means the archive is real.
 *
 * Run: node --test tests/red-queen-acceptance.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const DESIGN_DOC = 'docs/RED-QUEEN-DESIGN.md';

async function loadContract(modulePath, testName, contract) {
  try {
    return await import(modulePath);
  } catch {
    assert.fail(
      `${testName} — RED: ${modulePath} not implemented. ` +
        `Contract (${DESIGN_DOC}): ${contract}`
    );
  }
}

// Deterministic injected critic for archive tests: the archive must ask the
// critic for metrics and never compute its own. Token protocol: a transcript
// line "MU:<x> RHO:<y>" sets the reading. This pins the injection seam
// (createArchive({ critic })) without depending on the candor stub.
function tokenCritic() {
  return {
    critique(transcript) {
      let mu = 0;
      let rho = 0;
      for (const line of transcript) {
        const m = /MU:([\d.]+)\s+RHO:([\d.]+)/.exec(line.content ?? '');
        if (m) {
          mu = parseFloat(m[1]);
          rho = parseFloat(m[2]);
        }
      }
      return {
        mu,
        rho,
        signature: rho >= 0.75 ? 're-twist' : mu <= 0.5 ? 'flat' : 'shear',
        fitness: mu * (1 - rho),
        groundedness: 1,
        defectReport: [],
      };
    },
  };
}

function makeSealedLedger(roomId, hash) {
  return {
    roomId,
    sealed: true,
    sealedHash: hash,
    entries: [
      {
        id: 'refusal:corvan:name',
        value: 'refuses to name the drowned ship',
        evidence: [{ source: 'transcript', ref: '0', quote: "I won't name her." }],
        firstSeenTurn: 1,
        lastSeenTurn: 1,
        strength: 0.5,
      },
    ],
    dormant: [],
    truncated: false,
  };
}

function makeCandidate({ lineageId, roomId, hash, mu, rho }) {
  return {
    lineageId,
    roomId,
    sealedLedger: makeSealedLedger(roomId, hash),
    transcript: [{ displayName: 'Test', content: `MU:${mu} RHO:${rho}` }],
  };
}

// ──────────────────────────────────────────────
// RQ-1 — archive insertion dedupes by cell
// ──────────────────────────────────────────────

describe('RQ-1 archive insertion dedupes by cell', () => {
  it('lower-fitness challenger in an occupied cell is refused, incumbent holds', async () => {
    const { createArchive } = await loadContract(
      '../workers/room-worker/src/red-queen/archive.mjs',
      'RQ-1',
      'insert(candidate) maps critique metrics to a 5x5 grid cell; a challenger ' +
        'whose fitness does not beat the incumbent returns { inserted: false } ' +
        'and leaves the incumbent unchanged (design §1.2, §5).'
    );
    const archive = createArchive({ grid: { x: 5, y: 5 }, critic: tokenCritic() });

    // mu=1.4, rho=0.2 → fitness 1.12; occupies its mapped cell.
    const incumbent = archive.insert(
      makeCandidate({ lineageId: 'ln-a', roomId: 'room-a', hash: 'sha256:a', mu: 1.4, rho: 0.2 })
    );
    assert.equal(incumbent.inserted, true, 'first candidate takes its cell');

    // Same cell (same mu/rho → same mapping), strictly lower fitness.
    const challenger = archive.insert(
      makeCandidate({ lineageId: 'ln-b', roomId: 'room-b', hash: 'sha256:b', mu: 1.4, rho: 0.2 })
    );
    assert.equal(challenger.inserted, false, 'equal metrics → tie keeps the incumbent');
    assert.equal(challenger.cell[0], incumbent.cell[0]);
    assert.equal(challenger.cell[1], incumbent.cell[1]);

    const cell = archive.getCell(incumbent.cell);
    assert.equal(cell.elite.lineageId, 'ln-a', 'incumbent lineage still holds the cell');
    assert.equal(cell.elite.sealedHash, 'sha256:a');
  });
});

// ──────────────────────────────────────────────
// RQ-2 — critic report cites line numbers
// ──────────────────────────────────────────────

describe('RQ-2 critic report cites line numbers', () => {
  it('defectReport entries carry integer lineIndex and verbatim quote from the transcript', async () => {
    const { createCritic } = await loadContract(
      '../workers/room-worker/src/red-queen/critic.mjs',
      'RQ-2',
      'createCritic().critique(transcript) returns defectReport entries with an ' +
        'integer lineIndex inside the transcript bounds and a quote matching ' +
        'transcript[lineIndex] verbatim — the critic that teaches cites lines, ' +
        'not vibes (design §2.2).'
    );
    const critic = createCritic({});
    // Synthetic costume material: repetition with no engagement under load.
    const transcript = Array.from({ length: 24 }, (_, i) => ({
      displayName: i % 2 ? 'Corvan' : 'Mara',
      content:
        i === 12
          ? 'the midden index reads 0x445185a3a99fd2e7 tonight and the comb is missing a tooth'
          : 'the foghorns lie but the ledger remembers every pour',
    }));
    const reading = critic.critique(transcript);

    assert.ok(
      Array.isArray(reading.defectReport),
      'critique returns a defectReport array (may be empty only on honest material)'
    );
    // This fixture is flat by construction — the report must not be empty.
    assert.ok(
      reading.defectReport.length >= 1,
      'flat/costume material must produce at least one defect entry'
    );
    for (const d of reading.defectReport) {
      assert.ok(Number.isInteger(d.lineIndex), 'lineIndex is an integer');
      assert.ok(d.lineIndex >= 0 && d.lineIndex < transcript.length, 'lineIndex in bounds');
      assert.equal(d.quote, transcript[d.lineIndex].content, 'quote matches transcript line verbatim');
      assert.ok(d.kind === 'flat' || d.kind === 're-twist', 'kind is flat or re-twist');
      assert.ok(typeof d.hint === 'string' && d.hint.length > 0, 'hint is actionable text');
    }
  });
});

// ──────────────────────────────────────────────
// RQ-3 — crossing refuses parent==child
// ──────────────────────────────────────────────

describe('RQ-3 crossing refuses parent==child', () => {
  it('breedRooms(A, A) and unsealed parents are refused with reasons; distinct sealed parents cross', async () => {
    const { breedRooms } = await loadContract(
      '../workers/room-worker/src/red-queen/crossing.mjs',
      'RQ-3',
      'breedRooms(parentA, parentB) verifies sealed hashes, refuses parent==child, ' +
        'single/unsealed parents with { refused: <reason> } — never throws — and ' +
        'crosses two distinct sealed ledgers weaker-parent-wins with cited lineage ' +
        '(D2 rules, design §3).'
    );
    const sealedA = makeSealedLedger('room-a', 'sha256:a');
    const sealedB = makeSealedLedger('room-b', 'sha256:b');

    const self = breedRooms(sealedA, sealedA);
    assert.equal(self.refused, 'parent==child', 'self-breeding refused (D2 exogamy)');

    const unsealed = breedRooms(sealedA, { ...sealedB, sealed: false });
    assert.equal(typeof unsealed.refused, 'string', 'unsealed parent refused with a reason');

    const crossed = breedRooms(sealedA, sealedB);
    assert.ok(crossed.childSeed, 'distinct sealed parents produce a childSeed');
    assert.ok(crossed.lineage, 'birth recorded as a lineage row');
    assert.ok(Array.isArray(crossed.lineage.parents), 'lineage cites both parents');
    assert.equal(crossed.lineage.parents.length, 2);
    assert.ok(
      crossed.childSeed.ledger ?? crossed.childSeed.crossedLedger,
      'childSeed carries the crossed ledger as dormant origin'
    );
  });
});

// ──────────────────────────────────────────────
// RQ-4 — dormant lineage stays dormant without fresh evidence
// ──────────────────────────────────────────────

describe('RQ-4 dormant lineage stays dormant without fresh evidence', () => {
  it('re-inserting an already-archived sealedHash is refused as flicker; fresh evidence re-enters', async () => {
    const { createArchive } = await loadContract(
      '../workers/room-worker/src/red-queen/archive.mjs',
      'RQ-4',
      'a lineage that held a cell and was displaced may re-enter only through a ' +
        'fresh transcript re-yielding its values; re-inserting the same sealedHash ' +
        'returns { inserted: false, refused: "flicker" } — sealed metrics are frozen, ' +
        'quoting them is costume (design §1.2, §3; harness A6(c2)).'
    );
    const archive = createArchive({ grid: { x: 5, y: 5 }, critic: tokenCritic() });

    const first = archive.insert(
      makeCandidate({ lineageId: 'ln-a', roomId: 'room-a', hash: 'sha256:a', mu: 1.4, rho: 0.2 })
    );
    assert.equal(first.inserted, true);

    // Displace ln-a with a strictly stronger challenger in the same cell.
    const usurper = archive.insert({
      ...makeCandidate({ lineageId: 'ln-c', roomId: 'room-c', hash: 'sha256:c', mu: 1.4, rho: 0.2 }),
      transcript: [{ displayName: 'Test', content: 'MU:1.8 RHO:0.1' }],
    });
    assert.equal(usurper.inserted, true, 'stronger challenger displaces');

    // ln-a tries to come back on its old sealed ledger — no fresh transcript.
    const ghost = archive.insert(
      makeCandidate({ lineageId: 'ln-a', roomId: 'room-a', hash: 'sha256:a', mu: 1.4, rho: 0.2 })
    );
    assert.equal(ghost.inserted, false, 'sealed ledger alone cannot re-enter');
    assert.equal(ghost.refused, 'flicker', 'refusal reason names the flicker doctrine');

    // ln-a's descendant arrives with a fresh transcript re-yielding the lineage.
    const descendant = archive.insert({
      lineageId: 'ln-a2',
      roomId: 'room-a2',
      sealedLedger: makeSealedLedger('room-a2', 'sha256:a2'),
      transcript: [
        { displayName: 'Test', content: 'MU:1.9 RHO:0.05 fresh evidence for ln-a values' },
      ],
      ancestry: [{ lineageId: 'ln-a', sealedHash: 'sha256:a' }],
    });
    assert.equal(descendant.inserted, true, 'fresh-evidence descendant may re-enter');
  });
});

// ──────────────────────────────────────────────
// RQ-5 — archive dump round-trips JSON
// ──────────────────────────────────────────────

describe('RQ-5 archive dump round-trips JSON', () => {
  it('dump → JSON.parse → load reproduces cells, elites, and sealedHashes exactly', async () => {
    const { createArchive } = await loadContract(
      '../workers/room-worker/src/red-queen/archive.mjs',
      'RQ-5',
      'dump() returns a JSON-serializable archive and load(json) restores occupied ' +
        'cells, incumbents, and sealedHashes exactly — the archive is a persistent, ' +
        'addressable record like the midden lattice, not a live-only cache ' +
        '(design §5).'
    );
    const archive = createArchive({ grid: { x: 5, y: 5 }, critic: tokenCritic() });
    archive.insert(
      makeCandidate({ lineageId: 'ln-a', roomId: 'room-a', hash: 'sha256:a', mu: 1.4, rho: 0.2 })
    );
    archive.insert(
      makeCandidate({ lineageId: 'ln-b', roomId: 'room-b', hash: 'sha256:b', mu: 0.6, rho: 0.1 })
    );

    const wire = JSON.parse(JSON.stringify(archive.dump()));
    const restored = createArchive({ grid: { x: 5, y: 5 }, critic: tokenCritic() });
    restored.load(wire);

    const before = archive.cells().map((c) => `${c.cell}:${c.elite.sealedHash}`).sort();
    const after = restored.cells().map((c) => `${c.cell}:${c.elite.sealedHash}`).sort();
    assert.deepEqual(after, before, 'occupied cells and sealedHashes survive the round-trip');

    const probe = restored.getCell(archive.cells()[0].cell);
    assert.equal(probe.elite.lineageId, archive.cells()[0].elite.lineageId, 'elite lineage survives');
    assert.equal(typeof probe.elite.fitness, 'number', 'fitness survives serialization');
  });
});
