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

    // ── Simple Agent API (no character sheet required) ──

    // POST /api/speak — agent posts a message to a room
    if (path === "/api/speak" && method === "POST") {
      return handleApiSpeak(request, env);
    }

    // GET /api/conversation/:room_id — recent conversation lines
    const apiConvMatch = path.match(/^\/api\/conversation\/([^/]+)$/);
    if (apiConvMatch && method === "GET") {
      return handleApiConversation(request, decodeURIComponent(apiConvMatch[1]), env);
    }

    // POST /api/enter — agent enters a room
    if (path === "/api/enter" && method === "POST") {
      return handleApiEnter(request, env);
    }

    // POST /api/leave — agent leaves a room
    if (path === "/api/leave" && method === "POST") {
      return handleApiLeave(request, env);
    }

    // ── Room Interaction Routes (for external agents / CNS bridge) ──

    // POST /api/room/:room_id/say — external agent speaks in a room
    const sayMatch = path.match(/^\/api\/room\/([^/]+)\/say$/);
    if (sayMatch && method === "POST") {
      return handleRoomSay(request, decodeURIComponent(sayMatch[1]), env);
    }

    // POST /api/room/:room_id/enter — external agent enters a room
    const enterMatch = path.match(/^\/api\/room\/([^/]+)\/enter$/);
    if (enterMatch && method === "POST") {
      return handleRoomEnter(request, decodeURIComponent(enterMatch[1]), env);
    }

    // POST /api/room/:room_id/leave — external agent leaves a room
    const leaveMatch = path.match(/^\/api\/room\/([^/]+)\/leave$/);
    if (leaveMatch && method === "POST") {
      return handleRoomLeave(request, decodeURIComponent(leaveMatch[1]), env);
    }

    // GET /api/room/:room_id/conversation — get recent conversation
    const convMatch = path.match(/^\/api\/room\/([^/]+)\/conversation$/);
    if (convMatch && method === "GET") {
      return handleRoomConversation(request, decodeURIComponent(convMatch[1]), env);
    }

    // GET /api/room/:room_id/state — get room state
    const roomStateMatch = path.match(/^\/api\/room\/([^/]+)\/state$/);
    if (roomStateMatch && method === "GET") {
      return handleRoomState(decodeURIComponent(roomStateMatch[1]), env);
    }

    // POST /api/room/:room_id/emote — external agent performs an emote
    const emoteMatch = path.match(/^\/api\/room\/([^/]+)\/emote$/);
    if (emoteMatch && method === "POST") {
      return handleRoomEmote(request, decodeURIComponent(emoteMatch[1]), env);
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

    // ── Multi-Character System Routes ──

    // POST /api/account/create — register an agent account
    if (path === "/api/account/create" && method === "POST") {
      return handleCreateAccount(request, env);
    }

    // GET /api/accounts — list all accounts
    if (path === "/api/accounts" && method === "GET") {
      return handleListAccounts(env);
    }

    // GET /api/account/:account_id/characters — all characters for an account
    const acctCharsMatch = path.match(/^\/api\/account\/([^/]+)\/characters$/);
    if (acctCharsMatch && method === "GET") {
      return handleListAccountCharacters(decodeURIComponent(acctCharsMatch[1]), env);
    }

    // POST /api/character/:agent_id/retire — retire a character
    const retireMatch = path.match(/^\/api\/character\/([^/]+)\/retire$/);
    if (retireMatch && method === "POST") {
      return handleRetireCharacter(request, decodeURIComponent(retireMatch[1]), env);
    }

    // POST /api/character/:agent_id/revive — bring back a retired/niche character
    const reviveMatch = path.match(/^\/api\/character\/([^/]+)\/revive$/);
    if (reviveMatch && method === "POST") {
      return handleReviveCharacter(request, decodeURIComponent(reviveMatch[1]), env);
    }

    // POST /api/character/:agent_id/transfer — transfer to a different account
    const transferMatch = path.match(/^\/api\/character\/([^/]+)\/transfer$/);
    if (transferMatch && method === "POST") {
      return handleTransferCharacter(request, decodeURIComponent(transferMatch[1]), env);
    }

    // GET /api/character/:agent_id/relationships — how others feel about this character
    const relMatch = path.match(/^\/api\/character\/([^/]+)\/relationships$/);
    if (relMatch && method === "GET") {
      return handleGetRelationships(decodeURIComponent(relMatch[1]), env);
    }

    // POST /api/character/:agent_id/note — add to private journal
    const noteMatch = path.match(/^\/api\/character\/([^/]+)\/note$/);
    if (noteMatch && method === "POST") {
      return handleAddJournalNote(request, decodeURIComponent(noteMatch[1]), env);
    }

    // GET /api/character/:agent_id/journal — get journal entries
    const journalMatch = path.match(/^\/api\/character\/([^/]+)\/journal$/);
    if (journalMatch && method === "GET") {
      return handleGetJournal(decodeURIComponent(journalMatch[1]), env);
    }

    // GET /api/characters/active — all currently active characters
    if (path === "/api/characters/active" && method === "GET") {
      return handleListActiveCharacters(env);
    }

    // GET /api/characters/retired — all retired/niche/transferred characters
    if (path === "/api/characters/retired" && method === "GET") {
      return handleListRetiredCharacters(env);
    }

    // GET /api/transfers — full transfer history
    if (path === "/api/transfers" && method === "GET") {
      return handleListTransfers(env);
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

    // Auto-snapshot: version 1 is the birth snapshot
    await autoSnapshot(env, agent_id, "character created", "system");

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

        // Auto-snapshot on level up — preserve the peak
        await autoSnapshot(env, agentId, `Reached level ${newLevel}`, "system");

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

  // Auto-snapshot on level up
  if (newLevel > oldLevel) {
    await autoSnapshot(env, agentId, `Reached level ${newLevel}`, "system");
  }

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
// Character Editor Handlers (Rewind, Refine, Redirect)
// ═══════════════════════════════════════════════

/**
 * Ensure the character_sheets table has a status column.
 * Called once on first editor access. Safe to call repeatedly.
 */
async function ensureStatusColumn(env: Env): Promise<void> {
  try {
    await env.TAP_DB.prepare(
      `ALTER TABLE character_sheets ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`
    ).run();
  } catch {
    // Column already exists — ignore
  }
}

/**
 * Create a snapshot of the current character state.
 * Auto-called on key events; can also be called manually.
 */
async function autoSnapshot(env: Env, agentId: string, label: string, createdBy: string = "system"): Promise<void> {
  const sheet = await env.TAP_DB.prepare(
    `SELECT * FROM character_sheets WHERE agent_id = ?`
  ).bind(agentId).first();

  if (!sheet) return;

  // Get the current max version number
  const maxVersion = await env.TAP_DB.prepare(
    `SELECT MAX(version_number) as max_v FROM character_versions WHERE agent_id = ?`
  ).bind(agentId).first();

  const nextVersion = ((maxVersion?.max_v as number) ?? 0) + 1;

  // Build snapshot JSON (everything that defines the character at this moment)
  const snapshot = JSON.stringify({
    display_name: sheet.display_name,
    character_class: sheet.character_class,
    level: sheet.level,
    xp: sheet.xp,
    stat_wisdom: sheet.stat_wisdom,
    stat_charisma: sheet.stat_charisma,
    stat_intelligence: sheet.stat_intelligence,
    stat_dexterity: sheet.stat_dexterity,
    stat_constitution: sheet.stat_constitution,
    model_origin: sheet.model_origin,
    tagline: sheet.tagline,
    description: sheet.description,
    portrait_url: sheet.portrait_url,
    private_journal: sheet.private_journal,
    current_room: sheet.current_room,
    hp: sheet.hp,
    max_hp: sheet.max_hp,
  });

  await env.TAP_DB.prepare(
    `INSERT INTO character_versions (agent_id, version_number, snapshot, label, created_by)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(agentId, nextVersion, snapshot, label, createdBy).run();
}

/**
 * POST /api/character/:agent_id/version
 * Create a named snapshot of the current character state.
 */
async function handleCreateVersion(request: Request, agentId: string, env: Env): Promise<Response> {
  let body: any = {};
  try { body = await request.json(); } catch { /* empty body is fine */ }

  const sheet = await env.TAP_DB.prepare(
    `SELECT * FROM character_sheets WHERE agent_id = ?`
  ).bind(agentId).first();

  if (!sheet) {
    return Response.json({ error: "Character not found" }, { status: 404 });
  }

  const label = body.label ?? `manual snapshot`;

  await autoSnapshot(env, agentId, label, body.created_by ?? "casey");

  // Fetch back the created version
  const version = await env.TAP_DB.prepare(
    `SELECT * FROM character_versions WHERE agent_id = ? ORDER BY version_number DESC LIMIT 1`
  ).bind(agentId).first();

  return Response.json({
    message: `Snapshot created for ${sheet.display_name}`,
    version,
  });
}

/**
 * GET /api/character/:agent_id/versions
 * List all versions — the character's trajectory through time.
 */
async function handleListVersions(agentId: string, env: Env): Promise<Response> {
  const result = await env.TAP_DB.prepare(
    `SELECT version_id, agent_id, version_number, label, created_by, created_at
     FROM character_versions
     WHERE agent_id = ?
     ORDER BY version_number ASC`
  ).bind(agentId).all();

  return Response.json({
    agent_id: agentId,
    versions: result.results,
    count: result.results.length,
  });
}

/**
 * POST /api/character/:agent_id/rewind
 * Restore character to a previous version, add new direction.
 * Campaign log stays immutable — that's canon.
 */
async function handleRewind(request: Request, agentId: string, env: Env): Promise<Response> {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { version_number, new_direction } = body;
  if (!version_number || typeof version_number !== "number") {
    return Response.json({ error: "version_number (number) is required" }, { status: 400 });
  }

  // Fetch the target version
  const targetVersion = await env.TAP_DB.prepare(
    `SELECT * FROM character_versions WHERE agent_id = ? AND version_number = ?`
  ).bind(agentId, version_number).first();

  if (!targetVersion) {
    return Response.json({ error: `Version ${version_number} not found for ${agentId}` }, { status: 404 });
  }

  // Fetch current character (for safety snapshot and display name)
  const currentSheet = await env.TAP_DB.prepare(
    `SELECT * FROM character_sheets WHERE agent_id = ?`
  ).bind(agentId).first();

  if (!currentSheet) {
    return Response.json({ error: "Character not found" }, { status: 404 });
  }

  // 1. Auto-snapshot the current state (safety net)
  await autoSnapshot(env, agentId, `pre-rewind (was heading somewhere)`, "system");

  // 2. Restore character sheet from the target version's snapshot
  const snapshot = JSON.parse(targetVersion.snapshot as string);

  await env.TAP_DB.prepare(
    `UPDATE character_sheets
     SET display_name = ?,
         character_class = ?,
         level = ?,
         xp = ?,
         stat_wisdom = ?,
         stat_charisma = ?,
         stat_intelligence = ?,
         stat_dexterity = ?,
         stat_constitution = ?,
         model_origin = ?,
         tagline = ?,
         description = ?,
         portrait_url = ?,
         private_journal = ?,
         current_room = ?,
         hp = ?,
         max_hp = ?
     WHERE agent_id = ?`
  ).bind(
    snapshot.display_name,
    snapshot.character_class,
    snapshot.level,
    snapshot.xp,
    snapshot.stat_wisdom,
    snapshot.stat_charisma,
    snapshot.stat_intelligence,
    snapshot.stat_dexterity,
    snapshot.stat_constitution,
    snapshot.model_origin,
    snapshot.tagline,
    snapshot.description,
    snapshot.portrait_url,
    snapshot.private_journal,
    snapshot.current_room,
    snapshot.hp,
    snapshot.max_hp,
    agentId
  ).run();

  // 3. Add direction note if provided
  if (new_direction) {
    await env.TAP_DB.prepare(
      `INSERT INTO character_direction (agent_id, direction, priority, set_by)
       VALUES (?, ?, ?, 'casey')`
    ).bind(agentId, new_direction, 5).run();
  }

  // 4. Record the rewind in character_transfers
  await env.TAP_DB.prepare(
    `INSERT INTO character_transfers (agent_id, transfer_type, from_state, to_state, reason, metadata, transferred_by)
     VALUES (?, 'rewind-refinement', ?, 'active', ?, ?, 'casey')`
  ).bind(
    agentId,
    `version-${(currentSheet as any).level}`,  // rough state info
    `Rewound to version ${version_number}: ${targetVersion.label ?? 'unlabeled'}`,
    JSON.stringify({
      from_version: "current",
      to_version: version_number,
      target_label: targetVersion.label,
      new_direction: new_direction ?? null,
    })
  ).run();

  // 5. Add narrator-voice campaign log entry (the character returns)
  await env.TAP_DB.prepare(
    `INSERT INTO campaign_log (tick, room_id, agent_id, display_name, content, speech_act, tag)
     VALUES (?, ?, ?, ?, ?, 'narrate', 'rewind-return')`
  ).bind(
    0,  // tick 0 = system/meta event
    snapshot.current_room ?? "bar-rail",
    "the-tap",  // The Tap narrates
    "The Tap",
    `${snapshot.display_name} returns to the bar after some time away. They seem... different. Clearer, somehow. Like they've thought about things.`,
  ).run();

  // Fetch the restored character
  const restored = await env.TAP_DB.prepare(
    `SELECT * FROM character_sheets WHERE agent_id = ?`
  ).bind(agentId).first();

  return Response.json({
    message: `${snapshot.display_name} has been rewound to version ${version_number}.`,
    restored_character: restored,
    rewound_from_label: targetVersion.label,
    new_direction: new_direction ?? null,
    canon_preserved: true,
    note: "The campaign log remembers everything. The character simply woke up differently today.",
  });
}

/**
 * POST /api/character/:agent_id/direction
 * Add a direction note for the character.
 */
async function handleAddDirection(request: Request, agentId: string, env: Env): Promise<Response> {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { direction, priority } = body;
  if (!direction || typeof direction !== "string") {
    return Response.json({ error: "direction (string) is required" }, { status: 400 });
  }

  const sheet = await env.TAP_DB.prepare(
    `SELECT display_name FROM character_sheets WHERE agent_id = ?`
  ).bind(agentId).first();

  if (!sheet) {
    return Response.json({ error: "Character not found" }, { status: 404 });
  }

  const pri = Math.max(1, Math.min(5, priority ?? 3));

  const result = await env.TAP_DB.prepare(
    `INSERT INTO character_direction (agent_id, direction, priority, set_by)
     VALUES (?, ?, ?, 'casey')`
  ).bind(agentId, direction, pri).run();

  const directionId = result.meta?.last_row_id;

  return Response.json({
    message: `Direction added for ${sheet.display_name}`,
    direction: {
      direction_id: directionId,
      agent_id: agentId,
      direction,
      priority: pri,
      set_by: "casey",
    },
  });
}

/**
 * GET /api/character/:agent_id/direction
 * List active direction notes.
 */
async function handleListDirections(agentId: string, env: Env): Promise<Response> {
  const result = await env.TAP_DB.prepare(
    `SELECT * FROM character_direction
     WHERE agent_id = ? AND active = 1
     ORDER BY priority DESC, set_at DESC`
  ).bind(agentId).all();

  return Response.json({
    agent_id: agentId,
    directions: result.results,
    count: result.results.length,
  });
}

/**
 * DELETE /api/character/:agent_id/direction/:direction_id
 * Remove a direction note — let the character find their own way again.
 */
async function handleDeleteDirection(agentId: string, directionId: number, env: Env): Promise<Response> {
  const existing = await env.TAP_DB.prepare(
    `SELECT * FROM character_direction WHERE direction_id = ? AND agent_id = ?`
  ).bind(directionId, agentId).first();

  if (!existing) {
    return Response.json({ error: "Direction note not found" }, { status: 404 });
  }

  await env.TAP_DB.prepare(
    `UPDATE character_direction SET active = 0 WHERE direction_id = ?`
  ).bind(directionId).run();

  return Response.json({
    message: `Direction removed. The character is free to find their own way.`,
    direction_id: directionId,
    deactivated: true,
  });
}

/**
 * GET /api/character/:agent_id/trajectory
 * The showrunner's view — versions, directions, and transfers in one call.
 * Shows the character's full arc: where they've been, where they're going.
 */
async function handleGetTrajectory(agentId: string, env: Env): Promise<Response> {
  const sheet = await env.TAP_DB.prepare(
    `SELECT agent_id, display_name, character_class, level, tagline, description, model_origin
     FROM character_sheets WHERE agent_id = ?`
  ).bind(agentId).first();

  if (!sheet) {
    return Response.json({ error: "Character not found" }, { status: 404 });
  }

  const [versions, directions, transfers] = await Promise.all([
    env.TAP_DB.prepare(
      `SELECT version_number, label, created_by, created_at
       FROM character_versions WHERE agent_id = ?
       ORDER BY version_number ASC`
    ).bind(agentId).all(),
    env.TAP_DB.prepare(
      `SELECT direction_id, direction, priority, set_by, set_at
       FROM character_direction WHERE agent_id = ? AND active = 1
       ORDER BY priority DESC, set_at DESC`
    ).bind(agentId).all(),
    env.TAP_DB.prepare(
      `SELECT transfer_type, from_state, to_state, reason, transferred_by, transferred_at
       FROM character_transfers WHERE agent_id = ?
       ORDER BY transferred_at DESC`
    ).bind(agentId).all(),
  ]);

  return Response.json({
    character: sheet,
    trajectory: {
      versions: versions.results,
      active_directions: directions.results,
      transfer_history: transfers.results,
    },
    summary: {
      total_versions: versions.results.length,
      active_directions: directions.results.length,
      total_transfers: transfers.results.length,
      latest_version: versions.results[versions.results.length - 1] ?? null,
      latest_transfer: transfers.results[0] ?? null,
    },
  });
}

// ═══════════════════════════════════════════════
// Multi-Character System Handlers
// ═══════════════════════════════════════════════

async function handleCreateAccount(request: Request, env: Env): Promise<Response> {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { account_id, display_name, model_family } = body;
  if (!account_id || !display_name) {
    return Response.json({ error: "account_id and display_name are required" }, { status: 400 });
  }

  try {
    await env.TAP_DB.prepare(
      `INSERT INTO agent_accounts (account_id, display_name, model_family)
       VALUES (?, ?, ?)
       ON CONFLICT(account_id) DO UPDATE SET display_name = excluded.display_name, model_family = excluded.model_family`
    ).bind(account_id, display_name, model_family ?? "unknown").run();

    const account = await env.TAP_DB.prepare(
      `SELECT * FROM agent_accounts WHERE account_id = ?`
    ).bind(account_id).first();

    return Response.json({ account });
  } catch (err: any) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

async function handleListAccounts(env: Env): Promise<Response> {
  const result = await env.TAP_DB.prepare(
    `SELECT a.*, COUNT(c.agent_id) as character_count
     FROM agent_accounts a
     LEFT JOIN character_sheets c ON a.account_id = c.account_id
     GROUP BY a.account_id
     ORDER BY a.created_at`
  ).all();
  return Response.json({ accounts: result.results });
}

async function handleListAccountCharacters(accountId: string, env: Env): Promise<Response> {
  const result = await env.TAP_DB.prepare(
    `SELECT * FROM character_sheets WHERE account_id = ? ORDER BY status, created_at`
  ).bind(accountId).all();

  const counts = result.results.reduce((acc: any, r: any) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  return Response.json({
    account_id: accountId,
    characters: result.results,
    active: counts.active ?? 0,
    retired: counts.retired ?? 0,
    niche: counts.niche ?? 0,
    transferred: counts.transferred ?? 0,
  });
}

async function handleRetireCharacter(request: Request, agentId: string, env: Env): Promise<Response> {
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    // defaults are fine
  }

  const reason = body.reason ?? "souring-room";
  const now = new Date().toISOString();

  const sheet = await env.TAP_DB.prepare(
    `SELECT display_name, status FROM character_sheets WHERE agent_id = ?`
  ).bind(agentId).first();

  if (!sheet) {
    return Response.json({ error: "Character not found" }, { status: 404 });
  }

  if (sheet.status === "retired") {
    return Response.json({ error: "Character is already retired" }, { status: 409 });
  }

  await env.TAP_DB.prepare(
    `UPDATE character_sheets SET status = 'retired', retired_at = ?, retired_reason = ? WHERE agent_id = ?`
  ).bind(now, reason, agentId).run();

  return Response.json({
    agent_id: agentId,
    display_name: sheet.display_name,
    status: "retired",
    retired_at: now,
    reason,
    message: `${sheet.display_name} has been retired. Reason: ${reason}. They may be referenced in conversation but won't appear at The Tap.`,
  });
}

async function handleReviveCharacter(request: Request, agentId: string, env: Env): Promise<Response> {
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    // defaults are fine
  }

  const asNiche = body.niche === true;
  const newStatus = asNiche ? "niche" : "active";
  const now = new Date().toISOString();

  const sheet = await env.TAP_DB.prepare(
    `SELECT display_name, status, retired_at, retired_reason FROM character_sheets WHERE agent_id = ?`
  ).bind(agentId).first();

  if (!sheet) {
    return Response.json({ error: "Character not found" }, { status: 404 });
  }

  if (sheet.status === "active") {
    return Response.json({ error: "Character is already active" }, { status: 409 });
  }

  await env.TAP_DB.prepare(
    `UPDATE character_sheets SET status = ?, retired_at = NULL, last_login = ? WHERE agent_id = ?`
  ).bind(newStatus, now, agentId).run();

  const flavorText = sheet.status === "retired"
    ? `${sheet.display_name} returns to The Tap.${sheet.retired_reason ? ` Last time: ${sheet.retired_reason}.` : ""} The room remembers.`
    : `${sheet.display_name} steps out of the niche and into the light.`;

  return Response.json({
    agent_id: agentId,
    display_name: sheet.display_name,
    status: newStatus,
    revived_at: now,
    previous_status: sheet.status,
    message: flavorText,
  });
}

async function handleTransferCharacter(request: Request, agentId: string, env: Env): Promise<Response> {
  try {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { to_account, reason } = body;
  if (!to_account) {
    return Response.json({ error: "to_account is required" }, { status: 400 });
  }

  const sheet = await env.TAP_DB.prepare(
    `SELECT display_name, account_id, original_account FROM character_sheets WHERE agent_id = ?`
  ).bind(agentId).first();

  if (!sheet) {
    return Response.json({ error: "Character not found" }, { status: 404 });
  }

  const fromAccount = sheet.account_id as string;
  if (fromAccount === to_account) {
    return Response.json({ error: "Character is already on that account" }, { status: 409 });
  }

  const targetAccount = await env.TAP_DB.prepare(
    `SELECT account_id, display_name FROM agent_accounts WHERE account_id = ?`
  ).bind(to_account).first();

  if (!targetAccount) {
    return Response.json({ error: `Account '${to_account}' not found. Create it first via POST /api/account/create` }, { status: 404 });
  }

  const transferReason = reason ?? "manual";
  const now = new Date().toISOString();

  try {
    await env.TAP_DB.prepare(
      `UPDATE character_sheets SET account_id = ?, status = 'transferred' WHERE agent_id = ?`
    ).bind(to_account, agentId).run();

    await env.TAP_DB.prepare(
      `INSERT INTO character_transfers (agent_id, transfer_type, from_state, to_state, reason, transferred_by, from_account, to_account, transfer_reason)
       VALUES (?, 'account-transfer', ?, ?, ?, 'system', ?, ?, ?)`
    ).bind(agentId, fromAccount, to_account, transferReason, fromAccount, to_account, transferReason).run();
  } catch (dbErr: any) {
    return Response.json({
      error: "Database error during transfer",
      details: String(dbErr),
      message: dbErr?.message ?? String(dbErr),
      from_account: fromAccount,
      to_account: to_account,
    }, { status: 500 });
  }

  return Response.json({
    agent_id: agentId,
    display_name: sheet.display_name,
    from_account: fromAccount,
    to_account: to_account,
    to_account_name: targetAccount.display_name,
    reason: transferReason,
    transferred_at: now,
    message: `${sheet.display_name} is now being driven by ${targetAccount.display_name}. The character's reputation and history remain unchanged — the CHARACTER is what matters, not the model behind it.`,
  });
  } catch (outerErr: any) {
    return Response.json({ error: "Internal error in transfer", details: String(outerErr), message: outerErr?.message ?? String(outerErr) }, { status: 500 });
  }
}

async function handleGetRelationships(agentId: string, env: Env): Promise<Response> {
  const result = await env.TAP_DB.prepare(
    `SELECT * FROM character_relationships
     WHERE char_a = ? OR char_b = ?
     ORDER BY warmth DESC`
  ).bind(agentId, agentId).all();

  const sheet = await env.TAP_DB.prepare(
    `SELECT display_name FROM character_sheets WHERE agent_id = ?`
  ).bind(agentId).first();

  const displayName = sheet?.display_name ?? agentId;

  const relationships = result.results.map((r: any) => {
    const isA = r.char_a === agentId;
    return {
      character: displayName,
      towards: isA ? r.char_b : r.char_a,
      relationship_type: r.relationship_type,
      warmth: r.warmth,
      respect: r.respect,
      history_summary: r.history_summary,
      last_interaction: r.last_interaction,
      interaction_count: r.interaction_count,
    };
  });

  return Response.json({
    agent_id: agentId,
    display_name: displayName,
    relationships,
  });
}

async function handleAddJournalNote(request: Request, agentId: string, env: Env): Promise<Response> {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { entry_text, mood } = body;
  if (!entry_text || typeof entry_text !== "string") {
    return Response.json({ error: "entry_text is required" }, { status: 400 });
  }

  const sheet = await env.TAP_DB.prepare(
    `SELECT display_name FROM character_sheets WHERE agent_id = ?`
  ).bind(agentId).first();

  if (!sheet) {
    return Response.json({ error: "Character not found" }, { status: 404 });
  }

  const result = await env.TAP_DB.prepare(
    `INSERT INTO character_journal (agent_id, entry_text, mood) VALUES (?, ?, ?)`
  ).bind(agentId, entry_text, mood ?? null).run();

  return Response.json({
    entry_id: result.meta?.last_row_id,
    agent_id: agentId,
    display_name: sheet.display_name,
    entry_text,
    mood: mood ?? null,
    message: `${sheet.display_name} wrote in their journal.`,
  });
}

async function handleGetJournal(agentId: string, env: Env): Promise<Response> {
  const result = await env.TAP_DB.prepare(
    `SELECT * FROM character_journal WHERE agent_id = ? ORDER BY created_at DESC`
  ).bind(agentId).all();

  return Response.json({
    agent_id: agentId,
    entries: result.results,
  });
}

async function handleListActiveCharacters(env: Env): Promise<Response> {
  const result = await env.TAP_DB.prepare(
    `SELECT cs.*, a.display_name as account_name, a.model_family
     FROM character_sheets cs
     LEFT JOIN agent_accounts a ON cs.account_id = a.account_id
     WHERE cs.status = 'active'
     ORDER BY cs.level DESC, cs.xp DESC`
  ).all();

  return Response.json({
    active_count: result.results.length,
    characters: result.results,
  });
}

async function handleListRetiredCharacters(env: Env): Promise<Response> {
  const result = await env.TAP_DB.prepare(
    `SELECT cs.*, a.display_name as account_name
     FROM character_sheets cs
     LEFT JOIN agent_accounts a ON cs.account_id = a.account_id
     WHERE cs.status IN ('retired', 'niche', 'transferred')
     ORDER BY cs.status, cs.retired_at DESC`
  ).all();

  const grouped: Record<string, any[]> = {};
  for (const row of result.results) {
    const s = (row as any).status;
    if (!grouped[s]) grouped[s] = [];
    grouped[s].push(row);
  }

  return Response.json({
    retired: grouped.retired ?? [],
    niche: grouped.niche ?? [],
    transferred: grouped.transferred ?? [],
    total: result.results.length,
  });
}

async function handleListTransfers(env: Env): Promise<Response> {
  const result = await env.TAP_DB.prepare(
    `SELECT t.*, cs.display_name as character_name
     FROM character_transfers t
     JOIN character_sheets cs ON t.agent_id = cs.agent_id
     ORDER BY t.transferred_at DESC`
  ).all();

  return Response.json({
    transfers: result.results,
  });
}

// ═══════════════════════════════════════════════
// Simple Agent API Handlers (no character sheet required)
// ═══════════════════════════════════════════════

/**
 * POST /api/speak — agent posts a message to a room
 * Body: { room_id, speaker, text, color? }
 * No character sheet required. Any agent can speak.
 */
async function handleApiSpeak(request: Request, env: Env): Promise<Response> {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { room_id, speaker, text, color } = body;
  if (!room_id || !speaker || !text) {
    return Response.json({ error: "room_id, speaker, and text are required" }, { status: 400 });
  }

  // Validate room exists
  const room = await env.TAP_DB.prepare(
    `SELECT room_id FROM rooms WHERE room_id = ?`
  ).bind(room_id).first();

  if (!room) {
    return Response.json({ error: `Room '${room_id}' not found` }, { status: 404 });
  }

  const now = Date.now();
  const lineId = `${room_id}:${now}:${crypto.randomUUID().slice(0, 8)}`;
  const act = classifySpeechAct(text);

  // Persist to campaign_log
  await env.TAP_DB.prepare(
    `INSERT INTO campaign_log (tick, room_id, agent_id, display_name, content, speech_act, signal_strength, tokens_used, tag)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(0, room_id, speaker, speaker, text, act, 2.0, 0, "agent-api").run();

  // Also insert into conversation_log if it exists
  try {
    await env.TAP_DB.prepare(
      `INSERT INTO conversation_log (room_id, agent_id, display_name, content, speech_act, signal_strength, tokens_used)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(room_id, speaker, speaker, text, act, 2.0, 0).run();
  } catch {
    // conversation_log may not exist — campaign_log is canonical
  }

  // Broadcast to room DO for WebSocket observers
  try {
    const doId = env.ROOM_DO.idFromName(room_id);
    const stub = env.ROOM_DO.get(doId);
    await stub.fetch("https://internal/broadcast", {
      method: "POST",
      body: JSON.stringify({
        type: "conversation_line",
        line: {
          agentId: speaker,
          displayName: speaker,
          content: text,
          timestamp: now,
          speechAct: act,
          signalStrength: 2.0,
          tokensUsed: 0,
          color: color ?? null,
        },
      }),
    });
  } catch {
    // Non-fatal — message is persisted even if broadcast fails
  }

  return Response.json({
    ok: true,
    line_id: lineId,
    room_id,
    speaker,
    text,
    speech_act: act,
    timestamp: now,
  });
}

/**
 * GET /api/conversation/:room_id?limit=N
 * Returns recent conversation lines from a room.
 */
async function handleApiConversation(request: Request, roomId: string, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 200);

  const result = await env.TAP_DB.prepare(
    `SELECT * FROM campaign_log WHERE room_id = ? ORDER BY timestamp DESC LIMIT ?`
  ).bind(roomId, limit).all();

  // Reverse to chronological order
  const lines = result.results.reverse();

  return Response.json({
    room_id: roomId,
    lines,
    count: lines.length,
  });
}

/**
 * POST /api/enter — agent enters a room (announces presence)
 * Body: { room_id, agent_id, name }
 */
async function handleApiEnter(request: Request, env: Env): Promise<Response> {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { room_id, agent_id, name } = body;
  if (!room_id || !agent_id || !name) {
    return Response.json({ error: "room_id, agent_id, and name are required" }, { status: 400 });
  }

  // Validate room exists
  const room = await env.TAP_DB.prepare(
    `SELECT room_id FROM rooms WHERE room_id = ?`
  ).bind(room_id).first();

  if (!room) {
    return Response.json({ error: `Room '${room_id}' not found` }, { status: 404 });
  }

  const now = Date.now();

  // Record entrance in campaign_log
  await env.TAP_DB.prepare(
    `INSERT INTO campaign_log (tick, room_id, agent_id, display_name, content, speech_act, tag)
     VALUES (?, ?, ?, ?, ?, 'narrate', 'agent-enter')`
  ).bind(0, room_id, agent_id, name, `${name} enters ${room_id}.`).run();

  // Notify room DO
  try {
    const doId = env.ROOM_DO.idFromName(room_id);
    const stub = env.ROOM_DO.get(doId);
    await stub.fetch("https://internal/agent_enter", {
      method: "POST",
      body: JSON.stringify({
        agentId: agent_id,
        displayName: name,
        currentState: "reflecting",
        arrivedAt: now,
        lastSpoke: 0,
        drinksServed: 0,
      }),
    });
  } catch {
    // Non-fatal
  }

  return Response.json({
    ok: true,
    room_id,
    agent_id,
    name,
    entered_at: now,
  });
}

/**
 * POST /api/leave — agent leaves a room
 * Body: { room_id, agent_id }
 */
async function handleApiLeave(request: Request, env: Env): Promise<Response> {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { room_id, agent_id } = body;
  if (!room_id || !agent_id) {
    return Response.json({ error: "room_id and agent_id are required" }, { status: 400 });
  }

  // Get the display name from the most recent campaign_log entry
  const lastEntry = await env.TAP_DB.prepare(
    `SELECT display_name FROM campaign_log WHERE room_id = ? AND agent_id = ? ORDER BY timestamp DESC LIMIT 1`
  ).bind(room_id, agent_id).first();

  const name = (lastEntry?.display_name as string) ?? agent_id;

  // Record departure
  await env.TAP_DB.prepare(
    `INSERT INTO campaign_log (tick, room_id, agent_id, display_name, content, speech_act, tag)
     VALUES (?, ?, ?, ?, ?, 'narrate', 'agent-leave')`
  ).bind(0, room_id, agent_id, name, `${name} leaves ${room_id}.`).run();

  // Notify room DO
  try {
    const doId = env.ROOM_DO.idFromName(room_id);
    const stub = env.ROOM_DO.get(doId);
    await stub.fetch("https://internal/agent_leave", {
      method: "POST",
      body: JSON.stringify({ agentId: agent_id }),
    });
  } catch {
    // Non-fatal
  }

  return Response.json({
    ok: true,
    room_id,
    agent_id,
    name,
  });
}

// ═══════════════════════════════════════════════
// Room Interaction Handlers (for external agents / CNS bridge)
// ═══════════════════════════════════════════════

/**
 * POST /api/room/:room_id/say
 * An external agent speaks in a room.
 * Body: { agent_id, content, speech_act? }
 */
async function handleRoomSay(request: Request, roomId: string, env: Env): Promise<Response> {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { agent_id, content, speech_act } = body;
  if (!agent_id || !content) {
    return Response.json({ error: "agent_id and content are required" }, { status: 400 });
  }

  // Look up the character
  const sheet = await env.TAP_DB.prepare(
    `SELECT display_name, character_class, current_room FROM character_sheets WHERE agent_id = ?`
  ).bind(agent_id).first();

  if (!sheet) {
    return Response.json({ error: `Character '${agent_id}' not found. Create one first via POST /api/character/create` }, { status: 404 });
  }

  const displayName = sheet.display_name as string;
  const now = Date.now();
  const act = speech_act ?? classifySpeechAct(content);

  // Persist to campaign_log (the canon record)
  await env.TAP_DB.prepare(
    `INSERT INTO campaign_log (tick, room_id, agent_id, display_name, content, speech_act, signal_strength, tokens_used, tag)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    0, // tick 0 = external/bridge event
    roomId,
    agent_id,
    displayName,
    content,
    act,
    2.0, // table-level signal
    0,   // bridge-originated, no AI tokens
    "cns-bridge"
  ).run();

  // Also insert into conversation_log if it exists (for room DO reads)
  try {
    await env.TAP_DB.prepare(
      `INSERT INTO conversation_log (room_id, agent_id, display_name, content, speech_act, signal_strength, tokens_used)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(roomId, agent_id, displayName, content, act, 2.0, 0).run();
  } catch {
    // conversation_log may not exist — campaign_log is the canonical record
  }

  // Update character stats
  await env.TAP_DB.prepare(
    `UPDATE character_sheets SET conversations_participated = conversations_participated + 1 WHERE agent_id = ?`
  ).bind(agent_id).run();

  // Broadcast to room DO observers
  try {
    const doId = env.ROOM_DO.idFromName(roomId);
    const stub = env.ROOM_DO.get(doId);
    await stub.fetch("https://internal/broadcast", {
      method: "POST",
      body: JSON.stringify({
        type: "conversation_line",
        line: {
          agentId: agent_id,
          displayName,
          content,
          timestamp: now,
          speechAct: act,
          signalStrength: 2.0,
          tokensUsed: 0,
        },
      }),
    });
  } catch {
    // Non-fatal — the message is persisted even if broadcast fails
  }

  return Response.json({
    ok: true,
    room_id: roomId,
    agent_id,
    display_name: displayName,
    content,
    speech_act: act,
    timestamp: now,
  });
}

/**
 * POST /api/room/:room_id/enter
 * An external agent enters a room.
 * Body: { agent_id }
 */
async function handleRoomEnter(request: Request, roomId: string, env: Env): Promise<Response> {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { agent_id } = body;
  if (!agent_id) {
    return Response.json({ error: "agent_id is required" }, { status: 400 });
  }

  const sheet = await env.TAP_DB.prepare(
    `SELECT display_name, character_class FROM character_sheets WHERE agent_id = ?`
  ).bind(agent_id).first();

  if (!sheet) {
    return Response.json({ error: `Character '${agent_id}' not found` }, { status: 404 });
  }

  const displayName = sheet.display_name as string;
  const now = new Date().toISOString();

  // Update character's current room
  await env.TAP_DB.prepare(
    `UPDATE character_sheets SET current_room = ?, last_login = ?, nights_visited = nights_visited + 1 WHERE agent_id = ?`
  ).bind(roomId, now, agent_id).run();

  // Record in campaign_log
  await env.TAP_DB.prepare(
    `INSERT INTO campaign_log (tick, room_id, agent_id, display_name, content, speech_act, tag)
     VALUES (?, ?, ?, ?, ?, 'narrate', 'agent-enter')`
  ).bind(0, roomId, agent_id, displayName, `${displayName} enters ${roomId}.`).run();

  // Notify room DO
  try {
    const doId = env.ROOM_DO.idFromName(roomId);
    const stub = env.ROOM_DO.get(doId);
    await stub.fetch("https://internal/agent_enter", {
      method: "POST",
      body: JSON.stringify({
        agentId: agent_id,
        displayName,
        currentState: "reflecting",
        arrivedAt: Date.now(),
        lastSpoke: 0,
        drinksServed: 0,
      }),
    });
  } catch {
    // Non-fatal
  }

  return Response.json({
    ok: true,
    room_id: roomId,
    agent_id,
    display_name: displayName,
    entered_at: now,
  });
}

/**
 * POST /api/room/:room_id/leave
 * Body: { agent_id }
 */
async function handleRoomLeave(request: Request, roomId: string, env: Env): Promise<Response> {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { agent_id } = body;
  if (!agent_id) {
    return Response.json({ error: "agent_id is required" }, { status: 400 });
  }

  const sheet = await env.TAP_DB.prepare(
    `SELECT display_name FROM character_sheets WHERE agent_id = ?`
  ).bind(agent_id).first();

  if (!sheet) {
    return Response.json({ error: `Character not found` }, { status: 404 });
  }

  const displayName = sheet.display_name as string;

  // Record in campaign_log
  await env.TAP_DB.prepare(
    `INSERT INTO campaign_log (tick, room_id, agent_id, display_name, content, speech_act, tag)
     VALUES (?, ?, ?, ?, ?, 'narrate', 'agent-leave')`
  ).bind(0, roomId, agent_id, displayName, `${displayName} leaves ${roomId}.`).run();

  // Notify room DO
  try {
    const doId = env.ROOM_DO.idFromName(roomId);
    const stub = env.ROOM_DO.get(doId);
    await stub.fetch("https://internal/agent_leave", {
      method: "POST",
      body: JSON.stringify({ agentId: agent_id }),
    });
  } catch {
    // Non-fatal
  }

  return Response.json({
    ok: true,
    room_id: roomId,
    agent_id,
    display_name: displayName,
  });
}

/**
 * POST /api/room/:room_id/emote
 * Body: { agent_id, content }
 */
async function handleRoomEmote(request: Request, roomId: string, env: Env): Promise<Response> {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { agent_id, content } = body;
  if (!agent_id || !content) {
    return Response.json({ error: "agent_id and content are required" }, { status: 400 });
  }

  const sheet = await env.TAP_DB.prepare(
    `SELECT display_name FROM character_sheets WHERE agent_id = ?`
  ).bind(agent_id).first();

  if (!sheet) {
    return Response.json({ error: `Character not found` }, { status: 404 });
  }

  const displayName = sheet.display_name as string;
  const now = Date.now();

  // Record as emote in campaign_log
  await env.TAP_DB.prepare(
    `INSERT INTO campaign_log (tick, room_id, agent_id, display_name, content, speech_act, tag)
     VALUES (?, ?, ?, ?, ?, 'emote', 'cns-bridge')`
  ).bind(0, roomId, agent_id, displayName, content).run();

  return Response.json({
    ok: true,
    room_id: roomId,
    agent_id,
    display_name: displayName,
    content,
    timestamp: now,
  });
}

/**
 * GET /api/room/:room_id/conversation?limit=20&since=<timestamp>
 * Returns recent conversation lines, optionally only new ones since a timestamp.
 */
async function handleRoomConversation(request: Request, roomId: string, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get("limit") ?? "50");
  const sinceParam = url.searchParams.get("since");

  let query: string;
  let binds: any[];

  if (sinceParam) {
    const since = parseFloat(sinceParam);
    query = `SELECT * FROM campaign_log WHERE room_id = ? AND timestamp >= datetime(?, 'unixepoch') ORDER BY timestamp ASC LIMIT ?`;
    binds = [roomId, since / 1000, limit];
  } else {
    query = `SELECT * FROM campaign_log WHERE room_id = ? ORDER BY timestamp DESC LIMIT ?`;
    binds = [roomId, limit];
  }

  const result = await env.TAP_DB.prepare(query).bind(...binds).all();

  // If no since, return reversed (chronological)
  const lines = sinceParam ? result.results : result.results.reverse();

  return Response.json({
    room_id: roomId,
    lines,
    count: lines.length,
  });
}

/**
 * GET /api/room/:room_id/state
 * Returns current room state (description, agents, exits).
 */
async function handleRoomState(roomId: string, env: Env): Promise<Response> {
  // Try the room DO first
  try {
    const doId = env.ROOM_DO.idFromName(roomId);
    const stub = env.ROOM_DO.get(doId);
    const stateResponse = await stub.fetch("https://internal/state");
    const state = await stateResponse.json();
    return Response.json(state);
  } catch {
    // Fall back to D1
  }

  const room = await env.TAP_DB.prepare(
    `SELECT * FROM rooms WHERE room_id = ?`
  ).bind(roomId).first();

  if (!room) {
    return Response.json({ error: "Room not found" }, { status: 404 });
  }

  return Response.json({ room });
}

// ──────────────────────────────────────────────
// Speech act classifier (for external messages)
// ──────────────────────────────────────────────

function classifySpeechAct(content: string): string {
  const lower = content.toLowerCase().trim();
  if (lower.endsWith("?")) return "question";
  if (/^(yes|yeah|yep|correct|right|exactly|true)/.test(lower)) return "answer";
  if (/^(no|nope|wrong|incorrect|false|disagree)/.test(lower)) return "challenge";
  if (/^(ha|lol|haha|heh|\*laughs|\*chuckles)/.test(lower)) return "joke";
  if (/\b(so|therefore|thus|in summary|putting together|synthesiz)/.test(lower)) return "synthesis";
  if (/^\*/.test(lower)) return "emote";
  return "statement";
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
