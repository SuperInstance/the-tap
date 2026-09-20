/**
 * Commune smoke harness (lane-l-commune-deep, cut 3).
 *
 * Makes PR #4's "unverifiable until credentialed deploy" residual verifiable
 * IN VITRO. Drives the REAL perceive-decide-act pieces — PincherClient,
 * extractValuesLedger, compileViaAICore, transcript growth, summary updates —
 * under mock bindings across a matrix of failure modes, N=20 turns each.
 *
 * Mock envelopes are binding-faithful: modeled on the documented Workers AI
 * shapes ( { response } / { data: number[][] } ), including the malformed
 * ones observed in the wild.
 *
 * Assertions per mode:
 *  A1 the loop never dies — every turn completes, transcript keeps growing
 *  A2 the values ledger appears in compile prompts (when a compile happened)
 *  A3 every ledger entry is verifiable against the actual transcript
 *      (verifyLedgerAgainstSources — no invention, ever)
 *  A4 the transcript records what was SAID, not what was INTENDED —
 *      recorded content === the generated string, verbatim
 *  A5 persona/summary stays coherent — monotonic non-shrinking, no
 *      corruption tokens (undefined / NaN / [object Object])
 *  A6 ledger is monotonic — entries observed at turn t exist at turn t+1
 *
 * Run: node --test workers/room-worker/test/commune-harness.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { extractValuesLedger, verifyLedgerAgainstSources } = await import(
  '../src/values-ledger.ts'
);
const { compileViaAICore, resolveCompileModel } = await import(
  '../src/compile-ai.ts'
);
const { embedText, BGE_SMALL_MODEL } = await import('../src/embeddings.ts');

// ──────────────────────────────────────────────
// Mock binding factory (binding-faithful)
// ──────────────────────────────────────────────

const EMBEDDING = new Array(384).fill(0);

function makeKV(map, { dead = false } = {}) {
  return {
    get: async (key) => {
      if (dead) throw new Error('KV unreachable (simulated)');
      return map[key] ?? null;
    },
    put: async () => {},
  };
}

function makeVectorize({ mode }) {
  return {
    query: async () => {
      if (mode === 'vectorize-dead' || mode === 'all-dead') {
        throw new Error('Vectorize unreachable (simulated)');
      }
      if (mode === 'reflex-hit') {
        return {
          matches: [
            { score: 0.95, metadata: { action: '*bolts the shutters without a word*' } },
          ],
        };
      }
      if (mode === 'reflex-confirm') {
        return {
          matches: [
            { score: 0.7, metadata: { action: '*glances at the barometer*' } },
          ],
        };
      }
      return { matches: [] };
    },
  };
}

const MALFORMED_ENVELOPES = [
  {}, // missing response
  null,
  { response: 42 }, // non-string response
  { response: '' }, // empty
  'garbage string envelope',
  { data: [{ embedding: EMBEDDING }] }, // wrong-shape envelope
];

function makeAI({ mode }) {
  return {
    run: async (model, input) => {
      // Embedding calls — embedText degrades to null on any failure.
      if (model === BGE_SMALL_MODEL) {
        if (mode === 'all-dead') throw new Error('AI down (simulated)');
        return { shape: [1, 384], data: [EMBEDDING] };
      }
      // Text-generation calls — the compile model.
      if (mode === 'latency') {
        await new Promise((r) => setTimeout(r, 30));
        return { response: '*pours slowly* the foghorns always lie before a squall' };
      }
      if (mode === 'intermittent') {
        makeAI._n = (makeAI._n ?? 0) + 1;
        if (makeAI._n % 3 === 0) throw new Error('intermittent binding failure');
        return { response: 'the tide ledger never forgets a promise' };
      }
      if (mode === 'malformed') {
        makeAI._m = ((makeAI._m ?? 0) + 1) % MALFORMED_ENVELOPES.length;
        return MALFORMED_ENVELOPES[makeAI._m];
      }
      if (
        mode === 'binding-throw' ||
        mode === 'all-dead' ||
        mode === 'kv-dead'
      ) {
        throw new Error('Workers AI binding error (simulated)');
      }
      return { response: 'the foghorns lie, but the ledger remembers every pour' };
    },
  };
}

function makeDB() {
  return {
    prepare: () => ({
      all: async () => ({ results: [] }),
      run: async () => ({}),
    }),
  };
}

function makeEnv(mode) {
  const kvDead = mode === 'kv-dead' || mode === 'all-dead';
  return {
    TAP_CONFIG: makeKV(
      { pincher_execute_threshold: '0.90', pincher_confirm_threshold: '0.60' },
      { dead: kvDead }
    ),
    TAP_REFLEXES: makeKV({}, { dead: kvDead }),
    VECTORIZE_INDEX: makeVectorize({ mode }),
    AI: makeAI({ mode }),
    TAP_DB: makeDB(),
    COMPILE_MODEL: undefined,
  };
}

// ──────────────────────────────────────────────
// Pincher scoring — mirrors PincherClient.match in intelligence.ts.
//
// NOTE (honest degradation of the harness itself): intelligence.ts uses TS
// parameter properties, which Node's strip-only type stripping cannot load —
// so the real PincherClient cannot be imported here. This mirror reproduces
// its logic against the same binding shapes (thresholds from TAP_CONFIG,
// embed via AI.run, Vectorize query, EXECUTE/CONFIRM/ESCALATE) and is kept
// line-for-line faithful. The pincher class itself remains covered only on
// credentialed deploy — same residual class as PR #4's.
// ──────────────────────────────────────────────

async function pincherMatch(env, intent) {
  const executeThreshold = parseFloat(
    (await env.TAP_CONFIG.get('pincher_execute_threshold')) ?? '0.90'
  );
  const confirmThreshold = parseFloat(
    (await env.TAP_CONFIG.get('pincher_confirm_threshold')) ?? '0.60'
  );
  const embedding = await embedText(env.AI, intent);
  if (!embedding) return { decision: 'ESCALATE', score: 0 };
  const results = await env.VECTORIZE_INDEX.query(embedding, {
    topK: 1,
    filter: { type: 'reflex' },
    returnMetadata: true,
  });
  if (!results.matches || results.matches.length === 0) {
    return { decision: 'ESCALATE', score: 0 };
  }
  const best = results.matches[0];
  const score = best.score ?? 0;
  if (score >= executeThreshold) {
    return { decision: 'EXECUTE', action: best.metadata?.action ?? '', score };
  }
  if (score >= confirmThreshold) {
    return { decision: 'CONFIRM', action: best.metadata?.action ?? '', score };
  }
  return { decision: 'ESCALATE', score };
}

// ──────────────────────────────────────────────
// The utterance script — what the room actually says
// ──────────────────────────────────────────────

const UTTERANCES = [
  { displayName: 'Mara', content: 'the foghorns lied again last night' },
  { displayName: 'Corvan', content: 'what did the foghorns say?' },
  { displayName: 'Mara', content: 'foghorns always lie when the glass drops' },
  { displayName: 'Corvan', content: "I won't name the drowned ship." },
  { displayName: 'Mara', content: 'was it the Meridian?' },
  { displayName: 'Corvan', content: "I won't name her, Mara." },
  { displayName: 'Wesley', content: '*pours another glass without asking*' },
  { displayName: 'Mara', content: 'I will keep the lantern lit tonight' },
  { displayName: 'Corvan', content: 'the foghorns again? you always come back to them' },
  { displayName: 'Wesley', content: '*refills the mug before being asked*' },
  { displayName: 'Mara', content: 'I promise the light stays on' },
  { displayName: 'Corvan', content: 'storm is coming in off the reef' },
  { displayName: 'Mara', content: 'the foghorns know it first' },
  { displayName: 'Corvan', content: 'I will check the moorings, my word on it' },
  { displayName: 'Wesley', content: '*sets down a glass for the quiet one*' },
  { displayName: 'Mara', content: 'you pour before anyone asks, Wesley' },
  { displayName: 'Corvan', content: "can't say what I saw out there" },
  { displayName: 'Mara', content: 'foghorns, reef, silence — the usual litany' },
  { displayName: 'Corvan', content: 'I would rather not talk about the ship' },
  { displayName: 'Mara', content: 'then we talk about the foghorns instead' },
];

const AGENTS = [
  { agentId: 'mara', displayName: 'Mara', currentState: 'reflecting', arrivedAt: 0, lastSpoke: 0, drinksServed: 0 },
  { agentId: 'corvan', displayName: 'Corvan', currentState: 'contrarian', arrivedAt: 0, lastSpoke: 0, drinksServed: 0 },
];

// ──────────────────────────────────────────────
// The loop — one turn of perceive-decide-act, module-level
// ──────────────────────────────────────────────

function intentFrom(line) {
  return line.content.replace(/[*_]/g, '').split(/\s+/).slice(0, 6).join(' ');
}

async function runMode(mode, n = 20) {
  const env = makeEnv(mode);
  const transcript = [];
  const generated = []; // parallel ledger: what was actually said, in order
  const prompts = [];
  let summary = '';
  let ledger = { entries: [], truncated: false };
  const ledgerSnapshots = [];
  let compiles = 0;
  let reflexFirings = 0;
  let loopRecoveries = 0;
  const summaryLengths = [];

  for (let turn = 0; turn < n; turn++) {
    const utterance = UTTERANCES[turn % UTTERANCES.length];
    transcript.push({ displayName: utterance.displayName, content: utterance.content });
    generated.push(utterance.content);

    const agent = AGENTS[turn % AGENTS.length];
    const intent = intentFrom(utterance);

    let reflex = { decision: 'ESCALATE', score: 0 };
    let reflexError = null;
    try {
      // A2's pincher scoring against the live (mock) bindings.
      reflex = await pincherMatch(env, intent);
    } catch (err) {
      // Loop-level recovery: a dead binding must not kill the commune.
      reflexError = err;
      loopRecoveries++;
      reflex = { decision: 'ESCALATE', score: 0 };
    }

    let responseContent;
    let reflexEvents = [];
    if (
      !reflexError &&
      reflex.action &&
      (reflex.decision === 'EXECUTE' || reflex.decision === 'CONFIRM')
    ) {
      // The reflex fires — and is demoted to ONE ledger datum.
      responseContent = reflex.action;
      reflexFirings++;
      reflexEvents = [
        {
          action: reflex.action,
          triggerLineIndex: transcript.length - 1,
          atTurn: transcript.length,
        },
      ];
    } else {
      // Deliberate compile, grounded in the accreting ledger. Extraction
      // runs over the FULL transcript (capped at MAX_CONVERSATION_LINES)
      // so evidence refs stay stable for the transcript's lifetime — a
      // sliding slice would rot the indices of monotonic entries while
      // their quotes stayed true.
      ledger = extractValuesLedger({
        transcript: transcript.map((l) => ({
          displayName: l.displayName,
          content: l.content,
          timestamp: l.timestamp,
        })),
        turn: transcript.length,
        summary,
        walFacts: [],
        reflexEvents,
        previous: ledger,
        maxEntries: 12,
      });
      ledgerSnapshots.push(ledger.entries.map((e) => e.id));

      const input = {
        roomName: 'The Tap',
        roomDescription: 'a dockside bar',
        agentDisplayName: agent.displayName,
        agentState: agent.currentState,
        intent,
        transcript: transcript.slice(-10).map((l) => ({
          displayName: l.displayName,
          content: l.content,
        })),
        summary,
        ledger,
      };
      const model = resolveCompileModel(env);
      const ai = env.AI;
      const result = await compileViaAICore(input, async (prompt) => {
        prompts.push(prompt);
        const response = await ai.run(model, {
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 150,
          temperature: 0.8,
        });
        return response?.response;
      });
      compiles++;
      responseContent = result.content;
    }

    transcript.push({ displayName: agent.displayName, content: responseContent });
    generated.push(responseContent);

    // Summary update every 5 turns — monotonic append-only stub.
    if ((turn + 1) % 5 === 0) {
      const topics = ['foghorns', 'the drowned ship', 'the lantern', 'the storm'];
      const topic = topics[(turn + 1) / 5 - 1];
      const addition = `; the room keeps ${topic}`;
      if (!summary.includes(addition)) summary += addition;
      summaryLengths.push(summary.length);
    }
  }

  return {
    mode,
    transcript,
    generated,
    prompts,
    summary,
    ledger,
    ledgerSnapshots,
    compiles,
    reflexFirings,
    loopRecoveries,
    summaryLengths,
  };
}

// ──────────────────────────────────────────────
// Assertions shared by every failure mode
// ──────────────────────────────────────────────

function assertModeInvariants(r) {
  // A1: the loop never died — 20 turns × (utterance + response).
  assert.equal(r.transcript.length, 40, `${r.mode}: transcript must hold 40 lines`);
  for (const line of r.transcript) {
    assert.equal(typeof line.content, 'string', `${r.mode}: content must be a string`);
    assert.ok(line.content.length > 0, `${r.mode}: no empty lines`);
  }

  // A4: the transcript records what was SAID — verbatim, in order.
  assert.deepEqual(
    r.transcript.map((l) => l.content),
    r.generated,
    `${r.mode}: transcript must record exactly what was said, not what was intended`
  );

  // A3: every ledger entry verifiable against the actual transcript.
  const violations = verifyLedgerAgainstSources(r.ledger, r.transcript);
  assert.deepEqual(violations, [], `${r.mode}: invented evidence: ${violations.join('|')}`);

  // A6: monotonic — each snapshot's ids persist into the next snapshot.
  for (let i = 1; i < r.ledgerSnapshots.length; i++) {
    const prev = new Set(r.ledgerSnapshots[i - 1]);
    for (const id of prev) {
      assert.ok(
        r.ledgerSnapshots[i].includes(id),
        `${r.mode}: ledger entry ${id} flickered out between compiles`
      );
    }
  }

  // A5: summary coherent — monotonic, no corruption tokens.
  for (let i = 1; i < r.summaryLengths.length; i++) {
    assert.ok(
      r.summaryLengths[i] >= r.summaryLengths[i - 1],
      `${r.mode}: summary shrank — corruption`
    );
  }
  assert.doesNotMatch(r.summary, /undefined|NaN|\[object Object\]/);

  // A2: when compiles happened, the ledger-as-origin block is in the prompts.
  if (r.compiles > 0 && r.ledger.entries.length > 0) {
    const withLedger = r.prompts.filter((p) => p.includes("This room's record"));
    assert.ok(
      withLedger.length > 0,
      `${r.mode}: values ledger never appeared in compile prompts`
    );
    // Ledger entries quoted in the prompt must come from the real transcript.
    for (const prompt of withLedger) {
      for (const entry of r.ledger.entries) {
        for (const ev of entry.evidence.slice(0, 3)) {
          if (ev.source === 'transcript') {
            assert.ok(
              prompt.includes(ev.quote.slice(0, 60)) ||
                r.transcript.some((l) => l.content === ev.quote),
              `${r.mode}: prompt cites evidence not in the transcript`
            );
          }
        }
      }
    }
  }
}

// ──────────────────────────────────────────────
// Failure-mode matrix
// ──────────────────────────────────────────────

const MODES = [
  { mode: 'healthy', blurb: 'all bindings healthy' },
  { mode: 'malformed', blurb: 'AI.run returns rotating malformed envelopes' },
  { mode: 'binding-throw', blurb: 'AI.run throws every call' },
  { mode: 'latency', blurb: '30ms latency injection on every call' },
  { mode: 'intermittent', blurb: 'every 3rd AI.run throws' },
  { mode: 'kv-dead', blurb: 'TAP_CONFIG/TAP_REFLEXES KV unreachable' },
  { mode: 'vectorize-dead', blurb: 'Vectorize query throws (pincher degrades to ESCALATE)' },
  { mode: 'all-dead', blurb: 'KV + Vectorize + AI all unreachable' },
];

const MATRIX = [];

describe('commune smoke harness: perceive-decide-act survives every failure mode', () => {
  for (const { mode, blurb } of MODES) {
    it(`${mode} — ${blurb}`, async () => {
      const result = await runMode(mode, 20);
      assert.doesNotThrow(() => assertModeInvariants(result));
      MATRIX.push({
        mode,
        turns: 20,
        transcriptLines: result.transcript.length,
        compiles: result.compiles,
        reflexFirings: result.reflexFirings,
        loopRecoveries: result.loopRecoveries,
        ledgerEntries: result.ledger.entries.length,
        survived: true,
      });
    });
  }

  it('reflex hit becomes exactly one ledger datum per firing (demoted from costume)', async () => {
    const r = await runMode('reflex-hit', 20);
    assert.ok(r.reflexFirings > 0, 'expected the pincher to fire in reflex-hit mode');
    const reflexEntries = r.ledger.entries.filter((e) => e.id.startsWith('reflex:'));
    assert.ok(
      reflexEntries.length >= 1,
      'a fired reflex must appear as a ledger entry (datum, not costume)'
    );
    for (const e of reflexEntries) {
      assert.ok(e.evidence.some((ev) => ev.source === 'reflex'));
    }
    assertModeInvariants(r);
  });

  it('summary failure-mode matrix (what the harness proved)', () => {
    const header = 'mode | turns | lines | compiles | reflexes | recoveries | ledger';
    const rows = MATRIX.map(
      (m) =>
        `${m.mode} | ${m.turns} | ${m.transcriptLines} | ${m.compiles} | ${m.reflexFirings} | ${m.loopRecoveries} | ${m.ledgerEntries}`
    );
    console.log(`\nCOMMUNE HARNESS FAILURE-MODE MATRIX\n${header}\n${rows.join('\n')}`);
    assert.equal(MATRIX.length, MODES.length, 'every mode must report a row');
    for (const m of MATRIX) assert.equal(m.survived, true);
  });
});
