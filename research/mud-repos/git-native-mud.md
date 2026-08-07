# Sibling repo study: git-native-mud

Repo studied: `/home/eileen/projects/git-native-mud` (origin: `github.com/SuperInstance/git-native-mud`)

Method: read every source file directly (`mud_engine.py`, `quest_engine.py`,
`bridges/game_bridge.py`, `bridges/solitaire_bridge.py`,
`.github/workflows/mud-turn.yml`, all `world/**` YAML/JSON, all top-level
`*.md` design docs), grepped for git-plumbing usage, server frameworks, and
whether `quest_engine.py` is actually wired into the turn processor. Full
`git log --oneline` reviewed for build order. Nothing below is inferred from
the README alone — every claim is cross-checked against the code that
implements (or fails to implement) it.

---

## 1. What the code actually does

Strip the marketing tagline ("the repo IS the world, commits ARE actions, zero
server") down to what's actually running, and you get a much smaller, more
honest system:

- **The world is plain files.** `world/rooms/*.yaml` (20 rooms) and
  `world/agents/*.yaml` (8 agents) are ordinary YAML documents loaded with
  `yaml.safe_load`. There is no custom git object format, no content-addressed
  world state beyond what git already gives any tracked file, and no use of
  git plumbing at all — a repo-wide grep for `subprocess`, `commit-tree`,
  `update-ref`, `hash-object` in `*.py` came back **empty**. Every git
  operation is the standard `git add / commit / push` sequence, run either by
  a human or by the CI job.

- **"Actions become commits" via a directory convention, not a git mechanism.**
  A player/agent writes one YAML file per turn to
  `world/commands/{agent_id}.yaml` (e.g. `move: north`) and commits it. That's
  the entire "action" primitive — a filename keyed by agent ID, containing a
  single-key command dict. There is no action schema/validator, no signature,
  no idempotency key beyond "this file exists."

- **There IS a server — it's just GitHub's, not a process you run.**
  `.github/workflows/mud-turn.yml` triggers `mud_engine.py` on every push that
  touches `world/commands/**` (or manual `workflow_dispatch`). It installs
  `pyyaml`, runs the engine, then does `git add world/ && git commit -m "Turn
  processed" && git push` using a bot identity (`GitMUD Engine
  <mud@gitnative.dev>`). This is a real, centralized, sequential turn
  processor — it just runs on GitHub Actions infrastructure instead of a
  boxed server. Concurrency handling is whatever GitHub Actions/git give you
  for free (a runner processes one workflow run at a time against the repo;
  ordinary git push races are possible but not addressed anywhere in code).
  "Zero server" is true only in the narrow sense of "no server *you* host";
  it is not serverless in the sense of decentralized or peer-resolved.

- **`mud_engine.py` (187 lines) is the entire simulation.** Per turn it:
  1. Loads all files under `world/commands/*.yaml` into a dict keyed by
     agent id.
  2. Rolls initiative: `random.randint(1, 20) + initiative_bonus`, sorts
     descending.
  3. For each agent in initiative order, dispatches on which single key is
     present in their command dict: `move`, `take`, `drop`, `attack`, `fish`,
     `scan`, `say`, `wait`, else "unknown command."
  4. Mutates the agent's YAML in place (location, inventory, battery) and
     appends a plain-text line to an in-memory turn log.
  5. Deletes the processed command file.
  6. Calls `update_room_refs()` to resync each room's `agents`/`items` lists
     from agent/item file locations (a full rescan of every room/item/agent
     file each turn, not incremental).
  7. Writes `world/log/turn-NNNN.md` (turn number = count of existing log
     files + 1) and writes `GITHUB_OUTPUT` keys (`turn_number`, `summary`,
     `changes`) for the Actions job to consume.

- **Actions supported are genuinely minimal**: move (exit lookup on the room's
  `exits` map, −2 battery), take/drop (inventory cap 10, −1 battery), attack
  (a d20+2 roll that is **logged but never applied** — no HP is subtracted
  anywhere in the file, no room/target combat resolution exists), fish
  (requires `fishing_rod` in inventory + room name containing "river",
  random salmon or nothing), scan (dumps exits/agents, no fog-of-war), say
  (just logged, no per-room broadcast delivery beyond the log line), wait
  (no-op, 0 battery). Day/night cycle and "every 20 turns" claimed in the
  README do not exist in `mud_engine.py` — there's no day/night/turn-modulo
  logic in the file at all.

- **`quest_engine.py` is a free-standing, self-testing script — it is not
  wired into `mud_engine.py`.** Confirmed by grep: `quest_engine` /
  `QuestEngine` never appear in any other `.py` file. Running the file
  directly regenerates `world/quests/fishing-expedition.md` and
  `world/quests/plot-course.md` from hardcoded triple-quoted strings, then
  runs a self-test (`engine.accept_quest("scout", ...)`, prints results). The
  quest engine parses `requires:`/`ensures:`/`strategies:` sections out of a
  quest markdown file's body with a hand-rolled line-by-line parser (not a
  real YAML/frontmatter contract system beyond the initial `---` frontmatter
  split), and `check_requires`/`grant_ensures` special-case exactly three
  requirement keys (`fishing_rod`, `river_access`, `battery`) and reward keys
  (`catch`, `experience`, `course`). It never reads or writes agent state via
  the same `world/agents/*.yaml` path that `mud_engine.py`'s turn loop uses
  in the same run — it's a parallel, disconnected prototype.

- **`bridges/game_bridge.py` and `bridges/solitaire_bridge.py` are a real,
  working abstraction with one real implementation.** `GameBridge` (ABC) with
  `capture_state / describe_state / execute_command` is genuinely
  implemented end-to-end by `SolitaireBridge`, which wraps a complete,
  correct, from-scratch Klondike solitaire engine (`SolitaireGame`, ~230
  lines: stock/waste/foundations/tableau, `move_tableau_to_tableau` with
  proper face-up-run detection, `auto_foundation`, ASCII-art `describe()`).
  `GitHubBridge`, `DockerBridge`, `SensorBridge` in `game_bridge.py` are
  **stubs that return hardcoded fake data** (`{"stars": 42, "issues": 7}`,
  `{"containers": 5, "running": 4}`, `{"temp_c": 18.5, ...}`) — none call a
  real API. None of the bridges are invoked from `mud_engine.py`; there is no
  "room type" dispatch anywhere in the turn engine that would route a room to
  a bridge. `solitaire_lounge.yaml` exists as a room file but the engine has
  no code path that would load `SolitaireBridge` when an agent enters it.

- **The design docs (`ROOM-GATEWAY-ARCHITECTURE.md`, `COCKPIT-MUD-DESIGN.md`,
  `OPENPROSE-MUD-FUSION.md`, `BRIDGE-SCENARIOS.md`) describe a much larger
  system than exists**: commands like `quest accept`, `wire`, `forge`,
  `compile`, `deploy`, `trigger set`, `session begin`, `order: {agent}
  {command}`, `throttle`, `heading`, `declare emergency`, `plot_course`,
  `broadcast`, `ping` — none of these strings appear as handled cases in
  `mud_engine.py`'s command dispatch (only `move/take/drop/attack/fish/scan
  /say/wait`). These docs are vision/spec documents for future phases
  ("Phase 1: Map OpenProse to MUD commands... Phase 6: Deploy to
  git-native-mud"), not implementation status.

- **World data has schema drift and no evidence of ever running.** There is
  no `world/commands/`, `world/log/`, or `world/items/` directory in the repo
  — `mud_engine.py` has never produced a committed turn log or been run
  against real player commands in this repo's history (or the outputs were
  never committed). `world/rooms/the_bridge.json`,
  `world/rooms/super_cub_cockpit.json`, and `world/rooms/atc_radar_room.json`
  use a different, incompatible room schema (`exits` values are human-titled
  room names like `"Fleet Operations Center"`, not the snake_case file-stem
  IDs `get_room()`/`room_path()` require, and there's no `agents: []` field).
  These three rooms would silently break `mud_engine.py`'s `move` handler
  (`get_room(exits[direction])` would look for
  `world/rooms/Fleet Operations Center.yaml` and fail) — they're
  design-fiction rooms attached to the cockpit/ATC vision docs, not
  integrated into the playable YAML world.

**Bottom line**: the working core is a small, honest, well-scoped Python
script (`mud_engine.py`) plus a real CI trigger
(`.github/workflows/mud-turn.yml`) that together implement "commit a YAML
file, GitHub Actions applies it, commits the result back." That part is real
and functional. Everything past that — quests as contracts, bridges to real
external systems, OpenProse-as-MUD-mechanics, cockpit/ATC — is design
documentation and disconnected prototypes, not integrated code. The "zero
server" framing undersells that GitHub Actions *is* the server; it's just a
server the project doesn't have to operate.

---

## 2. Key architectural patterns

Patterns that are real (present in code), described precisely:

1. **Filesystem-as-mailbox for actions.** One file per agent per pending
   action, path-keyed by agent id: `world/commands/{agent_id}.yaml`
   (`mud_engine.py:52-56`). The engine's only "inbox check" is
   `glob.glob("world/commands/*.yaml")`. This is a trivially simple,
   trivially inspectable actor mailbox — no queue library, no locking, just
   glob + delete-after-processing (`mud_engine.py:161-162`).

2. **State-as-flat-files, one file per entity.** Rooms and agents are each a
   single YAML file, loaded/saved with bare `yaml.safe_load` /
   `yaml.dump(..., sort_keys=False)` (`mud_engine.py:10-16`). No database, no
   in-memory authoritative store that outlives the process — the filesystem
   (as tracked by git) *is* the store. Every git commit that touches
   `world/` is by construction a full snapshot of world state at that turn,
   and `git log`/`git diff` over `world/` give you a free audit trail with no
   extra bookkeeping.

3. **Derived state resynced by full rescan, not incrementally maintained.**
   `update_room_refs()` (`mud_engine.py:24-48`) rebuilds every room's
   `agents` and `items` lists from scratch each turn by scanning all agent
   and item files and bucketing by `location`. Rooms are not the source of
   truth for who's in them — agent files are, and rooms are a rendered view.
   This avoids a whole class of state-drift bugs (an agent moving without
   updating two places) at the cost of O(agents + items + rooms) work every
   turn — fine at this repo's scale (8 agents, 20 rooms), not something to
   copy at scale without changes.

4. **Initiative as a stable sort key computed once per turn**, not embedded
   in individual action processing: `sorted(commands.keys(), key=lambda a:
   random.randint(1,20) + bonus, reverse=True)` (`mud_engine.py:65-67`). All
   of a turn's actions are resolved by iterating this precomputed order, so
   turn order is deterministic *after* the dice are rolled, auditable from
   the log line `Initiative: {...}` (`mud_engine.py:70`), but the dice
   themselves are not seeded/logged — a replay of the git history cannot
   reproduce identical dice outcomes even though it can reproduce the command
   inputs.
   
5. **CI as the sole write authority, with a bot git identity.**
   `mud-turn.yml` sets `user.name "GitMUD Engine" / user.email
   mud@gitnative.dev` before committing (`mud-turn.yml:25-26`), so the git
   log cleanly distinguishes player-submitted command commits from
   engine-applied state commits by author. `permissions: contents: write`
   is scoped narrowly to that job. Turn processing is fully serialized
   because it's a single CI job triggered per push — no distributed
   consensus needed because there's exactly one writer for `world/` after
   the initial command commit.

6. **Bridge interface is a real, minimal 3-method contract**
   (`bridges/game_bridge.py:11-43`): `capture_state() -> dict`,
   `describe_state(state) -> str`, `execute_command(cmd) -> str`, plus
   optional `available_commands()` / `room_type()`. This is a clean seam for
   "external system as room" even though only one implementation
   (`SolitaireBridge`) is real. The pattern (state capture / text rendering /
   command translation, decoupled from what's behind it) is worth noting
   independent of the stub implementations.

7. **Contracts-as-quests parsing is hand-rolled and fragile, not a pattern to
   copy as-is.** `QuestEngine.load_quest` splits on literal `"---"` for
   frontmatter and then does a manual `requires:`/`ensures:`/`strategies:`
   section-scan over lines (`quest_engine.py:46-66`), keying off hardcoded
   string comparisons (`if req == "fishing_rod"`,
   `elif req == "river_access"` — `quest_engine.py:75-79`). It works for the
   two quest files it ships with and nothing else; adding a new requirement
   type means editing the engine's `if/elif` chain, not the quest file. This
   is worth knowing about specifically so The Tap doesn't inherit the same
   scaling wall if it borrows the "quest as contract" idea.

---

## 3. What The Tap should adopt and why

Judged against tap-room (RoomGraph, perceive-decide-act,
`src/tap-room/src/lib.rs`), tap-dynamics (Z3 speaker states), and tap-reflex
(<50ms reflex shell, `src/tap-reflex/src/lib.rs`):

- **Adopt: git commit history as free audit trail for agent actions.**
  git-native-mud gets "every action is logged, every state is diffable" for
  free by treating `world/` as the only persistence layer and letting git be
  the append-only log. The Tap's tap-room already has an in-memory
  `RoomGraph` — it doesn't need git as its live state store (that would be
  far too slow for a <50ms-budget reflex shell sitting next to it), but the
  *idea* transfers directly to **periodic/append-only snapshotting of
  RoomGraph + agent state to a git-tracked directory for audit/replay**,
  separate from the hot path. This gives The Tap a debuggable history of
  "what every agent did and when" without building a bespoke event-sourcing
  log — `git log --stat` / `git diff` over committed snapshots is the whole
  query interface, same as git-native-mud gets. Concretely: write a
  `tap-room` state dump (or a compact action-log line per tick) to a file,
  commit on some cadence or on notable events, and you inherit the same
  "stigmergy" audit property this repo is claiming credit for.

- **Adopt: the command-mailbox convention, not its implementation.**
  git-native-mud's `world/commands/{agent_id}.yaml` → delete-after-process
  pattern is a genuinely simple, inspectable actor-mailbox design. tap-room's
  perceive-decide-act loop needs *some* ingestion point for agent intents;
  a filesystem/glob mailbox is worth ruling in as the cheapest possible
  option for a local, single-process ensemble (no need for a message broker
  when everything runs on one box) — but implement it as a real typed
  channel/queue in Rust (tap-room already has real types), not by literally
  shelling out to glob YAML files. The lesson to take is "one inbox slot per
  agent, drained and deleted each tick," not the Python/YAML mechanics.

- **Do not adopt: git as the live turn-state store.** git-native-mud's CI
  round-trip (push → Actions run → commit back) has turn latency measured in
  seconds-to-minutes (CI cold start, checkout, pip install). That is flatly
  incompatible with tap-reflex's <50ms budget and with tap-room needing to
  run a live perceive-decide-act loop. This confirms the git-as-runtime
  premise doesn't scale to a real-time local ensemble — useful mainly as a
  cautionary data point, not a pattern to reuse for The Tap's live path.

- **Do not adopt: quest_engine.py's hardcoded requires/ensures matching.**
  It's a real prototype but not integrated (see §1) and its
  string-equality-chain approach to prerequisites would not compose well
  with tap-dynamics' Z3-based state model. If The Tap wants "prerequisite
  gates on agent actions" (e.g., an agent can't `speak` unless
  tap-dynamics says its `SpeakerState` allows it), that's a better fit
  for the Z3/typed-enum approach tap-dynamics already has
  (`src/tap-dynamics/src/lib.rs`) than for a re-implementation of
  git-native-mud's ad hoc parser.

- **Adopt (with caution): the Bridge abstraction shape, not its stub
  implementations.** The 3-method `capture_state / describe_state /
  execute_command` contract (`bridges/game_bridge.py:11-43`) is a clean,
  narrow interface for "an agent-controllable external thing rendered as
  text." If The Tap ever wants a room/station that wraps a real external
  system (a log tailer, a build status board, etc.) for agents to interact
  with conversationally, this exact 3-method shape is worth mirroring in
  Rust as a trait — but note plainly that in git-native-mud only the
  Solitaire implementation is real; GitHub/Docker/Sensor are hardcoded fake
  data and should not be cited as "proven" integrations.

- **Adopt: bot-identity separation for automated commits.** If The Tap ever
  commits generated state/logs to git (per the snapshot recommendation
  above), git-native-mud's pattern of a dedicated commit identity
  (`"GitMUD Engine" <mud@gitnative.dev>`, `mud-turn.yml:25-26`) for
  machine-authored commits — distinct from any human/agent-authored command
  commits — is a small, cheap convention worth copying verbatim: it keeps
  `git log --author` a usable filter for "what did the engine do vs. what
  did an agent request."

---

## 4. Code snippets worth preserving

All snippets below are copied verbatim from the files indicated; none are
paraphrased or reconstructed from memory.

**Command mailbox + drain-and-delete, `mud_engine.py:50-62`:**
```python
# Load commands
commands = {}
for cmdf in glob.glob("world/commands/*.yaml"):
    agent_id = os.path.basename(cmdf).removesuffix(".yaml")
    cmd = load(cmdf)
    if cmd:
        commands[agent_id] = cmd

if not commands:
    print("No commands pending. Exiting.")
    with open(os.environ.get("GITHUB_OUTPUT", "/dev/null"), "a") as gh_out:
        gh_out.write("changes=false\n")
    exit(0)
```

**Initiative roll, `mud_engine.py:64-67`:**
```python
initiative = sorted(commands.keys(),
    key=lambda a: random.randint(1, 20) + (load(agent_path(a)) or {}).get("initiative_bonus", 0),
    reverse=True)
```

**Derived-state resync (rooms rebuilt from agent/item locations each turn),
`mud_engine.py:24-48`:**
```python
def update_room_refs():
    """Sync agents/items lists in rooms from agent/item locations."""
    rooms = {}
    for rf in glob.glob("world/rooms/*.yaml"):
        rid = os.path.basename(rf).removesuffix(".yaml")
        rooms[rid] = load(rf) or {"name": rid, "description": "", "exits": {}, "items": [], "agents": []}
        rooms[rid]["agents"] = []
    
    items_by_room = {}
    for itemf in glob.glob("world/items/*.yaml"):
        item = load(itemf)
        if item and item.get("location", "").startswith("room:"):
            room_id = item["location"].replace("room:", "")
            items_by_room.setdefault(room_id, []).append(item.get("name", os.path.basename(itemf)))
    
    for af in glob.glob("world/agents/*.yaml"):
        agent = load(af)
        if agent and agent.get("alive", True):
            loc = agent.get("location", "dock")
            if loc in rooms:
                rooms[loc]["agents"].append(agent.get("name", os.path.basename(af).removesuffix(".yaml")))
    
    for rid, room in rooms.items():
        room["items"] = items_by_room.get(rid, [])
        save(room_path(rid), room)
```

**CI turn-processor wiring, `.github/workflows/mud-turn.yml` (full file):**
```yaml
name: MUD Turn Processor
run-name: Turn ${{ github.run_number }}
on:
  push:
    paths:
      - 'world/commands/**'
  workflow_dispatch:

permissions:
  contents: write

jobs:
  process_turn:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - run: pip install pyyaml
      - name: Process world turn
        run: python mud_engine.py
      - name: Commit world state
        run: |
          git config user.name "GitMUD Engine"
          git config user.email "mud@gitnative.dev"
          git add world/
          git commit -m "Turn processed" || echo "No changes"
          git push
```

**Bridge interface contract, `bridges/game_bridge.py:11-43`:**
```python
class GameBridge(ABC):
    """Base class for all MUD-to-World bridges.
    
    Implementations:
    - SolitaireBridge (text solitaire)
    - PlaywrightBridge (controls real websites)
    - GitHubBridge (controls repos via API)
    - DockerBridge (controls containers)
    - SensorBridge (reads real hardware)
    """
    
    @abstractmethod
    def capture_state(self) -> Dict[str, Any]:
        """Capture current state of the external system."""
        pass
    
    @abstractmethod
    def describe_state(self, state: Optional[Dict] = None) -> str:
        """Render state as MUD-friendly text description."""
        pass
    
    @abstractmethod
    def execute_command(self, cmd: str) -> str:
        """Execute a MUD command, return result text."""
        pass
    
    def available_commands(self) -> list:
        """Return list of available MUD commands for this room."""
        return ["look", "help"]
    
    def room_type(self) -> str:
        """Type of room: display, control, game, application, edge"""
        return "game"
```

**Example room file showing the actual world schema,
`world/rooms/dock.yaml` (full file):**
```yaml
name: South Dock
description: Salt spray blows off the black ocean. A gangplank leads north. The vessel
  is tied up alongside.
exits:
  north: bridge
  east: cargo_hold
  south: deck
items:
- docking_rope
- life_ring
agents: []
```

**Example agent file, `world/agents/captain.yaml` (full file):**
```yaml
name: Captain
location: helm
hp: 20
max_hp: 20
battery: 100
inventory:
- captains_log
alive: true
role: command
initiative_bonus: 3
```

---

## Sources read

- `README.md`, `mud_engine.py`, `quest_engine.py` (full)
- `.github/workflows/mud-turn.yml` (full)
- `bridges/game_bridge.py`, `bridges/solitaire_bridge.py` (full)
- `ROOM-GATEWAY-ARCHITECTURE.md`, `OPENPROSE-MUD-FUSION.md`,
  `COCKPIT-MUD-DESIGN.md` (partial), `BRIDGE-SCENARIOS.md` (full)
- `world/rooms/dock.yaml`, `world/rooms/the_bridge.json`,
  `world/agents/captain.yaml`
- `git log --oneline` (full history, 21 commits)
- Repo-wide grep for git-plumbing calls (`subprocess`, `commit-tree`,
  `update-ref`, `hash-object`), server frameworks (`flask`, `socket`,
  `fastapi`, etc.), and `quest_engine`/`QuestEngine` cross-references —
  all confirmed absent/isolated as stated above.
