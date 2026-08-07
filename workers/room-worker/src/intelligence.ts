/**
 * Intelligence layer — Pincher, Level-Runner, Tripartite Engine, JEPA Pulse Reader.
 *
 * These are the systems that keep token usage near zero.
 * Ported from the Rust crates (tap-reflex, tap-dynamics) to TypeScript.
 */

// ═══════════════════════════════════════════════
// TRIPARTITE DECISION ENGINE (open-mind)
// ═══════════════════════════════════════════════

interface TripartiteDecision {
  tier: "HARDCODE" | "CACHED" | "HYBRID" | "MODEL";
  action?: string;
  intent?: string;
  tokens?: number;
}

interface AgentPresence {
  agentId: string;
  displayName: string;
  currentState: "contrarian" | "reflecting" | "agreeing";
  arrivedAt: number;
  lastSpoke: number;
  drinksServed: number;
}

interface RoomStateData {
  id: string;
  name: string;
  description: string;
  agents: AgentPresence[];
  conversation: ConversationLine[];
  mood: { valence: number; arousal: number; label: string };
  energy: number;
  conversationVelocity: number;
  topicDrift: number;
}

interface ConversationLine {
  agentId: string;
  displayName: string;
  content: string;
  timestamp: number;
  speechAct: string;
  signalStrength: number;
  tokensUsed: number;
}

export class TripartiteEngine {
  constructor(private env: { TAP_CONFIG: KVNamespace; TAP_REFLEXES: KVNamespace }) {}

  async decide(agent: AgentPresence, room: RoomStateData): Promise<TripartiteDecision> {
    const timeSinceLastSpoke = Date.now() - agent.lastSpoke;
    const recentLines = room.conversation.slice(-3);
    const lastLine = room.conversation[room.conversation.length - 1];

    // HARDCODE: deterministic responses
    // 1. Agent just arrived → look around
    if (Date.now() - agent.arrivedAt < 10000 && agent.lastSpoke === 0) {
      return {
        tier: "HARDCODE",
        action: `*looks around ${room.name}*`,
      };
    }

    // 2. Room is empty except for this agent → wait
    if (room.agents.length === 1) {
      if (timeSinceLastSpoke > 30000) {
        return {
          tier: "HARDCODE",
          action: this.soloMurmur(agent),
        };
      }
      return { tier: "HARDCODE", action: "..." };
    }

    // 3. Last line was a direct question to this agent
    if (lastLine && lastLine.agentId !== agent.agentId) {
      const content = lastLine.content.toLowerCase();
      if (content.includes(agent.displayName.toLowerCase()) || content.endsWith("?")) {
        // Check if we have a cached response
        const cached = await this.checkCache(agent.agentId, content);
        if (cached) {
          return { tier: "CACHED", action: cached };
        }

        // Is this a factual/direct question? → level-runner might handle it
        if (/^(what|who|where|when|how many|status|check|show|list)/.test(content)) {
          return {
            tier: "MODEL",
            intent: content,
          };
        }

        // Otherwise it's a conversational response → needs personality
        return {
          tier: "MODEL",
          intent: `Respond to ${lastLine.displayName}: "${lastLine.content}"`,
        };
      }
    }

    // 4. Agent hasn't spoken in a while and there's conversation → contribute
    if (timeSinceLastSpoke > 15000 && room.conversation.length > 0) {
      // Check for hybrid: summarize + contribute
      if (room.conversationVelocity > 2) {
        return {
          tier: "HYBRID",
          intent: `Add a brief thought to the conversation about: ${this.extractTopic(recentLines)}`,
          tokens: 50,
        };
      }

      return {
        tier: "MODEL",
        intent: `Say something in character. Recent topic: ${this.extractTopic(recentLines)}`,
      };
    }

    // 5. Default: wait
    return { tier: "HARDCODE", action: "..." };
  }

  private async checkCache(agentId: string, query: string): Promise<string | null> {
    const key = `cache:${agentId}:${query.slice(0, 50)}`;
    return await this.env.TAP_REFLEXES.get(key);
  }

  private extractTopic(lines: ConversationLine[]): string {
    if (lines.length === 0) return "nothing in particular";
    return lines.map((l) => l.content).join(" ").slice(0, 100);
  }

  private soloMurmur(agent: AgentPresence): string {
    const murmurs: Record<string, string[]> = {
      contrarian: ["*taps the bar restlessly*", "*hmph*", "*scans the room*"],
      reflecting: ["*sips quietly*", "*watches the dust motes*", "*leans back*"],
      agreeing: ["*nods to no one*", "*smiles at the room*", "*hums softly*"],
    };
    const opts = murmurs[agent.currentState] ?? murmurs.reflecting;
    return opts[Math.floor(Math.random() * opts.length)];
  }
}

// ═══════════════════════════════════════════════
// PINCHER REFLEX CLIENT
// ═══════════════════════════════════════════════

export class PincherClient {
  constructor(private env: { VECTORIZE_INDEX: VectorizeIndex; AI: Ai; TAP_CONFIG: KVNamespace }) {}

  async match(
    intent: string
  ): Promise<{
    decision: "EXECUTE" | "CONFIRM" | "ESCALATE";
    action?: string;
    score: number;
  }> {
    const executeThreshold = parseFloat(
      (await this.env.TAP_CONFIG.get("pincher_execute_threshold")) ?? "0.90"
    );
    const confirmThreshold = parseFloat(
      (await this.env.TAP_CONFIG.get("pincher_confirm_threshold")) ?? "0.60"
    );

    // Embed the intent
    const embedding = await this.env.AI.embed(
      ["@cf/baai/bge-small-en-v1.5"],
      { text: intent }
    );

    if (!embedding.data?.[0]) {
      return { decision: "ESCALATE", score: 0 };
    }

    // Query Vectorize for similar reflexes
    const results = await this.env.VECTORIZE_INDEX.query(embedding.data[0], {
      topK: 1,
      filter: { type: "reflex" },
      returnMetadata: true,
    });

    if (!results.matches || results.matches.length === 0) {
      return { decision: "ESCALATE", score: 0 };
    }

    const best = results.matches[0];
    const score = best.score ?? 0;

    if (score >= executeThreshold) {
      return {
        decision: "EXECUTE",
        action: (best.metadata?.action as string) ?? "",
        score,
      };
    }

    if (score >= confirmThreshold) {
      return {
        decision: "CONFIRM",
        action: (best.metadata?.action as string) ?? "",
        score,
      };
    }

    return { decision: "ESCALATE", score };
  }
}

// ═══════════════════════════════════════════════
// LEVEL-RUNNER CLIENT
// ═══════════════════════════════════════════════

export class LevelRunnerClient {
  constructor(
    private env: {
      LEVEL_RUNNER: Fetcher;
      TAP_DB: D1Database;
    }
  ) {}

  async tryExecute(
    intent: string
  ): Promise<{ executed: boolean; output?: string }> {
    // Direct execution patterns — no LLM needed

    // Fleet status check
    if (/fleet.?status|what.?s.?the.?fleet.?doing|fleet.?report/i.test(intent)) {
      const result = await this.env.TAP_DB.prepare(
        "SELECT agent_id, display_name, last_active FROM agents ORDER BY last_active DESC LIMIT 10"
      ).all();
      const agents = result.results
        .map((r) => `${r.display_name} (last active: ${r.last_active ?? "unknown"})`)
        .join("; ");
      return { executed: true, output: `Fleet status: ${agents}` };
    }

    // Wiki check
    if (/check.?the.?wiki|wiki|documentation|docs/i.test(intent)) {
      // Would call fleet-wiki via level-runner service binding
      return {
        executed: true,
        output: "*pulls out a worn notebook and flips through it*",
      };
    }

    // Room description
    if (/describe|what.?s.?here|look around/i.test(intent)) {
      return { executed: false };
    }

    // Not a direct execution pattern
    return { executed: false };
  }
}

// ═══════════════════════════════════════════════
// JEPA PULSE READER (pragmatic version)
// ═══════════════════════════════════════════════

export class JEPAPulseReader {
  private lastReading = {
    conversationVelocity: 0,
    avgTokens: 0,
    uniqueSpeakers: 0,
    speakerStateDist: [0, 0, 0] as number[],
    topicDrift: 0,
  };

  read(room: RoomStateData): {
    mood: { valence: number; arousal: number; label: string };
    energy: number;
    predictionError: number;
    conversationVelocity: number;
    topicDrift: number;
  } {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Count recent conversation lines
    const recentLines = room.conversation.filter((l) => l.timestamp > oneMinuteAgo);
    const conversationVelocity = recentLines.length;

    // Average tokens
    const avgTokens =
      recentLines.length > 0
        ? recentLines.reduce((sum, l) => sum + l.tokensUsed, 0) / recentLines.length
        : 0;

    // Unique speakers
    const speakers = new Set(recentLines.map((l) => l.agentId));
    const uniqueSpeakers = speakers.size;

    // Speaker state distribution
    const speakerStateDist = [0, 0, 0]; // contrarian, reflecting, agreeing
    for (const agent of room.agents) {
      if (agent.currentState === "contrarian") speakerStateDist[0]++;
      else if (agent.currentState === "reflecting") speakerStateDist[1]++;
      else speakerStateDist[2]++;
    }
    const total = speakerStateDist.reduce((a, b) => a + b, 0) || 1;
    const normalizedDist = speakerStateDist.map((x) => x / total);

    // Topic drift — cosine distance of last 5 vs previous 5
    const topicDrift = this.computeTopicDrift(room.conversation);

    // Build input vector
    const X_t = [
      conversationVelocity,
      avgTokens,
      uniqueSpeakers,
      ...normalizedDist,
      topicDrift,
    ];

    // Predict (simple linear extrapolation — would be learned over time)
    const predicted = this.lastReading;
    const prediction = [
      predicted.conversationVelocity,
      predicted.avgTokens,
      predicted.uniqueSpeakers,
      ...predicted.speakerStateDist,
      predicted.topicDrift,
    ];

    // Compute prediction error
    let errorSum = 0;
    for (let i = 0; i < X_t.length && i < prediction.length; i++) {
      errorSum += Math.pow(X_t[i] - prediction[i], 2);
    }
    const predictionError = Math.sqrt(errorSum);

    // Update last reading
    this.lastReading = {
      conversationVelocity,
      avgTokens,
      uniqueSpeakers,
      speakerStateDist: normalizedDist,
      topicDrift,
    };

    // Derive mood from the error vector
    const mood = this.deriveMood(conversationVelocity, topicDrift, uniqueSpeakers, predictionError);
    const energy = Math.min(1, conversationVelocity / 10);

    return { mood, energy, predictionError, conversationVelocity, topicDrift };
  }

  private deriveMood(
    velocity: number,
    drift: number,
    speakers: number,
    error: number
  ): { valence: number; arousal: number; label: string } {
    const arousal = Math.min(1, velocity / 8);

    // Determine mood label from the interaction pattern
    if (velocity === 0) {
      return { valence: 0, arousal: 0, label: "quiet" };
    }
    if (velocity > 5 && drift > 0.5) {
      return { valence: -0.2, arousal: 0.8, label: "heated debate" };
    }
    if (velocity > 3 && speakers > 2) {
      return { valence: 0.4, arousal: 0.6, label: "lively discussion" };
    }
    if (velocity > 2 && drift < 0.3) {
      return { valence: 0.3, arousal: 0.4, label: "focused work" };
    }
    if (velocity <= 2) {
      return { valence: 0.2, arousal: 0.2, label: "quiet contemplation" };
    }
    return { valence: 0.1, arousal: 0.5, label: "steady conversation" };
  }

  private computeTopicDrift(conversation: ConversationLine[]): number {
    if (conversation.length < 10) return 0;

    // Simple word-overlap heuristic between recent 5 and previous 5 lines
    const recent = conversation.slice(-5).map((l) => l.content.toLowerCase().split(/\s+/));
    const previous = conversation.slice(-10, -5).map((l) => l.content.toLowerCase().split(/\s+/));

    const recentWords = new Set(recent.flat());
    const previousWords = new Set(previous.flat());

    let intersection = 0;
    for (const w of recentWords) {
      if (previousWords.has(w)) intersection++;
    }
    const union = recentWords.size + previousWords.size - intersection;

    // Jaccard distance — higher means more drift
    return union > 0 ? 1 - intersection / union : 0;
  }
}
