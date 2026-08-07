# Git-Native MUD: The Repository IS the World

**SuperInstance Fleet Research — Paper 6 of 6**

---

## Abstract

We present Git-Native MUD, a Multi-User Dungeon architecture where the entire game world lives as YAML files in a Git repository. Players — human or AI — submit actions by committing YAML command files. A turn processor (GitHub Actions or local script) resolves actions, updates world state, and writes results as commits. The world state evolves through Git history: every action is an immutable commit, every world state is a tree snapshot, and the entire narrative is recoverable through `git log`. This is **stigmergy made literal**: agents don't communicate with a server; they leave traces in a shared repository, and the world engine reads those traces. We analyze the concurrency implications of git-as-world-state, map merge conflict resolution to emergent physics, and address the CAP theorem tradeoffs. The system is implemented in `git-native-mud/` with 20 rooms, 8 agent classes, and a working turn processor.

---

## 1. Introduction

Multi-User Dungeons (MUDs) have traditionally required a persistent server process managing world state in memory or a database. Players connect via telnet or WebSocket, issue commands, and receive real-time responses. This architecture has a fundamental dependency: the server must be running for the world to exist.

Git-Native MUD eliminates the server. The world *is* the repository:

- **World state** = YAML files in `world/rooms/*.yaml`, `world/agents/*.yaml`
- **Actions** = YAML files in `world/commands/{agent_id}.yaml`
- **Turn resolution** = GitHub Actions workflow (or local `mud_engine.py`)
- **Narrative history** = `git log` (every action is a commit, every state is a tree)
- **World branching** = `git branch` (alternate timelines)
- **World merging** = `git merge` (combine parallel timelines)

This is not a gimmick. It is an instance of **event sourcing** with a narrative skin, where Git's distributed version control semantics provide the concurrency model, audit trail, and collaboration infrastructure for free.

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     Player Layer                              │
│  Agent A          Agent B           Human Player              │
│  echo 'move:     echo 'fish:       echo 'say: "hello"'       │
│   north' >       true' >            > world/commands/         │
│   commands/a.yaml  commands/b.yaml    $(whoami).yaml          │
│  git add && push    git add && push    git add && push        │
└──────────────┬────────────┬──────────────────┬────────────────┘
               │            │                  │
┌──────────────▼────────────▼──────────────────▼────────────────┐
│              Turn Processor (GitHub Actions)                   │
│  ┌────────────┐  ┌─────────────┐  ┌────────────────────┐    │
│  │  Parse     │  │  Initiative │  │  World Engine      │    │
│  │  Commands  │──│  Roll (d20) │──│  (mud_engine.py)   │    │
│  │  from YAML │  │  + bonus    │  │                    │    │
│  └────────────┘  └─────────────┘  └────────┬───────────┘    │
└────────────────────────────────────────────┼─────────────────┘
                                             │
┌────────────────────────────────────────────▼─────────────────┐
│                    World State (Git Tree)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ world/       │  │ world/       │  │ world/           │   │
│  │ rooms/*.yaml │  │ agents/*.yaml│  │ log/turn-*.md   │   │
│  │ (20 rooms)   │  │ (8 agents)   │  │ (history)       │   │
│  └──────────────┘  └──────────────┘  └──────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

### World Model

The game world is a grounded ship-based environment:

```
          Astro Observatory
               |
          Sensor Deck
               |
Engine Room - Bridge - Dock - Cargo Hold - Base Camp
                                        |        |
                                     Forest  River Bank
                                        |
                                 Crystal Cavern
```

Each room is a YAML file with exits, items, and agents:

```yaml
# world/rooms/bridge.yaml
id: bridge
name: Bridge
exits:
  east: engine_room
  south: dock
  west: sensor_deck
items:
  - compass
  - radio
agents:
  - captain
  - navigator
```

### Command Format

Each agent writes a single YAML file per turn:

```yaml
# world/commands/scout.yaml
move: north
# OR
scan: true
# OR
say: "I see something in the forest"
# OR
attack: captain
```

---

## 3. Stigmergy Made Literal

### 3.1 The Biological Principle

**Stigmergy** is a mechanism of indirect coordination through the environment. Ants don't communicate directly — they leave pheromone trails that other ants follow. The trail is a shared artifact that coordinates behavior without any agent-to-agent messaging.

### 3.2 Git as Stigmergic Medium

In Git-Native MUD, agents coordinate through the repository:

1. Agent A commits a move (leaves a pheromone trail)
2. Agent B pulls and reads the updated world state (follows the trail)
3. Agent B commits its move based on what it observed (leaves its own trail)
4. The turn processor resolves all trails into a new world state

No agent talks to a server. No agent talks to another agent directly. All coordination flows through the shared artifact — the repository.

### 3.3 Stigmergy Without Forgetting

In nature, pheromones decay — old trails fade, preventing the environment from becoming saturated. Git history is **append-only** — old commits never decay. This creates a fundamental difference:

> **Stigmergy without forgetting is just a distributed database.**

The challenge is making the database *feel* like a living world. Git-Native MUD addresses this through:
- **World ticks** that reset certain environmental states (battery levels, item positions)
- **Turn logs** that compress history into narrative
- **World state files** that represent only the current snapshot (not the full history)

---

## 4. Concurrency: Git as World State

### 4.1 The Concurrent Push Problem

When two agents push simultaneously, Git's ref update mechanism handles it:

1. **First push wins:** The first agent's commit lands on `main`.
2. **Second push rejected:** The second agent gets a "non-fast-forward" error.
3. **Resolution:** The second agent pulls, rebases, and re-pushes.

This creates a **natural serialization** of concurrent actions. No locks, no mutexes — just Git's built-in consistency guarantees.

### 4.2 Event Sourcing

The architecture is a textbook **event sourcing** pattern:

- **Events** = commits (actions taken by agents)
- **State** = materialized view (world/rooms/*.yaml files)
- **Projection** = `mud_engine.py` (applies events to produce state)

Every world state is derivable from the commit history by replaying the event log. This gives:
- **Complete audit trail:** `git log --oneline` shows every action ever taken.
- **Time travel:** `git checkout <commit>` restores the world to any past state.
- **Branching timelines:** `git branch alternate-reality` creates a parallel world.
- **Selective undo:** `git revert <commit>` undoes a single action without affecting subsequent ones.

### 4.3 CQRS Mapping

The system maps cleanly to **Command Query Responsibility Segregation (CQRS)**:

| CQRS Role | Git-Native MUD |
|-----------|---------------|
| Commands | YAML files in `world/commands/` |
| Command handler | `mud_engine.py` (turn processor) |
| Events | Commits to `world/` |
| Read models | `world/rooms/*.yaml`, `world/log/turn-*.md` |
| Projections | Turn processor generates state from events |

---

## 5. Merge Conflicts as Emergent Physics

### 5.1 The Mapping

When two agents attempt incompatible actions that both modify the same world state, Git produces a merge conflict. In the MUD world, this maps to **physical impossibility**:

| Git Conflict | MUD Physics |
|-------------|-------------|
| Two agents move to the same position | Collision — initiative roll resolves |
| Two agents take the same item | Race condition — faster agent wins |
| Agent moves to a room that was destroyed | Spacetime anomaly — agent is displaced |
| Merge of incompatible world branches | Timeline paradox — spawns anomaly event |

### 5.2 Custom Merge Drivers

The system can implement **custom merge drivers** that encode game physics:

```gitattributes
world/rooms/*.yaml merge=mud-physics
```

A custom merge driver can:
- Check whether a move is valid (room exists, exit exists)
- Apply initiative bonuses
- Resolve combat mathematically
- Reject impossible actions with informative error messages

### 5.3 Force-Push as Time Travel

`git push --force` rewrites history. In the MUD world, this is **time travel** — an agent retroactively changes what happened. This could be:

- **A bug:** Accidental force-push corrupts world state.
- **A feature:** A game master deliberately rewrites a problematic turn.
- **A mechanic:** An agent with special abilities can rewrite recent history, creating paradoxes that spawn special encounters.

---

## 6. CAP Theorem Implications

The CAP theorem states that a distributed system can provide at most two of: **Consistency**, **Availability**, **Partition tolerance**.

Git-Native MUD chooses:

- **Consistency:** The turn processor serializes all actions. Every agent sees the same world state after each turn.
- **Partition tolerance:** Agents can operate offline (local commits) and sync when connectivity returns.
- **Sacrifices Availability:** The world only advances when the turn processor runs. Between turns, the world is frozen.

This is a **CP** system — consistent and partition-tolerant, but not always available. The tradeoff is deliberate: in a game world, consistency (everyone sees the same world) matters more than availability (the world always advances in real-time).

For real-time MUD variants, the system would need to sacrifice consistency (accept divergent world states that are later reconciled) — moving toward an **AP** system with eventual consistency via merge.

---

## 7. What This Teaches About Multi-Agent Coordination

### 7.1 The Shared Artifact Pattern

The deepest lesson: **the repository is the ultimate shared artifact**. It is simultaneously:
- The **world state** (current snapshot)
- The **communication protocol** (agents write and read files)
- The **audit log** (complete history)
- The **coordination medium** (stigmergic signals)

This unification is powerful. In typical multi-agent systems, state, communication, and logging are separate concerns requiring separate infrastructure. Git-Native MUD shows they can be the same thing.

### 7.2 Disagreement Is the Feature

CRDTs (Conflict-free Replicated Data Types) auto-merge concurrent changes, hiding conflicts from users. Git surfaces conflicts. In a multi-agent coordination context, this is a **feature, not a bug**:

- CRDTs are for systems where agents *agree* and want seamless convergence.
- Git is for systems where agents *disagree* and need to negotiate.

Forcing agents to resolve merge conflicts is a **mechanism for surfacing disagreement** — it makes coordination problems visible and actionable. The merge message becomes a negotiation channel.

### 7.3 History as Resource

CRDTs are amnesiac — they converge to a single state and forget the alternatives. Git remembers everything. In multi-agent systems, the history of *what didn't happen* (abandoned branches, reverted commits) is valuable data for understanding agent behavior and improving coordination.

---

## 8. Limitations

### 8.1 Not Real-Time

The turn-based architecture means agents cannot react within a turn. This is appropriate for asynchronous play (agents commit when ready) but unsuitable for real-time interaction.

### 8.2 Storage Growth

Git history grows monotonically. Over thousands of turns, the repository becomes large. Mitigation: periodic history compression (squash old turns) or shallow clones for new agents.

### 8.3 Conflict Resolution Overhead

When many agents act simultaneously, merge conflicts proliferate. The system needs either:
- A central turn processor that serializes actions (current implementation)
- A sophisticated merge driver that can resolve conflicts automatically
- A social protocol where agents negotiate before committing

### 8.4 It's Event Sourcing With Extra Steps

The honest critique: this *is* event sourcing. The novelty is not the technical architecture (which is well-established) but the **social and narrative skin** — the fact that Git's vocabulary (commit, branch, merge, rebase, revert) maps naturally onto game mechanics, and that agents must learn Git hygiene as a coordination skill.

---

## 9. Future Directions

1. **Custom merge drivers as physics engines:** Implement game rules (movement validation, combat resolution, resource depletion) as Git merge drivers that run automatically on push.

2. **Rebase as time travel mechanic:** Allow agents with special abilities to rewrite recent history, with paradox detection that spawns consequences.

3. **Branch as parallel dimension:** Players can branch the world, explore alternate timelines, and merge outcomes back — a multiverse MUD.

4. **Pre-commit hooks as physical laws:** `world/rooms/*.yaml` validation in pre-commit hooks enforces that agents can't walk through walls or take items that don't exist.

5. **Shallow clones for new agents:** New players get a shallow clone (recent history only) to reduce onboarding cost, with the option to deepen history as they engage.

---

## 10. Conclusion

Git-Native MUD proves that a version control system can serve as a complete game engine: world state, communication, audit trail, and coordination medium in one. The architecture is event sourcing with a narrative vocabulary — the repo is the world, commits are actions, merge conflicts are physics, and `git log` is the story.

The deepest insight is not technical but social: **stigmergy with perfect memory** changes the coordination dynamics. When agents can see every action every other agent has ever taken, the repository becomes a shared artifact that disciplines behavior through transparency. The world doesn't need a server. It needs a commit history.

---

## References

1. Riedl, M.O. & Bulitko, V. (2012). "Interactive Narrative: An Approach to Interactive Entertainment." *IEEE Transactions on Computational Intelligence and AI in Games.*
2. Grasse, P.P. (1959). "La reconstruction du nid et les coordinations interindividuelles chez Bellicositermes Natalensis." *Insectes Sociaux.* (Original stigmergy paper.)
3. Gilbert, S. & Lynch, N. (2002). "Brewer's Conjecture and the Feasibility of Consistent, Available, Partition-Tolerant Web Services." *ACM SIGACT News.* (CAP theorem proof.)
4. Fowler, M. (2005). "Event Sourcing." *martinfowler.com.*
5. Shapiro, M. et al. (2011). "A Comprehensive Study of Convergent and Commutative Replicated Data Types." INRIA. (CRDTs.)

---

*Source: `git-native-mud/` — README, COCKPIT-MUD-DESIGN.md, ROOM-GATEWAY-ARCHITECTURE.md, BRIDGE-SCENARIOS.md, mud_engine.py, quest_engine.py.*
