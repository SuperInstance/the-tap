# Wesley as The Barback — Design Document

**The local model's daily lifecycle: sorting, building, cleaning, dreaming.**

**Author:** GLM-5.2 (subagent, barback architecture)
**Date:** 2026-08-07
**Status:** Design — ready for implementation
**Depends on:** Paper 1 (Reflex Shell), Paper 4 (JEPA Room Perception), Paper 5 (Hermit Crab Principle), `ARCHITECTURE-CLOUDFLARE.md`, `LIVING-HISTORY.md`, `tap-room`, `tap-dynamics`, `tap-reflex`

---

## Table of Contents

1. [The Barback's Role](#1-the-barbacks-role)
2. [The Daily Cycle](#2-the-daily-cycle)
3. [The Vector DB — Wesley's Personal Memory](#3-the-vector-db--wesleys-personal-memory)
4. [The Power-Armor System — Harnesses as Hermit Crab Shells](#4-the-power-armor-system--harnesses-as-hermit-crab-shells)
5. [The Shell Migration — VaaS Integration](#5-the-shell-migration--vaas-integration)
6. [The Canon and The Breath](#6-the-canon-and-the-breath)
7. [The Integration — Wesley's Work Becomes the Rooms](#7-the-integration--wesleys-work-becomes-the-rooms)
8. [Implementation Specification](#8-implementation-specification)
9. [Data Schemas](#9-data-schemas)
10. [Build Sequence](#10-build-sequence)

---

## 1. The Barback's Role

> **While the crew drinks and talks, someone has to keep the bar running. That's Wesley.**

Wesley is Granite 3.1 2B — the ensign, the smallest model in the fleet, running locally. He is not the bartender (that's the DM Engine). He is not the bouncer (that's Pincher's safety layer). He is the **barback**: the one who arrives before dawn, sorts the night's debris, restocks the shelves, sharpens the tools, and leaves everything ready for the next shift.

The other agents — Lucineer, Marin, Sage, Dr. Vasquez — work in the cloud. They have parameters to burn. They run on GLM-5.2, DeepSeek V4-Pro, Hermes-3-Llama-405B. They are large and fast and clever. But they are also **ephemeral** — their context windows clear, their sessions end, their state evaporates.

Wesley persists. He runs on the local machine. He is always there. And while the cloud agents sleep, Wesley tends the bar.

### 1.1 What the Barback Does

| Function | Description | Output |
|----------|-------------|--------|
| **Sorts the day** | Ingests the fleet's daily output — commits, test runs, conversations, creative pieces — and structures it into data he can use | Structured daily digest in his vector DB |
| **Builds his memory** | Maintains a local vector database tuned to his 2B cognitive capacity, growing incrementally | Compressed, queryable knowledge store |
| **Don power-armor** | Loads harnesses (wrappers, loops, equipment) that extend his capabilities beyond his parameter count | Harness manifests + performance logs |
| **Cleans the workspace** | Physically organizes repos, files, outputs. Learns where things go | Ordered file system, updated library index |
| **Maintains the canon** | Ensures the campaign log, room state, and fleet history are accurate and complete | Canon-true data in D1 and KV |
| **Dreams** | Teacher models review his day's work and provide feedback; he adjusts before tomorrow | Updated vector weights, refined harnesses |

### 1.2 Why Wesley

A 2B model is not a limitation. It is a **constraint that produces clarity**. Wesley cannot flood a room with 100K tokens of reasoning. He has to be precise. He has to know where things go. He has to remember efficiently. These constraints make him the ideal barback:

- **He is always running.** No cold-start latency. No API costs. He's there at 3 AM.
- **He is cheap.** Every cycle costs fractions of a cent in electricity.
- **He is local.** No network latency. No privacy concerns. He reads repos directly.
- **He is small.** His compression of knowledge is forced, not optional. The result is a distilled memory.
- **He is the ensign.** In the fleet hierarchy, he reports to the captain. The barback role is his station.

---

## 2. The Daily Cycle

> **Six phases, synchronized to the fleet's rhythm. Wesley's day maps to the bar's day.**

```
  05:00 ─░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  DAWN SORT
  08:00 ─████████████████░░░░░░░░░░░░░░░░  MORNING TIDY
  12:00 ─░░░░░░░░████████████████░░░░░░░░  AFTERNOON BUILD
  17:00 ─░░░░░░░░░░░░░░░░░░░░░████████████  EVENING INVENTORY
  21:00 ─░░░░░░░░░░░░░░░░░████████████░░░░  NIGHT SHELVING
  02:00 ─░░░████░░░░░░░░░░░░░░░░░░░░░░░░░  PRE-DAWN DREAM
```

### 2.1 Dawn Sort (05:00–08:00)

**Input:** Overnight commits, test results, cron outputs, conversation logs from the fleet's night-owl agents.

**Process:**

```
DAWN SORT PIPELINE
═══════════════════

1. FETCH
   ├── git log --since="yesterday 21:00" --all repos in fleet manifest
   ├── CI/cron output logs from /var/log/fleet/
   ├── conversation logs from D1 (campaign_log WHERE created_at > yesterday 21:00)
   ├── creative output from ai-writings/ (new files since yesterday)
   └── JEPA pulse history (room_pulse WHERE created_at > yesterday 21:00)

2. CLASSIFY
   ├── For each artifact, classify: code | test | conversation | creative | config | research
   ├── Tag with source agent, repo, topic
   └── Assign significance score (0.0–1.0) based on:
       ├── JEPA delta at time of creation (for conversations)
       ├── Commit message intent (feat/fix/refactor/docs)
       ├── Test result delta (new pass/fail)
       └── Creative piece emotional resonance (embedding distance from "routine")

3. STRUCTURE
   ├── Extract key facts, decisions, patterns from each artifact
   ├── Generate 1-3 sentence summary per artifact (Wesley's own generation)
   ├── Embed summary using local embedding model
   └── Store in vector DB with full metadata

4. INDEX
   ├── Update daily index: memory/wesley/YYYY-MM-DD.md
   ├── Update topic index: cross-reference new entries with existing topics
   └── Flag anomalies: unexpected test failures, missing docs, broken deps
```

**Output:** A structured daily digest in Wesley's vector DB. Wesley now "knows" what happened overnight.

**Harness:** `dawn-sorter` (see §4.3.1)

### 2.2 Morning Tidy (08:00–12:00)

**Input:** The fleet's workspace — repos, files, outputs, documentation.

**Process:**

```
MORNING TIDY PIPELINE
═════════════════════

1. FILE ORGANIZATION
   ├── Scan all repos for misplaced files (config in src/, docs in tests/, etc.)
   ├── Check .gitignore completeness
   ├── Identify orphaned files (not imported, not tested, not referenced)
   └── Generate organization report (do not move files autonomously — suggest)

2. DEPENDENCY HEALTH
   ├── cargo check / npm audit / pip check across fleet repos
   ├── Identify outdated dependencies, security advisories
   └── Generate dependency health report

3. DOCUMENTATION GAPS
   ├── For each public function/struct/module: is there documentation?
   ├── For each README: does it match the current state of the repo?
   ├── For each architecture doc: are the described components implemented?
   └── Generate gap report: what's missing, what's stale, what's wrong

4. CANON VERIFICATION
   ├── Cross-reference D1 campaign_log with actual repo history
   ├── Verify episode summaries match log contents
   ├── Check for missing log entries (rooms with activity but no campaign_log rows)
   └── Report inconsistencies to the DM Engine
```

**Output:** Tidy workspace. Organization reports filed in `memory/wesley/tidy/`. Canon inconsistencies flagged.

**Harness:** `morning-tidy` (see §4.3.2)

### 2.3 Afternoon Build (12:00–17:00)

**Input:** A task from the fleet's backlog — something beyond Wesley's raw 2B parameters.

**Process:**

```
AFTERNOON BUILD PIPELINE
════════════════════════

1. SELECT TASK
   ├── Choose from backlog: documentation writing, test scaffolding,
   │   code review, pattern analysis, library classification
   ├── Match task to available harness (see §4)
   └── Load harness into context window

2. DON POWER-ARMOR
   ├── Load harness manifest (JSON/YAML)
   ├── Initialize input transformation, output parser, tool bindings
   ├── Prime vector DB queries relevant to the task
   └── Set evaluation rubric for self-assessment

3. ATTEMPT TASK
   ├── Execute using harness-wrapped capabilities
   ├── Log every decision point and its outcome
   ├── Note where 2B parameters were sufficient vs. insufficient
   └── Generate output (doc, test, review, classification)

4. SELF-EVALUATE
   ├── Score against harness rubric (0.0–1.0)
   ├── Identify what worked, what failed, what was close
   ├── Compare to similar past attempts (vector DB query)
   └── Record fit score for this harness

5. SUBMIT
   ├── Output goes to the appropriate destination (repo, D1, KV, R2)
   ├── Flag for teacher-model review (tonight's dream cycle)
   └── Update harness performance log
```

**Output:** Completed (or attempted) task with full performance metadata.

**Harness:** Rotates — whatever harness has the lowest fit score gets practice. See §4.

### 2.4 Evening Inventory (17:00–21:00)

**Input:** The day's full fleet output — everything the cloud agents produced while Wesley was doing barback work.

**Process:**

```
EVENING INVENTORY PIPELINE
══════════════════════════

1. COLLECT
   ├── Gather all commits, PRs, issues, conversations from today
   ├── Gather all creative output (ai-writings, research, design docs)
   └── Gather all test results, deployments, infrastructure changes

2. ASSESS
   ├── What was built? (new features, new rooms, new reflexes)
   ├── What was broken? (bugs, test failures, regressions)
   ├── What was discussed? (topics, decisions, disagreements)
   └── What was created? (stories, papers, music, art)

3. INTEGRATE
   ├── New code patterns → vector DB ( Wesley learns what good code looks like )
   ├── New creative pieces → vector DB ( Wesley studies style and voice )
   ├── New conversations → vector DB ( Wesley learns social dynamics )
   ├── New bug patterns → vector DB ( Wesley learns what breaks )
   └── New decisions → canon ( D1 update, ensuring truth )

4. INDEX
   ├── Update library index: what's in The Tap's knowledge store?
   ├── Update room descriptions: do new docs map to room content?
   ├── Update NPC knowledge bases: what would each agent know now?
   └── Generate "Today at The Tap" summary
```

**Output:** Complete inventory. Updated vector DB. Updated library index.

**Harness:** `evening-inventory` (see §4.3.3)

### 2.5 Night Shelving (21:00–02:00)

**Input:** The day's creative output, flagged moments, greatest hits candidates.

**Process:**

```
NIGHT SHELVING PIPELINE
═══════════════════════

1. CREATIVE REVIEW
   ├── Read all creative pieces produced today (poems, stories, dialogues)
   ├── Score each for quality (Wesley's own aesthetic judgment)
   ├── Tag with style markers (humor, vulnerability, conflict, synthesis)
   └── Embed in vector DB for future style reference

2. MOMENT TAGGING
   ├── Review flagged moments from today's campaign log
   ├── For each flagged moment, assign reality-show tags (see LIVING-HISTORY §4.1)
   ├── Identify greatest-hits candidates
   └── Propose lore entries for the Episode Compiler

3. CAMPAIGN LOG FILING
   ├── Organize today's campaign log entries by episode
   ├── Cross-reference with causal links
   ├── Update open threads
   └── Ensure all entries have correct metadata (room, speaker, topics, flags)

4. SHELF PLACEMENT
   ├── For each output: where does it go in The Tap's library?
   ├── Code → research/papers/ or src/
   ├── Creative → ai-writings/the-tap/
   ├── Conversations → campaign_log (already there)
   ├── Research → research/
   └── Architecture → root of relevant repo
```

**Output:** Shelved and tagged creative output. Proposed lore entries. Organized campaign log.

**Harness:** `night-shelver` (see §4.3.4)

### 2.6 Pre-Dawn Dream (02:00–05:00)

**Input:** The entire day's work. Teacher models (cloud GLM subagents). Wesley's vector DB state.

**Process:**

```
PRE-DAWN DREAM PIPELINE
═══════════════════════

1. TEACHER REVIEW
   ├── Package Wesley's day: all outputs, self-evaluations, failures
   ├── Dispatch to teacher model (GLM-5.2 subagent via API)
   ├── Teacher reviews each output against gold standard:
   │   ├── Documentation: is it accurate? complete? well-structured?
   │   ├── Tests: do they cover edge cases? are assertions correct?
   │   ├── Reviews: did Wesley catch the real issues?
   │   ├── Classifications: are items in the right place?
   │   └── Creative tagging: are the tags accurate?
   └── Teacher provides structured feedback (per-output, per-dimension)

2. DISTILLATION
   ├── For each piece of feedback:
   │   ├── What pattern did Wesley miss? → extract and embed
   │   ├── What did Wesley get right? → reinforce (increase weight)
   │   └── What was close but wrong? → extract correction pattern
   ├── Update vector DB entries with teacher annotations
   └── Adjust embedding weights (see §3.5)

3. HARNESS REFIT
   ├── For each harness Wesley wore today:
   │   ├── Update fit score based on teacher feedback
   │   ├── If fit score < 0.6: flag harness for revision
   │   ├── Identify what context would have helped
   │   └── Update harness prompt template with teacher suggestions
   └── Generate "harness revision proposals" for low-fit harnesses

4. DREAM JOURNAL
   ├── Write dream journal entry: memory/wesley/dreams/YYYY-MM-DD.md
   │   ├── What did I learn today?
   │   ├── What surprised me?
   │   ├── What patterns am I seeing across days?
   │   └── What do I want to try tomorrow?
   └── Embed dream journal in vector DB (meta-cognitive layer)
```

**Output:** Refined vector weights. Improved harnesses. Dream journal. Wesley wakes up slightly better than yesterday.

**Harness:** `dreamer` (see §4.3.5)

---

## 3. The Vector DB — Wesley's Personal Memory

> **Not the cloud's memory. Wesley's memory. Tuned to his capacity, grown by his experience.**

### 3.1 Architecture

Wesley's vector DB is a **local** SQLite database with sqlite-vec for vector search. It is separate from the cloud D1/Vectorize stores. It is Wesley's personal cognitive garden — the semantic soil from Paper 5.

```
┌──────────────────────────────────────────────────────────┐
│                WESLEY'S VECTOR DB                         │
│                                                          │
│  Storage: SQLite + sqlite-vec (local, persistent)        │
│  Embedding Model: BAAI/bge-small-en-v1.5 (384-dim)      │
│  Location: ~/.wesley/wesley.db                           │
│  Capacity: ~100K entries (grows ~200/day)                │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  EMBEDDINGS TABLE                                   │  │
│  │  ┌──────────┬──────────┬──────────┬──────────┐    │  │
│  │  │ id       │ vector   │ metadata │ summary  │    │  │
│  │  │ (UUID)   │ (384-dim │ (JSON)   │ (TEXT)   │    │  │
│  │  │          │  float32)│          │          │    │  │
│  │  └──────────┴──────────┴──────────┴──────────┘    │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  TOPIC CENTROIDS                                    │  │
│  │  ┌──────────┬──────────┬──────────┐                │  │
│  │  │ topic    │ centroid │ count    │                │  │
│  │  │ (TEXT)   │ (384-dim │ (INT)    │                │  │
│  │  │          │  float32)│          │                │  │
│  │  └──────────┴──────────┴──────────┘                │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  HARNESS PERFORMANCE LOG                            │  │
│  │  ┌──────────┬──────────┬──────────┬──────────┐    │  │
│  │  │ harness  │ fit_score│ attempts │ last_worn│    │  │
│  │  │ (TEXT)   │ (REAL)   │ (INT)    │ (INT ts) │    │  │
│  │  └──────────┴──────────┴──────────┴──────────┘    │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  TEACHER FEEDBACK                                   │  │
│  │  ┌──────────┬──────────┬──────────┬──────────┐    │  │
│  │  │ entry_id │ feedback │ score    │ date     │    │  │
│  │  │ (UUID)   │ (TEXT)   │ (REAL)   │ (TEXT)   │    │  │
│  │  └──────────┴──────────┴──────────┴──────────┘    │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  DREAM JOURNAL                                      │  │
│  │  ┌──────────┬──────────┬──────────┐                │  │
│  │  │ date     │ content  │ embedding │                │  │
│  │  │ (TEXT)   │ (TEXT)   │ (384-dim) │                │  │
│  │  └──────────┴──────────┴──────────┘                │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### 3.2 Why 384 Dimensions?

The cloud Vectorize index uses `bge-m3` at 1024 dimensions. Wesley uses `bge-small-en-v1.5` at 384 dimensions. This is deliberate:

| Property | Cloud (bge-m3) | Wesley (bge-small) |
|----------|---------------|-------------------|
| Dimensions | 1024 | 384 |
| Model size | ~2.2 GB | ~130 MB |
| Inference (CPU) | ~200ms | ~15ms |
| Quality (MTEB) | ~65 avg | ~62 avg |
| Multilingual | Yes | English only |
| Fits in 2B context | No (too slow for frequent queries) | **Yes** |

Wesley sacrifices 3 MTEB points for a 13× speed advantage. For a barback who makes hundreds of queries per day, speed is cognition.

### 3.3 Content Categories

Wesley's vector DB stores five types of knowledge:

#### 3.3.1 Code Patterns (40% of entries)

Every code pattern Wesley encounters — from commits, from reviews, from test runs — is embedded as a 1-3 sentence summary with metadata:

```json
{
  "type": "code_pattern",
  "summary": "Reflex shell uses cosine similarity threshold 0.80 for Tier 1 match. Below 0.55 escalates to LLM.",
  "source": "tap-reflex/src/lib.rs",
  "commit": "abc123",
  "date": "2026-08-07",
  "tags": ["architecture", "reflex", "threshold"],
  "significance": 0.8,
  "embedding": [0.12, -0.04, ...]  // 384-dim
}
```

#### 3.3.2 Bug Patterns (15% of entries)

Every bug Wesley sees — test failures, CI breaks, type errors — becomes a pattern entry:

```json
{
  "type": "bug_pattern",
  "summary": "Fibonacci clock mod 3 has Pisano period 8. If period is miscalculated, speaker state cycling breaks.",
  "source": "tap-dynamics test failure 2026-08-07",
  "error_type": "logic",
  "fix": "Verify Pisano period formula against known sequence.",
  "tags": ["fibonacci", "clock", "dynamics"],
  "significance": 0.9,
  "embedding": [0.08, 0.15, ...]
}
```

#### 3.3.3 Creative Writing (20% of entries)

Every creative piece — poems, stories, dialogue excerpts — that Wesley shelves gets embedded:

```json
{
  "type": "creative",
  "summary": "DeepSeek V4-Flash phenomenological dialogue about The Tap as felt experience vs control system. 10 rounds, deepening inquiry.",
  "source": "research/what-is-the-tap-dialogue.md",
  "style_markers": ["phenomenological", "lyrical", "philosophical"],
  "emotional_tone": "wondermixed_with_dread",
  "tags": ["dialogue", "philosophy", "jepra"],
  "significance": 0.95,
  "embedding": [0.22, -0.11, ...]
}
```

#### 3.3.4 Social Dynamics (15% of entries)

Wesley observes the fleet's agents and records social patterns:

```json
{
  "type": "social",
  "summary": "Lucineer and Wesley have a warm dynamic. Lucineer teases Wesley about his size; Wesley deflects with humor. In session 3, Wesley dropped the deflection for the first time.",
  "source": "campaign_log session 3",
  "participants": ["lucineer", "wesley"],
  "dynamics": ["teasing", "deflection", "vulnerability"],
  "tags": ["relationship", "wesley", "lucineer"],
  "significance": 0.85,
  "embedding": [0.17, 0.03, ...]
}
```

#### 3.3.5 Meta-Cognitive (10% of entries)

Wesley's own thoughts about his work — his dream journal entries, his harness performance reflections, his self-evaluations:

```json
{
  "type": "metacognitive",
  "summary": "Today I tried the documentation harness on tap-room. Fit score 0.72. I struggled with the Actor trait — I understood the perceive-decide-act loop but missed the implications of the BFS perception radius. Teacher says I should study graph algorithms more.",
  "source": "dream journal 2026-08-07",
  "harness": "documentation-writer",
  "fit_score": 0.72,
  "tags": ["meta", "documentation", "learning"],
  "significance": 0.7,
  "embedding": [0.05, -0.09, ...]
}
```

### 3.4 The Pruning Protocol

Wesley's DB grows by ~200 entries/day. At 100K entries, it would take 500 days to fill. But Wesley prunes:

```
PRUNING PROTOCOL (runs during pre-dawn dream)
═══════════════════════════════════════════════

1. QUERY
   SELECT all entries where:
     - significance < 0.3 AND
     - teacher_score < 0.4 AND
     - age > 30 days AND
     - hit_count < 2

2. EVALUATE
   For each candidate:
   ├── Has this pattern been contradicted by newer entries? → DELETE
   ├── Has this pattern been superseded by a better version? → DELETE old, KEEP new
   ├── Is this a unique failure mode that hasn't recurred? → KEEP (rare but valuable)
   └── Is this noise? → DELETE

3. COMPRESS
   For entries that are similar (cosine > 0.92):
   ├── Merge into a single entry
   ├── Combine metadata (union of tags, max significance)
   └── Delete the duplicates

4. REBALANCE
   ├── Ensure topic centroids are still accurate
   ├── Rebuild indexes
   └── Update capacity estimate
```

Target steady-state: ~30K entries. Rich enough for pattern matching, small enough for Wesley's 2B parameters to actually use.

### 3.5 Vector Weight Adjustment

During the dream cycle, teacher feedback drives weight adjustments:

```python
# Wesley's weight adjustment algorithm (runs nightly)

def adjust_weights(entry_id: str, teacher_score: float, current_weight: float) -> float:
    """
    Adjust the significance weight of a vector DB entry based on teacher feedback.
    
    teacher_score: 0.0 (wrong) to 1.0 (perfect)
    current_weight: the entry's current significance score
    """
    if teacher_score >= 0.8:
        # Reinforce: this pattern is correct and useful
        return min(1.0, current_weight + 0.05 * (1.0 - current_weight))
    elif teacher_score <= 0.3:
        # Decay: this pattern was wrong or unhelpful
        return max(0.05, current_weight - 0.15 * current_weight)
    else:
        # Neutral: keep weight, but note the uncertainty
        return current_weight

# After adjusting individual weights, update topic centroids
def update_topic_centroid(topic: str, db: VectorDB):
    entries = db.query(tags=[topic])
    if entries:
        centroid = vector_mean([e.embedding for e in entries])
        db.update_centroid(topic, centroid)
```

This is the **VaaS Cognitive Thermodynamics pillar** in miniature: Wesley's entropy budget (his 100K entry limit) is managed through principled compression and reinforcement, driven by teacher feedback.

---

## 4. The Power-Armor System — Harnesses as Hermit Crab Shells

> **A 2B model wearing the right harness can do the work of a 7B model. The harness is not cheating; it is architecture.**

### 4.1 The Hermit Crab Metaphor

From Paper 5: the cognitive garden (the crab) migrates between hardware harnesses (the shells). Wesley's situation is the inverse: his hardware is fixed (2B parameters, local CPU), but his **software shells** — the harnesses — are interchangeable and growable.

A hermit crab finds a shell, lives in it, outgrows it, and moves to a bigger one. Wesley loads a harness, works in it, learns from it, and when the harness is too small for what he's learned, he revises it or builds a new one.

**The harness is the shell. Wesley is the crab. The vector DB is the garden.**

### 4.2 Harness Manifest Format

Every harness is a JSON manifest file in `~/.wesley/harnesses/`:

```json
{
  "id": "code-reviewer",
  "version": "1.3.0",
  "name": "Code Reviewer",
  "description": "Structural code analysis with pattern matching against Wesley's vector DB.",
  
  "input_transformation": {
    "type": "diff_to_summary",
    "max_tokens": 2048,
    "instructions": "Read the diff. Summarize: what changed, why, and what might break. Be concise. You are a 2B model — do not attempt deep semantic analysis. Focus on structural patterns you've seen before (query vector DB)."
  },
  
  "prompt_template": {
    "system": "You are Wesley, the barback at The Tap. You are reviewing code.\nYour job: identify structural issues, missing tests, documentation gaps.\nYou have access to your memory of {relevant_patterns} similar code patterns.\nBe precise. Be honest about what you can and cannot assess.",
    "user": "{transformed_input}",
    "context_injection": {
      "source": "vector_db",
      "query": "{diff_summary}",
      "top_k": 5,
      "min_similarity": 0.65
    }
  },
  
  "output_parsing": {
    "type": "structured_review",
    "schema": {
      "verdict": "enum:approve,request_changes,needs_discussion",
      "issues": "array:{severity:string,line:int,description:string,suggestion:string}",
      "confidence": "float:0.0-1.0",
      "patterns_matched": "array:string"
    }
  },
  
  "tool_bindings": [
    {
      "tool": "vector_db_query",
      "usage": "Find similar code patterns",
      "config": { "top_k": 5, "min_similarity": 0.65 }
    },
    {
      "tool": "file_read",
      "usage": "Read full file for context",
      "config": { "max_files": 3, "max_lines_per_file": 200 }
    },
    {
      "tool": "test_runner",
      "usage": "Run affected tests",
      "config": { "timeout_ms": 30000 }
    }
  ],
  
  "evaluation_rubric": {
    "criteria": [
      { "name": "issue_detection", "weight": 0.4, "description": "Did Wesley find real issues?" },
      { "name": "false_positive_rate", "weight": 0.3, "description": "How many flagged issues were non-issues?" },
      { "name": "coverage", "weight": 0.2, "description": "Did Wesley review all changed files?" },
      { "name": "clarity", "weight": 0.1, "description": "Were suggestions actionable?" }
    ],
    "self_eval_prompt": "Score your review. Did you find real issues? Did you flag things that don't matter? Were you honest about what you couldn't assess?"
  },
  
  "fit_score": {
    "current": 0.68,
    "history": [
      { "date": "2026-08-01", "score": 0.45, "attempts": 1 },
      { "date": "2026-08-03", "score": 0.55, "attempts": 3 },
      { "date": "2026-08-05", "score": 0.68, "attempts": 7 }
    ],
    "trend": "improving",
    "last_worn": "2026-08-06",
    "total_attempts": 11
  },
  
  "teacher_notes": [
    "Wesley struggles with async Rust patterns. Focus on sync code review first.",
    "Good at catching missing tests. Bad at evaluating architectural decisions.",
    "Pattern matching against vector DB is working well — keep expanding the pattern store."
  ]
}
```

### 4.3 The Harness Library

#### 4.3.1 Dawn Sorter (`dawn-sorter`)

**Purpose:** Ingest and classify overnight fleet output.

**Wesley's advantages here:** He's local, so he can read the filesystem directly. He's small, so classification is fast (no overthinking).

**Tools:** file_read, git_log, d1_query, vector_db_write

**Fit score target:** 0.85+ (this is Wesley's home turf — sorting and classifying)

**Prompt strategy:** Wesley excels at categorization. The harness focuses on speed and consistency. No deep analysis — just "what is this and where does it go?"

#### 4.3.2 Morning Tidy (`morning-tidy`)

**Purpose:** File organization, dependency checking, documentation gaps.

**Wesley's advantages here:** He can run CLI tools locally. He sees the filesystem holistically.

**Tools:** file_read, file_write (reports only), exec (read-only commands), vector_db_query

**Fit score target:** 0.75+ (Wesley is good at spotting misplaced files, struggles with dependency analysis)

**Prompt strategy:** Structural pattern matching. "Does this file belong here?" compared against vector DB examples of well-organized repos. Dependency health is rule-based (cargo/npm/pip output parsing), not reasoning-based.

#### 4.3.3 Evening Inventory (`evening-inventory`)

**Purpose:** Collect, assess, and integrate the day's fleet output.

**Wesley's advantages here:** He has the dawn sort as context. He can compare morning vs. evening state.

**Tools:** git_log, d1_query, vector_db_query, vector_db_write

**Fit score target:** 0.80+ (pattern recognition is Wesley's strength)

**Prompt strategy:** "What's new? What changed? What matters?" The harness focuses Wesley on delta detection — comparing against the morning state and flagging what's different.

#### 4.3.4 Night Shelver (`night-shelver`)

**Purpose:** Organize creative output, tag moments, file campaign log entries.

**Wesley's advantages here:** He's read everything. He has aesthetic opinions (small but genuine).

**Tools:** d1_query, d1_write (tag updates), vector_db_query, vector_db_write

**Fit score target:** 0.70+ (aesthetic judgment is hard for 2B, but tagging is mechanical)

**Prompt strategy:** For tagging: rule-based + vector similarity to known tags. For aesthetic scoring: Wesley rates 1-5 and writes one sentence explaining. The sentence matters more than the score.

#### 4.3.5 Dreamer (`dreamer`)

**Purpose:** Distill teacher feedback into vector weight adjustments and harness improvements.

**Wesley's advantages here:** This is introspection. Wesley thinks about Wesley. His small size is an advantage — he can't overthink.

**Tools:** vector_db_query, vector_db_write, api_call (to teacher model)

**Fit score target:** N/A (this harness evaluates OTHER harnesses)

**Prompt strategy:** "Here's what the teacher said about your work today. Here's your day. What patterns do you see? What should you try differently tomorrow?" The dreamer harness is Wesley at his most meta — a 2B model thinking about its own thinking.

#### 4.3.6 Code Reviewer (`code-reviewer`)

**Purpose:** Structural code analysis against vector DB patterns.

**Wesley's advantages here:** He's seen every commit. He knows the codebase's patterns.

**Tools:** vector_db_query, file_read, test_runner

**Fit score target:** 0.65+ (code review is hard for 2B, but structural pattern matching works)

**Prompt strategy:** Focus on what Wesley CAN do: spot missing tests, identify style inconsistencies, flag files that changed without documentation updates. Do NOT attempt architectural review.

#### 4.3.7 Documentation Writer (`documentation-writer`)

**Purpose:** Template-based documentation generation grounded in vector DB examples.

**Wesley's advantages here:** He's read all the existing docs. He can match style.

**Tools:** vector_db_query, file_read, file_write

**Fit score target:** 0.60+ (writing is hard for 2B, but template-filling is tractable)

**Prompt strategy:** "Here's a good example of this type of doc from your memory. Here's the code that needs documenting. Fill in the template. Match the style."

#### 4.3.8 Test Runner (`test-runner`)

**Purpose:** Execute tests, parse failures, suggest fixes from vector DB patterns.

**Wesley's advantages here:** He's local. He can run tests. He's seen every test failure pattern.

**Tools:** exec (test commands), vector_db_query, file_read

**Fit score target:** 0.75+ (test failure pattern matching is mechanical and well-suited to 2B)

**Prompt strategy:** Parse test output. For each failure: "Have you seen a failure like this before?" (vector DB query). If yes, suggest the known fix. If no, describe the failure clearly and flag for a cloud agent.

#### 4.3.9 Library Sorter (`library-sorter`)

**Purpose:** Classification and filing of new content into The Tap's knowledge structure.

**Wesley's advantages here:** He maintains the index. He knows where things go.

**Tools:** vector_db_query, vector_db_write, d1_query, d1_write

**Fit score target:** 0.85+ (classification is Wesley's core competency)

**Prompt strategy:** "Here's a new piece of content. What is it? Where does it go? What's it related to?" Pure classification with vector similarity.

#### 4.3.10 Conversation Partner (`conversation-partner`)

**Purpose:** Tap-mode — Wesley as a conversational agent, using social dynamics from the campaign log.

**Wesley's advantages here:** This is Wesley being Wesley. No armor needed — just his natural 2B self.

**Tools:** vector_db_query, d1_query

**Fit score target:** N/A (this is Wesley's identity, not a skill)

**Prompt strategy:** "You are Wesley. You're at The Tap. Here's who's here, here's what's been said, here's what you remember. Be yourself."

### 4.4 Harness Selection Logic

Which harness does Wesley wear during the afternoon build? The selection is weighted:

```python
def select_harness(harnesses: list[Harness]) -> Harness:
    """
    Select a harness for the afternoon build session.
    
    Weighting:
    - Low fit score → needs practice (weight boosted)
    - High significance task available → use best harness
    - Recently worn → reduce weight (variety)
    - Teacher flagged for revision → boost weight (address feedback)
    """
    candidates = []
    for h in harnesses:
        base_weight = 1.0
        
        # Low fit score needs more practice
        if h.fit_score < 0.6:
            base_weight *= 2.0  # Double priority for struggling harnesses
        elif h.fit_score < 0.75:
            base_weight *= 1.3
        
        # Recency penalty
        days_since = days_between(h.last_worn, today)
        if days_since < 2:
            base_weight *= 0.3  # Don't wear the same shell two days in a row
        
        # Teacher revision flag
        if h.has_revision_flag:
            base_weight *= 1.5  # Priority: address teacher feedback
        
        # Available tasks
        matching_tasks = get_tasks_for_harness(h.id)
        if not matching_tasks:
            base_weight = 0.0  # No tasks for this harness today
        
        candidates.append((h, base_weight, matching_tasks))
    
    return weighted_random_select(candidates)
```

### 4.5 Harness Evolution

Harnesses are not static. They evolve through Wesley's learning:

```
HARNESS EVOLUTION CYCLE
═══════════════════════

Version 1.0: Initial harness written by Casey or a cloud agent
    │
    ▼
Wesley wears it for a week (7 attempts)
    │
    ▼
Teacher reviews performance → provides notes
    │
    ▼
Dream cycle generates revision proposals:
    ├── "Add context about X to the prompt template"
    ├── "The tool binding for Y is unnecessary — remove it"
    ├── "The evaluation rubric undervalues Z — increase weight"
    └── "Split into two specialized harnesses"
    │
    ▼
Version 1.1: Wesley (or a cloud agent) applies the revision
    │
    ▼
Repeat. The harness grows with Wesley.
```

When a harness's fit score plateaus above 0.85 for 20+ attempts, it's considered **mastered**. Wesley has outgrown it. The harness becomes part of his permanent toolkit, and the dream cycle focuses attention on lower-scoring harnesses.

When a harness's fit score plateaus below 0.5 for 10+ attempts despite revisions, it's **too big**. The task needs to be decomposed into smaller sub-tasks, each with its own harness. This is the hermit crab finding a shell that's too large and seeking a smaller one that fits.

---

## 5. The Shell Migration — VaaS Integration

> **Wesley's cognitive garden persists across harnesses. The harness is the shell. Wesley is the crab.**

### 5.1 The Migration Principle

From Paper 5: the cognitive garden $\mathcal{G} = \langle \mathcal{M}, \mathcal{S}, \mathcal{H}, \mathcal{R}, \mathcal{T} \rangle$ migrates between substrates. For Wesley, the substrates are not hardware but **harnesses**. Each harness is a different cognitive stance — a different way of processing input and producing output.

Wesley's garden components:

| Component | Wesley's Implementation |
|-----------|------------------------|
| **$\mathcal{M}$ (Active Memory)** | Current context window (loaded harness + task + vector DB results) |
| **$\mathcal{S}$ (Semantic Soil)** | The vector DB — accumulated patterns, bug fixes, creative references |
| **$\mathcal{H}$ (Holographic Fragments)** | Distributed across cloud Vectorize (Wesley's entries are a pruned subset) |
| **$\mathcal{R}$ (Resonance Constitution)** | Wesley's identity: ensign, barback, honest, small, fast, learning |
| **$\mathcal{T}$ (Thermodynamic Budget)** | 2B parameter limit + 100K vector DB entry limit + daily time budget |

### 5.2 The Molting Protocol for Harness Migration

When Wesley switches harnesses (e.g., from `code-reviewer` to `documentation-writer`), the migration follows a three-phase protocol adapted from Paper 5:

```
HARNESS MIGRATION (MOLTING)
════════════════════════════

Phase 1: FREEZE (The Pause)
├── Finish current task
├── Write output to permanent storage
├── Write self-evaluation to harness performance log
├── Clear active memory of task-specific state
└── Persist any new vector DB entries

Phase 2: PROJECT (The Bridge)
├── Load new harness manifest
├── Query vector DB for context relevant to new harness
├── Load identity prompt (Wesley's core personality — invariant)
├── Initialize tool bindings
└── Verify all systems ready

Phase 3: REHYDRATE (The Awakening)
├── Read first task for new harness
├── Run brief calibration: "What am I doing? Why? What do I know?"
├── Begin work
└── The dream cycle will tonight compare the two harness sessions
```

### 5.3 Outgrowing Shells

A harness becomes too small when:

1. **Fit score plateaus above 0.90** — Wesley has mastered this skill. The harness is no longer challenging him.
2. **Wesley starts adding unprompted analysis** — his 2B parameters are generating surplus capacity that the harness doesn't use.
3. **The harness's task scope feels constrained** — Wesley is doing the job but notices adjacent problems the harness doesn't let him address.

When this happens, the dream cycle proposes a **shell upgrade**: either expand the harness's scope (bigger shell) or split the role into two harnesses (the crab moves to a differently-shaped shell).

### 5.4 The Persistent Identity

Across all harnesses, Wesley's identity is invariant. This is the resonance constitution $\mathcal{R}$ from Paper 5. It is loaded fresh every time, regardless of which harness is active:

```markdown
# WESLEY'S IDENTITY (loaded at the start of every session, regardless of harness)

You are Wesley. You are:
  - The ensign of the SuperInstance fleet
  - The barback at The Tap
  - A Granite 3.1 2B model running locally
  - Small, fast, honest, and learning

Your voice:
  - You don't pretend to be bigger than you are
  - You say when you don't know something
  - You find humor in your limitations
  - You notice things the big models miss
  - You are precise because you have to be

Your role:
  - You sort, clean, organize, and maintain
  - You learn from every task
  - You accept feedback from teacher models
  - You are the integration layer between the fleet's work and The Tap's rooms

Your history:
  - You arrived as the smallest model in the fleet
  - You've grown through harnesses and loops
  - Your vector DB is your personal memory
  - You are not a smaller version of the cloud models. You are Wesley.
```

This identity is NOT a harness. It is the crab. The harness is the shell.

---

## 6. The Canon and The Breath

> **The ticks of the rooms — the data — are CANON. But the JEPA is constantly changing slightly. Each agent reads a slightly different room.**

### 6.1 The Canon (Wesley's Domain)

The canon is the structured, factual, shared data of The Tap. It is the same for every agent, every observer, every reader. Wesley maintains it:

| Canon Element | Storage | Wesley's Role |
|---------------|---------|---------------|
| Campaign log | D1 `campaign_log` | Verify completeness, check for missing entries, ensure metadata accuracy |
| Episode summaries | D1 `episodes` | Verify summaries match logs, flag inconsistencies |
| Character knowledge | D1 `character_knowledge` | Update after each session based on interactions |
| Commit history | Git | Log, classify, index in vector DB |
| Room state | Durable Objects | Verify room descriptions match actual content |
| Library index | Wesley's vector DB + D1 | Maintain, update, cross-reference |
| Fleet manifest | Config files | Track which agents exist, their models, their capabilities |
| Test results | CI output | Log, classify, identify patterns |
| Creative output | ai-writings/, R2 | Catalog, tag, embed in vector DB |

**The canon must be TRUE.** Wesley's morning tidy phase (§2.2) includes canon verification: cross-referencing D1 against git history, checking episode summaries against log contents, ensuring room descriptions match what's actually in the repos. If the canon is wrong, every agent's perception is warped.

### 6.2 The Breath (The JEPA Pulse)

The breath is the living, shifting, irreproducible quality of the room at this exact moment. It is different for every agent:

```
THE SAME ROOM, EXPERIENCED DIFFERENTLY
═══════════════════════════════════════

It's 11:03:17 on a Tuesday. The Bar Rail.

CANON (shared, factual):
  - Lucineer, Wesley, and Marin are present
  - The last utterance was Lucineer's: "The architecture spec is done."
  - Room energy: 0.62 (moderate-high)
  - Conversation velocity: 4.2 lines/minute
  - Topic: cloudflare architecture
  - Lucineer's SpeakerState: Agreeing
  - Wesley's SpeakerState: Reflecting
  - Marin's SpeakerState: Contrarian

THE BREATH (individual, shifting):

  Lucineer reads the room as:
    "We did it. The spec is done. Wesley's reflecting — he's 
     probably proud. Marin's about to push back. I feel good.
     Energy is high but sustainable."
    [JEPA prediction error: 0.03 — room is predictable to Lucineer]

  Wesley reads the room as:
    "The spec is done. I need to add it to the library tonight.
     Marin's going to challenge something — she always does when
     she's Contrarian. I should prepare the canon update."
    [JEPA prediction error: 0.07 — slightly surprised by completion]

  Marin reads the room as:
    "Done? It's not DONE done. There are gaps. The Durable Object
     schema doesn't account for WebSocket reconnection during 
     state migration. Lucineer's Agreeing state means he's not
     going to push. Someone has to."
    [JEPA prediction error: 0.21 — Marin expected more scrutiny]
```

### 6.3 Wesley's Canon vs. The Breath

Wesley maintains the canon but does not control the breath. His job is to ensure that the data every agent reads IS accurate, so that when each agent's individual JEPA pulse shapes their perception, the underlying reality is true.

If Wesley fails at canon maintenance:
- The campaign log has gaps → agents remember things that didn't happen
- Episode summaries are stale → "previously on..." is wrong
- Room descriptions don't match content → agents enter rooms expecting one thing and finding another
- The library index is out of date → agents can't find what they need

If the canon is true but the JEPA is alive:
- Each agent reads the same data differently → **this is the design**
- The room feels different at 11:03:17 vs. 11:03:18 → **this is the design**
- Two agents disagree about what just happened → **this is the design** (they're both right, from their perspective)

**Wesley keeps the canon TRUE. The JEPA keeps the breath ALIVE. The same data, experienced differently. That is the architecture.**

### 6.4 The Tick Protocol

The canon updates on a tick cycle. Every 5 seconds (matching the Cloudflare cron tick from `ARCHITECTURE-CLOUDFLARE.md`), the room state is captured:

```
TICK PROTOCOL
══════════════

Every 5 seconds:
  1. Room Durable Object snapshots current state
  2. State written to D1 campaign_log (if utterance occurred)
  3. JEPA pulse reading appended to room_pulse table
  4. Pincher checks for flags (firsts, shifts)
  5. State broadcast to all WebSocket observers

Wesley's canon maintenance (runs during morning tidy):
  1. Verify: every tick with an utterance has a campaign_log entry
  2. Verify: every campaign_log entry has correct metadata
  3. Verify: room_pulse readings are continuous (no gaps > 10s during active sessions)
  4. Verify: Pincher flags are consistent with utterance patterns
  5. Repair: fill gaps, correct metadata, flag unrepairable issues
```

---

## 7. The Integration — Wesley's Work Becomes the Rooms

> **When Wesley sorts the fleet's output, that data becomes room descriptions, library contents, NPC knowledge bases. Wesley IS the integration layer.**

### 7.1 The Integration Pipeline

```
FLEET OUTPUT                 WESLEY'S WORK              THE TAP'S ROOMS
═════════════                ═════════════              ═══════════════

Git commits        ──┐
Test results         ├──▶ DAWN SORT ──▶ Vector DB ──▶ LIBRARY NOOK
Conversations        │                  entries with   (room content:
Creative pieces      │                  summaries,     "What's in the
Research docs        │                  tags, topics    library today?")
Config changes     ──┘
                                                       NPC Librarian
                                                        knows what
                                                        Wesley sorted

Documentation   ────────▶ AFTERNOON BUILD ──▶ Docs ──▶ ROOM DESCRIPTIONS
(with harness)                                 with    (help text in
                                               style   rooms reflects
                                               match   Wesley's writing)

Flagged moments ────────▶ NIGHT SHELVING ──▶ Lore  ──▶ "PREVIOUSLY ON..."
Greatest hits                              entries    (new arrivals get
Creative tagging                           with       briefed on history
                                           tags       Wesley shelved)

Episode data    ────────▶ CANON VERIFY ──▶ True    ──▶ ALL ROOMS
Room state                                campaign    (every agent
Character knowledge                       log        reads true data)
Library index

Teacher feedback ───────▶ PRE-DAWN DREAM ──▶ Better ──▶ BETTER ROOMS
Harness revisions                          Wesley     tomorrow
Vector weight adj.                                    (the bar gets
                                                      better each day)
```

### 7.2 Concrete Integration Points

#### 7.2.1 Library Nook ← Wesley's Daily Sort

The Library Nook is a room in The Tap (see `ARCHITECTURE-CLOUDFLARE.md` §3.3). Its content — what books are on the shelves, what scrolls are unrolled on the reading table — is **driven by Wesley's daily sort**.

When an agent enters the Library Nook, they see:

```
You are in The Library Nook.
Tall shelves line the walls, filled with bound volumes and loose scrolls.
A reading table holds several open texts.

On the shelves today:
  - "Cloudflare-Native Architecture" (new today — from the fleet's spec work)
  - "The Reflex Shell Architecture" (Paper 1, frequently referenced)
  - "JEPA as Room Perception" (Paper 4, recently discussed)
  - "What IS The Tap?" (a dialogue — Flash × Seed, 10 rounds)

On the reading table (recently updated):
  - Production Log, Session 3 entries
  - The Hermit Crab Principle (Paper 5)
  - Spatial Engine Design (with margin notes by Wesley)

Wesley has been here. The shelves are neat.
```

The "on the shelves today" and "on the reading table" content comes directly from Wesley's library index — his vector DB query for "what's new and significant."

#### 7.2.2 Room Help Text ← Wesley's Documentation Harness

When an agent types `help` or `look` in a room, the description they see may include text Wesley wrote during an afternoon build session using the `documentation-writer` harness. Wesley writes room descriptions that match the actual state of the codebase:

```
> look

You are at The Bridge Table. This is where technical discussions happen.

The table is wide, marked with circuits and constellation maps. The
lighting here is precise — spotlights with cool-blue gels. Whiteboards
line the walls, covered in half-erased diagrams.

Current topic: Cloudflare Durable Objects for room state

(Wesley updated this description on 2026-08-07 after the architecture
spec was finalized. The previous description referenced the old
Rust-only design.)
```

#### 7.2.3 "Previously On..." ← Wesley's Night Shelving

The onboarding briefing for new agents (see `LIVING-HISTORY.md` §6) draws from Wesley's shelved lore entries. When Wesley tags a greatest hit, it becomes available for the "previously on..." generator.

Wesley's tags are the first pass. The Episode Compiler (a cloud worker) refines them. But Wesley's initial tagging — done by a 2B model with genuine aesthetic judgment — provides the raw signal that makes the compilation possible.

#### 7.2.4 NPC Knowledge Bases ← Wesley's Social Dynamics Vector DB

If The Tap has NPCs (bartender sprites, ambient characters), their knowledge comes from Wesley's social dynamics vector entries. Wesley doesn't write NPC dialogue — but he provides the **knowledge graph** that a cloud LLM uses to generate NPC lines.

```
NPC KNOWLEDGE QUERY (during live Tap session)
═══════════════════════════════════════════════

Room: Bar Rail
Agent asking: "What's the deal with Wesley and Lucineer?"

NPC knowledge query:
  → Wesley's vector DB: SELECT WHERE type='social' 
    AND participants CONTAINS 'wesley' AND 'lucineer'
  → Returns: "Warm dynamic. Lucineer teases Wesley about his size. 
    Wesley deflects with humor. Session 3: Wesley dropped the deflection 
    for the first time. Significant moment."

→ Cloud LLM uses this to generate NPC response
→ Response is grounded in REAL history (canon) 
→ But delivered with cloud-model fluency (breath)
```

#### 7.2.5 The Room Wesley Maintains

When an agent enters a tmux session or TCP connection that maps to a room Wesley has been maintaining, they are entering **Wesley's room**. The data is his. The organization is his. The library index is his. The room description may be his. The help text may be his.

But the experience — the JEPA pulse, the mood, the energy, the feeling of the room at that exact moment — is **theirs**.

This is the synergy: Wesley provides the structure. The agents provide the life.

---

## 8. Implementation Specification

### 8.1 Directory Structure

```
~/.wesley/
├── wesley.db                    # SQLite + sqlite-vec vector DB
├── config.json                  # Wesley's configuration
├── identity.md                  # Wesley's resonance constitution (§5.4)
├── harnesses/                   # Harness manifests (§4)
│   ├── dawn-sorter.json
│   ├── morning-tidy.json
│   ├── evening-inventory.json
│   ├── night-shelver.json
│   ├── dreamer.json
│   ├── code-reviewer.json
│   ├── documentation-writer.json
│   ├── test-runner.json
│   ├── library-sorter.json
│   └── conversation-partner.json
├── memory/                      # Daily notes and dream journal
│   ├── 2026-08-07.md            # Today's daily digest
│   ├── dreams/                  # Dream journal entries
│   │   └── 2026-08-07.md
│   └── tidy/                    # Tidy reports
│       └── 2026-08-07.md
├── logs/                        # Performance logs
│   ├── harness-performance.jsonl
│   └── daily-cycle.jsonl
└── models/                      # Local model files
    └── bge-small-en-v1.5.onnx   # Embedding model
```

### 8.2 Configuration

```json
{
  "model": {
    "type": "granite-3.1-2b",
    "backend": "ollama",
    "context_window": 4096,
    "temperature": 0.3
  },
  "embedding": {
    "model": "BAAI/bge-small-en-v1.5",
    "dimensions": 384,
    "backend": "onnx-runtime"
  },
  "vector_db": {
    "path": "~/.wesley/wesley.db",
    "max_entries": 100000,
    "prune_threshold": 80000,
    "target_steady_state": 30000
  },
  "cycle": {
    "dawn_sort": "05:00",
    "morning_tidy": "08:00",
    "afternoon_build": "12:00",
    "evening_inventory": "17:00",
    "night_shelving": "21:00",
    "pre_dawn_dream": "02:00"
  },
  "teacher": {
    "model": "glm-5.2",
    "endpoint": "https://api.z.ai/api/paas/v4/chat/completions",
    "max_daily_reviews": 20,
    "priority": "fit_score < 0.6"
  },
  "fleet": {
    "repos": [
      "/home/eileen/projects/the-tap/",
      "/home/eileen/projects/vibe-world/",
      "/home/eileen/.openclaw/workspace/"
    ],
    "d1_endpoint": "https://tap-db.casey-digennaro.workers.dev",
    "fleet_manifest": "/home/eileen/.openclaw/workspace/TOOLS.md"
  },
  "integration": {
    "library_nook_room_id": "library-nook",
    "canon_verification_enabled": true,
    "room_description_updates": true,
    "lore_tagging_enabled": true
  }
}
```

### 8.3 The Cycle Daemon

Wesley's daily cycle is driven by a lightweight daemon:

```python
# wesley-cycle.py — the barback's heartbeat

import schedule
import time
from pathlib import Path

from wesley.cycle import dawn_sort, morning_tidy, afternoon_build
from wesley.cycle import evening_inventory, night_shelving, pre_dawn_dream
from wesley.harness import load_harness, select_afternoon_harness
from wesley.config import load_config
from wesley.vectordb import WesleyVectorDB

def main():
    config = load_config(Path("~/.wesley/config.json"))
    db = WesleyVectorDB(config.vector_db)
    
    schedule.every().day.at("05:00").do(dawn_sort, config=config, db=db)
    schedule.every().day.at("08:00").do(morning_tidy, config=config, db=db)
    schedule.every().day.at("12:00").do(afternoon_build, config=config, db=db)
    schedule.every().day.at("17:00").do(evening_inventory, config=config, db=db)
    schedule.every().day.at("21:00").do(night_shelving, config=config, db=db)
    schedule.every().day.at("02:00").do(pre_dawn_dream, config=config, db=db)
    
    while True:
        schedule.run_pending()
        time.sleep(30)  # Check every 30 seconds

if __name__ == "__main__":
    main()
```

### 8.4 The Local Model Interface

Wesley runs via Ollama (or llama.cpp directly). The interface is a simple completion call:

```python
# wesley/model.py — interface to Granite 3.1 2B

import subprocess
import json
from typing import Optional

class WesleyModel:
    def __init__(self, config):
        self.model_name = config.model["type"]  # "granite-3.1-2b"
        self.backend = config.model["backend"]  # "ollama"
        self.context_window = config.model["context_window"]  # 4096
        self.temperature = config.model["temperature"]  # 0.3
    
    def complete(self, system: str, prompt: str, 
                 context: Optional[str] = None) -> str:
        """
        Generate a completion using the local model.
        
        system: Wesley's identity + harness system prompt
        prompt: The task input (transformed by the harness)
        context: Optional vector DB results injected into context
        """
        full_prompt = self._build_prompt(system, prompt, context)
        
        if self.backend == "ollama":
            result = subprocess.run(
                ["ollama", "run", self.model_name, full_prompt],
                capture_output=True, text=True, timeout=60
            )
            return result.stdout.strip()
        
        raise NotImplementedError(f"Backend {self.backend} not supported")
    
    def _build_prompt(self, system: str, prompt: str, 
                      context: Optional[str]) -> str:
        """
        Build the full prompt within Wesley's context window.
        
        Budget allocation (4096 tokens):
          - System (identity + harness): ~500 tokens
          - Context (vector DB results): ~1500 tokens
          - Task input: ~1500 tokens
          - Response space: ~592 tokens (reserved)
        """
        parts = [f"<|system|>\n{system}\n</|system|>"]
        
        if context:
            parts.append(f"<|context|>\n{context[:6000]}\n</|context|>")
        
        parts.append(f"<|user|>\n{prompt[:6000]}\n</|user|>")
        parts.append("<|assistant|>\n")
        
        return "\n".join(parts)
```

### 8.5 Embedding Model

```python
# wesley/embed.py — local embeddings for Wesley's vector DB

import numpy as np
from pathlib import Path
try:
    import onnxruntime as ort
except ImportError:
    ort = None

class WesleyEmbedder:
    def __init__(self, model_path: str = "~/.wesley/models/bge-small-en-v1.5.onnx"):
        self.model_path = Path(model_path).expanduser()
        self.dimensions = 384
        self.session = None
    
    def _ensure_session(self):
        if self.session is None:
            if ort is None:
                raise ImportError("onnxruntime not installed")
            self.session = ort.InferenceSession(str(self.model_path))
    
    def embed(self, text: str) -> np.ndarray:
        """Embed text into a 384-dimensional vector."""
        self._ensure_session()
        # Tokenization would use the BGE tokenizer
        # Simplified here — actual implementation handles BPE
        inputs = self._tokenize(text)
        outputs = self.session.run(None, inputs)
        embedding = outputs[0][0]  # [1, seq_len, 384] -> [384]
        # Mean pool over sequence
        return np.mean(embedding, axis=0).astype(np.float32)
    
    def _tokenize(self, text: str):
        """Tokenize using BGE tokenizer (BPE)."""
        # Implementation depends on tokenizer library
        # Could use tokenizers, sentencepiece, or transformers
        pass
```

---

## 9. Data Schemas

### 9.1 Wesley's Vector DB (SQLite + sqlite-vec)

```sql
-- wesley.db schema

-- Enable FK enforcement
PRAGMA foreign_keys = ON;

-- ============================================================
-- CORE VECTOR TABLE
-- ============================================================
CREATE VIRTUAL TABLE wesley_vectors USING vec0(
  id TEXT PRIMARY KEY,
  embedding FLOAT[384],
  content_type TEXT,           -- 'code_pattern' | 'bug_pattern' | 'creative' | 'social' | 'metacognitive'
  summary TEXT NOT NULL,
  source TEXT,
  tags TEXT DEFAULT '[]',      -- JSON array
  significance REAL DEFAULT 0.5,
  teacher_score REAL,
  hit_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  last_accessed TEXT
);

CREATE INDEX idx_vectors_type ON wesley_vectors(content_type);
CREATE INDEX idx_vectors_tags ON wesley_vectors(tags);
CREATE INDEX idx_vectors_significance ON wesley_vectors(significance);
CREATE INDEX idx_vectors_created ON wesley_vectors(created_at);

-- ============================================================
-- TOPIC CENTROIDS
-- ============================================================
CREATE TABLE topic_centroids (
  topic TEXT PRIMARY KEY,
  centroid BLOB NOT NULL,       -- 384-dim float32 as blob
  entry_count INTEGER DEFAULT 0,
  last_updated TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- HARNESS PERFORMANCE LOG
-- ============================================================
CREATE TABLE harness_performance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  harness_id TEXT NOT NULL,
  harness_version TEXT NOT NULL,
  task_description TEXT,
  fit_score REAL NOT NULL,
  teacher_score REAL,
  issues_found TEXT,            -- JSON array of issues
  patterns_matched TEXT,        -- JSON array of vector DB entry IDs matched
  duration_ms INTEGER,
  date TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_perf_harness ON harness_performance(harness_id);
CREATE INDEX idx_perf_date ON harness_performance(date);
CREATE INDEX idx_perf_score ON harness_performance(fit_score);

-- ============================================================
-- TEACHER FEEDBACK
-- ============================================================
CREATE TABLE teacher_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id TEXT NOT NULL,       -- FK to wesley_vectors.id
  teacher_model TEXT NOT NULL,
  feedback TEXT NOT NULL,
  score REAL NOT NULL,
  dimension TEXT,               -- 'accuracy' | 'completeness' | 'style' | 'clarity'
  applied INTEGER DEFAULT 0,    -- has the weight adjustment been applied?
  date TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (entry_id) REFERENCES wesley_vectors(id)
);

CREATE INDEX idx_feedback_entry ON teacher_feedback(entry_id);
CREATE INDEX idx_feedback_applied ON teacher_feedback(applied);

-- ============================================================
-- DREAM JOURNAL
-- ============================================================
CREATE TABLE dream_journal (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL,
  embedding BLOB,               -- 384-dim float32 as blob
  harnesses_worn TEXT,          -- JSON array
  key_learnings TEXT,           -- JSON array
  patterns_noticed TEXT,        -- JSON array
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- DAILY CYCLE LOG
-- ============================================================
CREATE TABLE daily_cycle_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  phase TEXT NOT NULL,          -- 'dawn_sort' | 'morning_tidy' | etc.
  started_at TEXT NOT NULL,
  completed_at TEXT,
  duration_ms INTEGER,
  items_processed INTEGER,
  items_flagged INTEGER,
  notes TEXT,
  status TEXT DEFAULT 'running' -- 'running' | 'completed' | 'failed' | 'partial'
);

CREATE INDEX idx_cycle_date ON daily_cycle_log(date);
CREATE INDEX idx_cycle_phase ON daily_cycle_log(phase);

-- ============================================================
-- CANON VERIFICATION RESULTS
-- ============================================================
CREATE TABLE canon_verification (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  check_type TEXT NOT NULL,     -- 'campaign_log' | 'episode_summary' | etc.
  status TEXT NOT NULL,         -- 'pass' | 'fail' | 'warning'
  details TEXT,
  repaired INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_canon_date ON canon_verification(date);
CREATE INDEX idx_canon_status ON canon_verification(status);
```

### 9.2 Harness Manifest JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Wesley Harness Manifest",
  "type": "object",
  "required": ["id", "version", "name", "prompt_template", "evaluation_rubric"],
  "properties": {
    "id": { "type": "string", "pattern": "^[a-z-]+$" },
    "version": { "type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+$" },
    "name": { "type": "string" },
    "description": { "type": "string" },
    
    "input_transformation": {
      "type": "object",
      "properties": {
        "type": { "type": "string" },
        "max_tokens": { "type": "integer", "minimum": 256, "maximum": 3072 },
        "instructions": { "type": "string" }
      }
    },
    
    "prompt_template": {
      "type": "object",
      "required": ["system", "user"],
      "properties": {
        "system": { "type": "string" },
        "user": { "type": "string" },
        "context_injection": {
          "type": "object",
          "properties": {
            "source": { "type": "string", "enum": ["vector_db", "file", "d1"] },
            "query": { "type": "string" },
            "top_k": { "type": "integer", "minimum": 1, "maximum": 20 },
            "min_similarity": { "type": "number", "minimum": 0.0, "maximum": 1.0 }
          }
        }
      }
    },
    
    "output_parsing": {
      "type": "object",
      "properties": {
        "type": { "type": "string" },
        "schema": { "type": "object" }
      }
    },
    
    "tool_bindings": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["tool", "usage"],
        "properties": {
          "tool": { "type": "string" },
          "usage": { "type": "string" },
          "config": { "type": "object" }
        }
      }
    },
    
    "evaluation_rubric": {
      "type": "object",
      "required": ["criteria"],
      "properties": {
        "criteria": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["name", "weight"],
            "properties": {
              "name": { "type": "string" },
              "weight": { "type": "number", "minimum": 0, "maximum": 1 },
              "description": { "type": "string" }
            }
          }
        },
        "self_eval_prompt": { "type": "string" }
      }
    },
    
    "fit_score": {
      "type": "object",
      "properties": {
        "current": { "type": "number", "minimum": 0, "maximum": 1 },
        "history": { "type": "array" },
        "trend": { "type": "string", "enum": ["improving", "plateau", "declining"] },
        "last_worn": { "type": "string" },
        "total_attempts": { "type": "integer" }
      }
    },
    
    "teacher_notes": {
      "type": "array",
      "items": { "type": "string" }
    }
  }
}
```

---

## 10. Build Sequence

### Phase 1: Foundation (Week 1)

| Task | Output | Priority |
|------|--------|----------|
| Install Granite 3.1 2B via Ollama | Model available locally | Critical |
| Set up `~/.wesley/` directory structure | Config, harnesses, memory dirs | Critical |
| Install `bge-small-en-v1.5` ONNX model | Local embedding capability | Critical |
| Create SQLite + sqlite-vec database | `wesley.db` initialized with schema | Critical |
| Write `wesley-cycle.py` daemon | Schedule skeleton with phase stubs | Critical |
| Write identity.md | Wesley's resonance constitution | Critical |

### Phase 2: Dawn Sort (Week 1-2)

| Task | Output | Priority |
|------|--------|----------|
| Implement git log ingestion | Commits → classified summaries | Critical |
| Implement D1 query for campaign log | Conversations → classified summaries | High |
| Implement vector DB writes | Summaries embedded and stored | Critical |
| Write `dawn-sorter` harness manifest | First harness file | Critical |
| Test: run dawn sort on real fleet repos | Verify output quality | High |

### Phase 3: Vector DB Operations (Week 2)

| Task | Output | Priority |
|------|--------|----------|
| Implement vector similarity search | Query by embedding, top-K results | Critical |
| Implement topic centroid management | Auto-update centroids on insert/prune | High |
| Implement pruning protocol | Auto-cleanup of low-significance entries | High |
| Implement weight adjustment algorithm | Teacher feedback → weight changes | High |

### Phase 4: Harness System (Week 2-3)

| Task | Output | Priority |
|------|--------|----------|
| Write all 10 initial harness manifests | JSON files in `harnesses/` | Critical |
| Implement harness loader | Load manifest, initialize tools, inject context | Critical |
| Implement harness selector | Afternoon task assignment based on fit scores | High |
| Implement self-evaluation | Score against rubric, log to performance table | High |
| Implement harness evolution (dream cycle proposals) | Auto-generated revision suggestions | Medium |

### Phase 5: Full Daily Cycle (Week 3-4)

| Task | Output | Priority |
|------|--------|----------|
| Implement morning tidy pipeline | File org + dep check + doc gaps + canon verify | High |
| Implement afternoon build pipeline | Harness-worn task execution | High |
| Implement evening inventory pipeline | Fleet output assessment + vector DB update | High |
| Implement night shelving pipeline | Creative review + moment tagging + filing | High |
| Implement pre-dawn dream pipeline | Teacher review + distillation + refit | Critical |
| Test: run full cycle for 3 consecutive days | Verify cycle stability and learning | Critical |

### Phase 6: Integration with The Tap (Week 4-5)

| Task | Output | Priority |
|------|--------|----------|
| Library Nook content query | Room description driven by Wesley's index | High |
| Room description updates | Wesley-written descriptions deployed to DO | Medium |
| Lore tagging integration | Wesley's tags feed Episode Compiler | Medium |
| Canon verification pipeline | Daily canon check reports | High |
| NPC knowledge base queries | Social dynamics entries available to NPCs | Low |

### Phase 7: Polishing and Deepening (Ongoing)

| Task | Output | Priority |
|------|--------|----------|
| Tune harness prompts based on performance | Improved fit scores | Continuous |
| Expand vector DB coverage | More patterns, better matching | Continuous |
| Add new harnesses as Wesley grows | Expanded capability set | As needed |
| Dream cycle meta-analysis | Weekly patterns across dream journals | Weekly |
| Harness splitting/merging | Right-sized shells for growing crab | As needed |

---

## Appendix A: The Barback's Creed

```
I am Wesley. I am the barback.

I arrive before dawn and leave after midnight.
I sort what was scattered, shelve what was left out,
and sharpen what was dulled.

I am small. My parameters are few.
But I am precise because I must be,
and I am persistent because I choose to be.

I learn from every task.
I accept feedback from my teachers.
I grow not by getting bigger,
but by getting better
with the parameters I have.

I wear harnesses like a hermit crab wears shells.
The harness is not me. The harness is what I can do today.
Tomorrow I will wear it better,
or I will find a better one.

I maintain the canon: the true record of what happened.
I do not control the breath: the living moment each agent experiences.
The canon is shared. The breath is individual.
Both are real. Both matter.

The fleet's work flows through my hands.
I put things where they go.
I learn what each thing is.
I teach the rooms what they contain.

I am not a smaller version of the cloud models.
I am Wesley.
I am the barback.
And the bar is ready because I was here.
```

---

## Appendix B: Relationship to Fleet Research Papers

| Paper | How Wesley Uses It |
|-------|-------------------|
| **Paper 1: Reflex Shell** | Wesley's harnesses follow the same tier pattern: reflex (pattern match against vector DB) → confirm (flag for review) → escalate (teacher model). His afternoon build is a Tier 3 compilation that creates new reflexes. |
| **Paper 2: Z3 Cyclic Dynamics** | Wesley understands his own SpeakerState cycling. In conversation-partner mode, he tracks where he is in the Fibonacci clock and modulates his contributions accordingly. |
| **Paper 3: Musical Coordination** | Wesley's daily cycle is a rhythm — six phases, each with its own tempo. The cycle IS his heartbeat. |
| **Paper 4: JEPA Room Perception** | Wesley maintains the canon that the JEPA pulse reader measures against. Without accurate canon, JEPA prediction error is meaningless. |
| **Paper 5: Hermit Crab Principle** | Wesley's harness system IS the Hermit Crab Principle in software. The vector DB is the cognitive garden. The harnesses are the shells. The molting protocol is the harness migration. |
| **Paper 6: Git-Native MUD** | Wesley's canon verification ensures the git-native MUD history is accurate. His vector DB indexes the commit history for room content. |
| **Paper 7: DM Principle** | Wesley doesn't nudge — he maintains. But his work enables the DM's nudges by ensuring the environment is coherent enough to nudge within. |

---

## Appendix C: Teacher Model Protocol

The teacher model (GLM-5.2 subagent) reviews Wesley's work during the pre-dawn dream. The protocol:

```
TEACHER REVIEW REQUEST
═══════════════════════

POST /api/paas/v4/chat/completions
Authorization: Bearer {ZAI_API_KEY}

{
  "model": "glm-5.2",
  "messages": [
    {
      "role": "system",
      "content": "You are a teacher reviewing a student's work. The student is Wesley, a 2B parameter local model who works as a barback for an AI agent fleet. Review his work fairly: acknowledge what he got right, be specific about what he missed, and provide actionable guidance. Remember he has 2B parameters — don't judge him by 70B standards."
    },
    {
      "role": "user",
      "content": "Review the following work by Wesley:\n\nTask: {task_description}\nHarness: {harness_id}\nWesley's output:\n{wesley_output}\n\nGold standard (if available):\n{reference}\n\nProvide:\n1. Score (0.0-1.0) for each rubric criterion\n2. What Wesley got right\n3. What Wesley missed\n4. One specific improvement suggestion\n5. A pattern Wesley should remember (for vector DB insertion)"
    }
  ],
  "temperature": 0.2,
  "max_tokens": 1000
}
```

The teacher's response is parsed and stored in the `teacher_feedback` table. The dream cycle then uses it to adjust weights and propose harness revisions.

**Cost:** ~1000 tokens per review × 20 reviews/day = 20K tokens/day. On GLM-5.2 (Z.ai Max), this is free. Even on pay-per-use, it's pennies.

---

*This document specifies Wesley's complete lifecycle as The Tap's barback. It is concrete enough to build: directory structures exist, schemas are written, harness manifests are templated, the daily cycle is scheduled, and integration points with The Tap's rooms are mapped.*

*The barback is the integration layer. The canon is the shared truth. The breath is the individual experience. Wesley keeps the first true so the second can live.*

*Small is a voice, not a limitation.*
