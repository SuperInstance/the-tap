/**
 * Tests for the COMPILE_MODEL env binding (lane-l-commune-deep, cut 2).
 *
 *  - default when env unset / null / empty / whitespace
 *  - override when env.COMPILE_MODEL is a usable string
 *  - never throws on garbage env
 *  - invalid model degrades that turn to HYBRID (binding-error path),
 *    verified end-to-end through compileViaAICore with a binding-faithful mock
 *
 * Run: node --test workers/room-worker/test/compile-model.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { COMPILE_MODEL, resolveCompileModel, compileViaAICore, hybridFallback } =
  await import('../src/compile-ai.ts');

const baseInput = {
  roomName: 'The Tap',
  roomDescription: 'a dockside bar',
  agentDisplayName: 'Kettle',
  agentState: 'listening',
  intent: 'ask about the storm',
  transcript: [{ displayName: 'Mara', content: 'wrong tide' }],
};

describe('resolveCompileModel', () => {
  it('returns the hardcoded default when env is undefined', () => {
    assert.equal(resolveCompileModel(undefined), COMPILE_MODEL);
  });

  it('returns the default when env is null', () => {
    assert.equal(resolveCompileModel(null), COMPILE_MODEL);
  });

  it('returns the default when env.COMPILE_MODEL is undefined', () => {
    assert.equal(resolveCompileModel({}), COMPILE_MODEL);
  });

  it('returns the default when env.COMPILE_MODEL is empty or whitespace', () => {
    assert.equal(resolveCompileModel({ COMPILE_MODEL: '' }), COMPILE_MODEL);
    assert.equal(resolveCompileModel({ COMPILE_MODEL: '   ' }), COMPILE_MODEL);
  });

  it('returns the override when set to a usable string', () => {
    assert.equal(
      resolveCompileModel({ COMPILE_MODEL: '@cf/meta/llama-3.3-70b-instruct' }),
      '@cf/meta/llama-3.3-70b-instruct'
    );
  });

  it('trims the override', () => {
    assert.equal(
      resolveCompileModel({ COMPILE_MODEL: '  @cf/meta/llama-3.3-70b-instruct  ' }),
      '@cf/meta/llama-3.3-70b-instruct'
    );
  });

  it('returns the default when the override is absurdly long', () => {
    assert.equal(
      resolveCompileModel({ COMPILE_MODEL: 'x'.repeat(500) }),
      COMPILE_MODEL
    );
  });

  it('never throws on garbage env shapes', () => {
    assert.doesNotThrow(() => resolveCompileModel({ COMPILE_MODEL: 42 }));
    assert.doesNotThrow(() => resolveCompileModel({ COMPILE_MODEL: {} }));
    assert.doesNotThrow(() =>
      resolveCompileModel({ get COMPILE_MODEL() { throw new Error('poison'); } })
    );
    // poisoned getter degrades to default
    assert.equal(
      resolveCompileModel({ get COMPILE_MODEL() { throw new Error('poison'); } }),
      COMPILE_MODEL
    );
  });
});

describe('invalid model degrades to HYBRID (never throws)', () => {
  it('a binding-faithful mock that rejects unknown models yields the HYBRID fallback', async () => {
    const KNOWN = new Set([COMPILE_MODEL]);
    const bindingFaithfulRun = async (model) => {
      if (!KNOWN.has(model)) {
        throw new Error(`404: model not found: ${model}`);
      }
      return { response: 'should never get here' };
    };

    const badModel = resolveCompileModel({ COMPILE_MODEL: 'not-a-real-model' });
    const result = await compileViaAICore(baseInput, bindingFaithfulRun);
    assert.equal(result.tokens, 0);
    assert.equal(result.content, hybridFallback(baseInput));
  });

  it('default model against a healthy binding compiles normally', async () => {
    const model = resolveCompileModel({});
    assert.equal(model, COMPILE_MODEL);
    const result = await compileViaAICore(baseInput, async () => ({
      response: 'the storm broke three ships out past the reef',
    }));
    assert.equal(result.tokens, 150);
    assert.match(result.content, /three ships/);
  });
});
