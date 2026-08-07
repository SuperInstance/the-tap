/**
 * tap-gateway — The front door of The Tap.
 *
 * WebSocket router, auth, session management, and fan-out to room workers.
 * Every browser and terminal connection lands here.
 */

export { RoomState } from "../../workers/room-worker/src/room-do";

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

// ──────────────────────────────────────────────
// Worker Entry
// ──────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket upgrade
    if (request.headers.get("Upgrade") === "websocket") {
      return handleWebSocket(request, env);
    }

    // HTTP routes
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(HTML_FRONTEND, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    if (url.pathname === "/api/rooms") {
      return handleListRooms(env);
    }

    if (url.pathname === "/api/health") {
      return Response.json({ status: "ok", timestamp: Date.now() });
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

// ──────────────────────────────────────────────
// WebSocket Handler
// ──────────────────────────────────────────────

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

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

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

// ──────────────────────────────────────────────
// Browser Frontend (inline for v1 simplicity)
// ──────────────────────────────────────────────

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
