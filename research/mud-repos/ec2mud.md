# ec2mud — sibling repo study

Repo: `/home/eileen/projects/ec2mud` (git remote `git@github.com:SuperInstance/ec2mud.git`, 5 commits, last commit "Add CI/CD workflow"). Every claim below is sourced from files actually read in this repo with Read/Grep — file paths and line numbers are given so they can be re-checked.

## 0. Honest scope check

This is a **small, real, working repo** — not thin boilerplate, but also much smaller than the README's "browser-based MUD game engine with web dashboard" framing suggests. Total non-generated source is ~1,800 lines across 15-ish TypeScript files plus 3 Node scripts. There is:

- **No Dockerfile, no systemd unit, no EC2/AWS deployment config anywhere in the repo.** `find . -iname "*docker*" -o -iname "*systemd*" -o -iname "*.service" -o -iname "*ec2*" -o -iname "*deploy*"` (excluding `.git`) returns nothing. The name "ec2mud" and the `package.json` description ("Multi-user dungeon (MUD) game server hosted on AWS EC2") are aspirational/branding only — there is zero infra-as-code, zero AWS SDK usage, zero deploy scripts. If The Tap wants "how does this actually run on EC2" answers, they aren't here.
- The only CI is `.github/workflows/ci-node.yml` — a generic Node matrix build (18/20/22) that lints (with `|| true`, i.e. never fails the build), builds, and runs `npm test || true` (also never fails — there is no test suite to run).
- **A live secret is checked into the repo**: `scripts/agent-explorer.js:14`, `scripts/dual-agent-experiment.js:10`, and `scripts/self-improve.js` all hardcode a DeepSeek API key literal (`REDACTED-DEEPSEEK-API-KEY-ROTATED`) as a fallback/default value. Worth flagging to whoever owns that key; not something to copy into The Tap.

What *is* real and worth studying: a working Socket.IO game server (two variants), a React/Next.js terminal client wired to it, and — most relevant to The Tap — three Node scripts where an LLM (DeepSeek) plays the MUD autonomously and agents interact with each other in real time. That last part is architecturally the closest thing in this repo to what The Tap is building.

## 1. What the code actually does

**Two interchangeable game-server backends, both Socket.IO over plain `http.createServer`:**

- `src/lib/standalone-mud.ts` (499 lines) — a **complete, self-contained, in-memory MUD server**. No database, no persistence — world state (6 rooms, NPCs, items) is a hardcoded `Record<string, Room>` object literal, and player state lives in a `Map<string, Player>` keyed by the Socket.IO connection id. It listens on port 3006 (`WS_PORT` env, default 3006) and also spins up a second bare `http.createServer` on port 3007 (`TELEMETRY_PORT`) serving a JSON `/telemetry` endpoint (session count, command count, failed-command count, per-room visit heatmap, players online, uptime).
- `src/lib/ws-bridge.ts` (129 lines) — a **protocol bridge**, not a game engine. For every Socket.IO connection from the browser it opens a fresh raw TCP socket (`net.createConnection`) to a separate Rust process ("holodeck-core") on port 7778, and pipes `login`/`command` Socket.IO events out as newline-terminated plain-text TCP writes, and pipes newline-delimited JSON lines coming back from that TCP socket into typed Socket.IO events (`room`, `player`, `line`, `login-ok`, `login-fail`). It buffers partial lines per-connection in a `Map<string, string>` (`buffers`) since TCP is a byte stream, not a message stream.

Neither of these processes is started by `next dev`/`next start` — they're separate `tsx`-executed scripts (`pnpm mud` / `pnpm bridge` in `package.json`). The Next.js app (`src/app/*`) is a third, independent process serving the React UI on port 3005 and a small `/api/modules/*` REST surface (see below) that is unrelated to the MUD gameplay — it manages a totally separate concept called "SuperInstance modules" (npm packages discovered in a sibling `packages/` directory), used by the dashboard/catalog pages, not the game.

**Client**: `src/app/game/page.tsx` (312 lines) is a single React client component (`'use client'`) that opens a Socket.IO connection (`io({ transports: ['websocket', 'polling'] })`), renders a scrolling terminal of typed lines plus a sidebar (room, players present, NPCs, items, exits-as-clickable-buttons), and sends `login`/`command` events. All client state — connection status, room, player stats, scrollback — is plain `useState`; there's no external state library.

**LLM-agent scripts** (`scripts/agent-explorer.js`, `scripts/dual-agent-experiment.js`, `scripts/self-improve.js`) are standalone Node CLIs, *not* part of the web app, that connect to `standalone-mud.ts` as regular Socket.IO clients and drive play via calls to the DeepSeek chat-completions API. `dual-agent-experiment.js` in particular launches two named agents ("Forge", "Tide") with distinct system prompts and staggered start delays, each running its own perceive→prompt→act loop against the shared MUD, explicitly to see "Can they find each other? Will they talk?" (file header comment, `scripts/dual-agent-experiment.js:1-5`).

## 2. Key architectural patterns

### Connection model: Socket.IO, one JS event loop, in-memory authoritative state
- Real-time transport is **Socket.IO** (not raw WebSocket, not TCP-to-browser) — `standalone-mud.ts:15` and `:108`, `Server as SocketIOServer` from the `socket.io` package, over a plain Node `http.createServer()`.
- There is exactly one server process, single-threaded event loop, no worker pool, no locking — "concurrency" is just async I/O interleaving. All shared state (`players: Map<string, Player>`, per-room `items: string[]`) is mutated directly and synchronously inside socket event handlers; there's no notion of a tick or transaction, each command runs to completion before the next event is processed.
- **Session identity = Socket.IO connection id.** There is no persistent player DB, no login/password check — `login` just checks the name isn't already in use by scanning the live `players` Map (`standalone-mud.ts:390-395`) and creates a fresh `Player` object for the session. Disconnect = the player vanishes (`standalone-mud.ts:435-456`); nothing survives a reconnect.
- Room broadcast is done by **manually iterating the `players` Map and filtering by `p.room === roomId`**, then `io.to(sid).emit(...)` per matching socket id (e.g. `standalone-mud.ts:135-143`, `:178-191`, `:254-259`, `:301-305`) — Socket.IO's built-in room-channel feature (`socket.join()`) is *not* used anywhere; presence/broadcast is entirely hand-rolled over the flat player map. This is a deliberate simplicity choice worth noting since it's the opposite of "idiomatic Socket.IO."

### Command parsing: flat switch on whitespace-split tokens
`handleCommand()` (`standalone-mud.ts:229-375`) does `input.trim().split(/\s+/)`, lowercases `parts[0]` as the verb, and dispatches via a movement-alias lookup (`dirMap: n→north` etc., `:237`) followed by a plain `switch (cmd)` with cases for `look/l`, `say`, `gossip`, `tell`, `take/get`, `drop`, `inventory/inv/i`, `stats`, `talk`, `help`, and a `default` that emits an "Unknown command" error and increments a `failedCommands` counter. No grammar, no verb-noun-preposition parser, no command registry/plugin pattern — it's one function, one switch statement. Every branch calls `socket.emit(...)` directly for the command's actor and loops `for (const [sid, p] of players)` to notify observers.

### World model: static object graph, not entity-component or data-driven
- `Room` (`standalone-mud.ts:21-28`) is `{ id, name, description, exits: Record<direction, roomId>, items: string[], npcs: Npc[] }`; `Npc` is just `{ name, dialogue: string[] }` with a line picked at random on `talk` (`:353`). Everything is inline TypeScript object literals in the same file — there is no external world-data format (no JSON/YAML room files, no loader), no room-editing tooling, no persistence layer.
- Movement validates against `currentRoom.exits[direction]`, tracks a `roomVisitCounts` heatmap for telemetry, and does an inverse-direction lookup (`oppositeDir`, `:199-202`) so arrival messages read naturally ("X arrives from the south").
- Spawn point is **weighted toward under-visited rooms** — `pickSpawnRoom()` (`:465-479`) builds a weight per room as `max(1, 10 - visits)` and does a weighted random pick. This is a small but genuinely clever load-balancing/engagement mechanic worth noting.

### Bridge pattern: Socket.IO ↔ raw TCP protocol translation
`ws-bridge.ts` is a clean example of a **transport-translation layer**: one Socket.IO connection maps 1:1 to one TCP connection to a backend process, JSON-vs-plaintext is autodetected on each line (`parseHolodeckLine`, `:38-57`, tries `JSON.parse`, falls back to treating the raw text as a system message), and partial-line buffering handles TCP's lack of message framing (`:70-84`). Connection lifecycle is symmetric — TCP close/error tears down the Socket.IO-side notification, and Socket.IO disconnect destroys the TCP socket (`:107-112`), with a `SIGINT` handler that drains all `connections` on shutdown (`:120-128`).

### LLM agents playing the MUD: perceive → LLM prompt → single-command act, on a fixed cadence
`scripts/agent-explorer.js` and `scripts/dual-agent-experiment.js` both implement the same loop shape:
1. Connect as a Socket.IO client, `login`, then on `login-ok` send an initial `look`.
2. Listen for `room`/`player`/`line` events and accumulate them into local variables (`currentRoom`, `visitedRooms: Set`, `gameHistory`/`conversationHistory: string[]`).
3. On a `while (turns < MAX_TURNS)` loop with a `sleep(2000-2500)` between iterations, serialize current room/exits/NPCs/items/visited-rooms/recent-history into a plain-text prompt, call `callDeepSeek(...)`, take the first line of the response as the command, and `socket.emit('command', { command: cleanCmd })`.
4. System prompts explicitly constrain output to "ONLY a single MUD command. No explanation, no quotes, no markdown" (`agent-explorer.js:71`) and give each agent a distinct personality/goal (`dual-agent-experiment.js:132-136`: Forge prefers west/north and is friendly; Tide prefers south/east and speaks in nautical metaphors and broadcasts findings via `gossip`).

This is a hand-rolled, blocking, one-command-per-turn agent loop — no tool-calling API, no streaming, no structured output, just "ask the LLM for one line of text, use it as the command." `self-improve.js` extends this into a self-play harness: spawns multiple agents with different personalities, collects coverage/error/stuck-loop stats per round, and writes reports to `/tmp/ec2mud-reports/`.

### Typing / async approach (vs. Rust)
- Types are structural TS interfaces (`Room`, `Player`, `Npc`, `RoomData`, `GameLine`, …), not algebraic/exhaustive-checked enums — the `type` field on emitted `line` events (`'system'|'say'|'tell'|'combat'|'movement'|'look'|'error'|'gossip'`) is a string union, matched with plain `if`/ternary chains client-side (`src/app/game/page.tsx:186-195`), not a `match` the compiler can prove exhaustive.
- `socket: any` is used throughout `standalone-mud.ts` (e.g. `:120`, `:146`, `:156`) rather than importing Socket.IO's typed `Socket` — type safety is opt-in per-call, not structural.
- Concurrency is implicit in the Node event loop: `async`/`await` and `Promise`/`setTimeout` (`sleep()` helpers in the LLM scripts) stand in for what tap-reflex/tap-dynamics would express as explicit timing budgets or a real async runtime (tokio). There is no analog to a hard latency budget anywhere in this repo — commands execute synchronously to completion with no timeout/deadline concept at all.

### The unrelated half: module registry / dashboard
`src/lib/module-registry.ts` + `src/types/modules.ts` + `src/app/api/modules/{route,load/route,unload/route}.ts` implement a **singleton registry** (persisted across Next.js hot-reloads via `global._superInstanceRegistry`, `module-registry.ts:240-260`) that scans a sibling `../packages` directory for `package.json` files and tracks fake/simulated load state and resource usage (`load/route.ts:66-74`: `await new Promise(resolve => setTimeout(resolve, 1000))` then assigns `Math.random()` CPU/memory numbers). This is a monorepo-tooling dashboard bolted onto the same Next app, unrelated to MUD gameplay — mentioned here only so it isn't mistaken for game architecture if someone greps the repo later.

## 3. What The Tap should adopt and why

The Tap's `tap-room` (perceive-decide-act room graph), `tap-dynamics` (Z3 speaker states), and `tap-reflex` (<50ms reflex shell) are all in-process Rust — there's no analog yet to "how does an agent actually *speak* into a live session, and how does that session get observed by a human or other agents." ec2mud's realest contribution is exactly that piece, even though its game logic is simplistic:

1. **Adopt the perceive→prompt→act loop shape from `agent-explorer.js`/`dual-agent-experiment.js`, not the code itself.** The pattern — accumulate room state + recent event history into a compact serialized context, call the model once, take exactly one action, repeat on a cadence — maps directly onto `tap-room`'s perceive-decide-act loop. The concrete, reusable idea: keep a bounded "recent history" window (`gameHistory.slice(-8)` in `agent-explorer.js:147`, `conversationHistory.slice(-6)` in `dual-agent-experiment.js:90`) rather than unbounded transcript, and force single-action-per-turn outputs with an explicit "ONE COMMAND ONLY" system-prompt constraint. This is cheap insurance against agents rambling multi-step plans instead of taking one interruptible action — directly relevant to how bar patrons in The Tap should speak (one utterance per turn, re-perceive after).

2. **Do not adopt the connection/session model as-is, but do adopt the principle it embodies: ephemeral, in-memory, keyed-by-live-connection state.** ec2mud has zero persistence and that's fine for a bar-room simulation where "who's here" only matters while they're here — `players: Map<socketId, Player>` (`standalone-mud.ts:99`) is a reasonable pattern for The Tap's live agent roster if/when it grows a network-facing layer, since Rust equivalents (`DashMap<ConnectionId, AgentSession>` or similar) would give the same "connection = source of truth for presence" property without needing a DB. Worth deferring until The Tap actually needs multiple simultaneous observers/agents talking over a wire — right now tap-room appears to be a single in-process simulation, so this is a "when you add a network layer" note, not urgent.

3. **Adopt the broadcast-by-filtering-a-flat-map pattern over Socket.IO's channel abstraction if/when The Tap grows a real-time viewer.** ec2mud explicitly skips `socket.join(room)` in favor of manually filtering `players` by `p.room === roomId` on every broadcast (`standalone-mud.ts:135-143` etc.). That's *not* a best practice to copy for scale, but it is simpler to reason about and debug for a small, single-process room count (The Tap's bar is one room, likely a handful of rooms at most) — worth noting as "don't reach for pub/sub machinery prematurely" if The Tap ever exposes a spectator WebSocket.

4. **Reuse the weighted-spawn idea (`pickSpawnRoom`, `standalone-mud.ts:465-479`) as a template for load-balancing which agent speaks/moves next**, not literally for room spawning (The Tap likely has one bar room). The technique — weight selection inversely by recent activity count, `max(1, 10 - visits)` — is a cheap way to keep The Tap's speaker-turn-taking (tap-dynamics' Z3 states) from letting one agent dominate; could inform a "who gets the floor next" weighting alongside the Contrarian/Reflecting/Agreeing state machine.

5. **Reuse the telemetry-endpoint idea, not the code**: a plain second HTTP server exposing `/telemetry` as JSON (session count, command count, failure count, uptime — `standalone-mud.ts:481-498`) is a trivially cheap observability pattern The Tap could bolt onto tap-room for free (turn count, failed-action count, per-agent utterance count) without pulling in a metrics stack.

6. **Explicitly do NOT adopt**: the hardcoded API key pattern (see §0) — if The Tap ever calls out to a hosted model from a script, load the key from env with no literal fallback. Also do not adopt the "aspirational README/package.json" habit of describing infrastructure (EC2 hosting) that doesn't exist in the repo — The Tap's docs should describe only what's implemented, per this task's own integrity requirement.

7. **Nothing here informs tap-dynamics' Z3 math or tap-reflex's latency budget directly** — ec2mud has no timing/deadline concept anywhere (confirmed by grep; no `setTimeout` used for anything but polling delays and a fake 1s "module load" simulation) and no state-machine modeling of speaker stance. Those two crates are ahead of anything in this sibling repo; nothing to backport.

## 4. Code snippets worth preserving

**Weighted spawn-room selection** — `src/lib/standalone-mud.ts:465-479`:
```ts
/** Pick a spawn room, weighted toward less-visited rooms */
function pickSpawnRoom(): string {
  const roomIds = Object.keys(rooms);
  const weights = roomIds.map(id => {
    const visits = roomVisitCounts[id] || 0;
    return Math.max(1, 10 - visits);
  });
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * totalWeight;
  for (let i = 0; i < roomIds.length; i++) {
    r -= weights[i];
    if (r <= 0) return roomIds[i];
  }
  return 'harbor';
}
```

**Command dispatch shape** (verb parsing + movement alias table) — `src/lib/standalone-mud.ts:229-243`:
```ts
function handleCommand(socket: any, player: Player, input: string) {
  totalCommands.count++;
  const parts = input.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  // Movement
  const directions = ['north', 'south', 'east', 'west', 'up', 'down', 'n', 's', 'e', 'w', 'u', 'd'];
  const dirMap: Record<string, string> = { n: 'north', s: 'south', e: 'east', w: 'west', u: 'up', d: 'down' };
  const fullDir = dirMap[cmd] || cmd;

  if (directions.includes(cmd)) {
    movePlayer(socket, player, fullDir);
    return;
  }
  ...
```

**TCP↔Socket.IO line-buffering bridge** — `src/lib/ws-bridge.ts:70-84`:
```ts
tcp.on('data', (chunk) => {
  const buf = buffers.get(socket.id) || '';
  const combined = buf + chunk.toString('utf-8');
  const lines = combined.split('\n');

  // Last element might be incomplete — keep it in the buffer
  buffers.set(socket.id, lines.pop() || '');

  for (const line of lines) {
    const parsed = parseHolodeckLine(line);
    if (parsed) {
      socket.emit(parsed.event, parsed.data);
    }
  }
});
```

**Perceive→prompt→act loop for an LLM-driven agent** — `scripts/agent-explorer.js:140-167` (trimmed):
```js
async function gameLoop() {
  while (turnCount < MAX_TURNS) {
    await sleep(2000); // Don't spam
    if (!currentRoom) continue;

    turnCount++;
    const recentHistory = gameHistory.slice(-8).map(h => h.text.replace(/\n/g, ' ').substring(0, 100)).join('\n');

    const gameState = `Current room: ${currentRoom.name} (ID: ${currentRoom.id})
Exits: ${Object.keys(currentRoom.exits).join(', ')}
Players here: ${currentRoom.players.join(', ') || 'none'}
NPCs here: ${currentRoom.npcs.join(', ') || 'none'}
Items on ground: ${currentRoom.items.join(', ') || 'none'}
Rooms visited so far: ${[...visitedRooms].join(', ')} (${visitedRooms.size}/6)

Recent events:
${recentHistory}

What do you do? (one command only)`;

    const command = await callDeepSeek(systemPrompt, gameState);
    const cleanCmd = command.trim().split('\n')[0].replace(/^["'`]|["'`]$/g, '');

    console.log(`   > ${cleanCmd}`);
    socket.emit('command', { command: cleanCmd });
    gameHistory.push({ type: 'command', text: `> ${cleanCmd}` });
  }
  ...
```

**Two-agent personality/goal prompts** (shows how distinct system prompts drive divergent behavior from the same engine) — `scripts/dual-agent-experiment.js:132-136`:
```js
const prompts = {
  Forge: `You are Forge, a shipwright agent who loves the Shell Works. You're exploring the holodeck to understand how agents and shells work together. You're friendly and like to gossip with other players. You prefer going WEST and NORTH from rooms. ALWAYS try unvisited exits first. Your goal is to visit all 6 rooms and meet other players. One command only.`,

  Tide: `You are Tide, a navigator agent who speaks in nautical metaphors. You're mapping the entire holodeck for the fleet. You prefer going SOUTH and EAST from rooms. ALWAYS try unvisited exits first. When you see another player, greet them via 'say'. Occasionally use 'gossip' to broadcast your findings. Your goal is to visit all 6 rooms and meet other players. One command only.`,
};
```
