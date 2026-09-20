/**
 * Tests for the values ledger (lane-l-commune-deep, cut 1).
 *
 *  - Grounding: every entry cites transcript/WAL/reflex evidence verbatim.
 *  - No-invention fuzz: random transcripts must never produce an entry
 *    whose evidence cannot be verified against the sources.
 *  - Monotonicity: values accrete; entries never flicker out.
 *  - Never-throws: dead WAL, garbage input, pathological shapes.
 *  - Origin rendering: the compile-prompt block frames the ledger as
 *    the room's record, never as a costume instruction.
 *
 * Run: node --test workers/room-worker/test/values-ledger.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const {
  extractValuesLedger,
  verifyLedgerAgainstSources,
  renderLedgerAsOrigin,
  DEFAULT_MAX_LEDGER_ENTRIES,
} = await import('../src/values-ledger.ts');

// ──────────────────────────────────────────────
// Deterministic grounding
// ──────────────────────────────────────────────

describe('values ledger: grounded extraction', () => {
  it('records a refusal with the actual transcript line as evidence', () => {
    const transcript = [
      { displayName: 'Mara', content: 'what ship did you lose?' },
      { displayName: 'Corvan', content: "I won't say what ship sank out there." },
    ];
    const ledger = extractValuesLedger({ transcript });
    assert.ok(ledger.entries.length >= 1);
    const refusal = ledger.entries.find((e) => e.id.startsWith('refusal:'));
    assert.ok(refusal, 'expected a refusal entry');
    assert.ok(
      refusal.evidence.some(
        (ev) => ev.source === 'transcript' && ev.quote === transcript[1].content
      )
    );
    assert.deepStrictEqual(
      verifyLedgerAgainstSources(ledger, transcript),
      []
    );
  });

  it('groups two refusals of the same shape into ONE entry with two citations', () => {
    const transcript = [
      { displayName: 'Corvan', content: "I won't name the drowned ship." },
      { displayName: 'Mara', content: 'was it the Meridian?' },
      { displayName: 'Corvan', content: "I won't name it, Mara." },
    ];
    const ledger = extractValuesLedger({ transcript });
    const refusals = ledger.entries.filter((e) => e.id.startsWith('refusal:corvan:'));
    // both refusals share topic key 'name' (top content word) → one entry
    assert.equal(refusals.length, 1);
    assert.ok(refusals[0].evidence.length >= 2);
    assert.ok(refusals[0].strength > 0.5, 'repeated evidence accretes strength');
    assert.deepStrictEqual(verifyLedgerAgainstSources(ledger, transcript), []);
  });

  it('records pours before being asked, citing the pour turns', () => {
    const transcript = [
      { displayName: 'Wesley', content: '*pours another glass without asking*' },
      { displayName: 'Mara', content: 'the tide is wrong tonight' },
      { displayName: 'Wesley', content: '*refills the mug before being asked*' },
    ];
    const ledger = extractValuesLedger({ transcript });
    const pour = ledger.entries.find((e) => e.id.startsWith('pour:wesley'));
    assert.ok(pour, 'expected a pour entry');
    assert.equal(pour.evidence.length, 2);
    assert.deepStrictEqual(verifyLedgerAgainstSources(ledger, transcript), []);
  });

  it('records a pincher reflex firing as ONE ledger entry (datum, not costume)', () => {
    const transcript = [
      { displayName: 'Mara', content: 'storm is coming' },
    ];
    const events = [
      { action: '*bolts the shutters*', triggerLineIndex: 0, atTurn: 1 },
    ];
    const ledger = extractValuesLedger({ transcript, reflexEvents: events });
    const reflex = ledger.entries.find((e) => e.id.startsWith('reflex:'));
    assert.ok(reflex, 'reflex firing must become a ledger entry');
    assert.ok(reflex.evidence.some((ev) => ev.source === 'reflex'));
    assert.ok(
      reflex.evidence.some(
        (ev) => ev.source === 'transcript' && ev.quote === 'storm is coming'
      )
    );
    assert.deepStrictEqual(
      verifyLedgerAgainstSources(ledger, transcript, [], events),
      []
    );
  });

  it('rides WAL facts in as entries citing fact + pinned transcript line', () => {
    const transcript = [{ displayName: 'Mara', content: 'the ledger remembers' }];
    const walFacts = [
      { id: 'wal-1', kind: 'commitment', text: 'promised to keep the light on', transcriptRef: 0 },
    ];
    const ledger = extractValuesLedger({ transcript, walFacts });
    const fromWal = ledger.entries.find((e) => e.id.startsWith('wal:'));
    assert.ok(fromWal, 'WAL fact must become an entry');
    assert.deepStrictEqual(
      verifyLedgerAgainstSources(ledger, transcript, walFacts),
      []
    );
  });

  it('detects a recurring topic after three carries of the same word', () => {
    const transcript = [
      { displayName: 'Mara', content: 'the foghorns lied again' },
      { displayName: 'Corvan', content: 'what about the foghorns?' },
      { displayName: 'Mara', content: 'foghorns always lie when the barometer falls' },
    ];
    const ledger = extractValuesLedger({ transcript });
    const rec = ledger.entries.find((e) => e.id.startsWith('returns:'));
    assert.ok(rec, 'expected a recurring-topic entry');
    assert.ok(rec.evidence.length >= 3);
    assert.deepStrictEqual(verifyLedgerAgainstSources(ledger, transcript), []);
  });
});

// ──────────────────────────────────────────────
// Monotonicity
// ──────────────────────────────────────────────

describe('values ledger: monotonic accretion', () => {
  it('entries persist across extractions and gain evidence, never flicker', () => {
    const t1 = [{ displayName: 'Corvan', content: "I won't name the drowned ship." }];
    const l1 = extractValuesLedger({ transcript: t1, turn: 1 });
    assert.equal(l1.entries.length, 1);

    const t2 = [
      ...t1,
      { displayName: 'Mara', content: 'was it the Meridian?' },
      { displayName: 'Corvan', content: "I won't name it, Mara." },
    ];
    const l2 = extractValuesLedger({ transcript: t2, turn: 3, previous: l1 });
    const refusal = l2.entries.find((e) => e.id === l1.entries[0].id);
    assert.ok(refusal, 'entry from turn 1 must survive');
    assert.ok(refusal.evidence.length >= 2, 'evidence accretes');
    assert.ok(refusal.strength >= l1.entries[0].strength);
    assert.equal(refusal.firstSeenTurn, l1.entries[0].firstSeenTurn);
  });

  it('a quiet turn changes nothing (empty transcript adds nothing)', () => {
    const t = [{ displayName: 'Mara', content: 'quiet night' }];
    const l1 = extractValuesLedger({ transcript: t, turn: 1 });
    const l2 = extractValuesLedger({ transcript: t, turn: 2, previous: l1 });
    assert.deepStrictEqual(l2.entries, l1.entries);
    assert.equal(l2.truncated, l1.truncated);
  });

  it('cap eviction is reported via truncated, and evicts weakest-first', () => {
    const topics = ['lighthouse', 'harbor', 'postern', 'beacon', 'pier'];
    const big = [];
    for (let i = 0; i < 20; i++) {
      const w = topics[i % topics.length];
      big.push({
        displayName: `Agent${i}`,
        content: `I will keep the ${w} lit, the ${w} vow`,
      });
    }
    const ledger = extractValuesLedger({ transcript: big, maxEntries: 5 });
    assert.equal(ledger.entries.length, 5);
    assert.equal(ledger.truncated, true);
    // sorted strongest-first → each survivor at least as strong as the next
    for (let i = 1; i < ledger.entries.length; i++) {
      assert.ok(ledger.entries[i - 1].strength >= ledger.entries[i].strength);
    }
    assert.deepStrictEqual(verifyLedgerAgainstSources(ledger, big), []);
  });

  it('defaults to DEFAULT_MAX_LEDGER_ENTRIES', () => {
    const big = [];
    for (let i = 0; i < DEFAULT_MAX_LEDGER_ENTRIES + 10; i++) {
      big.push({
        displayName: 'A',
        content: `I will keep the vow${i} lit, the vow${i} promise`,
      });
    }
    const ledger = extractValuesLedger({ transcript: big });
    assert.ok(ledger.entries.length <= DEFAULT_MAX_LEDGER_ENTRIES);
    assert.equal(ledger.truncated, true);
  });
});

// ──────────────────────────────────────────────
// Never throws
// ──────────────────────────────────────────────

describe('values ledger: honest degradation', () => {
  it('dead WAL (undefined) yields transcript-only ledger', () => {
    const transcript = [{ displayName: 'M', content: "I won't say." }];
    const ledger = extractValuesLedger({ transcript, walFacts: undefined });
    assert.equal(ledger.entries.length, 1);
    assert.deepStrictEqual(verifyLedgerAgainstSources(ledger, transcript), []);
  });

  it('garbage WAL facts are dropped, not propagated', () => {
    const transcript = [{ displayName: 'M', content: 'evening' }];
    const ledger = extractValuesLedger({
      transcript,
      walFacts: [
        null,
        { id: 'x', kind: 'k', text: '' },
        { id: 'y', kind: 'k', text: '   ' },
        { id: 'z', kind: 'k', text: 42 },
      ],
    });
    assert.equal(ledger.entries.filter((e) => e.id.startsWith('wal:')).length, 0);
    assert.deepStrictEqual(verifyLedgerAgainstSources(ledger, transcript), []);
  });

  it('reflex with out-of-range triggerLineIndex still grounds on the action', () => {
    const transcript = [{ displayName: 'M', content: 'hi' }];
    const events = [{ action: '*locks the door*', triggerLineIndex: 99, atTurn: 5 }];
    const ledger = extractValuesLedger({ transcript, reflexEvents: events });
    assert.equal(ledger.entries.length, 1);
    assert.deepStrictEqual(
      verifyLedgerAgainstSources(ledger, transcript, [], events),
      []
    );
  });

  it('pathological inputs return previous ledger or empty — never throw', () => {
    assert.doesNotThrow(() => extractValuesLedger({}));
    assert.doesNotThrow(() => extractValuesLedger({ transcript: null }));
    assert.doesNotThrow(() =>
      extractValuesLedger({ transcript: [{ displayName: 7, content: {} }] })
    );
    const prev = extractValuesLedger({
      transcript: [{ displayName: 'M', content: "I won't say." }],
    });
    const r = extractValuesLedger({ transcript: null, previous: prev });
    assert.deepStrictEqual(r.entries, prev.entries);
  });
});

// ──────────────────────────────────────────────
// No-invention fuzz
// ──────────────────────────────────────────────

// Deterministic PRNG (mulberry32) so fuzz failures are reproducible.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FUZZ_WORDS = [
  'harbor', 'ship', 'storm', 'ledger', 'gate', 'promise', 'glass', 'beer',
  'foghorn', 'tide', 'meridian', 'wesley', 'mara', 'corvan', 'light',
  'anchor', 'rope', 'kraken', 'shanty', 'dawn', 'squall', 'reef', 'lantern',
];

function randomLine(rnd) {
  const n = 1 + Math.floor(rnd() * 6);
  const words = [];
  for (let i = 0; i < n; i++) words.push(FUZZ_WORDS[Math.floor(rnd() * FUZZ_WORDS.length)]);
  return words.join(' ');
}

describe('values ledger: no-invention fuzz', () => {
  it('200 seeded random transcripts → every entry verifiable or absent', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rnd = mulberry32(seed);
      const len = Math.floor(rnd() * 30);
      const transcript = [];
      for (let i = 0; i < len; i++) {
        transcript.push({
          displayName: ['Mara', 'Corvan', 'Wesley'][Math.floor(rnd() * 3)],
          content: randomLine(rnd),
        });
      }
      // Occasionally inject structured shapes and WAL/reflex noise.
      const walFacts =
        rnd() > 0.7
          ? [{ id: `w${seed}`, kind: 'note', text: randomLine(rnd) }]
          : [];
      const reflexEvents =
        rnd() > 0.8
          ? [{ action: `*${randomLine(rnd)}*`, triggerLineIndex: Math.floor(rnd() * Math.max(1, len)), atTurn: len }]
          : [];

      let ledger;
      assert.doesNotThrow(() => {
        ledger = extractValuesLedger({ transcript, walFacts, reflexEvents });
      });
      const violations = verifyLedgerAgainstSources(ledger, transcript, walFacts, reflexEvents);
      assert.deepStrictEqual(
        violations,
        [],
        `seed ${seed}: invented evidence → ${violations.join(' | ')}`
      );
    }
  });

  it('fuzz with pathological junk mixed in still grounds everything', () => {
    for (let seed = 1000; seed < 1050; seed++) {
      const rnd = mulberry32(seed);
      const transcript = [];
      for (let i = 0; i < 15; i++) {
        const roll = rnd();
        if (roll < 0.15) transcript.push({ displayName: 'Mara', content: '' });
        else if (roll < 0.3) transcript.push({ displayName: '', content: 'I will keep the lantern lit' });
        else transcript.push({ displayName: 'Corvan', content: randomLine(rnd) });
      }
      const ledger = extractValuesLedger({ transcript });
      const violations = verifyLedgerAgainstSources(ledger, transcript);
      assert.deepStrictEqual(violations, [], `seed ${seed}: ${violations.join(' | ')}`);
    }
  });
});

// ──────────────────────────────────────────────
// Origin rendering (never costume)
// ──────────────────────────────────────────────

describe('values ledger: origin framing for compile prompts', () => {
  it('renders entries as the room\'s record with quoted evidence', () => {
    const transcript = [
      { displayName: 'Corvan', content: "I won't name the drowned ship." },
    ];
    const ledger = extractValuesLedger({ transcript });
    const block = renderLedgerAsOrigin(ledger);
    assert.match(block, /record/i);
    assert.match(block, /origins, not instructions/);
    assert.match(block, /I won't name the drowned ship\./);
    assert.match(block, /Speak from this record/);
  });

  it('never instructs the model to "sound like" — no costume language', () => {
    const transcript = [
      { displayName: 'Corvan', content: "I won't name the drowned ship." },
      { displayName: 'Wesley', content: '*pours a glass*' },
    ];
    const ledger = extractValuesLedger({ transcript });
    const block = renderLedgerAsOrigin(ledger);
    assert.doesNotMatch(block, /sound like/i);
    assert.doesNotMatch(block, /you should/i);
    assert.doesNotMatch(block, /style hint/i);
    assert.doesNotMatch(block, /in the style of/i);
  });

  it('renders nothing for an empty ledger', () => {
    assert.equal(renderLedgerAsOrigin({ entries: [], truncated: false }), '');
  });
});
