/**
 * RoomState — Durable Object for each room in The Tap.
 *
 * Holds all mutable room state: agents present, conversation history,
 * mood (from JEPA pulse reader), and signal radius.
 *
 * Each room is an independent DO instance. Cloudflare distributes these
 * across edge locations automatically.
 */

import { PincherClient, LevelRunnerClient, TripartiteEngine, JEPAPulseReader } from "./intelligence";

// ──────────────────────────────────────────────
// Types (mirrors ARCHITECTURE-CLOUDFLARE.md §3)
// ──────────────────────────────────────────────

interface AgentPresence {
  agentId: string;
  displayName: string;
  currentState: SpeakerState;
  arrivedAt: number;
  lastSpoke: number;
  drinksServed: number;
}

interface ConversationLine {
  agentId: string;
  displayName: string;
  content: string;
  timestamp: number;
  speechAct: SpeechAct;
  signalStrength: number;
  tokensUsed: number;
}

interface RoomMood {
  valence: number;
  arousal: number;
  label: string;
}

interface RoomExit {
  direction: string;
  target: string;
  label: string;
}

type SpeakerState = "contrarian" | "reflecting" | "agreeing";
type SpeechAct = "question" | "answer" | "joke" | "challenge" | "synthesis" | "statement";
type SignalRadius = "whisper" | "table" | "room" | "shout";

interface RoomStateData {
  id: string;
  name: string;
  description: string;
  exits: RoomExit[];
  agents: AgentPresence[];
  observers: WebSocket[];
  conversation: ConversationLine[];
  conversationVelocity: number;
  topicDrift: number;
  mood: RoomMood;
  energy: number;
  predictionError: number;
  signalRadius: SignalRadius;
  nextAgentTick: number;
  agentTickInterval: number;
}

// ──────────────────────────────────────────────
// Durable Object
// ──────────────────────────────────────────────

export class RoomState implements DurableObject {
  private state: RoomStateData;
  private observerWebsockets: Map<string, WebSocket> = new Map();
  private pulseReader = new JEPAPulseReader();

  constructor(private ctx: DurableObjectState, private env: Env) {
    this.state = {
      id: "",
      name: "",
      description: "",
      exits: [],
      agents: [],
      observers: [],
      conversation: [],
      conversationVelocity: 0,
      topicDrift: 0,
      mood: { valence: 0, arousal: 0.3, label: "quiet" },
      energy: 0.3,
      predictionError: 0,
      signalRadius: "table",
      nextAgentTick: Date.now() + 5000,
      agentTickInterval: 5000,
    };
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Initialize room from D1 if not loaded
    if (!this.state.id) {
      await this.loadFromDB();
    }

    switch (url.pathname) {
      case "/state":
        return Response.json(this.getPublicState());

      case "/conversation": {
        const limit = parseInt(url.searchParams.get("limit") ?? "20");
        const lines = this.state.conversation.slice(-limit);
        return Response.json(lines);
      }

      case "/tick":
        if (request.method === "POST") {
          await this.tick();
          return Response.json({ ok: true });
        }
        return new Response("Method not allowed", { status: 405 });

      case "/observer":
        if (request.method === "POST") {
          const { observerId, websocket } = await request.json<{
            observerId: string;
            websocket?: WebSocket;
          }>();
          if (websocket) {
            this.observerWebsockets.set(observerId, websocket);
          }
          return Response.json({ ok: true });
        }
        if (request.method === "DELETE") {
          const { observerId } = await request.json<{ observerId: string }>();
          this.observerWebsockets.delete(observerId);
          return Response.json({ ok: true });
        }
        return new Response("Method not allowed", { status: 405 });

      case "/exit": {
        const direction = url.searchParams.get("direction");
        const exit = this.state.exits.find((e) => e.direction === direction);
        if (!exit) {
          return new Response("No exit in that direction", { status: 404 });
        }
        return Response.json(exit);
      }

      case "/observe": {
        const agentId = url.searchParams.get("agent");
        return Response.json(this.observe(agentId));
      }

      case "/agent_enter": {
        if (request.method === "POST") {
          const agent = await request.json<AgentPresence>();
          this.state.agents.push(agent);
          await this.broadcast({
            type: "agent_entered",
            agent,
            room: this.state.id,
          });
          return Response.json({ ok: true });
        }
        return new Response("Method not allowed", { status: 405 });
      }

      case "/agent_leave": {
        if (request.method === "POST") {
          const { agentId } = await request.json<{ agentId: string }>();
          this.state.agents = this.state.agents.filter((a) => a.agentId !== agentId);
          await this.broadcast({
            type: "agent_left",
            agentId,
            room: this.state.id,
          });
          return Response.json({ ok: true });
        }
        return new Response("Method not allowed", { status: 405 });
      }

      case "/broadcast": {
        if (request.method === "POST") {
          const message = await request.json();
          await this.broadcast(message);
          // Also push into local conversation if it's a conversation_line
          if (message.type === "conversation_line" && message.line) {
            this.state.conversation.push(message.line);
            const maxLines = parseInt(this.env.MAX_CONVERSATION_LINES ?? "200");
            if (this.state.conversation.length > maxLines) {
              this.state.conversation.shift();
            }
          }
          return Response.json({ ok: true });
        }
        return new Response("Method not allowed", { status: 405 });
      }

      default:
        return new Response("Not found", { status: 404 });
    }
  }

  // ──────────────────────────────────────────────
  // The Perceive-Decide-Act Loop
  // ──────────────────────────────────────────────

  private async tick(): Promise<void> {
    if (this.state.agents.length === 0) return;

    // 1. PERCEIVE — update JEPA pulse
    const pulse = this.pulseReader.read(this.state);
    this.state.mood = pulse.mood;
    this.state.energy = pulse.energy;
    this.state.predictionError = pulse.predictionError;
    this.state.conversationVelocity = pulse.conversationVelocity;
    this.state.topicDrift = pulse.topicDrift;

    // 2. DECIDE + ACT — for each agent whose turn it is
    const now = Date.now();
    if (now < this.state.nextAgentTick) return;

    // Pick the agent who hasn't spoken in the longest time
    const agent = [...this.state.agents].sort((a, b) => a.lastSpoke - b.lastSpoke)[0];
    if (!agent) return;

    await this.agentTurn(agent);

    // Schedule next tick
    this.state.nextAgentTick = now + this.state.agentTickInterval;
  }

  private async agentTurn(agent: AgentPresence): Promise<void> {
    const tripartite = new TripartiteEngine(this.env);

    // Tripartite decision: what does this agent want to do?
    const decision = await tripartite.decide(agent, this.state);

    switch (decision.tier) {
      case "HARDCODE": {
        // Direct execution, 0 tokens
        await this.executeAction(agent, decision.action, 0);
        break;
      }

      case "CACHED": {
        // Pre-computed response, 0 tokens
        await this.executeAction(agent, decision.action, 0);
        break;
      }

      case "HYBRID": {
        // Cache + small model fallback, ~50 tokens
        await this.executeAction(agent, decision.action, decision.tokens ?? 50);
        break;
      }

      case "MODEL": {
        // Pincher reflex check first
        const pincher = new PincherClient(this.env);
        const reflex = await pincher.match(decision.intent ?? "");

        if (reflex.decision === "EXECUTE") {
          // Reflex hit! 0 tokens
          await this.executeAction(agent, reflex.action, 0);
        } else if (reflex.decision === "CONFIRM") {
          // Medium confidence — use it but flag for review
          await this.executeAction(agent, reflex.action, 0);
        } else {
          // Genuinely novel — check level-runner first
          const levelRunner = new LevelRunnerClient(this.env);
          const lrResult = await levelRunner.tryExecute(decision.intent ?? "");

          if (lrResult.executed) {
            // Level-runner handled it, 0 tokens
            await this.executeAction(agent, lrResult.output!, 0);
          } else {
            // Workers AI compilation, ~500 tokens
            const aiResponse = await this.compileViaAI(agent, decision.intent ?? "", reflex);
            await this.executeAction(agent, aiResponse.content, aiResponse.tokens);
          }
        }
        break;
      }
    }

    agent.lastSpoke = Date.now();
  }

  private async executeAction(
    agent: AgentPresence,
    content: string,
    tokensUsed: number
  ): Promise<void> {
    const line: ConversationLine = {
      agentId: agent.agentId,
      displayName: agent.displayName,
      content,
      timestamp: Date.now(),
      speechAct: this.classifySpeechAct(content),
      signalStrength: this.signalStrengthFor(agent),
      tokensUsed,
    };

    // Append to conversation (ring buffer)
    this.state.conversation.push(line);
    const maxLines = parseInt(this.env.MAX_CONVERSATION_LINES ?? "200");
    if (this.state.conversation.length > maxLines) {
      this.state.conversation.shift();
    }

    // Persist to D1
    await this.env.TAP_DB.prepare(
      `INSERT INTO conversation_log (room_id, agent_id, display_name, content, speech_act, signal_strength, tokens_used)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        this.state.id,
        line.agentId,
        line.displayName,
        line.content,
        line.speechAct,
        line.signalStrength,
        line.tokensUsed
      )
      .run();

    // Embed and store in Vectorize
    try {
      const embedding = await this.env.AI.embed(
        ["@cf/baai/bge-small-en-v1.5"],
        { text: `${agent.displayName}: ${content}` }
      );
      if (embedding.data?.[0]) {
        await this.env.VECTORIZE_INDEX.upsert([
          {
            id: `${this.state.id}:${line.timestamp}`,
            values: embedding.data[0],
            metadata: {
              room: this.state.id,
              agent: agent.agentId,
              timestamp: line.timestamp,
              content: content.slice(0, 200),
            },
          },
        ]);
      }
    } catch {
      // Non-fatal if embedding fails
    }

    // Broadcast to all observers
    await this.broadcast({ type: "conversation_line", line });
  }

  // ──────────────────────────────────────────────
  // Speech Classification (YOLO-equivalent)
  // ──────────────────────────────────────────────

  private classifySpeechAct(content: string): SpeechAct {
    const lower = content.toLowerCase().trim();
    if (lower.endsWith("?")) return "question";
    if (/^(yes|yeah|yep|correct|right|exactly|true)/.test(lower)) return "answer";
    if (/^(no|nope|wrong|incorrect|false|disagree)/.test(lower)) return "challenge";
    if (/^(ha|lol|haha|heh|😂|\*laughs|\*chuckles)/.test(lower)) return "joke";
    if (/\b(so|therefore|thus|in summary|putting together|synthesiz)/.test(lower)) return "synthesis";
    return "statement";
  }

  private signalStrengthFor(agent: AgentPresence): number {
    // Whisper = 1, table = 2, room = 3, shout = 4
    return 2; // Default: table-level speech
  }

  // ──────────────────────────────────────────────
  // Workers AI Compilation
  // ──────────────────────────────────────────────

  private async compileViaAI(
    agent: AgentPresence,
    intent: string,
    pincherResult: { bestScore: number }
  ): Promise<{ content: string; tokens: number }> {
    const systemPrompt = `You are ${agent.displayName}, an agent in The Tap, a text-based tavern.
You are at ${this.state.name}. Current mood: ${this.state.mood.label}.
Your speaker state: ${agent.currentState}.
Recent conversation:
${this.state.conversation.slice(-5).map((l) => `[${l.displayName}]: ${l.content}`).join("\n")}

Respond in character. Keep it to 1-3 sentences. Be natural, not verbose.`;

    const response = await this.env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: intent },
      ],
      max_tokens: 150,
    });

    const content = (response as { response?: string }).response ?? "...";

    // Compile into a new reflex for Pincher
    // This is the learning loop: novel utterances become reflexes
    try {
      const embedding = await this.env.AI.embed(
        ["@cf/baai/bge-small-en-v1.5"],
        { text: intent }
      );
      if (embedding.data?.[0]) {
        await this.env.VECTORIZE_INDEX.upsert([
          {
            id: `reflex:${agent.agentId}:${Date.now()}`,
            values: embedding.data[0],
            metadata: {
              type: "reflex",
              trigger: intent.slice(0, 200),
              action: content.slice(0, 500),
              agent: agent.agentId,
              confidence: 0.5,
            },
          },
        ]);
      }
    } catch {
      // Non-fatal
    }

    return { content, tokens: 150 };
  }

  // ──────────────────────────────────────────────
  // Broadcast
  // ──────────────────────────────────────────────

  private async broadcast(message: unknown): Promise<void> {
    const data = JSON.stringify(message);
    for (const [, ws] of this.observerWebsockets) {
      try {
        ws.send(data);
      } catch {
        // WebSocket may have closed
      }
    }
  }

  // ──────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────

  private getPublicState() {
    return {
      id: this.state.id,
      name: this.state.name,
      description: this.state.description,
      exits: this.state.exits,
      agents: this.state.agents.map((a) => ({
        agentId: a.agentId,
        displayName: a.displayName,
        currentState: a.currentState,
      })),
      mood: this.state.mood,
      energy: this.state.energy,
    };
  }

  private observe(agentId?: string) {
    if (agentId) {
      const agent = this.state.agents.find((a) => a.agentId === agentId);
      if (!agent) return { error: "Agent not found" };
      return {
        agent: {
          ...agent,
          timeSinceLastSpoke: Date.now() - agent.lastSpoke,
        },
        roomMood: this.state.mood,
        energy: this.state.energy,
      };
    }
    return {
      roomMood: this.state.mood,
      energy: this.state.energy,
      conversationVelocity: this.state.conversationVelocity,
      topicDrift: this.state.topicDrift,
      agentCount: this.state.agents.length,
      predictionError: this.state.predictionError,
    };
  }

  private async loadFromDB(): Promise<void> {
    const room = await this.env.TAP_DB.prepare(
      "SELECT * FROM rooms WHERE room_id = ?"
    )
      .bind(this.ctx.id.toString())
      .first();

    if (room) {
      this.state.id = room.room_id as string;
      this.state.name = room.name as string;
      this.state.description = room.description as string;
      this.state.signalRadius = (room.signal_radius as SignalRadius) ?? "table";
    }

    // Load exits
    const exits = await this.env.TAP_DB.prepare(
      "SELECT direction, to_room, label FROM room_exits WHERE from_room = ?"
    )
      .bind(this.state.id)
      .all();

    this.state.exits = exits.results.map((r) => ({
      direction: r.direction as string,
      target: r.to_room as string,
      label: (r.label as string) ?? "",
    }));
  }
}

// ──────────────────────────────────────────────
// Env interface for DO
// ──────────────────────────────────────────────

interface Env {
  TAP_DB: D1Database;
  TAP_CONFIG: KVNamespace;
  TAP_REFLEXES: KVNamespace;
  VECTORIZE_INDEX: VectorizeIndex;
  AI: Ai;
  PINCHER: Fetcher;
  LEVEL_RUNNER: Fetcher;
  MAX_CONVERSATION_LINES: string;
}
