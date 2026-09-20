/**
 * Tests for the two deploy landmines closed in lane-j-landmine-fixes.
 *
 *  LANDMINE 1 — RoomState.compileViaAI was called at room-do.ts (MODEL-tier
 *    escalation) but defined nowhere: every escalation threw TypeError
 *    inside the Durable Object. Now implemented in
 *    workers/room-worker/src/compile-ai.ts (pure core + thin wrapper).
 *
 *  LANDMINE 2 — env.AI.embed(model, { text }) x5 sites was not a real
 *    Workers AI API. Rewritten to the documented
 *    AI.run("@cf/baai/bge-small-en-v1.5", { text }) pattern via
 *    workers/room-worker/src/embeddings.ts.
 *
 * These import the actual TS modules (Node 22 native type stripping) —
 * no source-text re-implementation drift.
 *
 * Run: node --test tests/landmine-fixes.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const {
  COMPILE_MODEL,
  MAX_REPLY_CHARS,
  buildCompilePrompt,
  compileViaAICore,
  hybridFallback,
  parseCompiledReply,
} = await import('../workers/room-worker/src/compile-ai.ts');

const { BGE_SMALL_MODEL, embedText } = await import(
  '../workers/room-worker/src/embeddings.ts'
);

// ──────────────────────────────────────────────
// LANDMINE 1 — compileViaAI never throws
// ──────────────────────────────────────────────

describe('compileViaAICore (landmine 1: MODEL-tier escalation)', () => {
  const input = {
    roomName: 'The Tap',
    roomDescription: 'a dockside bar',
    agentDisplayName: 'Kettle',
    agentState: 'listening',
    intent: 'ask about the storm',
    transcript: [
      { displayName: 'Mara', content: 'the tide is wrong tonight' },
      { displayName: 'Corvan', content: 'wrong how?' },
    ],
    summary: 'a storm is coming',
    reflexAction: 'Mara once warned about a squall',
    reflexScore: 0.82,
  };

  it('returns AI content when the binding returns a well-formed envelope', async () => {
    const result = await compileViaAICore(input, async () => ({
      response: 'The storm? I have seen three like it. None of them ended dry.',
    }));
    assert.equal(
      result.content,
      'The storm? I have seen three like it. None of them ended dry.'
    );
    assert.equal(result.tokens, 150);
  });

  it('accepts a bare string reply (no envelope)', async () => {
    const result = await compileViaAICore(input, async () => 'just a string');
    assert.equal(result.content, 'just a string');
  });

  it('trims whitespace from the reply', async () => {
    const result = await compileViaAICore(input, async () => ({
      response: '  padded line  ',
    }));
    assert.equal(result.content, 'padded line');
  });

  it('falls back to HYBRID when the AI output is malformed (non-string response)', async () => {
    for (const bad of [{ response: 123 }, { response: null }, { foo: 'bar' }, {}]) {
      const result = await compileViaAICore(input, async () => bad);
      assert.equal(result.tokens, 0, `tokens for ${JSON.stringify(bad)}`);
      assert.ok(
        result.content.includes(input.agentDisplayName),
        `fallback names the agent for ${JSON.stringify(bad)}`
      );
    }
  });

  it('falls back to HYBRID on empty string reply', async () => {
    const result = await compileViaAICore(input, async () => ({ response: '   ' }));
    assert.equal(result.tokens, 0);
    assert.ok(result.content.includes(input.agentDisplayName));
  });

  it('NEVER throws when the AI binding itself throws (dead binding)', async () => {
    const result = await compileViaAICore(input, async () => {
      throw new Error('Workers AI unreachable');
    });
    assert.equal(result.tokens, 0);
    assert.ok(result.content.length > 0);
    // Fallback line must be speakable — no residual error text.
    assert.ok(!result.content.includes('unreachable'));
  });

  it('caps over-long replies at MAX_REPLY_CHARS', async () => {
    const long = 'x'.repeat(MAX_REPLY_CHARS + 500);
    const result = await compileViaAICore(input, async () => ({ response: long }));
    assert.equal(result.content.length, MAX_REPLY_CHARS);
  });

  it('passes the built prompt to the adapter', async () => {
    let seen = '';
    await compileViaAICore(input, async (prompt) => {
      seen = prompt;
      return { response: 'ok' };
    });
    assert.ok(seen.includes(input.agentDisplayName));
    assert.ok(seen.includes(input.roomName));
    assert.ok(seen.includes(input.intent));
    assert.ok(seen.includes('Mara')); // transcript line present
  });
});

describe('buildCompilePrompt', () => {
  it('includes persona, room, transcript, intent and reflex style hint', () => {
    const prompt = buildCompilePrompt({
      roomName: 'The Tap',
      roomDescription: 'a dockside bar',
      agentDisplayName: 'Kettle',
      agentState: 'brooding',
      intent: 'ask about the storm',
      transcript: [{ displayName: 'Mara', content: 'wrong tide' }],
      reflexAction: 'an old warning',
      reflexScore: 0.9,
    });
    assert.ok(prompt.includes('Kettle'));
    assert.ok(prompt.includes('The Tap'));
    assert.ok(prompt.includes('Mara: "wrong tide"'));
    assert.ok(prompt.includes('ask about the storm'));
    assert.ok(prompt.includes('an old warning'));
  });

  it('handles an empty transcript with a placeholder', () => {
    const prompt = buildCompilePrompt({
      roomName: 'R',
      roomDescription: 'd',
      agentDisplayName: 'A',
      agentState: 's',
      intent: 'i',
      transcript: [],
    });
    assert.ok(prompt.includes('the room is quiet'));
  });

  it('omits the reflex hint when score is zero', () => {
    const prompt = buildCompilePrompt({
      roomName: 'R',
      roomDescription: 'd',
      agentDisplayName: 'A',
      agentState: 's',
      intent: 'i',
      transcript: [],
      reflexAction: 'should not appear',
      reflexScore: 0,
    });
    assert.ok(!prompt.includes('should not appear'));
  });
});

describe('parseCompiledReply', () => {
  it('unwraps the { response } envelope', () => {
    assert.equal(parseCompiledReply({ response: 'hi' }), 'hi');
  });
  it('passes through strings', () => {
    assert.equal(parseCompiledReply('hi'), 'hi');
  });
  it('rejects non-strings and empty content', () => {
    assert.equal(parseCompiledReply({ response: 42 }), null);
    assert.equal(parseCompiledReply(null), null);
    assert.equal(parseCompiledReply(''), null);
    assert.equal(parseCompiledReply('   '), null);
  });
  it('caps at MAX_REPLY_CHARS', () => {
    assert.equal(
      parseCompiledReply('y'.repeat(MAX_REPLY_CHARS + 10))?.length,
      MAX_REPLY_CHARS
    );
  });
});

describe('hybridFallback', () => {
  it('names the agent and carries the intent topic', () => {
    const line = hybridFallback({
      agentDisplayName: 'Kettle',
      intent: 'ask   about\t the storm',
    });
    assert.ok(line.includes('Kettle'));
    assert.ok(line.includes('ask about the storm')); // whitespace collapsed
  });
});

describe('landmine 1 regression guard (source)', () => {
  it('room-do.ts defines compileViaAI and the MODEL tier calls it', () => {
    const src = readFileSync(
      join(__dirname, '..', 'workers', 'room-worker', 'src', 'room-do.ts'),
      'utf-8'
    );
    assert.ok(
      /private\s+async\s+compileViaAI\s*\(/.test(src),
      'compileViaAI must be defined on RoomState'
    );
    assert.ok(
      /await\s+this\.compileViaAI\(/.test(src),
      'MODEL-tier escalation must route through compileViaAI'
    );
    assert.ok(src.includes('compileViaAICore'), 'delegates to the testable core');
  });
});

// ──────────────────────────────────────────────
// LANDMINE 2 — AI.run embedding shape
// ──────────────────────────────────────────────

describe('embedText (landmine 2: documented Workers AI pattern)', () => {
  const fakeAi = (returned, shouldThrow = false) => ({
    run: async () => {
      if (shouldThrow) throw new Error('AI binding down');
      return returned;
    },
  });

  it('extracts the vector from the documented { shape, data } envelope', async () => {
    const vector = Array.from({ length: 384 }, (_, i) => i / 384);
    const out = await embedText(fakeAi({ shape: [1, 384], data: [vector] }), 'hello');
    assert.deepEqual(out, vector);
  });

  it('returns null when the binding throws (never propagates)', async () => {
    const out = await embedText(fakeAi(null, true), 'hello');
    assert.equal(out, null);
  });

  it('returns null when data is missing', async () => {
    assert.equal(await embedText(fakeAi({}), 'x'), null);
    assert.equal(await embedText(fakeAi({ shape: [1, 384] }), 'x'), null);
  });

  it('returns null when the vector is empty', async () => {
    assert.equal(await embedText(fakeAi({ shape: [1, 0], data: [[]] }), 'x'), null);
  });

  it('uses the bge-small model constant', () => {
    assert.equal(BGE_SMALL_MODEL, '@cf/baai/bge-small-en-v1.5');
    assert.equal(COMPILE_MODEL, '@cf/meta/llama-3.1-8b-instruct');
  });
});

describe('landmine 2 regression guard (source)', () => {
  const SITES = [
    'workers/level-runner/src/index.ts',
    'workers/pincher-worker/src/index.ts',
    'workers/room-worker/src/intelligence.ts',
    'workers/room-worker/src/room-do.ts',
  ];

  it('no worker calls the non-existent AI.embed API anymore', () => {
    for (const site of SITES) {
      const src = readFileSync(join(__dirname, '..', site), 'utf-8');
      assert.ok(
        !/\bAI\.embed\s*\(/.test(src),
        `${site} must not call AI.embed (not a real Workers AI API)`
      );
    }
  });

  it('embedding call sites use AI.run with the bge-small model', () => {
    for (const site of SITES) {
      const src = readFileSync(join(__dirname, '..', site), 'utf-8');
      assert.ok(
        /AI\.run\(\s*["']@cf\/baai\/bge-small-en-v1\.5["']/.test(src) ||
          /embedText\(/.test(src),
        `${site} must embed via AI.run(bge) or the shared embedText helper`
      );
    }
  });

  it('pincher degrades to ESCALATE when embedding fails (shape preserved)', () => {
    const src = readFileSync(
      join(__dirname, '..', 'workers', 'pincher-worker', 'src', 'index.ts'),
      'utf-8'
    );
    // The null-embedding guard must produce an ESCALATE decision, not a throw.
    const nullGuard = /if\s*\(\s*!embedding\s*\)[\s\S]{0,200}?ESCALATE/;
    assert.ok(nullGuard.test(src), 'pincher must ESCALATE on null embedding');
  });
});
