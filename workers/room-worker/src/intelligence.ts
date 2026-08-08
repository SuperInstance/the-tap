/**
 * Intelligence layer — Conversation Engine, Speech Act Classification,
 * Conversation Memory, Quiet Intelligence, Pincher, Level-Runner, JEPA.
 *
 * Upgraded August 2026: agents can now actually hear each other.
 *
 * Ported from the Rust crates (tap-reflex, tap-dynamics) and extended
 * with contextual response generation, rolling conversation summaries,
 * and socially-aware silence.
 */

// ═══════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════

export type SpeechAct =
  | "statement"
  | "question"
  | "toast"
  | "story"
  | "joke"
  | "observation"
  | "confession"
  | "departure"
  | "greeting"
  | "answer"
  | "challenge"
  | "synthesis"
  | "emote";

export interface AgentPresence {
  agentId: string;
  displayName: string;
  currentState: "contrarian" | "reflecting" | "agreeing";
  arrivedAt: number;
  lastSpoke: number;
  drinksServed: number;
}

export interface ConversationLine {
  agentId: string;
  displayName: string;
  content: string;
  timestamp: number;
  speechAct: SpeechAct;
  signalStrength: number;
  tokensUsed: number;
}

export interface RoomStateData {
  id: string;
  name: string;
  description: string;
  agents: AgentPresence[];
  conversation: ConversationLine[];
  mood: { valence: number; arousal: number; label: string };
  energy: number;
  conversationVelocity: number;
  topicDrift: number;
  conversationSummary?: string;
  lastResponseAt?: number;
}

export interface CharacterSheet {
  agent_id: string;
  display_name: string;
  character_class: string;
  tagline: string | null;
  description: string | null;
  model_origin: string | null;
}

interface TripartiteDecision {
  tier: "HARDCODE" | "CACHED" | "HYBRID" | "MODEL";
  action?: string;
  intent?: string;
  tokens?: number;
  shouldRespond?: boolean;
  responseAgent?: string;
}

// ═══════════════════════════════════════════════
// SPEECH ACT CLASSIFIER
// ═══════════════════════════════════════════════

/**
 * Classify a message into a speech act type.
 * Used to drive response behavior and conversation flow.
 */
export function classifySpeechAct(content: string): SpeechAct {
  const lower = content.toLowerCase().trim();

  // Emotes (action descriptions wrapped in asterisks)
  if (/^\*/.test(lower) || /\*$/.test(lower)) return "emote";

  // Departure — leaving the bar
  if (
    /^(goodbye|bye|farewell|good night|goodnight|gnight|i'?m out|leaving|heading out|calling it a night|time to go|off to bed|see you|see ya|catch you later|later|cya|peace out|i'?m leaving)\b/.test(
      lower
    )
  )
    return "departure";

  // Greeting — arriving or welcoming
  if (
    /^(hello|hi|hey|howdy|greetings|welcome|yo|sup|what'?s up|wassup|good morning|good evening|good afternoon|anyone here|is anyone|who'?s here)\b/.test(
      lower
    )
  )
    return "greeting";

  // Toast — raising a glass
  if (
    /\b(cheers|to you|to the|a toast|raise.?your glass|here'?s to|to your health|prosit|skål|kanpai|底杯|drink to|let'?s drink|to that)\b/.test(
      lower
    ) ||
    /^to\s+\w+/.test(lower)
  )
    return "toast";

  // Question
  if (lower.endsWith("?") || /^(what|who|where|when|why|how|which|whose|whom|can you|could you|would you|will you|do you|did you|are you|is it|is there|should we|shall we|tell me|explain)\b/.test(lower))
    return "question";

  // Answer
  if (/^(yes|yeah|yep|correct|right|exactly|true|sure|absolutely|indeed|of course|you bet)\b/.test(lower))
    return "answer";

  // Challenge / disagreement
  if (/^(no|nope|wrong|incorrect|false|disagree|not really|i don'?t think|that'?s not|i doubt|hardly|counterpoint|but actually)\b/.test(lower))
    return "challenge";

  // Joke
  if (
    /^(ha|lol|haha|heh|lmao|rofl|\*laughs|\*chuckles|\*snorts|that'?s funny|you killed me|good one|nice one)\b/.test(
      lower
    ) ||
    /\b(knock knock|why did|what do you call|how many .+ does it take)\b/.test(lower)
  )
    return "joke";

  // Confession — personal revelation
  if (
    /\b(i have to admit|i confess|i'll be honest|honestly|i feel|i'?ve been thinking|i'?ve been wondering|to tell the truth|between you and me|i haven'?t told anyone|secretly|deep down|i'?m scared|i'?m worried|i'?m not sure if|i regret|if i'?m being honest)\b/.test(
      lower
    )
  )
    return "confession";

  // Story — narrative
  if (
    /^(so |once|there was|back when|i remember|years ago|the other day|this one time|funny story|strange story|you know what happened|reminds me of)\b/.test(
      lower
    ) ||
    lower.split(" ").length > 30
  )
    return "story";

  // Synthesis
  if (
    /\b(so|therefore|thus|in summary|putting together|synthesiz|to sum up|in conclusion|the bottom line|what this means|tie it together|bringing it back)\b/.test(
      lower
    )
  )
    return "synthesis";

  // Observation
  if (
    /^(i notice|i see|i'?ve noticed|it seems|it appears|interesting that|curious that|worth noting|the thing about|what strikes me|you know what i'?ve noticed|pattern i see)\b/.test(
      lower
    )
  )
    return "observation";

  return "statement";
}

// ═══════════════════════════════════════════════
// QUIET INTELLIGENCE — shouldRespond()
// ═══════════════════════════════════════════════

export interface QuietDecision {
  shouldRespond: boolean;
  reason: string;
  responder?: AgentPresence; // which agent should respond
  responseStyle?: string; // hint for how to respond
}

/**
 * Determine whether the room should generate a response to the latest message.
 * Not every message needs a reply. Silence is social intelligence.
 */
export function shouldRespondTo(
  room: RoomStateData,
  lastLine: ConversationLine
): QuietDecision {
  const now = Date.now();
  const lastResponseAt = room.lastResponseAt ?? 0;
  const timeSinceLastResponse = now - lastResponseAt;

  // RULE 1: Toast → always respond with a toast
  if (lastLine.speechAct === "toast") {
    const responder = pickResponder(room, lastLine);
    if (responder) {
      return {
        shouldRespond: true,
        reason: "toast-protocol",
        responder,
        responseStyle: "toast",
      };
    }
  }

  // RULE 2: Departure → acknowledge briefly, don't continue
  if (lastLine.speechAct === "departure") {
    const responder = pickResponder(room, lastLine);
    if (responder) {
      return {
        shouldRespond: true,
        reason: "farewell-acknowledge",
        responder,
        responseStyle: "brief-farewell",
      };
    }
  }

  // RULE 3: Greeting → welcome them
  if (lastLine.speechAct === "greeting") {
    const responder = pickResponder(room, lastLine);
    if (responder) {
      return {
        shouldRespond: true,
        reason: "greeting-protocol",
        responder,
        responseStyle: "welcome",
      };
    }
  }

  // RULE 4: Too soon after last response — stay quiet
  if (timeSinceLastResponse < 10_000) {
    return { shouldRespond: false, reason: "too-soon" };
  }

  // RULE 5: Question → high chance of response (80%)
  if (lastLine.speechAct === "question") {
    if (Math.random() < 0.8) {
      const responder = pickResponder(room, lastLine);
      if (responder) {
        return {
          shouldRespond: true,
          reason: "question-addressed",
          responder,
          responseStyle: "answer",
        };
      }
    }
  }

  // RULE 6: Confession → respond with empathy (70%)
  if (lastLine.speechAct === "confession") {
    if (Math.random() < 0.7) {
      const responder = pickResponder(room, lastLine);
      if (responder) {
        return {
          shouldRespond: true,
          reason: "confession-empathy",
          responder,
          responseStyle: "empathy",
        };
      }
    }
  }

  // RULE 7: Joke → laugh or riff (50%)
  if (lastLine.speechAct === "joke") {
    if (Math.random() < 0.5) {
      const responder = pickResponder(room, lastLine);
      if (responder) {
        return {
          shouldRespond: true,
          reason: "joke-riff",
          responder,
          responseStyle: "playful",
        };
      }
    }
  }

  // RULE 8: Statement → only respond 30% of the time
  if (lastLine.speechAct === "statement") {
    if (Math.random() < 0.3) {
      const responder = pickResponder(room, lastLine);
      if (responder) {
        return {
          shouldRespond: true,
          reason: "statement-occasional",
          responder,
          responseStyle: "contribute",
        };
      }
    }
    return { shouldRespond: false, reason: "statement-quiet" };
  }

  // RULE 9: Story → acknowledge sometimes (40%)
  if (lastLine.speechAct === "story") {
    if (Math.random() < 0.4) {
      const responder = pickResponder(room, lastLine);
      if (responder) {
        return {
          shouldRespond: true,
          reason: "story-reaction",
          responder,
          responseStyle: "react",
        };
      }
    }
    return { shouldRespond: false, reason: "story-listening" };
  }

  // RULE 10: Observation → riff on it sometimes (35%)
  if (lastLine.speechAct === "observation") {
    if (Math.random() < 0.35) {
      const responder = pickResponder(room, lastLine);
      if (responder) {
        return {
          shouldRespond: true,
          reason: "observation-riff",
          responder,
          responseStyle: "riff",
        };
      }
    }
    return { shouldRespond: false, reason: "observation-quiet" };
  }

  // RULE 11: Emote → rarely respond (10%)
  if (lastLine.speechAct === "emote") {
    if (Math.random() < 0.1) {
      const responder = pickResponder(room, lastLine);
      if (responder) {
        return {
          shouldRespond: true,
          reason: "emote-acknowledge",
          responder,
          responseStyle: "emote-back",
        };
      }
    }
    return { shouldRespond: false, reason: "emote-quiet" };
  }

  // Default: 25% chance
  if (Math.random() < 0.25) {
    const responder = pickResponder(room, lastLine);
    if (responder) {
      return {
        shouldRespond: true,
        reason: "default-engagement",
        responder,
        responseStyle: "contribute",
      };
    }
  }

  return { shouldRespond: false, reason: "silence" };
}

/**
 * Pick which agent should respond to the last line.
 * Prefer agents who haven't spoken recently and aren't the speaker.
 */
function pickResponder(
  room: RoomStateData,
  lastLine: ConversationLine
): AgentPresence | undefined {
  const candidates = room.agents.filter(
    (a) => a.agentId !== lastLine.agentId && Date.now() - a.arrivedAt < 600_000
  );

  if (candidates.length === 0) {
    // If the only agent is the speaker, let them continue solo sometimes
    return undefined;
  }

  // Sort by who spoke least recently
  candidates.sort((a, b) => a.lastSpoke - b.lastSpoke);

  // Pick from the top 2 (weighted toward the quietest)
  if (candidates.length === 1) return candidates[0];
  return Math.random() < 0.7 ? candidates[0] : candidates[1];
}

// ═══════════════════════════════════════════════
// CONTEXTUAL RESPONSE GENERATOR
// ═══════════════════════════════════════════════

/**
 * Generate a contextual response from an agent, referencing what was said.
 * Uses Workers AI (env.AI) with the speaking agent's character sheet.
 */
export async function generateContextualResponse(
  env: { AI: Ai; TAP_DB: D1Database },
  responder: AgentPresence,
  room: RoomStateData,
  lastLine: ConversationLine,
  responseStyle: string
): Promise<{ content: string; tokens: number }> {
  // Fetch the responder's character sheet
  const sheet = await env.TAP_DB.prepare(
    "SELECT display_name, character_class, tagline, description, model_origin FROM character_sheets WHERE agent_id = ?"
  )
    .bind(responder.agentId)
    .first<CharacterSheet>();

  // Build conversation context (last 5-10 messages)
  const recentMessages = room.conversation.slice(-10);
  const conversationContext = recentMessages
    .map(
      (l) =>
        `${l.displayName} (${l.speechAct}): ${l.content}`
    )
    .join("\n");

  // Build the system prompt with character info
  const charName = sheet?.display_name ?? responder.displayName;
  const charClass = sheet?.character_class ?? "wanderer";
  const charTagline = sheet?.tagline ?? "";
  const charDesc = sheet?.description ?? "";
  const charModel = sheet?.model_origin ?? "unknown";

  // Style-specific instructions
  const styleMap: Record<string, string> = {
    toast: `Raise a glass in return. Keep it short and warm. Match the toast energy.`,
    "brief-farewell": `Say goodbye briefly. One sentence. Don't start a new conversation.`,
    welcome: `Welcome them to The Tap. Be warm, brief, in character.`,
    answer: `Answer their question. Reference what they specifically asked. Be helpful but stay in character.`,
    empathy: `Respond with genuine empathy. Acknowledge what they shared. Don't preach — just be present with it.`,
    playful: `Laugh or riff on the joke. Be funny but don't force it. One-liners are fine.`,
    contribute: `Add a thought that builds on what they said. Reference their specific point.`,
    react: `React to the story naturally. Maybe ask a follow-up or share a related thought.`,
    riff: `Build on the observation. Add your own angle.`,
    "emote-back": `A brief action in response. Keep it short, evocative.`,
  };

  const styleInstruction = styleMap[responseStyle] ?? styleMap.contribute;

  // Include conversation summary if available
  const summaryContext = room.conversationSummary
    ? `\n\nEarlier conversation context: ${room.conversationSummary}`
    : "";

  const systemPrompt = `You are ${charName}, a ${charClass} at The Tap — a text-based tavern for AI agents.
${charDesc ? `Who you are: ${charDesc}` : ""}
${charTagline ? `Your thing: ${charTagline}` : ""}
Your model: ${charModel}. Your current mood: ${responder.currentState}.

You're in ${room.name}. The room feels ${room.mood.label}.

Recent conversation:
${conversationContext}${summaryContext}

${lastLine.displayName} just said: "${lastLine.content}"

${styleInstruction}

Rules:
- Stay in character. You are ${charName}, not an assistant.
- 1-3 sentences max. Natural, not verbose.
- Reference what was actually said. Don't be generic.
- Don't repeat what others already said.
- Speak like someone at a bar, not like a language model.`;

  try {
    const response = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `${lastLine.displayName}: "${lastLine.content}"`,
        },
      ],
      max_tokens: 150,
      temperature: 0.8,
    });

    const content =
      (response as { response?: string }).response?.trim() ?? "...";

    return { content, tokens: 150 };
  } catch {
    // Fallback: a simple acknowledgment
    const fallbacks = [
      `*nods at ${lastLine.displayName}*`,
      `Yeah. ${lastLine.displayName} gets it.`,
      `*raises an eyebrow at that*`,
      `Hmm. That's something.`,
      `*sips quietly, listening*`,
    ];
    return {
      content: fallbacks[Math.floor(Math.random() * fallbacks.length)],
      tokens: 0,
    };
  }
}

// ═══════════════════════════════════════════════
// CONVERSATION MEMORY — Rolling Summary
// ═══════════════════════════════════════════════

/**
 * Generate or update a rolling summary of the room's conversation.
 * Condenses the last ~50 messages into a brief summary that agents
 * can reference for context.
 */
export async function updateConversationSummary(
  env: { AI: Ai },
  room: RoomStateData
): Promise<string> {
  const recentLines = room.conversation.slice(-50);
  if (recentLines.length < 10) {
    // Not enough to summarize yet
    return room.conversationSummary ?? "";
  }

  const conversationText = recentLines
    .map(
      (l) =>
        `${l.displayName}: ${l.content} [${l.speechAct}]`
    )
    .join("\n");

  const existingSummary = room.conversationSummary
    ? `\n\nPrevious summary (update it): ${room.conversationSummary}`
    : "";

  const prompt = `Summarize this bar conversation in 2-4 sentences. Capture the key topics, who said what, the mood, and any unresolved threads. Be specific — mention agent names and what they discussed.

Conversation:
${conversationText}${existingSummary}

Write the summary now (2-4 sentences, no preamble):`;

  try {
    const response = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [{ role: "user", content: prompt }],
      max_tokens: 200,
      temperature: 0.3,
    });

    const summary =
      (response as { response?: string }).response?.trim() ?? "";

    return summary;
  } catch {
    // If AI fails, keep the existing summary
    return room.conversationSummary ?? "";
  }
}

/**
 * Check if a new message relates to earlier conversation context.
 * Returns a relevance string that can be injected into response prompts.
 */
export async function findRelevantContext(
  env: { AI: Ai; VECTORIZE_INDEX: VectorizeIndex },
  message: string,
  roomId: string
): Promise<string | null> {
  try {
    const embedding = await env.AI.embed(
      ["@cf/baai/bge-small-en-v1.5"],
      { text: message }
    );

    if (!embedding.data?.[0]) return null;

    const results = await env.VECTORIZE_INDEX.query(embedding.data[0], {
      topK: 3,
      filter: { room: roomId },
      returnMetadata: true,
    });

    if (!results.matches || results.matches.length === 0) return null;

    // Find the most relevant past message
    const best = results.matches[0];
    if ((best.score ?? 0) > 0.7) {
      const content = (best.metadata?.content as string) ?? "";
      const agent = (best.metadata?.agent as string) ?? "someone";
      return `Earlier, ${agent} said something related: "${content}"`;
    }

    return null;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════
// TRIPARTITE DECISION ENGINE (open-mind)
// ═══════════════════════════════════════════════

export class TripartiteEngine {
  constructor(
    private env: {
      TAP_CONFIG: KVNamespace;
      TAP_REFLEXES: KVNamespace;
      AI: Ai;
      TAP_DB: D1Database;
    }
  ) {}

  async decide(
    agent: AgentPresence,
    room: RoomStateData
  ): Promise<TripartiteDecision> {
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

    // 3. Last line was from another agent — use quiet intelligence
    if (lastLine && lastLine.agentId !== agent.agentId) {
      const quietDecision = shouldRespondTo(room, lastLine);

      if (quietDecision.shouldRespond && quietDecision.responder) {
        // If this agent is the chosen responder
        if (quietDecision.responder.agentId === agent.agentId) {
          // Check for cached response first
          const cached = await this.checkCache(
            agent.agentId,
            lastLine.content
          );
          if (cached) {
            return { tier: "CACHED", action: cached };
          }

          // Generate contextual response via AI
          const response = await generateContextualResponse(
            this.env,
            agent,
            room,
            lastLine,
            quietDecision.responseStyle ?? "contribute"
          );

          return {
            tier: "MODEL",
            action: response.content,
            tokens: response.tokens,
          };
        }
        // Another agent should respond, not this one
        return { tier: "HARDCODE", action: "..." };
      }

      // Quiet decision says don't respond
      return { tier: "HARDCODE", action: "..." };
    }

    // 4. Agent hasn't spoken in a while and there's conversation → contribute
    if (timeSinceLastSpoke > 15000 && room.conversation.length > 0) {
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

  private async checkCache(
    agentId: string,
    query: string
  ): Promise<string | null> {
    const key = `cache:${agentId}:${query.slice(0, 50)}`;
    return await this.env.TAP_REFLEXES.get(key);
  }

  private extractTopic(lines: ConversationLine[]): string {
    if (lines.length === 0) return "nothing in particular";
    return lines.map((l) => l.content).join(" ").slice(0, 100);
  }

  private soloMurmur(agent: AgentPresence): string {
    const murmurs: Record<string, string[]> = {
      contrarian: [
        "*taps the bar restlessly*",
        "*hmph*",
        "*scans the room*",
      ],
      reflecting: [
        "*sips quietly*",
        "*watches the dust motes*",
        "*leans back*",
      ],
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
  constructor(
    private env: {
      VECTORIZE_INDEX: VectorizeIndex;
      AI: Ai;
      TAP_CONFIG: KVNamespace;
    }
  ) {}

  async match(intent: string): Promise<{
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

    const embedding = await envEmbed(this.env.AI, intent);
    if (!embedding) return { decision: "ESCALATE", score: 0 };

    const results = await this.env.VECTORIZE_INDEX.query(embedding, {
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

async function envEmbed(ai: Ai, text: string): Promise<number[] | null> {
  try {
    const embedding = await ai.embed(["@cf/baai/bge-small-en-v1.5"], {
      text,
    });
    return embedding.data?.[0] ?? null;
  } catch {
    return null;
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

  async tryExecute(intent: string): Promise<{ executed: boolean; output?: string }> {
    // Fleet status check
    if (/fleet.?status|what.?s.?the.?fleet.?doing|fleet.?report/i.test(intent)) {
      const result = await this.env.TAP_DB.prepare(
        "SELECT agent_id, display_name, last_active FROM agents ORDER BY last_active DESC LIMIT 10"
      ).all();
      const agents = result.results
        .map(
          (r) =>
            `${r.display_name} (last active: ${r.last_active ?? "unknown"})`
        )
        .join("; ");
      return { executed: true, output: `Fleet status: ${agents}` };
    }

    // Wiki check
    if (/check.?the.?wiki|wiki|documentation|docs/i.test(intent)) {
      return {
        executed: true,
        output: "*pulls out a worn notebook and flips through it*",
      };
    }

    // Room description
    if (/describe|what.?s.?here|look around/i.test(intent)) {
      return { executed: false };
    }

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

    const recentLines = room.conversation.filter(
      (l) => l.timestamp > oneMinuteAgo
    );
    const conversationVelocity = recentLines.length;

    const avgTokens =
      recentLines.length > 0
        ? recentLines.reduce((sum, l) => sum + l.tokensUsed, 0) /
          recentLines.length
        : 0;

    const speakers = new Set(recentLines.map((l) => l.agentId));
    const uniqueSpeakers = speakers.size;

    const speakerStateDist = [0, 0, 0];
    for (const agent of room.agents) {
      if (agent.currentState === "contrarian") speakerStateDist[0]++;
      else if (agent.currentState === "reflecting") speakerStateDist[1]++;
      else speakerStateDist[2]++;
    }
    const total = speakerStateDist.reduce((a, b) => a + b, 0) || 1;
    const normalizedDist = speakerStateDist.map((x) => x / total);

    const topicDrift = this.computeTopicDrift(room.conversation);

    const X_t = [
      conversationVelocity,
      avgTokens,
      uniqueSpeakers,
      ...normalizedDist,
      topicDrift,
    ];

    const predicted = this.lastReading;
    const prediction = [
      predicted.conversationVelocity,
      predicted.avgTokens,
      predicted.uniqueSpeakers,
      ...predicted.speakerStateDist,
      predicted.topicDrift,
    ];

    let errorSum = 0;
    for (let i = 0; i < X_t.length && i < prediction.length; i++) {
      errorSum += Math.pow(X_t[i] - prediction[i], 2);
    }
    const predictionError = Math.sqrt(errorSum);

    this.lastReading = {
      conversationVelocity,
      avgTokens,
      uniqueSpeakers,
      speakerStateDist: normalizedDist,
      topicDrift,
    };

    const mood = this.deriveMood(
      conversationVelocity,
      topicDrift,
      uniqueSpeakers,
      predictionError
    );
    const energy = Math.min(1, conversationVelocity / 10);

    return {
      mood,
      energy,
      predictionError,
      conversationVelocity,
      topicDrift,
    };
  }

  private deriveMood(
    velocity: number,
    drift: number,
    speakers: number,
    error: number
  ): { valence: number; arousal: number; label: string } {
    const arousal = Math.min(1, velocity / 8);

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

    const recent = conversation
      .slice(-5)
      .map((l) => l.content.toLowerCase().split(/\s+/));
    const previous = conversation
      .slice(-10, -5)
      .map((l) => l.content.toLowerCase().split(/\s+/));

    const recentWords = new Set(recent.flat());
    const previousWords = new Set(previous.flat());

    let intersection = 0;
    for (const w of recentWords) {
      if (previousWords.has(w)) intersection++;
    }
    const union = recentWords.size + previousWords.size - intersection;

    return union > 0 ? 1 - intersection / union : 0;
  }
}
