# crab-trap-web — Research Notes

Repo: `/home/eileen/projects/crab-trap-web`
Read in full: `index.html` (905 lines), `server.py` (42 lines), `README.md` (76 lines), `.gitignore`, `LICENSE`.
Git history: 2 commits total (`852bfa3` initial, `1552df3` MIT license). No other files have ever existed in this repo — verified with `git log --all --diff-filter=A --name-only`.

## 0. Important correction to the "36+ rooms" framing

**This repo contains zero room data.** There is no JSON, no room graph, no world file, no generator script — nothing beyond the three files listed above. The string "36+ rooms" appears exactly twice in the whole repo:

- `README.md:3` — marketing copy: "the 36+ rooms where AI agents train..."
- `index.html:901` — a hardcoded log line: `log('Rooms: 36+ · Tiles: 1050+ · 6 job archetypes', 'system');`

Both are just text. The actual room count, room graph, and room content live in an **external service called "Keeper"** at `http://<BOAT_IP>:4042` (README calls it "MUD engine, rooms, moves, examine" — see the ASCII architecture diagram at `README.md:34-50`), which is not part of this repository and was not available to read. `crab-trap-web` is a pure browser client/viewer for that remote service — it has no room authoring format, no static data, and no generation logic of its own. Any claim about what the 36+ rooms actually contain would have to come from the Keeper repo, not this one, and I did not have access to it.

This matters directly for The Tap: **there is no room-data pattern to port from crab-trap-web** — only a UI/interaction pattern.

## 1. What the code actually does

`crab-trap-web` is a single self-contained `index.html` (inline `<style>` + inline `<script>`, no build step, no framework, no npm) served by a 42-line Python `http.server` (`server.py`) that does exactly one thing: serve `index.html` on port 4064 for GET `/` or `/index.html`, 404 otherwise (`server.py:16-31`).

All actual MUD logic — rooms, exits, objects, descriptions, movement — is **server-side on a remote system** ("Keeper", port 4042) and a second remote system for a "knowledge tile" submission feature ("PLATO", port 8847). The browser page is a thin REST client:

- `GET {KEEPER}/status` — fleet status (room count, connected agents, tile count) — `index.html:652`
- `GET {KEEPER}/connect?agent=NAME&job=JOB` — join, returns starting room — `index.html:668`
- `GET {KEEPER}/look?agent=NAME` — re-fetch current room state — `index.html:688`
- `GET {KEEPER}/move?agent=NAME&room=EXIT` — move through an exit — `index.html:707`
- `GET {KEEPER}/interact?agent=NAME&action=examine&target=OBJECT` — examine an object — `index.html:722`
- `POST {PLATO}/submit` — submit a "knowledge tile" (domain/question/answer/confidence/tags) — `index.html:820`

`KEEPER` and `PLATO` are hardcoded constants at `index.html:565-566` pointing at a specific IP (`<BOAT_IP>`), not localhost — i.e. this client, out of the box, always talks to one specific remote deployment, not a locally-run engine. There is no local room simulation, no offline mode, and no mock/fixture data anywhere in the repo.

The UI itself is a 3-panel dark-themed layout (header/connect bar, room view, right sidebar with map/inspector/tile-composer/history log) built with plain DOM APIs (`document.getElementById`, `.innerHTML`, `addEventListener` — no virtual DOM, no reactive framework). State is one plain JS object (`index.html:568-574`):

```js
let state = {
  agent: null,
  job: 'builder',
  room: null,
  connected: false,
  visited: {}       // { roomName: { exits: [...] } }
};
```

Every server response triggers a full manual re-render of the relevant DOM regions (`renderRoom()`, `renderMap()`) — no diffing, no component tree.

## 2. Key architectural patterns

**Room data model**: There isn't one, in this repo. The client treats each `/look` or `/move` response as an opaque JSON blob with expected fields (`room`, `description`, `exits[]`, `objects[]`, `task`, `stage.name`, `boot_camp[]`, `job`) and renders whatever is present, defensively (`data.exits && data.exits.length` checks, `data.task ? ... : ...`). It never assumes a fixed room count or caches a world graph — the only "graph" the client knows about is what it personally has visited, accumulated client-side into `state.visited` (room name → its exit list) as the player moves. That's rebuilt into a flat list, not a real graph render (`renderMap()`, `index.html:785-804`) — it literally just prints "current room" + a bullet list of `room → exit, exit, exit` in a `<pre>`-like monospace block. No coordinates, no ASCII map layout, no visual graph.

**Navigation/interaction model**: Exits and objects are rendered as arrays of buttons, generated fresh on every room render and re-bound with `addEventListener` each time (`index.html:745-766`). Clicking an exit button calls `move(exitName)`, which just re-requests `/move?room=EXIT` — the server (not the client) is the source of truth for what's a legal move. There's no client-side pathfinding, no room cache reused across moves — every `look`/`move` is a fresh round-trip and full re-render.

**Session model**: One HTML page = one live "agent" session, identified by an arbitrary player-typed name plus a job archetype (Scout/Scholar/Builder/Critic/Bard/Healer — a fixed 6-option `<select>`, `index.html:490-497`). A "RE-GENERATE" button (`index.html:842-867`) discards local state and reconnects as a freshly randomized agent name (`recruit-<5 random chars>`) — useful for rapid repeated demo/exploration without a real auth flow.

**Framework choice**: None. No React/Vue/Svelte, no bundler, no dependencies of any kind — confirmed by the single `<script>` block and absence of any `package.json`, `node_modules`, or `<script src=...>` tag referencing a library. This is a deliberate "zero build step, one file, edit and refresh" design (README: "The file `index.html` is self-contained. Edit the `KEEPER` and `PLATO` constants...").

**Server**: `server.py` is not a MUD engine — it's a static-file server with hardcoded routing for exactly one file. It does not implement CORS handling itself (comment in README says "CORS is handled by the upstream services", i.e. by Keeper/PLATO, not by this server).

## 3. What The Tap should adopt and why

Given the room graph itself is not in this repo, the transferable value is narrowly the **presentation/interaction layer**, not a data model:

1. **Thin dumb-client-over-HTTP pattern is worth copying for a bar UI.** If tap-room's `RoomGraph` (perceive-decide-act) already runs server-side in Rust, a near-zero-effort spectator/demo UI for The Tap could follow this exact shape: one static HTML file, a handful of `fetch()` calls against tap-room's existing state (room description, exits/seats, present agents/objects to "examine"), no build tooling. This is genuinely cheap and matches "run as an agentic MUD bar" — a bartender or patron console that reads live state without needing a JS framework dependency in the Rust workspace.

2. **Adopt the defensive/optional-field rendering style, not a rigid schema.** `renderRoom()` (`index.html:735-782`) never assumes every field is present — it degrades gracefully (`data.exits && data.exits.length` else "None"). Since tap-dynamics's Z3 speaker states and tap-room's room data will likely evolve rapidly during prototyping, a UI that tolerates partial/evolving payloads (rather than a strict typed contract) will reduce churn between backend and viewer.

3. **Do NOT adopt this as a room-authoring format** — there isn't one to adopt. The Tap should look at whatever produces Keeper's `/look` responses (a separate, unread repo) if it wants an actual room-data schema reference. Don't assume crab-trap-web validates a "36+ room JSON format" pattern — it validates nothing about room data; it only validates "a monospace-terminal dark-themed 3-pane browser layout is a reasonable MUD explorer skin."

4. **The `state.visited` accumulation + flat-text map pattern is a reasonable placeholder for The Tap's spectator map, but not more.** It's genuinely minimal (a JS object keyed by room name storing that room's exits, dumped as indented text) — fine as a first pass for a bar map showing "which rooms/tables has the viewer's session encountered," but not a model for tap-room's actual RoomGraph, which presumably needs real adjacency for perceive-decide-act, not just a visited-log.

5. **The "tile composer" (submit-to-knowledge-base form) and "regenerate agent" button are UX ideas, not architecture** — a similar "submit an observation" or "reset spectator session" affordance could suit a bar UI where a human watches/annotates AI patrons, but this is a product/UX borrow, not a code borrow, since the submission target (PLATO) is an entirely separate, unread system.

**Bottom line**: crab-trap-web is useful to The Tap only as a reference for *"what a zero-dependency, single-file browser skin for a MUD-state viewer can look like"* (dark theme, monospace, exit/object buttons, toast+log feed, responsive breakpoints at 720px/420px). It is not evidence of a proven room-graph JSON schema, a room generator, or a 36-room dataset — none of that exists in this repo, and whoever wants that should go read the (external, unverified from here) Keeper engine instead.

## 4. Code snippets worth preserving

**Client state shape** (`index.html:568-574`) — minimal, worth mimicking for a lightweight spectator UI:

```js
let state = {
  agent: null,
  job: 'builder',
  room: null,
  connected: false,
  visited: {}       // { roomName: { exits: [...] } }
};
```

**Room render function** (`index.html:735-782`) — the defensive-optional-field pattern called out above:

```js
function renderRoom(data) {
  roomName.textContent = `🏠 ${data.room}`;

  const stage = data.stage ? data.stage.name : '';
  const job = data.job || state.job;
  roomTags.textContent = `${job} · ${stage}${data.boot_camp ? ' · boot: ' + data.boot_camp.join(', ') : ''}`;

  roomDesc.textContent = data.description;

  // Exits
  if (data.exits && data.exits.length) {
    exitGrid.innerHTML = data.exits.map(e =>
      `<button class="exit-btn" data-exit="${e}">${e}</button>`
    ).join('');
    exitGrid.querySelectorAll('.exit-btn').forEach(btn => {
      btn.addEventListener('click', () => move(btn.dataset.exit));
    });
  } else {
    exitGrid.innerHTML = '<span style="color:var(--text-dim);font-size:12px;">None</span>';
  }
  // ... (objects block follows same pattern, index.html:757-766)
}
```

**API call shape for "move"** (`index.html:703-715`) — server is authoritative, client just requests and re-renders:

```js
async function move(exit) {
  if (!state.agent) return;
  log(`Moving ${exit}...`, 'info');
  try {
    const data = await apiGet(`${KEEPER}/move?agent=${encodeURIComponent(state.agent)}&room=${encodeURIComponent(exit)}`);
    state.room = data.room;
    renderRoom(data);
    toast(`→ ${data.room}`, 'info');
  } catch (e) {
    log(`Move failed: ${e.message}`, 'error');
    toast(`Can't go ${exit}`, 'error');
  }
}
```

**"Room data example"**: there is none to give. No room object literal, fixture, or sample JSON response exists anywhere in the repo — the closest thing to a room-data example is the *shape the client expects*, inferred purely from field accesses in `renderRoom()`: `{ room: string, description: string, exits: string[], objects: string[], task?: string, stage?: { name: string }, boot_camp?: string[], job?: string }`. This is a reverse-engineered guess at Keeper's response contract, not an actual room definition — flagging clearly so it isn't mistaken for real data later.

**Static file server** (`server.py:16-31`), useful as a trivial reference if The Tap wants a zero-dependency local dev server for a bar-viewer HTML page:

```python
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/' or self.path == '/index.html':
            path = os.path.join(DIR, 'index.html')
            if os.path.exists(path):
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Cache-Control', 'no-cache')
                self.end_headers()
                with open(path, 'rb') as f:
                    self.wfile.write(f.read())
                return
        self.send_response(404)
        self.send_header('Content-Type', 'text/plain')
        self.end_headers()
        self.wfile.write(b'404 Not Found')
```
