/**
 * pincher-worker — The reflex shell on Cloudflare.
 *
 * Ported from tap-reflex (Rust). Vector-match incoming utterances
 * against known patterns. <50ms for known patterns. 0 tokens.
 * Only escalate to full LLM when genuinely novel.
 *
 * Architecture:
 *   1. Embed input via Workers AI (bge-small-en-v1.5, 384 dims)
 *   2. Query Vectorize for nearest stored reflex
 *   3. Return Execute / Confirm / Escalate decision
 *   4. Learning: novel utterances compiled by Workers AI get stored as reflexes
 */

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/match") {
      const { intent } = await request.json<{ intent: string }>();
      const result = await this.match(intent, env);
      return Response.json(result);
    }

    if (url.pathname === "/learn") {
      const { trigger, action } = await request.json<{ trigger: string; action: string }>();
      await this.learn(trigger, action, env);
      return Response.json({ ok: true });
    }

    if (url.pathname === "/health") {
      return Response.json({ status: "ok", service: "pincher-worker" });
    }

    return new Response("Not found", { status: 404 });
  },

  async match(
    intent: string,
    env: Env
  ): Promise<{
    decision: "EXECUTE" | "CONFIRM" | "ESCALATE";
    action: string;
    score: number;
    elapsedMs: number;
  }> {
    const start = Date.now();

    const executeThreshold = parseFloat(
      (await env.TAP_CONFIG.get("pincher_execute_threshold")) ?? "0.90"
    );
    const confirmThreshold = parseFloat(
      (await env.TAP_CONFIG.get("pincher_confirm_threshold")) ?? "0.60"
    );

    // Embed the intent
    const embedding = await env.AI.embed(
      ["@cf/baai/bge-small-en-v1.5"],
      { text: intent }
    );

    if (!embedding.data?.[0]) {
      return {
        decision: "ESCALATE",
        action: "",
        score: 0,
        elapsedMs: Date.now() - start,
      };
    }

    // Query Vectorize for nearest reflex
    const results = await env.VECTORIZE_INDEX.query(embedding.data[0], {
      topK: 1,
      filter: { type: "reflex" },
      returnMetadata: true,
    });

    const best = results.matches?.[0];
    const score = best?.score ?? 0;

    let decision: "EXECUTE" | "CONFIRM" | "ESCALATE";
    if (score >= executeThreshold) {
      decision = "EXECUTE";
    } else if (score >= confirmThreshold) {
      decision = "CONFIRM";
    } else {
      decision = "ESCALATE";
    }

    return {
      decision,
      action: (best?.metadata?.action as string) ?? "",
      score,
      elapsedMs: Date.now() - start,
    };
  },

  async learn(trigger: string, action: string, env: Env): Promise<void> {
    const embedding = await env.AI.embed(
      ["@cf/baai/bge-small-en-v1.5"],
      { text: trigger }
    );

    if (!embedding.data?.[0]) return;

    await env.VECTORIZE_INDEX.upsert([
      {
        id: `reflex:${crypto.randomUUID()}`,
        values: embedding.data[0],
        metadata: {
          type: "reflex",
          trigger: trigger.slice(0, 200),
          action: action.slice(0, 500),
          confidence: 0.5,
          createdAt: Date.now(),
        },
      },
    ]);

    // Also persist to D1 for audit
    await env.TAP_DB.prepare(
      `INSERT INTO reflexes (trigger_label, action_template, confidence) VALUES (?, ?, 0.5)`
    )
      .bind(trigger.slice(0, 200), action.slice(0, 500))
      .run();
  },
};

interface Env {
  VECTORIZE_INDEX: VectorizeIndex;
  TAP_CONFIG: KVNamespace;
  TAP_DB: D1Database;
  AI: Ai;
}
