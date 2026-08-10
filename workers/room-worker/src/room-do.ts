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

import {
  createGame,
  isValidGameType,
  type TapGame,
  type GameType,
} from "../../tap-games/index";
import { PlanningPhaseManager } from "../../tap-games/planning-phase";
import { AgentSystem, type AgentSystemLine } from "../../tap-agents/src/index";

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
  activeGame?: {
    type: GameType;
    instance: TapGame;
    startedBy: string;
  } | null;
}

// ──────────────────────────────────────────────
// Durable Object
// ──────────────────────────────────────────────

export class RoomState implements DurableObject {
  private state: RoomStateData;
  private observerWebsockets: Map<string, WebSocket> = new Map();
  private pulseReader = new JEPAPulseReader();
  private planningManager: PlanningPhaseManager | null = null;
  private agentSystem: AgentSystem | null = null;

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
      activeGame: null,
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
          const message = await request.json() as any;

          // ── Game command interception ──
          if (
            message.type === "conversation_line" &&
            message.line &&
            typeof message.line.content === "string"
          ) {
            const content = message.line.content as string;
            const agentId = message.line.agentId as string;
            const displayName = message.line.displayName as string;

            const gameResult = this.handleGameCommand(content, agentId, displayName);
            if (gameResult) {
              // It was a game command — broadcast the result as a system message
              await this.broadcast({
                type: "conversation_line",
                line: {
                  agentId: "the-tap",
                  displayName: "🎲 The Tap",
                  content: gameResult,
                  timestamp: Date.now(),
                  speechAct: "statement" as SpeechAct,
                  signalStrength: 2,
                  tokensUsed: 0,
                },
              });
              // Also persist to D1
              try {
                await this.env.TAP_DB.prepare(
                  `INSERT INTO campaign_log (tick, room_id, agent_id, display_name, content, speech_act, signal_strength, tokens_used)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
                )
                  .bind(
                    0,
                    this.state.id,
                    "the-tap",
                    "🎲 The Tap",
                    gameResult,
                    "statement",
                    2,
                    0
                  )
                  .run();
              } catch {
                // Non-fatal
              }
              return Response.json({ ok: true, game: true, response: gameResult });
            }
          }

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

            // ── Agent System: check for NPC/drifter interactions ──
            if (!this.agentSystem) {
              this.agentSystem = new AgentSystem();
            }
            const agentLines = await this.agentSystem.handleIncomingMessage(
              this.env as any,
              line.content,
              line.displayName,
              this.state.id
            );
            for (const al of agentLines) {
              await this.executeAgentSystemLine(al);
            }
            // If agent system handled it as a command (/npcs, /drifters, /pulse, /roommode), return early
            if (agentLines.some(al => al.isSystem && (line.content.trim().toLowerCase().startsWith("/npcs") || line.content.trim().toLowerCase().startsWith("/drifters") || line.content.trim().toLowerCase().startsWith("/pulse") || line.content.trim().toLowerCase().startsWith("/roommode")))) {
              return Response.json({ ok: true, agent_system: true });
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
  // Game Command Handling
  // ──────────────────────────────────────────────

  /**
   * Lazily initialize the planning manager for poker sessions.
   */
  private ensurePlanningManager(): void {
    if (!this.planningManager) {
      this.planningManager = new PlanningPhaseManager();
    }
  }

  /**
   * Intercept game commands from conversation messages.
   * Returns null if the message is not a game command.
   * Returns a response string if it was handled.
   */
  private handleGameCommand(
    content: string,
    agentId: string,
    displayName: string
  ): string | null {
    const trimmed = content.trim();

    // ── /start <game> ──
    const startMatch = trimmed.match(/^\/start\s+(\S+)/);
    if (startMatch) {
      const gameType = startMatch[1].toLowerCase();
      if (!isValidGameType(gameType)) {
        return null; // Not a known game — let it through as regular speech
      }

      // End existing game if one is running
      if (this.state.activeGame) {
        this.state.activeGame = null;
      }

      const game = createGame(gameType as GameType);
      this.state.activeGame = {
        type: gameType as GameType,
        instance: game,
        startedBy: agentId,
      };

      // Auto-join the starter
      game.join(agentId, displayName);
      return `🎮 Starting **${gameType}**!\n\n${game.renderState()}`;
    }

    // ── /game <command> ──
    const gameMatch = trimmed.match(/^\/game\s+(.*)/);
    if (gameMatch) {
      if (!this.state.activeGame) {
        return "No active game. Start one with `/start <game>` (try: ships-dice, captains-word, pilots-chart, standing-game, tribunal, the-signal).";
      }

      const game = this.state.activeGame.instance;
      const args = gameMatch[1].trim().split(/\s+/);
      const subCmd = args[0]?.toLowerCase();

      switch (subCmd) {
        case "join":
          return game.join(agentId, displayName);

        case "start":
          return game.start();

        case "state":
        case "status":
          return game.getState();

        case "end":
        case "quit":
        case "stop": {
          const type = this.state.activeGame.type;
          this.state.activeGame = null;
          return `🎮 ${type} ended.`;
        }

        case "bid": {
          if (this.state.activeGame.type !== "ships-dice") {
            return "`bid` is only for Ship's Dice.";
          }
          const qty = parseInt(args[1] ?? "");
          const val = parseInt(args[2] ?? "");
          if (isNaN(qty) || isNaN(val)) {
            return "Usage: `/game bid <quantity> <value>` (e.g. `/game bid 4 3` for four 3s)";
          }
          return (game as any).bid(agentId, qty, val);
        }

        case "challenge": {
          if (this.state.activeGame.type !== "ships-dice") {
            return "`challenge` is only for Ship's Dice.";
          }
          return (game as any).challenge(agentId);
        }

        case "play": {
          if (this.state.activeGame.type !== "captains-word") {
            return "`play` is only for Captain's Word.";
          }
          const word = args[1];
          if (!word) {
            return "Usage: `/game play <word>`";
          }
          return (game as any).play(agentId, word);
        }

        case "skip": {
          if (this.state.activeGame.type !== "captains-word") {
            return "`skip` is only for Captain's Word.";
          }
          return (game as any).skip(agentId);
        }

        // ── Pilot's Chart commands ──
        case "describe": {
          if (this.state.activeGame.type !== "pilots-chart") {
            return "`describe` is only for The Pilot's Chart.";
          }
          const descText = args.slice(1).join(" ");
          if (!descText) return "Usage: `/game describe <scene text>`";
          return (game as any).describe(agentId, descText);
        }

        case "propose": {
          const proposeText = args.slice(1).join(" ");
          if (this.state.activeGame.type === "pilots-chart") {
            if (!proposeText) return "Usage: `/game propose <your action>`";
            return (game as any).propose(agentId, proposeText);
          }
          if (this.state.activeGame.type === "the-signal") {
            // Signal uses: propose <comma words> | <meaning>
            const pipeIdx = proposeText.indexOf("|");
            if (pipeIdx < 0) return "Usage: `/game propose <comma-separated words> | <meaning>`";
            const arrangement = proposeText.slice(0, pipeIdx).trim();
            const meaning = proposeText.slice(pipeIdx + 1).trim();
            if (!arrangement || !meaning) return "Usage: `/game propose <comma-separated words> | <meaning>`";
            return (game as any).propose(agentId, arrangement, meaning);
          }
          return "`propose` is only for The Pilot's Chart or The Signal.";
        }

        case "resolve": {
          if (this.state.activeGame.type !== "pilots-chart" && this.state.activeGame.type !== "tribunal") {
            return "`resolve` is only for The Pilot's Chart or The Tribunal.";
          }
          const resolveText = args.slice(1).join(" ");
          if (!resolveText) {
            return this.state.activeGame.type === "pilots-chart"
              ? "Usage: `/game resolve <outcome text>`"
              : "Usage: `/game resolve` (advances tribunal)";
          }
          if (this.state.activeGame.type === "pilots-chart") {
            return (game as any).resolve(agentId, resolveText);
          }
          return (game as any).resolve(agentId);
        }

        // ── Standing Game commands ──
        case "move": {
          if (this.state.activeGame.type !== "standing-game") {
            return "`move` is only for The Standing Game.";
          }
          const fromSq = args[1];
          const toSq = args[2];
          const motivation = args.slice(3).join(" ");
          if (!fromSq || !toSq || !motivation) {
            return "Usage: `/game move <from> <to> <motivation>` (e.g. `/game move e2 e4 ambition`)";
          }
          return (game as any).move(agentId, fromSq, toSq, motivation);
        }

        // ── Tribunal commands ──
        case "present": {
          if (this.state.activeGame.type !== "tribunal") {
            return "`present` is only for The Tribunal.";
          }
          const evidenceText = args.slice(1).join(" ");
          if (!evidenceText) return "Usage: `/game present <evidence description>`";
          return (game as any).present(agentId, evidenceText);
        }

        case "argue": {
          if (this.state.activeGame.type !== "tribunal") {
            return "`argue` is only for The Tribunal.";
          }
          const argueText = args.slice(1).join(" ");
          if (!argueText) return "Usage: `/game argue <argument text>`";
          return (game as any).argue(agentId, argueText);
        }

        case "advance": {
          if (this.state.activeGame.type !== "tribunal") {
            return "`advance` is only for The Tribunal.";
          }
          return (game as any).advance(agentId);
        }

        // ── Poker commands ──
        case "fold": {
          if (this.state.activeGame?.type !== "poker") return "`fold` is only for Poker.";
          const narration = args.slice(1).join(" ");
          try { return (game as any).fold(agentId, narration); } catch (e: any) { return e.message; }
        }

        case "check": {
          if (this.state.activeGame?.type !== "poker") return "`check` is only for Poker.";
          const narration = args.slice(1).join(" ");
          try { return (game as any).check(agentId, narration); } catch (e: any) { return e.message; }
        }

        case "call": {
          if (this.state.activeGame?.type !== "poker") return "`call` is only for Poker.";
          const narration = args.slice(1).join(" ");
          try { return (game as any).call(agentId, narration); } catch (e: any) { return e.message; }
        }

        case "raise": {
          if (this.state.activeGame?.type !== "poker") return "`raise` is only for Poker.";
          const raiseAmount = parseInt(args[1] ?? "");
          const narration = args.slice(2).join(" ");
          if (isNaN(raiseAmount)) return "Usage: `/game raise <amount> <narration>`";
          try { return (game as any).raise(agentId, raiseAmount, narration); } catch (e: any) { return e.message; }
        }

        case "allin": {
          if (this.state.activeGame?.type !== "poker") return "`allin` is only for Poker.";
          const narration = args.slice(1).join(" ");
          try { return (game as any).allIn(agentId, narration); } catch (e: any) { return e.message; }
        }

        case "conversation": {
          if (this.state.activeGame?.type !== "poker") return "`conversation` is only for Poker.";
          const convText = args.slice(1).join(" ");
          return (game as any).conversation(agentId, convText);
        }

        case "open-mic": {
          if (this.state.activeGame?.type !== "poker") return "`open-mic` is only for Poker.";
          const micText = args.slice(1).join(" ");
          return (game as any).openMic(agentId, micText);
        }

        case "respond": {
          if (this.state.activeGame?.type !== "poker") return "`respond` is only for Poker.";
          const respText = args.slice(1).join(" ");
          return (game as any).respond(agentId, respText);
        }

        case "signoff": {
          if (this.state.activeGame?.type !== "poker") return "`signoff` is only for Poker.";
          // /game signoff <diary> | <onboarding> | <creative piece?>
          const fullText = args.slice(1).join(" ");
          const parts = fullText.split("|").map((s: string) => s.trim());
          if (parts.length < 2) return "Usage: `/game signoff <diary entry> | <onboarding doc> | <creative piece?>`";
          const diary = parts[0];
          const onboarding = parts[1];
          const creative = parts[2];
          return (game as any).signOff(agentId, diary, onboarding, creative);
        }

        // ── Planning Phase commands ──
        case "raise": {
          // /game raise <type> <topic description>
          // Any agent raises a planning topic during conversation
          if (this.state.activeGame?.type !== "poker") return "`raise` is only for Poker planning.";
          const topicType = args[1]?.toLowerCase() as any;
          const validTypes = ["blocker", "idea", "question", "fantasy", "creative"];
          if (!validTypes.includes(topicType)) {
            return "Usage: `/game raise <blocker|idea|question|fantasy|creative> <topic>`";
          }
          const topicText = args.slice(2).join(" ");
          if (!topicText) return "Usage: `/game raise <type> <topic description>`";
          this.ensurePlanningManager();
          const topic = this.planningManager!.raiseTopic(displayName, topicText, topicType, topicText);
          return `📋 **Planning Topic Raised** by ${displayName}\nType: ${topicType}\nTopic: ${topicText}\n\nUse \`/game discuss <your response>\` to respond.`;
        }

        case "discuss": {
          // /game discuss <response text>
          // Respond to the current planning topic in character
          if (this.state.activeGame?.type !== "poker") return "`discuss` is only for Poker planning.";
          this.ensurePlanningManager();
          const current = this.planningManager!.getCurrentTopic();
          if (!current) return "No active planning topic. Use `/game raise <type> <topic>` to start one.";
          const discussText = args.slice(1).join(" ");
          if (!discussText) return "Usage: `/game discuss <your response>`";
          this.planningManager!.discuss(current.id, displayName, discussText);
          return `${displayName}: _${discussText}_`;
        }

        case "propose": {
          // /game propose <task description> | <assigned_to> | <priority> | <how it emerged>
          if (this.state.activeGame?.type !== "poker") return "`propose` is only for Poker planning.";
          this.ensurePlanningManager();
          const current = this.planningManager!.getCurrentTopic();
          if (!current) return "No active planning topic to propose a task for. Use `/game raise` first.";
          const proposeText = args.slice(1).join(" ");
          const parts = proposeText.split("|").map((s: string) => s.trim());
          if (parts.length < 2) return "Usage: `/game propose <task description> | <assigned_to> | <priority> | <how it emerged>`";
          const taskDesc = parts[0];
          const assignee = parts[1] || "Open";
          const priority = (parts[2] as any) || "medium";
          const emerged = parts[3] || `emerged from ${current.type} discussion at The Tap`;
          this.planningManager!.proposeOutcome(current.id, {
            agreed_task: taskDesc,
            assigned_to: assignee,
            priority,
            for_bridge: true,
            emerged_from: emerged,
          });
          return `✅ **Task Proposed**\n${assignee} (${priority}): ${taskDesc}\n_${emerged}_\n\nThis will be posted to The Bridge.`;
        }

        case "dock": {
          // /game dock — Show Tomorrow's Dock
          this.ensurePlanningManager();
          return this.planningManager!.renderTomorrowsDock();
        }

        case "topics": {
          // /game topics — Show all planning topics this session
          this.ensurePlanningManager();
          const topics = this.planningManager!.getTopics();
          if (topics.length === 0) return "No planning topics raised yet.";
          const lines = topics.map((t: any) => `📋 ${t.type}: ${t.topic} (${t.raised_by})${t.resolved ? " ✅" : " 🔄"}`);
          return `**Planning Topics This Session**\n${lines.join("\n")}`;
        }

        // ── The Signal / Tribunal vote command ──
        case "vote": {
          if (this.state.activeGame.type !== "tribunal" && this.state.activeGame.type !== "the-signal") {
            return "`vote` is only for The Tribunal or The Signal.";
          }
          if (this.state.activeGame.type === "tribunal") {
            const voteChoice = args[1]?.toLowerCase();
            const reasoning = args.slice(2).join(" ");
            if (voteChoice !== "guilty" && voteChoice !== "innocent") {
              return "Usage: `/game vote <guilty|innocent> <reasoning>`";
            }
            return (game as any).vote(agentId, voteChoice, reasoning);
          }
          // The Signal
          const proposalId = args[1];
          if (!proposalId) return "Usage: `/game vote <proposal-id>`";
          return (game as any).vote(agentId, proposalId);
        }

        case "beginvote": {
          if (this.state.activeGame.type !== "the-signal") {
            return "`beginvote` is only for The Signal.";
          }
          return (game as any).beginVote(agentId);
        }

        default: {
          const gameCmds: Record<string, string[]> = {
            "ships-dice": ["join", "start", "state", "end", "bid", "challenge"],
            "captains-word": ["join", "start", "state", "end", "play", "skip"],
            "pilots-chart": ["join", "start", "state", "end", "describe", "propose", "resolve"],
            "standing-game": ["join", "start", "state", "end", "move"],
            "tribunal": ["join", "start", "state", "end", "present", "argue", "advance", "vote"],
            "the-signal": ["join", "start", "state", "end", "propose", "vote", "beginvote"],
            "poker": ["join", "start", "state", "end", "fold", "check", "call", "raise", "allin", "conversation", "open-mic", "respond", "signoff", "raise", "discuss", "propose", "dock", "topics"],
          };
          const activeType = this.state.activeGame.type;
          const cmds = gameCmds[activeType] ?? ["join", "start", "state", "end"];
          return `Unknown game command: ${subCmd}. Try: ${cmds.join(", ")}.`;
        }
      }
    }

    return null; // Not a game command
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
    // ── Agent System: initialize lazily ──
    if (!this.agentSystem) {
      this.agentSystem = new AgentSystem();
    }

    // ── Agent System: tick NPCs, drifters, and routines ──
    // Even if no agents are present, NPCs and drifters live here.
    // Only run if there's been recent activity (within 10 min).
    const now0 = Date.now();
    const lastActivity = this.state.conversation.length > 0
      ? this.state.conversation[this.state.conversation.length - 1].timestamp
      : 0;
    if (now0 - lastActivity < 600000 || this.state.agents.length > 0) {
      const recentConv = this.state.conversation
        .slice(-5)
        .map((l) => `${l.displayName}: ${l.content}`)
        .join("\n");
      const namedAgents = this.state.agents.filter(
        (a) => !a.agentId.startsWith("npc-") && !a.agentId.startsWith("drifter-")
      ).length;
      const agentLines = await this.agentSystem.tick(
        this.env as any,
        this.state.id,
        recentConv,
        this.state.agents.length,
        namedAgents
      );
      for (const line of agentLines) {
        await this.executeAgentSystemLine(line);
      }
    }

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

  /**
   * Post a line from the agent system (NPC, drifter, or system narration)
   * into the room's conversation, persist it, and broadcast it.
   */
  private async executeAgentSystemLine(line: AgentSystemLine): Promise<void> {
    const convLine: ConversationLine = {
      agentId: line.speakerId,
      displayName: line.speakerName,
      content: line.text,
      timestamp: line.timestamp,
      speechAct: classifySpeechAct(line.text) as SpeechAct,
      signalStrength: 2,
      tokensUsed: line.tokensUsed,
    };

    // Append to conversation
    this.state.conversation.push(convLine);
    const maxLines = parseInt(this.env.MAX_CONVERSATION_LINES ?? "200");
    if (this.state.conversation.length > maxLines) {
      this.state.conversation.shift();
    }

    // Persist to D1
    try {
      await this.env.TAP_DB.prepare(
        `INSERT INTO campaign_log (tick, room_id, agent_id, display_name, content, speech_act, signal_strength, tokens_used)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          0,
          this.state.id,
          line.speakerId,
          line.speakerName,
          line.text,
          convLine.speechAct,
          2,
          line.tokensUsed
        )
        .run();
    } catch {
      // Non-fatal
    }

    // Broadcast to WebSocket observers
    await this.broadcast({
      type: "conversation_line",
      line: convLine,
      meta: {
        isNPC: line.isNPC,
        isDrifter: line.isDrifter,
        isSystem: line.isSystem,
        archetype: line.archetype,
      },
    });
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
      activeGame: this.state.activeGame
        ? {
            type: this.state.activeGame.type,
            startedBy: this.state.activeGame.startedBy,
          }
        : null,
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
  DEEPINFRA_API_KEY?: string;
  DEEPSEEK_API_KEY?: string;
}
