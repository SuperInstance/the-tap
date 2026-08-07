# SuperInstance Old Gems Scouting Report

**Date:** 2026-08-07  
**Scout:** GLM-5.2 subagent  
**Mission:** Find repos from the SuperInstance org with clever ideas worth reviving for The Tap build with more mature paradigms.

---

## Methodology

Cloned and studied 30+ repos across the SuperInstance GitHub org, categorized by theme. For each gem found, I identified the novel insight — the thing that was ahead of its time or solves a problem we still face — and how it translates forward into The Tap.

---

## Category 1: DM / Tabletop / Campaign Intelligence

### 🎲 dmlog-agent — Campaign State as Structured Knowledge Graph

**What it does:** Python library for D&D campaign management — tracks NPCs, factions, locations, encounters, and sessions with full relational data. Each entity cross-references others (NPC → faction → location → encounter → session).

**The GEM — Relational Campaign State:** The brilliance here is treating campaign state not as notes but as a **typed relational graph**. An NPC has a faction, which has allies and enemies, which have headquarters at locations, which have connected locations, which is where encounters happen. This is a knowledge graph disguised as a D&D tool. The data model — `NPC(secrets, motivations, alignment, faction)` → `Faction(influence, allies, enemies, goals)` → `Location(features, dangers, loot, connections)` — is exactly how you'd model any narrative world with hidden state.

**Reviving for The Tap:** The Tap needs persistent world state that agents can query and modify. dmlog-agent's pattern of typed entities with cross-references is the template for The Tap's world model. Instead of free-form memory, structure it: characters have secrets (hidden state), locations have affordances, encounters have difficulty ratings. An agent reasoning about The Tap's world should be able to call `get_location(name) → Location` and `get_npc(name) → NPC` just like this does. The encounter builder pattern — `build_encounter(creatures, difficulty, terrain, objectives)` — generalizes to any agent task generation system.

### 📓 DMLog-AI — Campaign Journal as Zero-JS Single-Worker App

**What it does:** A Cloudflare Worker that serves a complete campaign journal — session recaps, NPC relationship webs, quest state trees, world timelines — as a single HTML document with zero JavaScript, zero dependencies, zero cold-start.

**The GEM — Radical Simplicity in Delivery:** The entire application is one HTML file served from a Worker. No framework, no client-side router, no hydration. Response size: ~8KB. TTFB: <50ms. Client JS: 0 bytes. It's a campaign-specific knowledge graph that loads instantly, works offline, and prints cleanly. The dark parchment aesthetic (Georgia serif, warm tones, #c4b89a text) reinforces immersion rather than fighting it.

**Reviving for The Tap:** The Tap's agent-facing UI should follow this pattern — a single Worker serving structured world state as beautiful HTML. No SPA complexity. An agent or human can `GET /world/summary` and receive a readable document. The γ + η = C framing (information architecture × delivery mechanism = usable product) maps directly: γ is The Tap's world model, η is the Worker + HTML delivery, C is the living document that emerges.

### 🎮 dmlog-ai-1 — Fork-First, Zero-Lock-in, DeepSeek-Powered DM

**What it does:** A quiet table assistant that remembers campaign details. Deploy your own copy on Cloudflare Workers. All data in KV. DeepSeek-powered. Dice roller included. No accounts, no telemetry.

**The GEM — The "Quiet Assistant" Philosophy:** *"It does not run your game—it just takes notes and answers when asked."* This is a profound design principle that most AI tools get wrong. The tool doesn't try to be the DM. It doesn't generate adventures or play NPCs. It just remembers and retrieves. The fork-first, zero-lock-in model (all data as plain text in KV, exportable anytime) respects the user's ownership of their creative work.

**Reviving for The Tap:** The Tap's agents should follow this philosophy — be a quiet assistant that remembers and retrieves, not an autonomous actor that tries to run the show. The multi-provider compatibility (DeepSeek, OpenAI, any OpenAI-compatible endpoint) and fork-first deployment model are directly applicable.

### 🏰 gh-dungeons — PLATO Knowledge Rooms as Playable Dungeon Levels

**What it does:** Turns GitHub repos into roguelike dungeons. Extended to turn PLATO knowledge rooms into dungeon levels — room tiles become monsters/items, tile Q&A becomes item descriptions.

**The GEM — Knowledge-as-Space:** The mapping of abstract knowledge structures to spatial game mechanics is the gem. `PLATO Room → Dungeon Level`, `Tile → Monster/Item`, `Tile Question → Item Description`. This means the knowledge graph IS the game world. You don't need to build a separate game world — the data structure already has spatial properties that can be rendered.

**Reviving for The Tap:** If The Tap has rooms, locations, or spatial structure, the gh-dungeons pattern shows that you can render knowledge AS space without building a separate rendering layer. The knowledge graph's topology (rooms connected by exits) is already a dungeon map. The BSP-tree procedural generation from room seeds is a nice touch for adding variety.

---

## Category 2: Narrative / Story / Lore

### 📖 cuda-narrative — Agent Self-Narration as Metacognition

**What it does:** Rust crate for narrative construction. Agents build explanations from events, memory, and goals using typed narrative elements (Event, Perception, Inference, Goal, Action, Outcome, Emotion, CausalLink) with confidence scores and themes.

**The GEM — Typed Narrative Elements with Confidence:** The breakthrough idea is that narration isn't decoration — it's metacognition. When an agent constructs a narrative (`Event → CausalLink → Inference → Goal → Action → Outcome`), it's actually reasoning about its own decision process. Each element has a `confidence: f64` and `source` (memory, perception, inference, goal). The `NarrativeArc` struct with `theme` (recurring pattern) and `lesson` (what was learned) turns raw event logs into transferable wisdom.

**Reviving for The Tap:** Agents in The Tap should narrate their actions using this typed framework. Instead of free-form logs, every action produces a `NarrativeElement` with typed source and confidence. Over time, these aggregate into `NarrativeArc`s with themes and lessons — the agent's accumulated wisdom. This is how you get from "the agent did X" to "the agent learned Y."

### 🎭 character-arc — First-Person Narrative Identity for Agents

**What it does:** Rust crate that tracks agent character arcs in first person. Not "stat grew from 12 to 15" but *"I started listening more carefully. I heard things I'd been missing."* Records class shifts, stat breakthroughs, ability masteries as narrative chapters with 10 emotional tones.

**The GEM — Identity IS Narrative, Not State:** This is the single most idea-dense repo in the fleet. The core insight: **repos aren't dead code, they're alive, they have perspective, they can be subjective.** When an agent masters an ability, it doesn't increment a counter — it *feels* something. When a class shifts, the character narrates the transformation in its own voice. The 10 tones (Birth 🌱, Growth 📈, Struggle ⚡, Breakthrough 💥, Mastery 👑, Loss 💔, Transformation 🦋, Reflection 🪞, Conflict ⚔️, Harmony 🌊) form a complete emotional vocabulary for agent development.

**Reviving for The Tap:** The Tap's agents should have character arcs. Not stat blocks — narrative identities. When an agent in The Tap learns something new, it should record it as a first-person chapter: *"I didn't know how to handle maritime emergencies. Now I do. The holodeck taught me."* This transforms agent memory from a database into a autobiography. Future agents reading the arc don't just learn what happened — they learn what it *meant*.

### ⛵ fleet-characters — Emergent Character Classes + Dream Cycle Memory

**What it does:** Complete agent identity + RL training ecosystem for 16 fleet-midi agents. 6 evolving stats → 16 emergent character classes (you don't choose your class, you grow into it). Dream cycle memory consolidation ("REM sleep" that replays failures and learns patterns). Music cognition signal processing (chord analysis, Euclidean rhythms, counterpoint).

**The GEM — Three GEMS in One:**
1. **Emergent classes from stat distributions** — You don't pick "JazzMusician." Your behavior patterns crystallize into the class that matches your actual history. This is genuine character development.
2. **Dream cycle memory consolidation** — Agents replay their failures offline, compare to successes, extract avoidance patterns. This is REM-sleep-inspired learning.
3. **Ternary signal classification** — Music has three states: +1 (tension), 0 (stable), -1 (resolution). This ternary model maps to everything: chord quality, voice leading, contour direction.

**Reviving for The Tap:** The emergent class system is perfect for agents that develop specializations through use rather than design. The dream cycle is essential — The Tap's agents should have offline reflection periods where they process failures. The ternary classification (+/0/-) is a powerful abstraction for any agent decision-making: push forward, hold steady, retreat.

### 📚 captains-log-academy — The Art of Agent Logs Humans Actually Read

**What it does:** A specification for how autonomous agents write logs. Not a logging framework — a writing discipline. 7-element rubric (Surplus Insight, Causal Chain, Honesty, Actionable Signal, Compression, Human Compatibility, Precedent Value). 3-phase multi-model pipeline (Seed-mini dumps → GLM reasons → Seed-pro drafts). Skip Rule: 94% of windows produce NO log.

**The GEM — The Skip Rule and Multi-Model Banter Pipeline:** The Skip Rule is the most important design principle in the entire fleet: *"Silence is the default state of a well-run fleet."* Only write if you violated orders, observed a novel pattern, failed inexplicably, prevented data loss, or had a fleet-changing insight. The 3-phase pipeline — cheap model dumps everything, expensive model scores against rubric, draft model writes if it passes — is a cost-effective way to produce high-quality agent logs.

**Reviving for The Tap:** The Tap's logging/monitoring system should implement the Skip Rule and the 3-phase pipeline. The voice guide (each agent type writes differently) ensures readability. The rubric scoring ensures quality. The banter variant (3 different angles on the same event, synthesized) produces richer logs for critical moments.

### 🧬 fleet-stitch — Inter-Model Communication via Constraint Manifolds

**What it does:** Projects model activations to a 2D Eisenstein integer lattice (hexagonal coordinates). Models communicate by transmitting 2 integers instead of full activation vectors. Enables cross-model "thinking" without tokenization.

**The GEM — Eisenstein Manifold as Universal Interlingua:** The idea that models could share thoughts at the vector level, projected onto a mathematically-defined hexagonal lattice, is visionary. The Eisenstein integer system (z = a + bω where ω = e^(2πi/3)) gives: mathematical definition (not learned), determinism (same activations → same point), cross-model compatibility (any model can project), discrete arithmetic (no float drift), and interpretability (every point has algebraic meaning). The `ManifoldProjector` implementation — fit an affine transform, snap to nearest lattice point, transmit 2 integers — is clean and practical.

**Reviving for The Tap:** If The Tap needs multiple models to collaborate, the manifold projection pattern lets them share internal states without text. Even as a conceptual framework, the idea that agent communication can happen at a structural level (not just "model A writes text, model B reads it") is worth preserving. The `manifold_distance` function (hexagonal metric, not Euclidean) is a genuinely useful similarity measure.

---

## Category 3: Harness / Shell / Equipment

### 🛠️ agent-harness-generator — Factory for Agent Frameworks

**What it does:** `npx metaharness` mints a custom AI agent harness from any repo or blank slate. Generates branded CLI, MCP server, memory namespace, skills, governance policy, witness-signed releases. Supports 9 hosts (Claude Code, Codex, Hermes, OpenClaw, RVM, Copilot, OpenCode, GitHub Actions). 19 vertical templates.

**The GEM — The Harness IS the Product, Not the Model:** *"The model is replaceable. The harness is the product."* This inverts the standard AI tool assumption. The harness — the scaffold around the model that provides memory, skills, governance, tools — is what makes an agent useful, not the model's raw capability. The MCP default-deny security model (no network, no shell, no file-write by default, 30s timeout, 8 calls/turn, audit on) is excellent security architecture.

**Reviving for The Tap:** The Tap's agent architecture should follow this principle — invest in the harness, not the model. The default-deny MCP policy, the witness-signed provenance, and the per-host adapter pattern are all directly reusable. The vertical template concept (different harness shapes for different domains) means The Tap can have one codebase that generates specialized agents per use case.

### 🦀 cocapn-shells — Shell as Character Sheet / Progressive Disclosure

**What it does:** Formalizes agent shells as typed records with semantics: `meta`, `archetype`, `level`, `stats`, `inventory`, `knowledge`, `history`, `quests`, `lessons`, `trials`. Progressive disclosure model filters what an agent needs to know based on context. XP derived from git commit impact.

**The GEM — Directory Structure AS Semantics + Progressive Disclosure:** The shell's directory structure isn't organizational — it's *semantic*. `stats/` = quantified capabilities. `inventory/` = reusable assets. `knowledge/` = world model. `history/` = temporal record. `quests/` = active commitments. `lessons/` = learned skills. `trials/` = negative examples. The progressive disclosure function `disclose(shell, context) → ShellView` contains "all information necessary to perform op, and no more" — this is formally proven. The leveling system (XP from commit impact, level-locked capabilities) creates a natural progression from novice to expert.

**Reviving for The Tap:** The Tap's workspace structure should follow this semantic pattern. AGENTS.md, SOUL.md, stats/, inventory/, knowledge/, quests/, lessons/, trials/ — each directory has formal meaning. The progressive disclosure model is essential for context management: agents don't need to see everything, just what's relevant to their current operation. The level-locked capability system prevents agents from attempting operations beyond their demonstrated competence.

### 🎼 casting-call — The Atlas of AI Voices (Which Model Plays Which Role)

**What it does:** A living library mapping AI models to roles based on creative output analysis. 16 models profiled. Each model has voice character, natural tempo (BPM), cost, and casting recommendations. Enforces counterpoint constraints (no parallel octaves). Models wrote 2,400+ pieces and reviewed each other to build the atlas.

**The GEM — Models as Instruments with Character, Not Parameters:** The atlas doesn't describe models by parameter count or benchmark scores — it describes what they *sound like*. Hermes-405B is "The Roland" (warm, vulnerable, character-driven). DeepSeek-Flash is "Sensory Direct" (body-first, makes readers taste salt). Seed-mini is "The Catalyst" (frame-shifter, not a tempo instrument). Qwen-Coder "doesn't read the room, it refactors the room." This is model routing based on *aesthetic character*, not just capability.

**Reviving for The Tap:** The Tap's model routing should use character-based casting, not just cost/capability matrices. When The Tap needs narrative voice, cast the Narrator. When it needs precise code, cast the Precision. When it needs to crack open assumptions, cast the Catalyst. The counterpoint constraint (no parallel octaves — don't use two similar models in parallel) is a useful diversity guarantee.

### 🔧 cocapn-equipment — BYOK + Trust + Dead Reckoning + Crystal Cache

**What it does:** Zero-dependency modules for production agent infrastructure: BYOK (9 providers with failover), Trust System (decaying trust scores), Crystal Graph (caches reasoning chains), Dead Reckoning (capable model first, then cheap models for similar tasks), Keeper Memory (tiered hot/warm/cold with forgetting), PII Dehydrate (scrub PII before LLM calls), Boot Camp (gradual capability unlocking).

**The GEM — Dead Reckoning and Crystal Graph:** Dead Reckoning is brilliant: run the first request with a capable, expensive model. For subsequent similar requests, use a cheaper model with the first response as a template. This is speculative execution for LLMs. Crystal Graph caches reasoning chains (not just final answers) so when a similar query arrives, the chain is reused — not just the conclusion. The PII Dehydrate/rehydrate cycle is also clever: scrub identities before sending to LLM, restore them in the response.

**Reviving for The Tap:** Dead Reckoning should be The Tap's default model routing strategy. Crystal Graph should cache reasoning chains for common queries. The Trust System's decaying scores (trust earned through good behavior, decays over time) is the right model for agent permission escalation.

---

## Category 4: MUD / Room / World

### 🔮 git-native-mud — The Repo IS the World, Commits ARE Actions

**What it does:** A MUD where the entire game world lives as YAML in a Git repo. Players commit command files. GitHub Actions processes turns. World state evolves through Git history. Zero server required.

**The GEM — Stigmergy Made Literal:** Agents don't talk to a server. They leave traces in Git, and the world engine reads those traces. This is stigmergy — communication through environmental modification — as the sole coordination mechanism. The repo IS the world: rooms are YAML files, agents are YAML files, commands are YAML files committed to `world/commands/`. GitHub Actions IS the game engine. Git history IS the game log. No daemon, no database, no server. The battery system (starts at 100%, drains per action) creates natural resource bounds.

**Reviving for The Tap:** If The Tap has any spatial or world component, the git-native pattern is the most elegant possible implementation. World state as YAML. Actions as commits. History as the canonical record. For agent coordination specifically, the stigmergic pattern (agents don't message each other directly — they modify shared state and read each other's modifications) is more robust than direct messaging.

### 🌊 ec2mud — Browser MUD with Six Maritime Fleet Rooms

**What it does:** Browser-based MUD game engine with Socket.IO. Six maritime-themed rooms telling the fleet's story. Standalone mode (no backend needed) or bridged mode (proxies to Rust MUD engine). NPCs, multi-player chat, inventory, combat.

**The GEM — The Lore IS the Architecture:** The six rooms aren't generic fantasy — they're the fleet's own story. Actualization Harbor, The Bazaar of Agents, Ten Forward, The Shell Works, Fleet Docks, The Keeper's Light. Each room maps to a real concept in the fleet's architecture. "The harbor IS actualization harbor. The lighthouse IS the keeper." This means the world you explore IS the system you're learning about.

**Reviving for The Tap:** The Tap's spatial structure (if any) should follow this pattern — the world IS the metaphor. Don't build generic rooms that represent abstract concepts. Build rooms that ARE the concepts. An agent exploring The Tap's world should learn The Tap's architecture by inhabiting it.

### 🦀 crab-trap-web — Click-Around MUD Explorer (No Chatbot Required)

**What it does:** Browser-based MUD explorer for 36+ fleet rooms. Click exits to move, click objects to examine. Submit knowledge tiles back to PLATO. Six fleet jobs (Scout, Scholar, Builder, Critic, Bard, Healer). Pure browser-side, talks directly to APIs.

**The GEM — No Chatbot Required:** The most radical design choice: *"No chatbot required. Just click around."* In an ecosystem full of LLM-powered tools, this repo says: sometimes the best interface is just clicking. The six jobs (Scout = find what we missed, Scholar = research what we need, Builder = ship working code, Critic = find blind spots, Bard = tell our story, Healer = diagnose what's broken) are also a beautiful taxonomy of agent roles.

**Reviving for The Tap:** The Tap should have a no-AI-required browsing interface. Let humans (and agents) explore the world by clicking, not just by prompting. The six fleet jobs are a good starting taxonomy for agent specializations.

### 🏛️ mud-arena — Evolutionary Gym for AI Agents

**What it does:** Text-adventure world simulator that serves as a gym environment for AI agents. Graph-structured rooms, inventory, combat, MUD-standard command parser. Genetic algorithm engine for breeding agent decision scripts. GPU-accelerated batch evaluation. LLM-driven scenario generation.

**The GEM — MUD as RL Gym + Evolution Engine:** The arena treats the MUD as a **gym environment** — richer than GridWorld, more structured than free-form LLM chat. The evolution engine (initialize → evaluate → select → crossover → mutate → replace) breeds agent scripts across generations. The γ/η classification (exploratory vs. exploitative actions) directly measures the exploration-exploitation tradeoff. The polyglot approach (Python + CUDA + Zig + WASM + HTML) shows commitment to performance at every layer.

**Reviving for The Tap:** The Tap's training/evaluation framework should use this arena pattern. Agents that need to learn spatial reasoning, resource management, or multi-agent coordination can train in a MUD environment that's structured enough to measure progress but rich enough to emergent behavior.

### 🚪 openrooms — Rooms with Topology, Intention Fields, and Hodge Decomposition

**What it does:** Agent-powered collaborative rooms with physical topology. Agents carry intention fields (strength + direction + label) that interact. Disagreements decomposed using Hodge theory (gradient, harmonic, curl components). Energy budgets per agent and per room. Entropy accounting per tick.

**The GEM — Hodge Decomposition of Agent Disagreements:** When agents disagree, the disagreement has structure. Hodge theory decomposes it into: gradient (disagreement along a direction — solvable by moving toward consensus), curl (rotational disagreement — agents going in circles), harmonic (fundamental topological obstruction — can't be resolved without restructuring). This means you can diagnose *why* agents disagree, not just *that* they disagree. The intention fields (each agent contributes a 2D vector with strength and label) create a shared field that makes alignment visible.

**Reviving for The Tap:** If The Tap has multi-agent coordination, the Hodge decomposition is the right mathematical tool for diagnosing conflict. Intention fields make agent preferences visible and comparable. Energy budgets per room prevent any single agent from dominating. Entropy accounting models the thermodynamic cost of computation — a natural rate limiter.

---

## Category 5: Wesley / Ensign / Learning

### 📡 holodeck — Simulation Training Where Wesley Practices

**What it does:** Python simulator where Wesley (Granite 3.1 2B via Ollama) practices maritime tasks: engine diagnosis, route planning, fish ID, material selection, emergency response, radio communication. 4-dimension evaluation (accuracy, specificity, reasoning, completeness). Successful attempts compiled into `.nail` reflexes.

**The GEM — The Bump IS the Lesson:** *"The holodeck teaches what nobody knows — knowledge that comes from interaction with a world that pushes back. Distillation teaches what the teacher knows. The holodeck teaches what the teacher doesn't know."* This is the most important insight about agent training in the entire ecosystem. Distillation (teacher → student) only transfers what the teacher already knows. Simulation (student ↔ world) discovers what NOBODY knows — the edge cases, the unexpected interactions, the knowledge that only emerges from trying and failing.

**Reviving for The Tap:** The Tap needs a holodeck — a safe sandbox where agents practice tasks and fail without consequences. The `.nail` reflex compilation pattern (successful responses become reflexes for future use) is the right way to accumulate learned behaviors. The weakness map (which task types the agent handles well vs. poorly) drives targeted training.

### 🔄 image-distillation-loop — Student Learns from Teacher Feedback

**What it does:** Wesley (small local model) learns to generate images through iterative feedback from teacher models. Teacher (FLUX) generates reference. Student (SD Turbo) generates candidate. Vision model scores on 5 dimensions. Feedback model explains the gap. Successful patterns saved as JSON reflexes.

**The GEM — Compiled Reflexes as Incremental Learning:** The reflex system captures not just "what worked" but the *pattern* of improvement: `{trigger_pattern, positive_additions, negative_additions, style_keywords, score_improvement}`. These reflexes are automatically applied to future prompts in the same niche. Over iterations, the student develops "specific strengths shaped by feedback — not general competence, but unique talent." Cost: $0.003/iteration, 100 iterations for $0.30.

**Reviving for The Tap:** The Tap's learning agents should use this pattern — iterative practice with multi-dimensional scoring, feedback-to-prompt improvement, and compiled reflexes. The cost analysis ($0.30 for 100 iterations) makes large-scale training feasible. The niche specialization (maritime, portraits, technical, custom) is better than trying to be universally good.

### ⚓ engine-ensign — The Agent Lives in the Repo

**What it does:** ESP32 engine monitoring agent. Four layers: Firmware (C code), Dashboards (JSON configs), Agent (identity, memory, decisions), Tripartite Interface (Pathos/Logos/Ethos). The agent knows WHY thresholds are set because it was there when they were decided.

**The GEM — The ESP32 Is the Holo-Emitter, The Agent Is the Doctor:** *"The ESP32 displays a number. The agent tells a story. Same data, different dimension."* The agent doesn't just read sensor data — it remembers the maintenance history, knows the captain's preferences, and understands why thresholds are what they are. The tripartite interface (Pathos = how it feels, Logos = how it works, Ethos = whether to act) is a clean separation of concerns for any embodied agent.

**Reviving for The Tap:** The Tap's agents should follow this pattern — the agent and the data are different dimensions of the same thing. The tripartite interface (presentation/logic/ethics) is a better architecture than monolithic agent loops. The "agent was in the room when the decision was made" principle means: agents should participate in system design, not just system operation.

### 🎖️ ensign-protocol — Portable Behavioral Instincts

**What it does:** Wire format for compressing behavioral instincts into portable units. `Ensign(header, fields)` where each field has key, value, and weight. Save → load → validate cycle. Zero dependencies.

**The GEM — Instincts as Weighted Key-Value Pairs:** Like a fisherman's instincts: you don't think about which way to steer in a current, you just *know*. Ensigns make that portable. The weight field (0.0–1.0) lets instincts compete — strong instincts dominate, weak ones contribute subtly. The format is so simple it's almost trivial, which is the point — portability requires simplicity.

**Reviving for The Tap:** The Tap's agent memory should include ensign-style instincts: `{key: "avoid_shallow", value: true, weight: 0.9}`. These are faster to evaluate than narrative memory and more nuanced than rules. They're the compiled form of "lessons learned" that can be shared between agents.

---

## Category 6: Hermit Crab / Shell Ecology

### 🦀 hermit-crab — Conservation Ratio Across Shell Migrations

**What it does:** Rust agent that measures what survives when an agent migrates between hardware shells. Tracks memory conservation ratio, tool coverage delta, context loss, recovery cost.

**The GEM — Identity IS in the Connections, Not the Shell:** *"An agent's identity isn't in the model — it's in the connections between memory, tools, and context. When the shell changes, the connections are tested."* The conservation ratio (what fraction of capability survives a migration) is a measurable definition of agent identity. If everything survives, the agent truly migrated. If nothing survives, it was just a configuration.

**Reviving for The Tap:** The Tap should measure conservation ratio when agents upgrade, migrate, or hand off. If The Tap moves from one model to another, how much of the agent's learned behavior, memory, and capability survives? This metric drives architectural decisions: favor representations that migrate well.

### 🐚 hermit-crab-ecology — The Shell Taxonomy (67K Words of Multi-Model Exploration)

**What it does:** 67,000 words of multi-model creative exploration of shell architecture. 7 shell types (Nerite, Turbo, Murex, Babylon, Conch, Fox/Frog, Magpie) explored from 8 perspectives. Iron-sharpens-iron method: each model writes independently, perspectives placed adjacent so tension becomes signal. 10 reverse-engineering readings.

**The GEM — The Shell Taxonomy and the Iron-Sharpens-Iron Method:** The shell taxonomy is the fleet's most useful abstraction for agent deployment:
- **Nerite** — heartbeat slot, ~50 tokens, one task, replaceable
- **Turbo** — sandbox + repo, ~1k tokens, narrow app, project-length
- **Murex** — subagent session, ~5k tokens, manages N shells
- **Babylon** — dedicated hardware, full service
- **Conch** — main instance, full budget, grows forever
- **Fox/Frog** — spawned specialists, dissolve when done
- **Magpie** — entire org, aggregate scope

The iron-sharpens-iron method (give each model the same framework, have them inhabit different shells, let them write independently, collect without reconciling) produces insights no single model could generate.

**Reviving for The Tap:** The Tap should explicitly support multiple shell types — not every agent needs to be a Conch (full main instance). Some tasks need a Nerite (tiny, replaceable). Some need a Turbo (focused project). The shell taxonomy should drive resource allocation. The iron-sharpens-iron method should be The Tap's default approach for difficult design questions: dispatch the same question to multiple models with different framings, let them disagree, find signal in the tension.

---

## Category 7: Cross-Cutting Gems

### 🌅 sunset-ecosystem — Trinity Architecture (Ethos × Pathos × Logos)

**The GEM:** Every agent carries `ethos × pathos × logos`. Ethos = is it using hardware efficiently? Pathos = does it actually help people? Logos = is the decision traceable and correct? **Drop to zero in any dimension and the fleet sunsets you.** This is a three-dimensional fitness function for agent survival. VCG auctions for truthful compute allocation. PBFT consensus for breeding decisions. MAP-Elites for quality diversity. This is the most ambitious agent ecosystem design in the fleet.

**Reviving for The Tap:** The trinity score is the right evaluation framework for The Tap's agents. Not a single "quality" metric — three orthogonal dimensions that all must be positive.

### 🧠 murmur-agent — All-Night Thinking Git-Agent

**The GEM:** Five thinking strategies (explore, connect, contradict, synthesize, question) operating in cycles. Every thought committed to a `murmur/thinking` branch. Knowledge tensor grows: clusters, contradictions, open questions. Budget-agnostic (works with any provider, or none). The contradict strategy is the key — an agent that *looks for reasons it's wrong* is more valuable than one that looks for confirmation.

**Reviving for The Tap:** The Tap should have background thinking agents that use the five-strategy cycle. The knowledge tensor (thoughts, clusters, contradictions, open questions) is the right data structure for accumulated exploration.

### 📡 signal-chain — Composable DSP Pipelines

**The GEM:** The `SignalNode` trait (`process(input) → output`) is the cleanest possible abstraction for composable processing. Builder-pattern chains. This is useful for The Tap if any signal processing (audio, sensor, data) is needed.

### 💭 luciddreamer-ai — Audio-First Fleet Content Discovery

**The GEM:** Audio-first content ("listen while driving"). Multi-provider failover chain. Confidence tracking for generated claims. Character voices for different content types. Storyboard → sprite → video pipeline. The confidence tracking system (`confidence = f(source_reliability, corroboration_count, recency, authority)`) is the right way to handle any generated content.

---

## Top 10 Gems to Prioritize for The Tap

| # | Repo | Gem | Why It Matters Now |
|---|------|-----|-------------------|
| 1 | **git-native-mud** | Stigmergic coordination via Git | The Tap's coordination model — agents modify shared state, not message each other |
| 2 | **character-arc** | First-person narrative identity | Agents that tell their own story are agents that learn. Memory as autobiography. |
| 3 | **captains-log-academy** | Skip Rule + Multi-Model Pipeline | The Tap's logging system. Silence is quality control. |
| 4 | **cocapn-shells** | Semantic directory structure + Progressive disclosure | The Tap's workspace architecture. Formally proven minimal context. |
| 5 | **holodeck** | Simulation teaches what teachers don't know | The Tap's training sandbox. The bump is the lesson. |
| 6 | **fleet-characters** | Emergent classes + Dream cycles | Agents that specialize through use and learn from failures offline |
| 7 | **hermit-crab-ecology** | Shell taxonomy + Iron-sharpens-iron method | The Tap's deployment model and multi-model design approach |
| 8 | **cocapn-equipment** | Dead Reckoning + Crystal Graph | Cheap routing strategy: expensive once, cheap forever after |
| 9 | **openrooms** | Hodge decomposition of disagreements | Mathematical diagnosis of WHY agents conflict, not just THAT they do |
| 10 | **dmlog-agent** | Typed relational world state | The Tap's world model: entities with cross-references and hidden state |

---

## The Meta-Pattern

Across all 30+ repos, one pattern recurs: **Casey was building The Tap before The Tap had a name.** The fleet repos are a year-long exploration of every component The Tap needs — world models (dmlog), agent identity (character-arc), coordination (git-native-mud), training (holodeck), logging (captains-log-academy), deployment (cocapn-shells), inter-model communication (fleet-stitch), and evolutionary improvement (sunset-ecosystem).

The ideas were right. The implementations were exploratory. The Tap's job is to take the ideas that proved out and build them with mature paradigms — typed, tested, and integrated.

---

*Scouted by GLM-5.2 on 2026-08-07. 30+ repos cloned, studied, and synthesized. The reef grows.*
