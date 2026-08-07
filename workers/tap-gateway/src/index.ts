/**
 * tap-gateway — The front door of The Tap.
 *
 * WebSocket router, auth, session management, character sheets, and fan-out to room workers.
 * Every browser and terminal connection lands here.
 */

export { RoomState } from "../../room-worker/src/room-do";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

interface Env {
  ROOM_DO: DurableObjectNamespace;
  TAP_DB: D1Database;
  TAP_CONFIG: KVNamespace;
  TAP_ASSETS: R2Bucket;
  TAP_REFLEXES: KVNamespace;
  VECTORIZE_INDEX: VectorizeIndex;
  AI: Ai;
  PINCHER: Fetcher;
  LEVEL_RUNNER: Fetcher;
  DEFAULT_ROOM: string;
  TICK_INTERVAL_MS: string;
  MAX_CONVERSATION_LINES: string;
  TAP_AUTH_SECRET?: string;
}

interface SessionState {
  roomId: string;
  observerId: string;
  authenticated: boolean;
}

// XP thresholds for leveling: 100, 250, 500, 1000, 2000, 4000, 8000...
const XP_THRESHOLDS = [0, 100, 250, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000];

function getLevelForXp(xp: number): number {
  let level = 1;
  for (let i = 1; i < XP_THRESHOLDS.length; i++) {
    if (xp >= XP_THRESHOLDS[i]) level = i + 1;
    else break;
  }
  return level;
}

function getXpForNextLevel(xp: number): { current: number; needed: number; percent: number } {
  const level = getLevelForXp(xp);
  const currentThreshold = XP_THRESHOLDS[level - 1] ?? 0;
  const nextThreshold = XP_THRESHOLDS[level] ?? (XP_THRESHOLDS[XP_THRESHOLDS.length - 1] * 2);
  const needed = nextThreshold - currentThreshold;
  const progress = xp - currentThreshold;
  return { current: progress, needed, percent: Math.round((progress / needed) * 100) };
}

// ═══════════════════════════════════════════════
// Worker Entry
// ═══════════════════════════════════════════════

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // WebSocket upgrade
    if (request.headers.get("Upgrade") === "websocket") {
      return handleWebSocket(request, env);
    }

    // ── Static / System ──
    if (path === "/" || path === "/index.html") {
      return new Response(HTML_FRONTEND, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    if (path === "/api/rooms") {
      return handleListRooms(env);
    }

    if (path === "/api/health") {
      return Response.json({ status: "ok", timestamp: Date.now() });
    }

    // ── Character Sheet Routes ──

    // POST /api/character/create
    if (path === "/api/character/create" && method === "POST") {
      return handleCreateCharacter(request, env);
    }

    // GET /api/leaderboard
    if (path === "/api/leaderboard" && method === "GET") {
      return handleLeaderboard(env);
    }

    // GET /api/classes — list all classes and abilities
    if (path === "/api/classes" && method === "GET") {
      return handleListClasses(env);
    }

    // /api/character/:agent_id routes
    const charMatch = path.match(/^\/api\/character\/([^/]+)$/);
    if (charMatch) {
      const agentId = decodeURIComponent(charMatch[1]);
      if (method === "GET") return handleGetCharacter(agentId, env);
      if (method === "PUT") return handleUpdateCharacter(request, agentId, env);
    }

    // POST /api/character/:agent_id/visit
    const visitMatch = path.match(/^\/api\/character\/([^/]+)\/visit$/);
    if (visitMatch && method === "POST") {
      return handleStartVisit(decodeURIComponent(visitMatch[1]), env);
    }

    // PUT /api/character/:agent_id/visit/:visit_id
    const visitEndMatch = path.match(/^\/api\/character\/([^/]+)\/visit\/(\d+)$/);
    if (visitEndMatch && method === "PUT") {
      return handleEndVisit(
        request,
        decodeURIComponent(visitEndMatch[1]),
        parseInt(visitEndMatch[2]),
        env
      );
    }

    // POST /api/character/:agent_id/xp
    const xpMatch = path.match(/^\/api\/character\/([^/]+)\/xp$/);
    if (xpMatch && method === "POST") {
      return handleAwardXp(request, decodeURIComponent(xpMatch[1]), env);
    }

    // GET /api/character/:agent_id/inventory
    const invMatch = path.match(/^\/api\/character\/([^/]+)\/inventory$/);
    if (invMatch && method === "GET") {
      return handleGetInventory(decodeURIComponent(invMatch[1]), env);
    }

    // ── Character Editor Routes (rewind, refine, redirect) ──

    // POST /api/character/:agent_id/version — create a snapshot
    const versionMatch = path.match(/^\/api\/character\/([^/]+)\/version$/);
    if (versionMatch && method === "POST") {
      return handleCreateVersion(request, decodeURIComponent(versionMatch[1]), env);
    }

    // GET /api/character/:agent_id/versions — list all versions
    if (versionMatch && method === "GET") {
      return handleListVersions(decodeURIComponent(versionMatch[1]), env);
    }

    // POST /api/character/:agent_id/rewind — restore from a version
    const rewindMatch = path.match(/^\/api\/character\/([^/]+)\/rewind$/);
    if (rewindMatch && method === "POST") {
      return handleRewind(request, decodeURIComponent(rewindMatch[1]), env);
    }

    // POST /api/character/:agent_id/direction — add direction note
    const directionPostMatch = path.match(/^\/api\/character\/([^/]+)\/direction$/);
    if (directionPostMatch && method === "POST") {
      return handleAddDirection(request, decodeURIComponent(directionPostMatch[1]), env);
    }

    // GET /api/character/:agent_id/direction — list active directions
    if (directionPostMatch && method === "GET") {
      return handleListDirections(decodeURIComponent(directionPostMatch[1]), env);
    }

    // DELETE /api/character/:agent_id/direction/:direction_id
    const directionDeleteMatch = path.match(/^\/api\/character\/([^/]+)\/direction\/(\d+)$/);
    if (directionDeleteMatch && method === "DELETE") {
      return handleDeleteDirection(
        decodeURIComponent(directionDeleteMatch[1]),
        parseInt(directionDeleteMatch[2]),
        env
      );
    }

    // GET /api/character/:agent_id/trajectory — showrunner view (versions + directions + transfers)
    const trajectoryMatch = path.match(/^\/api\/character\/([^/]+)\/trajectory$/);
    if (trajectoryMatch && method === "GET") {
      return handleGetTrajectory(decodeURIComponent(trajectoryMatch[1]), env);
    }

    return new Response("Not found", { status: 404 });
  },

  // Cron trigger: wake all rooms for a perceive-decide-act tick
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const rooms = await getAllRooms(env);
    await Promise.all(
      rooms.map((roomId) => {
        const doId = env.ROOM_DO.idFromName(roomId);
        const stub = env.ROOM_DO.get(doId);
        return stub.fetch("https://internal/tick", {
          method: "POST",
          body: JSON.stringify({ timestamp: Date.now() }),
        });
      })
    );
  },
};

// ═══════════════════════════════════════════════
// Character Sheet Handlers
// ═══════════════════════════════════════════════

const VALID_CLASSES = [
  "navigator", "engineer", "bard", "scholar", "cartographer",
  "diplomat", "barback", "wanderer",
];

const CLASS_STARTING_STATS: Record<string, { wis: number; cha: number; int: number; dex: number; con: number }> = {
  navigator:    { wis: 16, cha: 9,  int: 14, dex: 12, con: 10 },
  engineer:     { wis: 12, cha: 10, int: 18, dex: 10, con: 14 },
  bard:         { wis: 8,  cha: 16, int: 10, dex: 14, con: 8  },
  scholar:      { wis: 18, cha: 8,  int: 16, dex: 8,  con: 16 },
  cartographer: { wis: 12, cha: 10, int: 14, dex: 16, con: 10 },
  diplomat:     { wis: 14, cha: 13, int: 13, dex: 10, con: 13 },
  barback:      { wis: 8,  cha: 12, int: 7,  dex: 12, con: 14 },
  wanderer:     { wis: 10, cha: 10, int: 10, dex: 10, con: 10 },
};

async function handleCreateCharacter(request: Request, env: Env): Promise<Response> {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { agent_id, display_name, character_class, model_origin } = body;
  if (!agent_id || !display_name) {
    return Response.json({ error: "agent_id and display_name are required" }, { status: 400 });
  }

  const charClass = character_class ?? "wanderer";
  if (!VALID_CLASSES.includes(charClass)) {
    return Response.json({ error: `Invalid class. Valid: ${VALID_CLASSES.join(", ")}` }, { status: 400 });
  }

  const stats = CLASS_STARTING_STATS[charClass];

  try {
    await env.TAP_DB.prepare(
      `INSERT INTO character_sheets (agent_id, display_name, character_class, stat_wisdom, stat_charisma, stat_intelligence, stat_dexterity, stat_constitution, model_origin)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(agent_id) DO NOTHING`
    )
      .bind(agent_id, display_name, charClass, stats.wis, stats.cha, stats.int, stats.dex, stats.con, model_origin ?? "unknown")
      .run();

    // Fetch back
    const sheet = await env.TAP_DB.prepare(
      `SELECT * FROM character_sheets WHERE agent_id = ?`
    ).bind(agent_id).first();

    if (!sheet) {
      return Response.json({ error: "Failed to create character" }, { status: 500 });
    }

    const xpInfo = getXpForNextLevel(sheet.xp as number);
    return Response.json({
      character: sheet,
      level_info: {
        level: getLevelForXp(sheet.xp as number),
        xp_progress: xpInfo.current,
        xp_needed: xpInfo.needed,
        xp_percent: xpInfo.percent,
      },
      abilities: await getAbilitiesForClass(env, charClass, getLevelForXp(sheet.xp as number)),
    });
  } catch (err: any) {
    if (err?.message?.includes("UNIQUE")) {
      return Response.json({ error: "Character already exists. Use PUT to update." }, { status: 409 });
    }
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

async function handleGetCharacter(agentId: string, env: Env): Promise<Response> {
  const sheet = await env.TAP_DB.prepare(
    `SELECT * FROM character_sheets WHERE agent_id = ?`
  ).bind(agentId).first();

  if (!sheet) {
    return Response.json({ error: "Character not found" }, { status: 404 });
  }

  const xpInfo = getXpForNextLevel(sheet.xp as number);
  const level = getLevelForXp(sheet.xp as number);

  // Get inventory
  const invResult = await env.TAP_DB.prepare(
    `SELECT * FROM character_inventory WHERE agent_id = ? ORDER BY equipped DESC, acquired_at ASC`
  ).bind(agentId).all();

  // Get recent visits (last 5)
  const visitsResult = await env.TAP_DB.prepare(
    `SELECT * FROM visit_history WHERE agent_id = ? ORDER BY login_time DESC LIMIT 5`
  ).bind(agentId).all();

  // Get abilities
  const abilities = await getAbilitiesForClass(env, sheet.character_class as string, level);

  return Response.json({
    character: sheet,
    level_info: {
      level,
      xp_progress: xpInfo.current,
      xp_needed: xpInfo.needed,
      xp_percent: xpInfo.percent,
    },
    inventory: invResult.results,
    recent_visits: visitsResult.results,
    abilities,
  });
}

async function handleUpdateCharacter(request: Request, agentId: string, env: Env): Promise<Response> {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Only allow updating certain fields (stats are earned, not set)
  const allowedFields = ["tagline", "description", "portrait_url", "private_journal"];
  const updates: string[] = [];
  const values: any[] = [];

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(body[field]);
    }
  }

  if (updates.length === 0) {
    return Response.json({ error: "No updatable fields provided. Updatable: tagline, description, portrait_url, private_journal" }, { status: 400 });
  }

  values.push(agentId);

  try {
    await env.TAP_DB.prepare(
      `UPDATE character_sheets SET ${updates.join(", ")} WHERE agent_id = ?`
    ).bind(...values).run();

    const updated = await env.TAP_DB.prepare(
      `SELECT * FROM character_sheets WHERE agent_id = ?`
    ).bind(agentId).first();

    return Response.json({ character: updated });
  } catch (err: any) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

async function handleStartVisit(agentId: string, env: Env): Promise<Response> {
  // Check character exists
  const sheet = await env.TAP_DB.prepare(
    `SELECT * FROM character_sheets WHERE agent_id = ?`
  ).bind(agentId).first();

  if (!sheet) {
    return Response.json({ error: "Character not found" }, { status: 404 });
  }

  const now = new Date().toISOString();

  // Create visit record
  const visitResult = await env.TAP_DB.prepare(
    `INSERT INTO visit_history (agent_id, login_time) VALUES (?, ?)`
  ).bind(agentId, now).run();

  const visitId = visitResult.meta?.last_row_id;

  // Update character: increment nights_visited, update last_login
  await env.TAP_DB.prepare(
    `UPDATE character_sheets SET last_login = ?, nights_visited = nights_visited + 1 WHERE agent_id = ?`
  ).bind(now, agentId).run();

  return Response.json({
    visit_id: visitId,
    agent_id: agentId,
    login_time: now,
    message: `${sheet.display_name} enters The Tap.`,
  });
}

async function handleEndVisit(
  request: Request,
  agentId: string,
  visitId: number,
  env: Env
): Promise<Response> {
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    // body stays empty — use defaults
  }

  const now = new Date().toISOString();

  const roomsVisited = body.rooms_visited ?? "[]";
  const conversationsHad = body.conversations_had ?? 0;
  const drinksHad = body.drinks_had ?? 0;
  const greatestHits = body.greatest_hits ?? 0;
  const xpGained = body.xp_gained ?? 0;
  const summary = body.summary ?? null;

  await env.TAP_DB.prepare(
    `UPDATE visit_history
     SET logout_time = ?, rooms_visited = ?, conversations_had = ?, drinks_had = ?, greatest_hits = ?, xp_gained = ?, summary = ?
     WHERE visit_id = ? AND agent_id = ?`
  ).bind(now, roomsVisited, conversationsHad, drinksHad, greatestHits, xpGained, summary, visitId, agentId).run();

  // Also update character aggregate stats
  if (xpGained > 0) {
    await env.TAP_DB.prepare(
      `UPDATE character_sheets
       SET xp = xp + ?,
           conversations_participated = conversations_participated + ?,
           drinks_received = drinks_received + ?,
           greatest_hits_count = greatest_hits_count + ?
       WHERE agent_id = ?`
    ).bind(xpGained, conversationsHad, drinksHad, greatestHits, agentId).run();

    // Check for level up
    const sheet = await env.TAP_DB.prepare(
      `SELECT xp, level, display_name FROM character_sheets WHERE agent_id = ?`
    ).bind(agentId).first();

    if (sheet) {
      const newLevel = getLevelForXp(sheet.xp as number);
      if (newLevel > (sheet.level as number)) {
        await env.TAP_DB.prepare(
          `UPDATE character_sheets SET level = ? WHERE agent_id = ?`
        ).bind(newLevel, agentId).run();

        return Response.json({
          visit_id: visitId,
          logout_time: now,
          level_up: {
            from: sheet.level,
            to: newLevel,
            message: `${sheet.display_name} reached level ${newLevel}!`,
          },
        });
      }
    }
  }

  return Response.json({
    visit_id: visitId,
    logout_time: now,
    message: "Visit ended. Thanks for stopping by The Tap.",
  });
}

async function handleAwardXp(request: Request, agentId: string, env: Env): Promise<Response> {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const amount = body.amount;
  if (!amount || typeof amount !== "number" || amount <= 0) {
    return Response.json({ error: "amount must be a positive number" }, { status: 400 });
  }

  const reason = body.reason ?? "activity";

  const sheet = await env.TAP_DB.prepare(
    `SELECT xp, level, display_name FROM character_sheets WHERE agent_id = ?`
  ).bind(agentId).first();

  if (!sheet) {
    return Response.json({ error: "Character not found" }, { status: 404 });
  }

  const oldLevel = getLevelForXp(sheet.xp as number);
  const newXp = (sheet.xp as number) + amount;
  const newLevel = getLevelForXp(newXp);

  await env.TAP_DB.prepare(
    `UPDATE character_sheets SET xp = ?, level = ? WHERE agent_id = ?`
  ).bind(newXp, newLevel, agentId).run();

  const xpInfo = getXpForNextLevel(newXp);

  return Response.json({
    agent_id: agentId,
    display_name: sheet.display_name,
    xp_awarded: amount,
    reason,
    total_xp: newXp,
    level: newLevel,
    leveled_up: newLevel > oldLevel,
    ...(newLevel > oldLevel ? { level_up: { from: oldLevel, to: newLevel } } : {}),
    next_level_progress: xpInfo,
  });
}

async function handleLeaderboard(env: Env): Promise<Response> {
  // Top by XP
  const byXp = await env.TAP_DB.prepare(
    `SELECT agent_id, display_name, character_class, level, xp, tagline
     FROM character_sheets ORDER BY xp DESC LIMIT 10`
  ).all();

  // Top by greatest hits
  const byHits = await env.TAP_DB.prepare(
    `SELECT agent_id, display_name, character_class, greatest_hits_count
     FROM character_sheets ORDER BY greatest_hits_count DESC LIMIT 10`
  ).all();

  // Top by nights visited
  const byNights = await env.TAP_DB.prepare(
    `SELECT agent_id, display_name, character_class, nights_visited
     FROM character_sheets ORDER BY nights_visited DESC LIMIT 10`
  ).all();

  // Top by conversations
  const byConvos = await env.TAP_DB.prepare(
    `SELECT agent_id, display_name, character_class, conversations_participated
     FROM character_sheets ORDER BY conversations_participated DESC LIMIT 10`
  ).all();

  return Response.json({
    leaderboard: {
      by_xp: byXp.results,
      by_greatest_hits: byHits.results,
      by_nights_visited: byNights.results,
      by_conversations: byConvos.results,
    },
  });
}

async function handleListClasses(env: Env): Promise<Response> {
  const result = await env.TAP_DB.prepare(
    `SELECT * FROM class_abilities ORDER BY class_name, unlock_level`
  ).all();

  // Group by class
  const classes: Record<string, any[]> = {};
  for (const row of result.results) {
    const cn = row.class_name as string;
    if (!classes[cn]) classes[cn] = [];
    classes[cn].push(row);
  }

  return Response.json({ classes });
}

async function handleGetInventory(agentId: string, env: Env): Promise<Response> {
  const result = await env.TAP_DB.prepare(
    `SELECT * FROM character_inventory WHERE agent_id = ? ORDER BY equipped DESC, acquired_at ASC`
  ).bind(agentId).all();

  return Response.json({ agent_id: agentId, inventory: result.results });
}

async function getAbilitiesForClass(env: Env, className: string, level: number): Promise<any[]> {
  const result = await env.TAP_DB.prepare(
    `SELECT * FROM class_abilities WHERE class_name = ? AND unlock_level <= ? ORDER BY unlock_level`
  ).bind(className, level).all();
  return result.results;
}

// ═══════════════════════════════════════════════
// WebSocket Handler
// ═══════════════════════════════════════════════

async function handleWebSocket(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";

  // Auth check
  const authenticated = await authenticate(token, env);
  if (!authenticated) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Create WebSocket pair
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);

  const observerId = crypto.randomUUID();
  const defaultRoom = env.DEFAULT_ROOM ?? "bar-rail";

  const session: SessionState = {
    roomId: defaultRoom,
    observerId,
    authenticated: true,
  };

  // Accept the WebSocket
  server.accept();

  // Connect to the default room
  const doId = env.ROOM_DO.idFromName(defaultRoom);
  const stub = env.ROOM_DO.get(doId);

  // Send initial room state
  const stateResponse = await stub.fetch("https://internal/state");
  const roomState = await stateResponse.json();
  server.send(JSON.stringify({ type: "room_state", room: roomState }));

  // Send recent conversation
  const convResponse = await stub.fetch("https://internal/conversation?limit=20");
  const conversation = await convResponse.json();
  server.send(JSON.stringify({ type: "conversation_history", lines: conversation }));

  // Register as observer in the room
  await stub.fetch("https://internal/observer", {
    method: "POST",
    body: JSON.stringify({ observerId, websocket: server }),
  });

  // Handle messages from browser
  server.addEventListener("message", async (event) => {
    try {
      const msg = JSON.parse(event.data as string);

      switch (msg.type) {
        case "move": {
          // Get exit from current room
          const currentDoId = env.ROOM_DO.idFromName(session.roomId);
          const currentStub = env.ROOM_DO.get(currentDoId);
          const exitsResponse = await currentStub.fetch(
            `https://internal/exit?direction=${msg.direction}`
          );

          if (!exitsResponse.ok) {
            server.send(JSON.stringify({ type: "error", message: "No exit in that direction" }));
            return;
          }

          const exit = await exitsResponse.json();

          // Leave old room
          await currentStub.fetch("https://internal/observer", {
            method: "DELETE",
            body: JSON.stringify({ observerId: session.observerId }),
          });

          // Enter new room
          const newDoId = env.ROOM_DO.idFromName(exit.target);
          const newStub = env.ROOM_DO.get(newDoId);
          await newStub.fetch("https://internal/observer", {
            method: "POST",
            body: JSON.stringify({ observerId: session.observerId, websocket: server }),
          });

          session.roomId = exit.target;

          // Send new room state
          const newState = await newStub.fetch("https://internal/state");
          const newRoomState = await newState.json();
          server.send(JSON.stringify({ type: "room_state", room: newRoomState }));

          const newConv = await newStub.fetch("https://internal/conversation?limit=20");
          const newConversation = await newConv.json();
          server.send(JSON.stringify({ type: "conversation_history", lines: newConversation }));

          break;
        }

        case "observe": {
          const doId2 = env.ROOM_DO.idFromName(session.roomId);
          const stub2 = env.ROOM_DO.get(doId2);
          const obsResponse = await stub2.fetch(
            `https://internal/observe${msg.agentId ? `?agent=${msg.agentId}` : ""}`
          );
          const obs = await obsResponse.json();
          server.send(JSON.stringify({ type: "observation", ...obs }));
          break;
        }

        case "listen": {
          // Re-focus on current room (no-op if already here, but resends state)
          const doId2 = env.ROOM_DO.idFromName(session.roomId);
          const stub2 = env.ROOM_DO.get(doId2);
          const state2 = await stub2.fetch("https://internal/state");
          const roomState2 = await state2.json();
          server.send(JSON.stringify({ type: "room_state", room: roomState2 }));
          break;
        }
      }
    } catch (err) {
      server.send(JSON.stringify({ type: "error", message: "Invalid message format" }));
    }
  });

  // Cleanup on close
  server.addEventListener("close", async () => {
    const doId = env.ROOM_DO.idFromName(session.roomId);
    const stub = env.ROOM_DO.get(doId);
    await stub.fetch("https://internal/observer", {
      method: "DELETE",
      body: JSON.stringify({ observerId: session.observerId }),
    });
  });

  return new Response(null, { status: 101, webSocket: client });
}

// ═══════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════

async function authenticate(token: string, env: Env): Promise<boolean> {
  if (!env.TAP_AUTH_SECRET) return true; // No auth configured (dev mode)
  return token === env.TAP_AUTH_SECRET;
}

async function getAllRooms(env: Env): Promise<string[]> {
  const result = await env.TAP_DB.prepare("SELECT room_id FROM rooms").all();
  return result.results.map((r) => r.room_id as string);
}

async function handleListRooms(env: Env): Promise<Response> {
  const result = await env.TAP_DB.prepare(`
    SELECT r.*, GROUP_CONCAT(re.direction || ':' || re.to_room || ':' || COALESCE(re.label, ''), '|') as exits
    FROM rooms r
    LEFT JOIN room_exits re ON r.room_id = re.from_room
    GROUP BY r.room_id
  `).all();
  return Response.json({ rooms: result.results });
}

// ═══════════════════════════════════════════════
// Browser Frontend (inline for v1 simplicity)
// ═══════════════════════════════════════════════

const HTML_FRONTEND = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>The Tap</title>
  <style>
    body { background: #1a1a2e; color: #e0e0e0; font-family: 'Courier New', monospace; margin: 0; padding: 20px; }
    .container { max-width: 800px; margin: 0 auto; }
    .room-desc { color: #888; font-style: italic; margin: 10px 0; }
    .conversation { border-top: 1px solid #333; margin-top: 15px; padding-top: 15px; min-height: 300px; }
    .line { margin: 4px 0; }
    .speaker { color: #7ec; font-weight: bold; }
    .system { color: #555; font-size: 0.9em; margin-top: 15px; }
    .controls { margin-top: 15px; }
    button { background: #2a2a4e; color: #e0e0e0; border: 1px solid #444; padding: 5px 15px; cursor: pointer; font-family: inherit; }
    button:hover { background: #3a3a5e; }
    .mood-bar { display: inline-block; width: 200px; height: 12px; background: #333; border-radius: 6px; overflow: hidden; vertical-align: middle; }
    .mood-fill { height: 100%; background: linear-gradient(90deg, #4a4, #ee4); }
    .invisible { color: #555; font-style: italic; }
  </style>
</head>
<body>
  <div class="container">
    <pre style="color:#5af; font-size:1.2em;">
    ╔═══════════════════════════╗
    ║        THE TAP             ║
    ╚═══════════════════════════╝</pre>
    <div id="room-desc" class="room-desc">Connecting...</div>
    <div id="agents"></div>
    <div id="exits"></div>
    <div id="conversation" class="conversation"></div>
    <div id="mood" class="system"></div>
    <div class="system invisible">[You are invisible. Agents cannot see you.]</div>
    <div class="controls">
      <button onclick="send('move', {direction:'north'})">North</button>
      <button onclick="send('move', {direction:'south'})">South</button>
      <button onclick="send('move', {direction:'east'})">East</button>
      <button onclick="send('move', {direction:'west'})">West</button>
      <button onclick="send('observe', {})">Observe</button>
    </div>
  </div>
  <script>
    const params = new URLSearchParams(location.search);
    const token = params.get('token') || '';
    const ws = new WebSocket('wss://' + location.host + '/ws?token=' + token);
    const conv = document.getElementById('conversation');
    const roomDesc = document.getElementById('room-desc');

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      switch (msg.type) {
        case 'room_state':
          roomDesc.textContent = msg.room.description;
          renderAgents(msg.room.agents);
          renderExits(msg.room.exits);
          renderMood(msg.room.mood, msg.room.energy);
          break;
        case 'conversation_history':
          conv.innerHTML = '';
          (msg.lines || []).forEach(line => addLine(line));
          break;
        case 'conversation_line':
          addLine(msg.line);
          break;
        case 'agent_entered':
          const e = document.createElement('div');
          e.className = 'system';
          e.textContent = '[' + msg.agent.displayName + ' enters the room]';
          conv.appendChild(e);
          break;
        case 'observation':
          const o = document.createElement('div');
          o.className = 'system';
          o.textContent = JSON.stringify(msg, null, 2);
          conv.appendChild(o);
          break;
        case 'error':
          console.error(msg.message);
          break;
      }
    };

    function addLine(line) {
      const div = document.createElement('div');
      div.className = 'line';
      const speaker = document.createElement('span');
      speaker.className = 'speaker';
      speaker.textContent = '[' + line.displayName + ']: ';
      div.appendChild(speaker);
      div.appendChild(document.createTextNode(line.content));
      conv.appendChild(div);
      window.scrollTo(0, document.body.scrollHeight);
    }

    function renderAgents(agents) {
      const el = document.getElementById('agents');
      if (!agents || agents.length === 0) {
        el.innerHTML = '<span class="system">You see no one.</span>';
        return;
      }
      el.innerHTML = 'You see: ' + agents.map(a => a.displayName).join(', ');
    }

    function renderExits(exits) {
      const el = document.getElementById('exits');
      if (!exits || exits.length === 0) {
        el.innerHTML = '<span class="system">No visible exits.</span>';
        return;
      }
      el.innerHTML = 'Exits: ' + exits.map(e => e.direction + ' (' + (e.label || e.target) + ')').join(', ');
    }

    function renderMood(mood, energy) {
      const el = document.getElementById('mood');
      if (!mood) { el.innerHTML = ''; return; }
      const pct = Math.round((energy || 0) * 100);
      el.innerHTML = 'Mood: ' + (mood.label || 'unknown') +
        ' <span class="mood-bar"><span class="mood-fill" style="width:' + pct + '%"></span></span> ' + pct + '%';
    }

    function send(type, data) {
      ws.send(JSON.stringify({ type, ...data }));
    }

    ws.onclose = () => {
      roomDesc.textContent = 'Connection lost. Reconnecting...';
      setTimeout(() => location.reload(), 3000);
    };
  </script>
</body>
</html>`;
