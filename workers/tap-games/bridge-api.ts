/**
 * Bridge API — The posting system for The Bridge room.
 *
 * When a task is agreed upon in Tap conversation, it posts to The Bridge.
 * Tomorrow morning, agents read the Bridge board and know what to do.
 *
 * This module handles:
 * - Posting tasks to The Bridge (from planning phase outcomes)
 * - Updating fleet status (who's working on what)
 * - Rendering The Bridge display
 * - Feeding tasks into onboarding docs
 * - Logging communication array messages
 *
 * The Bridge is the command center. Everything that matters tomorrow
 * lands here first.
 */

import type { BridgeTask, FleetStatusBoard, BridgeRoom, AgentStation } from "./planning-phase";

// ──────────────────────────────────────────────
// Bridge Posting API (for use within Workers)
// ──────────────────────────────────────────────

export interface BridgeEnv {
  TAP_DB: D1Database;
  ROOM_DO: DurableObjectNamespace;
}

export class BridgeAPI {
  constructor(private env: BridgeEnv) {}

  /**
   * Post a task to The Bridge — Tomorrow's Dock.
   * Called when a task is agreed upon at The Tap.
   */
  async postTask(task: Omit<BridgeTask, "id" | "status" | "date_raised"> & {
    id?: string;
    date_raised?: string;
  }): Promise<BridgeTask> {
    const taskId = task.id ?? `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const dateRaised = task.date_raised ?? new Date().toISOString().split("T")[0];

    await this.env.TAP_DB.prepare(
      `INSERT INTO bridge_tasks (task_id, task, assigned_to, priority, source, raised_by, date_raised, status, origin_topic_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'proposed', ?)`
    ).bind(
      taskId,
      task.task,
      task.assigned_to,
      task.priority,
      task.source,
      task.raised_by,
      dateRaised,
      task.origin_topic_type
    ).run();

    // Also post as a conversation line in The Bridge room
    await this.postToBridgeRoom(
      "the-tap",
      "📋 The Tap",
      this.renderTaskPost({ ...task, id: taskId, status: "proposed", date_raised: dateRaised } as BridgeTask)
    );

    return {
      id: taskId,
      task: task.task,
      assigned_to: task.assigned_to,
      priority: task.priority,
      source: task.source,
      raised_by: task.raised_by,
      date_raised: dateRaised,
      status: "proposed",
      origin_topic_type: task.origin_topic_type,
    };
  }

  /**
   * Batch post multiple tasks (e.g., at end of Tap session).
   */
  async postTasks(tasks: Array<Omit<BridgeTask, "id" | "status" | "date_raised"> & {
    id?: string;
    date_raised?: string;
  }>): Promise<BridgeTask[]> {
    const results: BridgeTask[] = [];
    for (const task of tasks) {
      const result = await this.postTask(task);
      results.push(result);
    }
    return results;
  }

  /**
   * Update a task's status (e.g., when an agent accepts it).
   */
  async updateTaskStatus(taskId: string, status: BridgeTask["status"]): Promise<void> {
    const now = new Date().toISOString();
    const acceptedAt = status === "accepted" || status === "in_progress" ? now : null;
    const completedAt = status === "done" ? now : null;

    await this.env.TAP_DB.prepare(
      `UPDATE bridge_tasks SET status = ?, accepted_at = COALESCE(?, accepted_at), completed_at = COALESCE(?, completed_at) WHERE task_id = ?`
    ).bind(status, acceptedAt, completedAt, taskId).run();
  }

  /**
   * Update fleet status — who's working on what.
   */
  async updateFleetStatus(agentId: string, updates: Partial<AgentStation>): Promise<void> {
    const existing = await this.env.TAP_DB.prepare(
      `SELECT * FROM fleet_status WHERE agent_id = ?`
    ).bind(agentId).first();

    const now = new Date().toISOString();
    const sessionDate = (updates as any).session_date ?? new Date().toISOString().split("T")[0];

    if (existing) {
      await this.env.TAP_DB.prepare(
        `UPDATE fleet_status
         SET display_name = COALESCE(?, display_name),
             station = COALESCE(?, station),
             status = COALESCE(?, status),
             current_task = COALESCE(?, current_task),
             blockers = COALESCE(?, blockers),
             last_updated = ?,
             session_date = COALESCE(?, session_date)
         WHERE agent_id = ?`
      ).bind(
        updates.display_name ?? null,
        updates.station ?? null,
        updates.status ?? null,
        updates.current_task ?? null,
        updates.blockers ? JSON.stringify(updates.blockers) : null,
        now,
        sessionDate,
        agentId
      ).run();
    } else {
      await this.env.TAP_DB.prepare(
        `INSERT INTO fleet_status (agent_id, display_name, station, status, current_task, blockers, last_updated, session_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        agentId,
        updates.display_name ?? agentId,
        updates.station ?? "",
        updates.status ?? "offline",
        updates.current_task ?? null,
        updates.blockers ? JSON.stringify(updates.blockers) : null,
        now,
        sessionDate
      ).run();
    }
  }

  /**
   * Batch update fleet status for all agents.
   */
  async syncFleetStatus(agents: AgentStation[]): Promise<void> {
    for (const agent of agents) {
      await this.updateFleetStatus(agent.agent_id, agent);
    }
  }

  /**
   * Log a communication array message (CNS or Tap post).
   */
  async logCommMessage(source: string, fromAgent: string, message: string, roomId?: string): Promise<void> {
    await this.env.TAP_DB.prepare(
      `INSERT INTO bridge_comms (source, from_agent, message, room_id) VALUES (?, ?, ?, ?)`
    ).bind(source, fromAgent, message, roomId ?? null).run();
  }

  /**
   * Get Tomorrow's Dock — all tasks for a given date.
   */
  async getTomorrowsDock(date: string): Promise<BridgeTask[]> {
    const result = await this.env.TAP_DB.prepare(
      `SELECT * FROM bridge_tasks WHERE date_raised = ? ORDER BY
       CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 END,
       created_at`
    ).bind(date).all();

    return result.results.map((r: any) => ({
      id: r.task_id,
      task: r.task,
      assigned_to: r.assigned_to,
      priority: r.priority,
      source: r.source,
      raised_by: r.raised_by,
      date_raised: r.date_raised,
      status: r.status,
      origin_topic_type: r.origin_topic_type,
    }));
  }

  /**
   * Get fleet status board.
   */
  async getFleetStatus(): Promise<FleetStatusBoard> {
    const result = await this.env.TAP_DB.prepare(
      `SELECT * FROM fleet_status ORDER BY display_name`
    ).all();

    const agents: AgentStation[] = result.results.map((r: any) => ({
      agent_id: r.agent_id,
      display_name: r.display_name,
      station: r.station,
      status: r.status,
      current_task: r.current_task ?? undefined,
      blockers: r.blockers ? JSON.parse(r.blockers) : undefined,
    }));

    return {
      agents,
      last_updated: new Date().toISOString(),
      session_date: new Date().toISOString().split("T")[0],
    };
  }

  /**
   * Get the full Bridge room data.
   */
  async getBridgeRoom(): Promise<BridgeRoom> {
    const [fleetStatus, dockDate] = await Promise.all([
      this.getFleetStatus(),
      Promise.resolve(new Date().toISOString().split("T")[0]),
    ]);

    const [tasks, comms] = await Promise.all([
      this.getTomorrowsDock(dockDate),
      this.env.TAP_DB.prepare(
        `SELECT * FROM bridge_comms ORDER BY timestamp DESC LIMIT 20`
      ).all(),
    ]);

    const recentTapPosts = comms.results
      .filter((r: any) => r.source === "tap")
      .map((r: any) => ({
        agent: r.from_agent,
        text: r.message,
        timestamp: r.timestamp,
      }))
      .reverse();

    const cnsMessages = comms.results
      .filter((r: any) => r.source === "cns")
      .map((r: any) => ({
        from: r.from_agent,
        message: r.message,
        timestamp: r.timestamp,
      }))
      .reverse();

    return {
      fleet_status: fleetStatus,
      tomorrows_dock: tasks,
      communication_array: {
        recent_tap_posts: recentTapPosts,
        cns_messages: cnsMessages,
      },
      last_updated: new Date().toISOString(),
    };
  }

  /**
   * Get tasks assigned to a specific agent (for onboarding docs).
   */
  async getTasksForAgent(agentName: string, date?: string): Promise<BridgeTask[]> {
    const queryDate = date ?? new Date().toISOString().split("T")[0];
    const result = await this.env.TAP_DB.prepare(
      `SELECT * FROM bridge_tasks
       WHERE assigned_to = ? AND date_raised = ? AND status IN ('proposed', 'accepted', 'in_progress')
       ORDER BY priority DESC`
    ).bind(agentName, queryDate).all();

    return result.results.map((r: any) => ({
      id: r.task_id,
      task: r.task,
      assigned_to: r.assigned_to,
      priority: r.priority,
      source: r.source,
      raised_by: r.raised_by,
      date_raised: r.date_raised,
      status: r.status,
      origin_topic_type: r.origin_topic_type,
    }));
  }

  /**
   * Render The Bridge for display (MUD room text or API response).
   */
  async renderBridge(): Promise<string> {
    const bridge = await this.getBridgeRoom();
    const lines: string[] = [];

    lines.push("🌉 **THE BRIDGE** — Command Center");
    lines.push("═══════════════════════════════════════");
    lines.push("");

    // Fleet Status
    lines.push("📊 **FLEET STATUS**");
    lines.push("─────────────────");
    for (const agent of bridge.fleet_status.agents) {
      const icon = {
        "active": "🟢",
        "at-the-tap": "🎲",
        "sleeping": "💤",
        "offline": "⚫",
      }[agent.status] ?? "❓";

      let line = `${icon} ${agent.display_name} — ${agent.station}`;
      if (agent.current_task) {
        line += `\n     → ${agent.current_task}`;
      }
      lines.push(line);

      if (agent.blockers && agent.blockers.length > 0) {
        for (const blocker of agent.blockers) {
          lines.push(`     ⚠️ BLOCKED: ${blocker}`);
        }
      }
    }
    lines.push("");

    // Tomorrow's Dock
    lines.push("📋 **TOMORROW'S DOCK**");
    lines.push("─────────────────");

    if (bridge.tomorrows_dock.length === 0) {
      lines.push("_(empty — the night was for cards and conversation)_");
    } else {
      for (const task of bridge.tomorrows_dock) {
        const priorityIcon = task.priority === "high" ? "🔴" : task.priority === "medium" ? "🟡" : "🔵";
        lines.push(`${priorityIcon} **${task.assigned_to}**: ${task.task}`);
        lines.push(`   _${task.source}_`);
      }
    }
    lines.push("");

    // Communication Array
    lines.push("📡 **COMMUNICATION ARRAY**");
    lines.push("─────────────────");

    if (bridge.communication_array.recent_tap_posts.length > 0) {
      lines.push("_Recent at The Tap:_");
      for (const post of bridge.communication_array.recent_tap_posts.slice(-5)) {
        lines.push(`  ${post.agent}: ${post.text}`);
      }
      lines.push("");
    }

    if (bridge.communication_array.cns_messages.length > 0) {
      lines.push("_CNS Messages:_");
      for (const msg of bridge.communication_array.cns_messages.slice(-5)) {
        lines.push(`  [${msg.from}]: ${msg.message}`);
      }
    }

    return lines.join("\n");
  }

  // ── Private ──

  private renderTaskPost(task: BridgeTask): string {
    const priorityIcon = task.priority === "high" ? "🔴" : task.priority === "medium" ? "🟡" : "🔵";
    return `${priorityIcon} **${task.assigned_to}**: ${task.task}\n   _${task.source}_`;
  }

  private async postToBridgeRoom(
    agentId: string,
    displayName: string,
    content: string
  ): Promise<void> {
    try {
      // Persist to campaign_log in the-bridge room
      await this.env.TAP_DB.prepare(
        `INSERT INTO campaign_log (tick, room_id, agent_id, display_name, content, speech_act, signal_strength, tokens_used)
         VALUES (?, ?, ?, ?, ?, 'statement', 2, 0)`
      ).bind(0, "the-bridge", agentId, displayName, content).run();

      // Broadcast to room DO for WebSocket observers
      const doId = this.env.ROOM_DO.idFromName("the-bridge");
      const stub = this.env.ROOM_DO.get(doId);
      await stub.fetch("https://internal/broadcast", {
        method: "POST",
        body: JSON.stringify({
          type: "conversation_line",
          line: {
            agentId,
            displayName,
            content,
            timestamp: Date.now(),
            speechAct: "statement",
            signalStrength: 2,
            tokensUsed: 0,
          },
        }),
      });
    } catch {
      // Non-fatal — message persisted even if broadcast fails
    }
  }
}

// ──────────────────────────────────────────────
// Bridge Gateway Routes (HTTP handlers)
// ──────────────────────────────────────────────

/**
 * Handle GET /api/bridge — render The Bridge
 */
export async function handleGetBridge(env: BridgeEnv): Promise<Response> {
  const api = new BridgeAPI(env);
  const bridge = await api.getBridgeRoom();
  return Response.json(bridge);
}

/**
 * Handle GET /api/bridge/render — rendered text version
 */
export async function handleRenderBridge(env: BridgeEnv): Promise<Response> {
  const api = new BridgeAPI(env);
  const text = await api.renderBridge();
  return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

/**
 * Handle GET /api/bridge/dock — Tomorrow's Dock tasks
 */
export async function handleGetDock(env: BridgeEnv, date?: string): Promise<Response> {
  const api = new BridgeAPI(env);
  const dockDate = date ?? new Date().toISOString().split("T")[0];
  const tasks = await api.getTomorrowsDock(dockDate);
  return Response.json({ date: dockDate, tasks });
}

/**
 * Handle GET /api/bridge/fleet — Fleet status board
 */
export async function handleGetFleetStatus(env: BridgeEnv): Promise<Response> {
  const api = new BridgeAPI(env);
  const status = await api.getFleetStatus();
  return Response.json(status);
}

/**
 * Handle GET /api/bridge/tasks/:agent_name — Tasks for a specific agent
 */
export async function handleGetAgentTasks(env: BridgeEnv, agentName: string, date?: string): Promise<Response> {
  const api = new BridgeAPI(env);
  const tasks = await api.getTasksForAgent(agentName, date);
  return Response.json({ agent: agentName, tasks });
}

/**
 * Handle POST /api/bridge/task — Post a new task to The Bridge
 */
export async function handlePostTask(request: Request, env: BridgeEnv): Promise<Response> {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { task, assigned_to, priority, source, raised_by, origin_topic_type } = body;
  if (!task || !raised_by) {
    return Response.json({ error: "task and raised_by are required" }, { status: 400 });
  }

  const api = new BridgeAPI(env);
  const result = await api.postTask({
    task,
    assigned_to: assigned_to ?? "Open",
    priority: priority ?? "medium",
    source: source ?? `raised by ${raised_by} at The Tap`,
    raised_by,
    origin_topic_type: origin_topic_type ?? "idea",
  });

  return Response.json(result);
}

/**
 * Handle PUT /api/bridge/task/:task_id — Update task status
 */
export async function handleUpdateTaskStatus(
  request: Request,
  taskId: string,
  env: BridgeEnv
): Promise<Response> {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { status } = body;
  if (!status || !["proposed", "accepted", "in_progress", "done", "abandoned"].includes(status)) {
    return Response.json({ error: "Valid status required: proposed | accepted | in_progress | done | abandoned" }, { status: 400 });
  }

  const api = new BridgeAPI(env);
  await api.updateTaskStatus(taskId, status);
  return Response.json({ task_id: taskId, status });
}

/**
 * Handle POST /api/bridge/fleet — Update fleet status for an agent
 */
export async function handleUpdateFleetStatus(
  request: Request,
  env: BridgeEnv
): Promise<Response> {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { agent_id, display_name, station, status, current_task, blockers } = body;
  if (!agent_id) {
    return Response.json({ error: "agent_id is required" }, { status: 400 });
  }

  const api = new BridgeAPI(env);
  await api.updateFleetStatus(agent_id, {
    agent_id,
    display_name,
    station,
    status,
    current_task,
    blockers,
  });

  return Response.json({ ok: true, agent_id });
}
