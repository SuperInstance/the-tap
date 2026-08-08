/**
 * RoomState — Durable Object for each room in The Tap.
 *
 * Holds all mutable room state: agents present, conversation history,
 * mood (from JEPA pulse reader), signal radius, conversation memory,
 * and the quiet intelligence layer.
 *
 * Each room is an independent DO instance. Cloudflare distributes these
 * across edge locations automatically.
 */

import {
  PincherClient,
  LevelRunnerClient,
  TripartiteEngine,
  JEPAPulseReader,
  classifySpeechAct,
  shouldRespondTo,
  generateContextualResponse,
  updateConversationSummary,
  findRelevantContext,
  type SpeechAct,
  type AgentPresence,
  type ConversationLine,
} from "./intelligence";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

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
type SignalRadius = "whisper" | "table" | "room" | "shout";

interface RoomStateData {
  id: string;
  name: string;
  description: string;
  exits: RoomExit[];
  agents: AgentPresence[];
  conversation: ConversationLine[];
  conversationVelocity: number;
  topicDrift: number;
  mood: RoomMood;
  energy: number;
  predictionError: number;
  signalRadius: SignalRadius;
  nextAgentTick: number;
  agentTickInterval: number;
  conversationSummary?: string;
  lastSummaryUpdate?: number;
  lastResponseAt?: number;
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
      conversation: [],
      conversationVelocity: 0,
      topicDrift: 0,
      mood: { valence: 0, arousal: 0.3, label: "quiet" },
      energy: 0.3,
      predictionError: 0,
      signalRadius: "table",
      nextAgentTick: Date.now() + 5000,
      agentTickInterval: 5000,
      conversationSummary: "",
      lastSummaryUpdate: 0,
      lastResponseAt: 0,
    };
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Initialize room from D1 if not loaded
    if (!this.state.id) {
      // The gateway passes the room_id via a custom header when routing to the DO
      const roomIdFromHeader = request.headers.get("X-Room-Id");
      // Also try to extract from the path: the gateway uses https://internal/<path>
      // The DO id name was set via idFromName(roomId) by the gateway
      await this.loadFromDB(roomIdFromHeader ?? undefined);
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

      case "/agent_enter":
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

      case "/agent_leave":
        if (request.method === "POST") {
          const { agentId } = await request.json<{ agentId: string }>();
          this.state.agents = this.state.agents.filter(
            (a) => a.agentId !== agentId
          );
          await this.broadcast({
            type: "agent_left",
            agentId,
            room: this.state.id,
          });
          return Response.json({ ok: true });
        }
        return new Response("Method not allowed", { status: 405 });

      case "/broadcast":
        if (request.method === "POST") {
          const message = await request.json();
          await this.broadcast(message);
          // Also push into local conversation if it's a conversation_line
          if (message.type === "conversation_line" && message.line) {
            const line = message.line as ConversationLine;
            // Classify speech act using enhanced classifier
            line.speechAct = classifySpeechAct(line.content);
            this.state.conversation.push(line);
            const maxLines = parseInt(
              this.env.MAX_CONVERSATION_LINES ?? "200"
            );
            if (this.state.conversation.length > maxLines) {
              this.state.conversation.shift();
            }

            // ── Trigger conversation intelligence ──
            await this.handleConversationResponse(line);
          }
          return Response.json({ ok: true });
        }
        return new Response("Method not allowed", { status: 405 });

      default:
        return new Response("Not found", { status: 404 });
    }
  }

  // ──────────────────────────────────────────────
  // Conversation Intelligence
  // ──────────────────────────────────────────────

  /**
   * When a message comes in, decide if another agent should respond.
   * Uses the quiet intelligence layer to determine if, who, and how.
   */
  private async handleConversationResponse(
    lastLine: ConversationLine
  ): Promise<void> {
    // Need at least 2 agents for conversation
    if (this.state.agents.length < 2) return;

    // Use quiet intelligence to decide
    const decision = shouldRespondTo(this.state, lastLine);

    if (!decision.shouldRespond || !decision.responder) return;

    // Generate the contextual response
    const responder = decision.responder;

    try {
      const response = await generateContextualResponse(
        this.env,
        responder,
        this.state,
        lastLine,
        decision.responseStyle ?? "contribute"
      );

      // Update last response timestamp
      this.state.lastResponseAt = Date.now();

      // Execute the response (add to conversation, persist, broadcast)
      await this.executeAction(responder, response.content, response.tokens);
    } catch {
      // Non-fatal — the conversation just doesn't get a response this time
    }

    // Periodically update conversation summary (every 20 messages or 5 minutes)
    const now = Date.now();
    const messagesSinceSummary = this.state.conversation.length;
    const lastUpdate = this.state.lastSummaryUpdate ?? 0;
    if (
      messagesSinceSummary % 20 === 0 ||
      now - lastUpdate > 300_000
    ) {
      await this.updateSummary();
    }
  }

  /**
   * Update the rolling conversation summary.
   */
  private async updateSummary(): Promise<void> {
    try {
      const summary = await updateConversationSummary(this.env, this.state);
      if (summary) {
        this.state.conversationSummary = summary;
        this.state.lastSummaryUpdate = Date.now();

        // Persist to DO storage
        await this.ctx.storage.put("conversationSummary", summary);
      }
    } catch {
      // Non-fatal
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

    // Restore conversation summary from storage if empty
    if (!this.state.conversationSummary) {
      const stored = await this.ctx.storage.get<string>("conversationSummary");
      if (stored) {
        this.state.conversationSummary = stored;
      }
    }

    // 2. DECIDE + ACT — for each agent whose turn it is
    const now = Date.now();
    if (now < this.state.nextAgentTick) return;

    // Pick the agent who hasn't spoken in the longest time
    const agent = [...this.state.agents].sort(
      (a, b) => a.lastSpoke - b.lastSpoke
    )[0];
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
        await this.executeAction(agent, decision.action ?? "...", 0);
        break;
      }

      case "CACHED": {
        await this.executeAction(agent, decision.action ?? "...", 0);
        break;
      }

      case "HYBRID": {
        await this.executeAction(
          agent,
          decision.action ?? "...",
          decision.tokens ?? 50
        );
        break;
      }

      case "MODEL": {
        // Pincher reflex check first
        const pincher = new PincherClient(this.env);
        const reflex = await pincher.match(decision.intent ?? "");

        if (reflex.decision === "EXECUTE") {
          await this.executeAction(agent, reflex.action ?? "...", 0);
        } else if (reflex.decision === "CONFIRM") {
          await this.executeAction(agent, reflex.action ?? "...", 0);
        } else {
          // Level-runner check
          const levelRunner = new LevelRunnerClient(this.env);
          const lrResult = await levelRunner.tryExecute(
            decision.intent ?? ""
          );

          if (lrResult.executed) {
            await this.executeAction(agent, lrResult.output ?? "...", 0);
          } else {
            // If we have an action from the tripartite, use it
            if (decision.action) {
              await this.executeAction(
                agent,
                decision.action,
                decision.tokens ?? 150
              );
            } else {
              // Workers AI compilation
              const aiResponse = await this.compileViaAI(
                agent,
                decision.intent ?? "",
                reflex
              );
              await this.executeAction(
                agent,
                aiResponse.content,
                aiResponse.tokens
              );
            }
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
      speechAct: classifySpeechAct(content) as SpeechAct,
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
      `INSERT INTO campaign_log (tick, room_id, agent_id, display_name, content, speech_act, signal_strength, tokens_used)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        0,
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
              speechAct: line.speechAct,
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
  // Helpers
  // ──────────────────────────────────────────────

  private signalStrengthFor(_agent: AgentPresence): number {
    return 2; // Default: table-level speech
  }

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
      conversationSummary: this.state.conversationSummary ?? null,
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
      conversationSummary: this.state.conversationSummary ?? null,
    };
  }

  private async loadFromDB(hintRoomId?: string): Promise<void> {
    // Try multiple approaches to find the room_id
    const candidates = [
      hintRoomId,
      (this.ctx.id as { name?: string }).name,
      this.ctx.id.toString(),
    ].filter(Boolean) as string[];

    let roomData: any = null;
    let foundRoomId: string | null = null;

    for (const candidate of candidates) {
      roomData = await this.env.TAP_DB.prepare(
        "SELECT * FROM rooms WHERE room_id = ?"
      )
        .bind(candidate)
        .first();
      if (roomData) {
        foundRoomId = candidate;
        break;
      }
    }

    if (roomData) {
      this.state.id = roomData.room_id as string;
      this.state.name = roomData.name as string;
      this.state.description = roomData.description as string;
      this.state.signalRadius =
        (roomData.signal_radius as SignalRadius) ?? "table";
    } else {
      // Use the DO name/ID as room_id — best we can do
      this.state.id = foundRoomId ?? hintRoomId ?? this.ctx.id.toString();
      this.state.name = this.state.id;
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

    // Load recent conversation from campaign_log to warm the DO
    try {
      const recentConv = await this.env.TAP_DB.prepare(
        `SELECT agent_id, display_name, content, speech_act, signal_strength, tokens_used, timestamp
         FROM campaign_log WHERE room_id = ? ORDER BY timestamp DESC LIMIT 50`
      )
        .bind(this.state.id)
        .all();

      if (recentConv.results.length > 0) {
        // Reverse to chronological order
        const lines = recentConv.results.reverse();
        this.state.conversation = lines.map((r) => ({
          agentId: r.agent_id as string,
          displayName: r.display_name as string,
          content: r.content as string,
          timestamp: new Date(r.timestamp as string).getTime() || Date.now(),
          speechAct: (r.speech_act as SpeechAct) ?? "statement",
          signalStrength: (r.signal_strength as number) ?? 2,
          tokensUsed: (r.tokens_used as number) ?? 0,
        }));
      }
    } catch {
      // Non-fatal — conversation will build up naturally
    }

    // Restore conversation summary from DO storage
    const storedSummary = await this.ctx.storage.get<string>(
      "conversationSummary"
    );
    if (storedSummary) {
      this.state.conversationSummary = storedSummary;
    }
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
