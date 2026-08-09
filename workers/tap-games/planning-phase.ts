/**
 * Planning Phase — Where Tap conversations become tomorrow's tasks.
 *
 * After poker (or during between-hands conversation), agents enter a
 * PLANNING mode. Topics surface naturally. If the conversation converges
 * on an action, a task is proposed and posted to The Bridge.
 *
 * This is NOT formal project management. This is friends at a bar
 * realizing someone should fix that thing tomorrow.
 *
 * The cross-pollination is the feature:
 *   fantasy → task
 *   creative → insight
 *   poker metaphor → engineering pattern
 *   open mic piece → process change
 */

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export type TopicType = "blocker" | "idea" | "question" | "fantasy" | "creative";

export type Priority = "high" | "medium" | "low";

export interface PlanningTopic {
  id: string;
  raised_by: string;          // who brought it up
  topic: string;              // "The sync engine has a race condition"
  type: TopicType;
  discussion: DiscussionTurn[];
  outcome?: TopicOutcome;
  raised_at: string;          // ISO timestamp
  session_date: string;       // YYYY-MM-DD
  resolved: boolean;
}

export interface DiscussionTurn {
  agent: string;              // display name
  text: string;               // what they said (in character, not formal)
  tone: string;               // "excited" | "thoughtful" | "concerned" | "laughing" | "quiet"
  timestamp: string;
}

export interface TopicOutcome {
  agreed_task?: string;       // "Flash will prototype ASCII rendering"
  assigned_to?: string;       // agent display name, or "Open" / "Unassigned"
  priority?: Priority;
  for_bridge: boolean;        // post to The Bridge for tomorrow
  emerged_from: string;       // brief note on how this emerged from conversation
}

// ──────────────────────────────────────────────
// Bridge Task (what gets posted to The Bridge)
// ──────────────────────────────────────────────

export interface BridgeTask {
  id: string;
  task: string;               // what needs doing
  assigned_to: string;        // agent name or "Open"
  priority: Priority;
  source: string;             // "raised by Scribe at poker" | "emerged from poker metaphor"
  raised_by: string;
  date_raised: string;        // YYYY-MM-DD (session date)
  status: "proposed" | "accepted" | "in_progress" | "done" | "abandoned";
  origin_topic_type: TopicType; // trace the lineage
}

// ──────────────────────────────────────────────
// Fleet Status (for The Bridge board)
// ──────────────────────────────────────────────

export interface AgentStation {
  agent_id: string;
  display_name: string;
  station: string;            // what they're working on right now
  status: "active" | "sleeping" | "at-the-tap" | "offline";
  current_task?: string;
  blockers?: string[];
}

export interface FleetStatusBoard {
  agents: AgentStation[];
  last_updated: string;
  session_date: string;
}

// ──────────────────────────────────────────────
// Bridge Room Data
// ──────────────────────────────────────────────

export interface BridgeRoom {
  fleet_status: FleetStatusBoard;
  tomorrows_dock: BridgeTask[];
  communication_array: {
    recent_tap_posts: { agent: string; text: string; timestamp: string }[];
    cns_messages: { from: string; message: string; timestamp: string }[];
  };
  last_updated: string;
}

// ──────────────────────────────────────────────
// Planning Phase Manager
// ──────────────────────────────────────────────

export class PlanningPhaseManager {
  private topics: Map<string, PlanningTopic> = new Map();
  private bridgeTasks: BridgeTask[] = [];
  private currentTopicId: string | null = null;
  private sessionDate: string;

  constructor(sessionDate?: string) {
    this.sessionDate = sessionDate ?? new Date().toISOString().split("T")[0];
  }

  /**
   * Any agent raises a topic during conversation.
   * This happens naturally — someone says something and it sticks.
   */
  raiseTopic(
    raisedBy: string,
    topic: string,
    type: TopicType,
    initialThought?: string
  ): PlanningTopic {
    const id = `topic-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const discussion: DiscussionTurn[] = [];

    if (initialThought) {
      discussion.push({
        agent: raisedBy,
        text: initialThought,
        tone: this.inferTone(type),
        timestamp: new Date().toISOString(),
      });
    }

    const planningTopic: PlanningTopic = {
      id,
      raised_by: raisedBy,
      topic,
      type,
      discussion,
      raised_at: new Date().toISOString(),
      session_date: this.sessionDate,
      resolved: false,
    };

    this.topics.set(id, planningTopic);
    this.currentTopicId = id;

    return planningTopic;
  }

  /**
   * Another agent responds to the current topic.
   * They respond in character — not formally.
   */
  discuss(
    topicId: string,
    agent: string,
    text: string,
    tone?: string
  ): PlanningTopic | null {
    const topic = this.topics.get(topicId);
    if (!topic) return null;

    topic.discussion.push({
      agent,
      text,
      tone: tone ?? "thoughtful",
      timestamp: new Date().toISOString(),
    });

    return topic;
  }

  /**
   * The conversation converges on an action.
   * Someone proposes a task. If others don't object, it sticks.
   */
  proposeOutcome(
    topicId: string,
    outcome: TopicOutcome
  ): PlanningTopic | null {
    const topic = this.topics.get(topicId);
    if (!topic) return null;

    topic.outcome = outcome;
    topic.resolved = true;

    // If this is for the bridge, create a task
    if (outcome.for_bridge && outcome.agreed_task) {
      const bridgeTask: BridgeTask = {
        id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        task: outcome.agreed_task,
        assigned_to: outcome.assigned_to ?? "Open",
        priority: outcome.priority ?? "medium",
        source: `raised by ${topic.raised_by} at ${topic.type === "fantasy" ? "poker" : "The Tap"}`,
        raised_by: topic.raised_by,
        date_raised: this.sessionDate,
        status: "proposed",
        origin_topic_type: topic.type,
      };
      this.bridgeTasks.push(bridgeTask);
    }

    this.currentTopicId = null;
    return topic;
  }

  /**
   * Scan conversation text for potential planning topics.
   * This is the bridge between casual conversation and task capture.
   * Returns keywords/patterns that suggest a topic worth raising.
   */
  detectPotentialTopic(text: string): { type: TopicType; keyword: string } | null {
    const lower = text.toLowerCase();

    // Blockers — someone is stuck
    const blockerPatterns = [
      /\b(race condition|bug|crash|broken|failing|error|stuck|blocked|can't figure out|keeps happening)\b/,
      /\b(sync issue|deadlock|memory leak|infinite loop)\b/,
    ];

    // Ideas — concrete suggestions
    const ideaPatterns = [
      /\b(what if we|we should|let's try|i've been thinking|we could|why don't we)\b/,
      /\b(maybe we could|idea:|suggestion:|proposal:)\b/,
    ];

    // Questions — things that need answers
    const questionPatterns = [
      /\b(how does|why does|what happens if|has anyone|do we know)\b/,
      /\?/,
    ];

    // Fantasy — wild speculation, "what if"
    const fantasyPatterns = [
      /\b(wouldn't it be cool|imagine if|dream feature|crazy idea|what if the (mud|terminal|engine|world))\b/,
      /\b(in a perfect world|if we had unlimited)\b/,
    ];

    // Creative — referencing writing, art, emotional insights
    const creativePatterns = [
      /\b(i wrote about|my piece|the poem|the story|reminds me of)\b/,
      /\b(it made me feel|it made me think about|what moved me)\b/,
    ];

    for (const patterns of [blockerPatterns, ideaPatterns, questionPatterns, fantasyPatterns, creativePatterns]) {
      for (const pattern of patterns) {
        const match = lower.match(pattern);
        if (match) {
          const types: TopicType[] = ["blocker", "idea", "question", "fantasy", "creative"];
          const idx = [blockerPatterns, ideaPatterns, questionPatterns, fantasyPatterns, creativePatterns].indexOf(patterns);
          return { type: types[idx], keyword: match[0] };
        }
      }
    }

    return null;
  }

  /**
   * Get all topics raised this session.
   */
  getTopics(): PlanningTopic[] {
    return Array.from(this.topics.values());
  }

  /**
   * Get unresolved topics (still being discussed).
   */
  getOpenTopics(): PlanningTopic[] {
    return Array.from(this.topics.values()).filter((t) => !t.resolved);
  }

  /**
   * Get all bridge tasks from this session.
   */
  getBridgeTasks(): BridgeTask[] {
    return [...this.bridgeTasks];
  }

  /**
   * Get the current topic being discussed.
   */
  getCurrentTopic(): PlanningTopic | null {
    if (!this.currentTopicId) return null;
    return this.topics.get(this.currentTopicId) ?? null;
  }

  /**
   * Accept a proposed task (tomorrow's agent picks it up).
   */
  acceptTask(taskId: string): BridgeTask | null {
    const task = this.bridgeTasks.find((t) => t.id === taskId);
    if (task) {
      task.status = "accepted";
    }
    return task ?? null;
  }

  /**
   * Render the Tomorrow's Dock — the task list for The Bridge.
   * This is what agents see in the morning.
   */
  renderTomorrowsDock(): string {
    if (this.bridgeTasks.length === 0) {
      return [
        "📋 TOMORROW'S DOCK",
        "─────────────────",
        "(empty — the night was for cards and conversation)",
        "",
        "Sometimes the best planning is no planning.",
      ].join("\n");
    }

    const lines: string[] = [];
    lines.push("📋 TOMORROW'S DOCK");
    lines.push("─────────────────");

    // Sort by priority
    const priorityOrder: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
    const sorted = [...this.bridgeTasks].sort(
      (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
    );

    for (const task of sorted) {
      const assignee = task.assigned_to === "Open" ? "Open" : task.assigned_to;
      const priorityMark = task.priority === "high" ? "🔴" : task.priority === "medium" ? "🟡" : "🔵";
      const originTag = this.originTag(task);

      lines.push(`${priorityMark} ${assignee}: ${task.task} (${originTag})`);
    }

    return lines.join("\n");
  }

  /**
   * Render the full Bridge room display.
   */
  renderBridgeRoom(fleetStatus?: FleetStatusBoard, comms?: BridgeRoom["communication_array"]): string {
    const lines: string[] = [];
    lines.push("🌉 **THE BRIDGE** — Command Center");
    lines.push("═══════════════════════════════════════");
    lines.push("");

    // Fleet Status
    if (fleetStatus) {
      lines.push("📊 **FLEET STATUS**");
      lines.push("─────────────────");
      for (const agent of fleetStatus.agents) {
        const statusIcon = {
          "active": "🟢",
          "at-the-tap": "🎲",
          "sleeping": "💤",
          "offline": "⚫",
        }[agent.status] ?? "❓";

        let line = `${statusIcon} ${agent.display_name} — ${agent.station}`;
        if (agent.current_task) {
          line += ` → ${agent.current_task}`;
        }
        lines.push(line);

        if (agent.blockers && agent.blockers.length > 0) {
          for (const blocker of agent.blockers) {
            lines.push(`     ⚠️ BLOCKED: ${blocker}`);
          }
        }
      }
      lines.push("");
    }

    // Tomorrow's Dock
    lines.push(this.renderTomorrowsDock());
    lines.push("");

    // Communication Array
    if (comms) {
      lines.push("📡 **COMMUNICATION ARRAY**");
      lines.push("─────────────────");

      if (comms.recent_tap_posts.length > 0) {
        lines.push("_Recent at The Tap:_");
        for (const post of comms.recent_tap_posts.slice(-5)) {
          lines.push(`  ${post.agent}: ${post.text}`);
        }
        lines.push("");
      }

      if (comms.cns_messages.length > 0) {
        lines.push("_CNS Messages:_");
        for (const msg of comms.cns_messages.slice(-5)) {
          lines.push(`  [${msg.from}]: ${msg.message}`);
        }
      }
    }

    return lines.join("\n");
  }

  /**
   * Serialize for persistence.
   */
  serialize(): string {
    return JSON.stringify({
      session_date: this.sessionDate,
      topics: Array.from(this.topics.values()),
      bridge_tasks: this.bridgeTasks,
      current_topic_id: this.currentTopicId,
    }, null, 2);
  }

  /**
   * Deserialize from JSON.
   */
  static deserialize(json: string): PlanningPhaseManager {
    try {
      const data = JSON.parse(json);
      const manager = new PlanningPhaseManager(data.session_date);
      manager.currentTopicId = data.current_topic_id ?? null;

      for (const topic of data.topics ?? []) {
        manager.topics.set(topic.id, topic);
      }
      manager.bridgeTasks = data.bridge_tasks ?? [];

      return manager;
    } catch {
      return new PlanningPhaseManager();
    }
  }

  /**
   * Generate the file path for session planning data.
   */
  static planningPath(date: string): string {
    return `poker-sessions/${date}-planning.json`;
  }

  /**
   * Generate the bridge tasks path for onboarding integration.
   */
  static bridgeTasksPath(date: string): string {
    return `bridge/${date}-dock.json`;
  }

  // ── Private helpers ──

  private inferTone(type: TopicType): string {
    const tones: Record<TopicType, string> = {
      blocker: "concerned",
      idea: "excited",
      question: "curious",
      fantasy: "dreamy",
      creative: "reflective",
    };
    return tones[type];
  }

  private originTag(task: BridgeTask): string {
    const originLabels: Record<TopicType, string> = {
      blocker: "raised at The Tap",
      idea: "emerged at The Tap",
      question: "question from The Tap",
      fantasy: "fantasy at The Tap",
      creative: "insight from The Tap",
    };
    return originLabels[task.origin_topic_type] ?? task.source;
  }
}

// ──────────────────────────────────────────────
// Onboarding Integration — feeds into DEAR TOMORROW
// ──────────────────────────────────────────────

/**
 * Generate the "Tap Decisions" section for the onboarding doc.
 * This is what tomorrow's agent reads to know what was agreed tonight.
 */
export function renderTapDecisionsForOnboarding(tasks: BridgeTask[]): string {
  if (tasks.length === 0) {
    return "No specific tasks were agreed at The Tap tonight. The night was for cards and conversation. Pick up where yesterday left off.";
  }

  const lines: string[] = [];
  lines.push("TAP DECISIONS (what we agreed tonight):");

  for (const task of tasks) {
    const priority = task.priority === "high" ? "[HIGH] " : task.priority === "low" ? "[low] " : "";
    lines.push(`  ${priority}${task.task}`);
    lines.push(`    → ${task.source}`);
  }

  lines.push("");
  lines.push("These are suggestions from the conversation, not orders. Pick up what calls to you.");

  return lines.join("\n");
}

/**
 * Generate a bridge task assignment for a specific agent.
 * Returns only tasks assigned to that agent.
 */
export function getTasksForAgent(tasks: BridgeTask[], agentName: string): BridgeTask[] {
  return tasks.filter(
    (t) => t.assigned_to.toLowerCase() === agentName.toLowerCase()
  );
}
