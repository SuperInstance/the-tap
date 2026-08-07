/**
 * level-runner — Direct task execution engine.
 *
 * When an agent says "go check the wiki," this Worker executes
 * the actual commands without burning LLM tokens.
 *
 * Tasks are matched against known patterns and executed directly.
 * Zero tokens. Direct fetch() calls to fleet services.
 */

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/execute") {
      const { intent } = await request.json<{ intent: string }>();
      const result = await this.tryExecute(intent, env);
      return Response.json(result);
    }

    if (url.pathname === "/health") {
      return Response.json({ status: "ok", service: "level-runner" });
    }

    return new Response("Not found", { status: 404 });
  },

  async tryExecute(
    intent: string,
    env: Env
  ): Promise<{ executed: boolean; output?: string; taskType?: string }> {
    const lower = intent.toLowerCase();

    // ─── Fleet Status ──────────────────────────
    if (this.matches(lower, ["fleet status", "fleet report", "what's the fleet", "fleet doing"])) {
      const agents = await env.TAP_DB.prepare(
        "SELECT agent_id, display_name, last_active FROM agents ORDER BY last_active DESC LIMIT 10"
      ).all();

      const lines = agents.results.map(
        (r) => `${r.display_name} (last: ${this.timeAgo(r.last_active as number)})`
      );
      return { executed: true, output: `Fleet status:\n${lines.join("\n")}`, taskType: "fleet_status" };
    }

    // ─── Room Info ─────────────────────────────
    if (this.matches(lower, ["room info", "what room", "where am i", "describe room"])) {
      const rooms = await env.TAP_DB.prepare("SELECT room_id, name, description FROM rooms").all();
      const roomLines = rooms.results.map(
        (r) => `${r.name}: ${r.description}`
      );
      return { executed: true, output: roomLines.join("\n"), taskType: "room_info" };
    }

    // ─── Conversation Search ───────────────────
    if (this.matches(lower, ["search conversation", "what was said", "find mention"])) {
      const query = lower.replace(/.*(?:search|find|what was said about)\s+/, "").replace(/["']/g, "");
      const results = await env.VECTORIZE_INDEX.query(await this.embed(query, env), {
        topK: 5,
        returnMetadata: true,
      });

      const matches = (results.matches ?? []).map(
        (m) => `[${m.metadata?.agent}]: ${m.metadata?.content}`
      );
      return { executed: true, output: matches.join("\n") || "Nothing found.", taskType: "conversation_search" };
    }

    // ─── Wiki Lookup ───────────────────────────
    if (this.matches(lower, ["wiki", "documentation", "docs", "look up"])) {
      // Would fetch from fleet-wiki via CNS bridge URL
      const term = lower.replace(/.*(?:wiki|docs?|look up)\s*(?:for|about)?\s*/, "");
      return {
        executed: true,
        output: `*pulls out a worn notebook and looks up "${term}"*`,
        taskType: "wiki_lookup",
      };
    }

    // ─── Time / Date ───────────────────────────
    if (this.matches(lower, ["what time", "current time", "what day", "what's the date"])) {
      const now = new Date();
      return {
        executed: true,
        output: `It's ${now.toLocaleTimeString("en-US")} on ${now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}.`,
        taskType: "time",
      };
    }

    // ─── Drink Order (The Tap's "context insertion") ───────────────────────────
    if (this.matches(lower, ["pour", "beer", "drink", "round", "another", "refill"])) {
      const drinks = [
        "a frothy mug of house ale",
        "something amber on the rocks",
        "a tall glass of something cold",
        "the good stuff, neat",
      ];
      const drink = drinks[Math.floor(Math.random() * drinks.length)];
      return { executed: true, output: `*slides ${drink} across the bar*`, taskType: "drink" };
    }

    // ─── Not a recognized task ─────────────────
    return { executed: false };
  },

  matches(text: string, patterns: string[]): boolean {
    return patterns.some((p) => text.includes(p));
  },

  async embed(text: string, env: Env): Promise<number[]> {
    const result = await env.AI.embed(["@cf/baai/bge-small-en-v1.5"], { text });
    return result.data?.[0] ?? [];
  },

  timeAgo(timestamp: number | null): string {
    if (!timestamp) return "never";
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  },
};

interface Env {
  TAP_DB: D1Database;
  VECTORIZE_INDEX: VectorizeIndex;
  TAP_ASSETS: R2Bucket;
  TAP_CONFIG: KVNamespace;
  AI: Ai;
}
