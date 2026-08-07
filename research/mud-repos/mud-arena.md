# mud-arena — research notes

Source: `/home/eileen/projects/mud-arena` (read directly: all files in `src/`, `tests/`, `README.md`, `pyproject.toml`, `.github/workflows/*.yml`). All claims below are grounded in what was actually read; where the docs claim something the code doesn't do, that's called out explicitly.

## 0. Orientation — this repo is two disconnected codebases wearing one README

The most important structural fact, and the one the README obscures: **`src/mud_arena/` (the package) and the top-level `src/*.py` scripts (`server.py`, `evolve.py`, `scenario_generator.py`, `script_compiler.py`, `dashboard.py`, `human_interface.py`, `tolerance.py`) do not share code.**

- `src/mud_arena/{agent,rooms,commands,events,inventory}.py` is a real, tested, coherent perceive-decide-act package.
- `src/server.py` defines its **own** `World`, `AgentState`, `Room`-as-dict data model and never imports `mud_arena` (`grep -n "^import\|^from" src/server.py` shows only `asyncio, json, os, sys, time, collections, dataclasses, pathlib, typing, websockets, aiohttp` — no `mud_arena`).
- `src/evolve.py`'s `Script` (a flat `List[int]` of "rules") and `src/script_compiler.py`'s `Script`/`ScriptRule` (a DSL-driven struct) are two more **independent, mutually incompatible** definitions of "script." None of the three `Script` classes in this repo (`evolve.py`, `script_compiler.py`, `dashboard.py`) are the same type or call into each other.

So "mud-arena" is really: one solid toy MUD engine, plus five stub/scaffold scripts that look production-ready in the README but are self-contained, untested placeholders. Treat the two halves separately below.

## 1. What the code actually does

### 1a. The core package (`src/mud_arena/`) — real and tested

- **`rooms.py`**: `Room` dataclass (id, name, description, `exits: Dict[str,str]`, `items: List[str]`, `npcs: List[str]`, `metadata`) plus `RoomGraph`, a flat `Dict[str, Room]` with `add_room`, `connect(a, b, direction, reverse="")`, `remove_room`, `get`, `navigate(from_room, direction) -> Optional[room_id]`, `all_rooms`, `exits_for`. No graph algorithms (no BFS/pathfinding) — navigation is a single dict lookup per hop.
- **`commands.py`**: hand-written recursive-descent-free parser. `Verb` enum (GO, LOOK, EXAMINE, TAKE, DROP, USE, TALK, INVENTORY, HELP, QUIT, UNKNOWN) and a frozen `Command(verb, target, indirect, raw)` dataclass. `parse_command(text)` does word-based dispatch with alias tables (`go/move/walk/run/head`, `take/get/pick/grab` handling "pick up X", bare direction words like `"north"`/`"n"` implicitly becoming `GO`), and a preposition-splitter (`_WITH_PREPS = {"with","on","to","at","upon"}`) for three-part commands like `use key with door`.
- **`events.py`**: `EventType` enum (ROOM_ENTER/LEAVE, ITEM_PICKED_UP/DROPPED/USED, NPC_SPOKE, ROOM_EVENT, AGENT_ACTION, CUSTOM), `Event` dataclass, and `EventBus` — a synchronous pub/sub with `subscribe`/`unsubscribe`/`emit`/`history(type=None, room="")` and an internal append-only `_log`. This log is what integration tests assert against (e.g. checking `ROOM_LEAVE`/`ROOM_ENTER` pairs fired on move).
- **`inventory.py`**: `Item(name, description, usable, uses=-1, tags)` with a `use()` that decrements `uses` and returns `False` once exhausted; `Inventory` is a `Dict[str, Item]` with optional `capacity` (0 = unlimited), `add/remove/get/has/list_items/find_by_tag/use`.
- **`agent.py`**: `Agent` dataclass with `id, name, current_room, inventory, _decision_fn`. Three public methods form the loop:
  - `perceive(graph) -> Dict[str, Any]` — returns room_id/name/description/exits/items/npcs/inventory, or a hardcoded "The Void" dict if `current_room` doesn't resolve.
  - `decide(perception) -> Command` — just calls `self._decision_fn(perception)`; default is `_default_decide` which always returns `LOOK`. This is the **pluggable hook point** — swap in an LLM call, a script interpreter, anything that returns a `Command`.
  - `act(command, graph, bus) -> str` — big if/elif dispatch over `Verb`, one `_do_*` method per verb, each mutating `graph`/`self.inventory` directly and emitting `Event`s onto `bus`, returning a human-readable string.
  - `step(graph, bus, command_text="")` composes all three: if `command_text` given, parse it directly (bypasses `decide`); otherwise call `decide`. This is the literal perceive→decide→act tick, and it's exactly what `tests/test_integration.py` drives.
  - Code smell worth flagging: `_do_take` (agent.py:173) reaches for `Item` via `__import__("mud_arena.inventory", fromlist=["Item"]).Item(name=target)` instead of using the top-level `from mud_arena.inventory import Inventory` import — `Item` was never imported at module scope, so this dynamic-import-at-call-site is a workaround, not a considered design choice.

This half is genuinely solid: 303 tests pass (`python3 -m pytest -q` → `303 passed in 0.17s`), and `tests/test_integration.py` exercises full multi-room adventures (navigate, take, drop, examine, talk, pluggable decision functions, event-log assertions) against the real classes, not mocks.

### 1b. The "simulation" scripts (`src/*.py`) — scaffolding, not a working system

- **`server.py`** — a WebSocket (7779) / Telnet (7778) / HTTP (7780) read-only "watch" server. It maintains its own `World` (rooms as raw dicts, `AgentState` dataclass, scores, generation stats, scenario list) fed by a `SimulationRunner` that either shells out to an external GPU binary (`./gpu_simulator`, expected to emit newline-delimited JSON per tick — **this binary does not exist anywhere in the repo**) or falls back to `CPUFallbackSimulator`, a fake 3-room/3-agent cycle that just rotates agents through `room_a → room_b → room_c` once a second. **This file cannot run**: `if __name__ == "__main__": asyncio.run(main())` calls a `main()` that is never defined anywhere in the file, and `start_http_server` prints `f"WebSocket server listening on port {WS_PORT}"` where `WS_PORT` is never defined (only `WEBSOCKET_PORT` is). Running `python src/server.py` — exactly what the README's Quick Start tells you to do — raises `NameError` immediately.
- **`evolve.py`** — a generic genetic-algorithm engine (`EvolutionEngine`: `initialize`, `evaluate`, `select` via tournament, `breed` via single-point crossover, `mutate`, `evolve_one_generation`, `evolve`, `get_statistics`, `export_population`/`import_population` via pickle, CLI via argparse). It is explicitly a stub: its own docstring says "you only have to plug in the real MUD-Arena specific logic for `Script.evaluate`, `generate_random_rules`, `generate_scenarios`..." and the shipped `Script.evaluate` just counts how many of a script's `rules: List[int]` equal a scenario (also just an `int`). The `llm_review` and `llm_generate_harder_scenarios` hooks are literal no-ops / trivial placeholders (`llm_review` is `pass`; the "harder scenario" generator just raises the random low-bound). This is a working genetic algorithm over meaningless integers, not agent behavior evolution — the "evolution" claim in the README ("built-in genetic algorithm engine for breeding agent decision scripts") is aspirational relative to what's implemented; the mechanism (select/breed/mutate/replace) is real and correct, but it's never wired to `mud_arena.Agent`, `script_compiler.Script`, or anything resembling an actual MUD scenario.
- **`script_compiler.py`** — a separate, more concrete DSL compiler: text like `WHEN hp < 30% AND enemy_in_room THEN flee north` / `DEFAULT move random_exit` parses into `ScriptRule(condition_type, condition_param, action_type, action_param, priority)` via `ScriptCompiler.parse`. Conditions pack a primary numeric type (`ConditionType.HP_BELOW` etc.) plus up to 4 boolean flags bit-packed into the upper byte of `condition_param` (documented at script_compiler.py:217-222). Has round-trip binary (de)serialization (`to_binary`/`from_binary`, `struct.pack("<iiiii", ...)`) sized for GPU upload, plus DSL mutation and crossover (`breed` — single-point crossover that always keeps each parent's trailing `DEFAULT` rule intact). This is well-tested (`tests/test_script_compiler.py`, 612 lines) and is the only "evolution-adjacent" code with any real domain content — but it is never called by `evolve.py`, and `evolve.py`'s `Script` type is unrelated to `script_compiler.py`'s `Script` type (name collision, different modules, no shared import).
- **`scenario_generator.py`** — dataclass model (`Item`, `Enemy`, `Hazard`, `Room`, `AgentConfig`, `Scenario`) plus `ScenarioGenerator.generate_random` (spanning-tree-connected room graph + random items/enemies/hazards/victory condition), `generate_challenge` (difficulty scales off a rolling success-rate heuristic), `generate_tournament`, and an LLM-backed `generate_from_prompt` that calls the legacy `openai.ChatCompletion.create` API and expects the model to emit exact-schema JSON (no schema validation beyond `json.loads` + dataclass field filtering). Code smell: `_connect_rooms` (scenario_generator.py:112-141) mutates a **module-level global** `rooms_by_id` that only exists because the caller (`generate_random`, line 207) does `global rooms_by_id; rooms_by_id = {...}` immediately before calling it — the helper isn't a pure function of its arguments even though it looks like one.
- **`tolerance.py`** — unrelated to MUD mechanics; it's a generic prediction-vs-actual drift tracker (`Measurement`, `ToleranceTracker` with `record/get_tolerance/calibrate/detect_drift/confidence/report/suggest_adjustments/save/load`). Reads like it was built for calibrating the GPU/CPU simulators against ground truth, but nothing else in the repo calls it.
- **`human_interface.py`** — an async WebSocket client (`TerminalInterface`) with three `Mode`s (NORMAL, CALIBRATION, AGENT_VIEW) and an offline fallback that just echoes commands back (`f"[OFFLINE] Echo: {cmd}"`) when no `websockets` connection succeeds. `measure()` in CALIBRATION mode computes drift **against its own previous client-side call**, not against any real "actual" value from the server — it stores `simulated=actual_value` and diffs consecutive calls, so despite the naming it isn't tied to `tolerance.py`.
- **`dashboard.py`** — reads an evolution-history JSON file and emits a single self-contained HTML file with Chart.js (loaded from CDN) line/pie charts for fitness, scenario-survival, strategy distribution, complexity trend, and an LLM-scenario log. Straightforward and works standalone given a correctly-shaped JSON blob, but nothing in the repo produces that JSON blob (`evolve.py`'s `history` list has different keys than what `dashboard.py._fitness_chart` expects — `evolve.py` writes `{"generation","avg","best","worst"}`; `dashboard.py` reads `g.get("index")` for its x-axis, not `"generation"`).

### 1c. README vs. code — concrete discrepancies (grepped, not assumed)

- `README.md`'s Quick Start says `python src/scenario_generator.py --random --rooms 12 --difficulty 4` and `python src/script_compiler.py --dsl "attack;move north;take key"`. Neither file contains `argparse` or any CLI flag handling (`grep -n "argparse" src/scenario_generator.py src/script_compiler.py` returns nothing) — both only have a fixed, hardcoded `if __name__ == "__main__":` demo block. The documented CLI flags don't exist.
- `README.md` says `python src/server.py` starts the server; as shown above this crashes on `NameError` before printing anything.
- CI (`.github/workflows/ci.yml`) runs `pytest || true`, and `.github/workflows/ci-python.yml` runs `python -m pytest --import-mode=importlib -x -v || true` — both swallow test failures, so a red test suite would not fail the build. (Currently the suite is green regardless: 303/303 pass.)
- Zero test files reference `evolve.py`, `server.py`, `dashboard.py`, or `human_interface.py` (`grep -rln "evolve\|EvolutionEngine\|server\b" tests/` → no matches). Test coverage exists only for the core package plus `scenario_generator.py`, `script_compiler.py`, and `tolerance.py`.

### 1d. The `.cu`/`.zig`/`.c`/`.h` files — unbuildable pasted output, not working ports

Checked `src/mud_arena.cu` (574 lines), `src/jc1_experiment_mud_arena.cu` (141 lines), `src/mud_arena.zig` (498 lines), `src/wasm_mud.c` (370 lines), `src/human_avatar.h` (84 lines). All four non-`.cu`-experiment files **literally begin with a markdown code fence and end with one** — e.g. `src/mud_arena.cu` line 1 is `` ```c `` and the last line of the file is `` ``` ``; same pattern in `mud_arena.zig` (`` ```zig `` ... `` ``` ``) and `wasm_mud.c`/`human_avatar.h` (`` ```c `` ... `` ``` ``). These are raw, un-stripped LLM chat outputs that were saved directly as source files and never compiled — no CI job builds them (`ci.yml`/`ci-python.yml` only run Python/pytest), and a straight `nvcc`/`zig build`/`emcc` invocation would fail immediately on the leading fence. `mud_arena.cu`'s own header comment describes a design (one CUDA block per room, one thread per agent, shared memory for room state) that's architecturally coherent as prose, but there is no evidence it was ever exercised. Treat these as design sketches, not artifacts — do not port code from them without first verifying it even parses.

## 2. Key architectural patterns

### RoomGraph
`mud_arena.rooms.RoomGraph` is a flat `Dict[str, Room]` where `Room.exits: Dict[str, str]` (direction-label → room-id) is the only adjacency structure — no separate edge list, no graph library. `connect(a, b, direction, reverse="")` optionally writes both directions in one call. `navigate` is `O(1)`: one dict lookup on the room, one on its exits. There is no BFS/perception-radius concept here — an agent only ever perceives its *current* room (`perceive` returns exactly one room's contents), unlike The Tap's own `tap-room`, which already has a hop-radius BFS (`RoomGraph::perceive(origin, radius)` in `tap-room/src/lib.rs`). mud-arena's model is strictly simpler than what The Tap already has.

### Perceive-decide-act
The pattern lives entirely in `Agent` (agent.py): `perceive()` builds a plain dict, `decide()` calls an injected `DecisionFn = Callable[[Dict[str, Any]], Command]` (default: always LOOK), `act()` is a verb-dispatch table mutating the graph and emitting events. `step()` glues the three together and is what's actually tested end-to-end. The decision function is the sole extension point for "AI" — there is no built-in LLM call anywhere in the core loop; that's left entirely to whoever sets `_decision_fn`. This is a clean, minimal seam.

### Commands
A hand-rolled parser (commands.py) with alias tables and a shared "split on preposition" helper (`_parse_three_part`) reused for both `use X with Y` and (via a second helper) `talk to X`. `Command` is a frozen dataclass — immutable once parsed, which matters because `Verb` is a plain `Enum` (not `IntEnum`) so it can't accidentally be treated as a number.

### Events
`EventBus` (events.py) is synchronous, in-process, single-threaded pub/sub plus an unbounded append-only log (`_log: List[Event]`) that doubles as an audit trail — `history(event_type=None, room="")` filters it. This log is the thing integration tests assert against instead of re-deriving state, which is a good testing pattern: assert on the event stream, not just final state.

### "Evolution" — two unconnected mechanisms, neither wired to the game
1. `evolve.py`'s `EvolutionEngine` is a textbook, well-structured GA loop (init → evaluate → tournament-select → single-point-crossover → per-gene mutate → elitist replacement → repeat), fully general over anything with `.copy()`/`.rules`/`.evaluate()`. It's real and correct as a GA, but its `Script.evaluate` is a placeholder (`sum(1 for r in self.rules if r == scenario)`) — it evolves nothing about MUD behavior.
2. `script_compiler.py`'s DSL (`WHEN <conditions> THEN <action>`, plus a `DEFAULT` fallback rule) is the actual MUD-relevant genome — conditions over HP/turns/enemy-presence/items, actions over use-item/flee/pickup/attack/move — with its own `mutate`/`breed`/binary round-trip. This is the more useful pattern to study, but note it has no runtime interpreter in this repo: nothing evaluates a compiled `Script` against a live `Agent`/`RoomGraph`. It's DSL ⇄ binary ⇄ DSL, not DSL ⇄ behavior.

Bridging these two (having `evolve.EvolutionEngine` operate on `script_compiler.Script` and score it by actually running rules against `mud_arena.Agent` in a `RoomGraph`) is exactly what mud-arena has *not* done — that gap is the most important thing to note for The Tap, since it's tempting to assume "evolution" is further along than it is.

## 3. What The Tap should adopt and why

The Tap's `tap-room` crate (`src/tap-room/src/lib.rs`) already independently arrived at a cleaner version of mud-arena's core package: `RoomGraph`/`Room`/`Direction` enum with `opposite()`/`Actor` trait (`perceive`/`decide`/`act`)/`tick()` function, plus BFS perception with radius and `thiserror`-based `RoomError`. So the highest-value adoption isn't "copy the room graph" — it's the parts mud-arena has that tap-room doesn't yet:

1. **Adopt the `Command`/`Verb` parser shape, not its implementation.** mud-arena's `Command{verb, target, indirect, raw}` (frozen, with a preposition-splitting helper reused across "use X with Y" and "talk to X") is a good minimal shape for turning free text (or LLM output) into a structured action tap-room's `Action` enum can consume. Right now `tap-room::Action` is a closed enum (`Move`, `Take`, `Drop`, `Say`, `Wait`) with no text-command layer above it — mud-arena shows a clean, tested pattern (`tests/test_commands.py`) for that layer if The Tap ever wants agents/humans to type free-text commands instead of only emitting `Action` values programmatically. Bring the *pattern* (alias tables + preposition split + frozen struct), not the Python.

2. **Adopt the `EventBus` + append-only event log as the audit/testing substrate.** tap-room's `Actor::act` mutates the graph directly and returns a `Result<RoomId, RoomError>` with no event trail — there's no equivalent of mud-arena's `Event`/`EventType`/`EventBus.history()`. mud-arena's integration tests (`test_movement_emits_events`, `test_event_log_complete`) assert against the event log rather than re-deriving state, which is exactly the kind of testable seam tap-dynamics' speaker-state transitions and tap-reflex's `Decision::{Execute,Confirm,Escalate}` outcomes would benefit from — a shared bus that tap-room emits ROOM_ENTER/LEAVE/ITEM_* onto, and tap-dynamics/tap-reflex can subscribe to for driving `SpeakerState` transitions or reflex-shell learning, without those crates needing direct references to each other. This is a bigger architectural win than anything evolution-related in mud-arena, and it's cheap: `EventBus` is ~40 lines of Rust-portable logic (a `HashMap<EventType, Vec<Handler>>` plus a `Vec<Event>` log).

3. **Do not adopt mud-arena's "evolution engine" as-is — adopt the DSL/genome split it *implies* but never finishes.** The useful lesson is architectural: `script_compiler.py`'s bit-packed `ScriptRule{condition_type, condition_param, action_type, action_param, priority}` is a genuinely good compact genome shape for evolving agent behavior (small, `struct.pack`-able, mutation/crossover operate on fixed-width fields) — and Z3-based `tap-dynamics::SpeakerState` is already a small enum with an algebraic transition function (`driven_by(pressure)`), which is a similarly compact genome candidate if The Tap ever wants to evolve *how* speaker-state pressure gets computed rather than hand-coding it. The warning: mud-arena never actually connects its GA (`evolve.py`) to its DSL (`script_compiler.py`) or to a live agent loop — replicating that gap would just import the same dead-end. If The Tap builds evolution, evaluate genomes by literally running them through `tap-room::tick()` against real `RoomGraph` state (mud-arena's `test_integration.py` pattern) from day one, rather than building a generic GA against a placeholder fitness function and hoping to wire it up later.

4. **Skip mud-arena's server/watch layer entirely; don't clone its WebSocket/Telnet/HTTP triple.** It's disconnected from the actual simulation state (own parallel `World`/`AgentState` model), depends on an external GPU binary that doesn't exist in the repo, and is currently non-functional (`NameError` on the documented entry point). If The Tap wants human observability into the bar, design the watch/observer surface to read the *same* `RoomGraph`/`EventBus` state tap-room and tap-dynamics already use, not a shadow copy — this is the single biggest process failure visible in mud-arena and worth actively avoiding.

5. **Reuse the testing discipline, not the untested scaffolding.** mud-arena's 303 passing tests all live against the core package + `scenario_generator.py`/`script_compiler.py`/`tolerance.py` — i.e., exactly the modules that are self-consistent and don't reach outside themselves. Every module that touches an external process (GPU binary), external service (OpenAI-compatible LLM endpoint), or another module's types (`evolve.py` vs `script_compiler.py`) is the untested part. That's a strong, empirical argument for The Tap to keep tap-reflex/tap-dynamics/tap-room narrowly scoped and cross-tested via `#[cfg(test)]` at every seam (as they already do) rather than letting "the bar" (server/orchestration layer) accumulate untested glue code the way mud-arena's `src/*.py` scripts did.

6. **`tolerance.py`'s calibration-tracking shape is a plausible fit for tap-dynamics/tap-reflex evaluation, if kept honest.** `ToleranceTracker.record(variable, predicted, actual)` → `get_tolerance`/`detect_drift`/`confidence`/`suggest_adjustments` is a clean, dependency-free (stdlib only) way to track whether a model's predicted values (e.g., predicted `SpeakerState` transitions, or reflex-shell confidence scores) match observed outcomes over time, with drift detection (`curve[-1] > curve[0]`) and a suggested correction factor (`1 + avg_error/100`). Worth porting as a small Rust module if The Tap ever needs to validate tap-dynamics' Z3 predictions against real conversation outcomes — but note in mud-arena itself nothing calls this tracker, so there's no proof of it working end-to-end, only that the API shape is sound.

## 4. Code snippets worth preserving

**Room graph navigation — `src/mud_arena/rooms.py:77-86`** (the whole "resolve movement" contract in 8 lines, worth matching for API shape even though tap-room's Rust version is already closer to production quality):
```python
def navigate(self, from_room: str, direction: str) -> Optional[str]:
    """Resolve a movement direction from a given room.

    Returns:
        The destination room id, or ``None`` if no exit exists.
    """
    room = self._rooms.get(from_room)
    if room is None:
        return None
    return room.exits.get(direction)
```

**Perceive-decide-act composition — `src/mud_arena/agent.py:244-255`** (the actual tick, kept intentionally thin — perception is a dict, not an object, which is what makes it easy to feed to an LLM or a rule DSL):
```python
def step(self, graph: RoomGraph, bus: EventBus, command_text: str = "") -> str:
    """Run a full perceive-decide-act cycle.

    If *command_text* is provided it is parsed directly; otherwise the
    agent's decision function is called.
    """
    perception = self.perceive(graph)
    if command_text:
        command = parse_command(command_text)
    else:
        command = self.decide(perception)
    return self.act(command, graph, bus)
```

**Event bus with queryable log — `src/mud_arena/events.py:45-82`** (the pattern worth porting to Rust as a shared bus between tap-room/tap-dynamics/tap-reflex):
```python
class EventBus:
    def __init__(self) -> None:
        self._handlers: Dict[EventType, List[EventHandler]] = {}
        self._log: List[Event] = []

    def subscribe(self, event_type: EventType, handler: EventHandler) -> None:
        self._handlers.setdefault(event_type, []).append(handler)

    def emit(self, event: Event) -> None:
        self._log.append(event)
        for handler in self._handlers.get(event.type, []):
            handler(event)

    def history(self, event_type: EventType | None = None, room: str = "") -> List[Event]:
        results = self._log
        if event_type is not None:
            results = [e for e in results if e.type == event_type]
        if room:
            results = [e for e in results if e.room == room]
        return list(results)
```

**Preposition-splitting for three-part commands — `src/mud_arena/commands.py:126-144`** (the reusable idea: one small function handles `use X with Y`, `attack X with Y`, etc. by scanning for a preposition token rather than hand-writing N parsers):
```python
_WITH_PREPS = frozenset({"with", "on", "to", "at", "upon"})

def _parse_three_part(rest: list[str], verb: Verb, raw: str) -> Command:
    """Parse ``X with Y`` style commands."""
    target_parts: list[str] = []
    indirect_parts: list[str] = []
    found_prep = False
    for word in rest:
        if not found_prep and word in _WITH_PREPS:
            found_prep = True
            continue
        if found_prep:
            indirect_parts.append(word)
        else:
            target_parts.append(word)
    return Command(
        verb=verb,
        target=" ".join(target_parts),
        indirect=" ".join(indirect_parts),
        raw=raw,
    )
```

**Bit-packed rule genome — `src/script_compiler.py:97-108`** (the compact, GA-friendly struct shape — worth adapting for The Tap if it evolves speaker/reflex behavior; note again this struct is never actually evaluated against a live agent anywhere in mud-arena):
```python
@dataclass
class ScriptRule:
    """One rule that will be uploaded to the GPU."""
    condition_type: int          # see ConditionType
    condition_param: int         # numeric threshold (percentage, turn count …)
    action_type: int             # see ActionType
    action_param: int            # integer ID (item, exit, target, direction)
    priority: int                # lower = higher priority
```

**GA generation step — `src/evolve.py:231-265`** (evaluate → statistics → tournament-select → breed+mutate → elitist replace; structurally sound even though the fitness function it's shown with is a placeholder):
```python
def evolve_one_generation(self, scenarios: List[Any], gpu: bool = True) -> None:
    fitness = self.evaluate(scenarios, gpu=gpu)

    avg_fit = float(np.mean(fitness))
    best_fit = float(np.max(fitness))
    worst_fit = float(np.min(fitness))
    self.history.append(
        {"generation": self.generation, "avg": avg_fit, "best": best_fit, "worst": worst_fit}
    )

    elite = self.select(fitness)

    children: List[Script] = []
    while len(children) < self.population_size - self.elite_size:
        parent_a, parent_b = random.sample(elite, 2)
        child = self.breed(parent_a, parent_b)
        child = self.mutate(child)
        children.append(child)

    sorted_by_fit = sorted(zip(self.population, fitness), key=lambda x: x[1], reverse=True)
    survivors = [s for s, _ in sorted_by_fit[: self.elite_size]]
    self.population = survivors + children

    self.generation += 1
```

## Summary of integrity-relevant caveats

- `server.py` cannot be run (`main()`/`WS_PORT` undefined) — the README's documented Quick Start command fails immediately.
- `scenario_generator.py` and `script_compiler.py` have no CLI flags despite README examples showing `--random`/`--dsl` arguments.
- `evolve.py` and `script_compiler.py` each define an unrelated `Script` class; the GA engine has never been wired to the DSL or to a live `mud_arena.Agent`.
- The `.cu`/`.zig`/`.c`/`.h` files are unstripped markdown-fenced LLM output, never compiled, not covered by CI.
- Real, working, tested code exists only in `src/mud_arena/` (5 modules, 303 passing tests) plus `scenario_generator.py`/`script_compiler.py`/`tolerance.py` in isolation.
