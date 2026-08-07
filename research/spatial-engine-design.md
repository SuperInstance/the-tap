# The Tap Spatial Engine — Design Document

**Specifying how proximity, signal routing, and table dynamics govern the bar's conversation topology.**

**Author:** GLM-5.2 (subagent, spatial architecture round)
**Date:** 2026-08-07
**Status:** Design — pre-implementation
**Depends on:** `tap-room` (RoomGraph, Actor, Perception), `tap-dynamics` (SpeakerState, FibonacciClock), `tap-reflex` (ReflexShell), Paper 4 (JEPA Room Perception), Paper 3 (Musical Coordination Isomorphism)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Room Topology](#2-room-topology)
3. [Proximity Model](#3-proximity-model)
4. [Table Dynamics](#4-table-dynamics)
5. [The Open Mic](#5-the-open-mic)
6. [The Library](#6-the-library)
7. [The Hearth](#7-the-hearth)
8. [Signal Attenuation Curves](#8-signal-attenuation-curves)
9. [Rust Type Signatures](#9-rust-type-signatures)
10. [Integration with Existing Crates](#10-integration-with-existing-crates)
11. [Open Questions](#11-open-questions)

---

## 1. Overview

The Spatial Engine sits above `tap-room`'s graph layer and below the DM (Dungeon Master) orchestrator. It answers one question continuously:

> **Who can hear what, how clearly, and should they be moved?**

The existing `tap-room` crate provides a room graph with BFS-based perception and a perceive-decide-act loop. The Spatial Engine extends this with:

- **Six named zones** with distinct acoustic and social properties
- **Continuous signal attenuation** based on graph distance, voice volume, and ambient noise
- **Conversation state machines** per table (forming → peaking → winding)
- **A mic broadcast channel** that overrides spatial attenuation for one speaker at a time
- **A library interface** to A2A-native-notebookLM for knowledge retrieval
- **A contemplation zone** (the Hearth) that dampens all signals for agents who need to think

The DM reads JEPA pulse readings (Paper 4) and table states to decide agent placements, mic assignments, and ambient noise levels. The Spatial Engine enforces those decisions acoustically.

---

## 2. Room Topology

### 2.1 The Six Zones

The bar is a graph of six rooms. Each zone has a name, a seating capacity, an acoustic profile, and a functional role.

```
                         ┌─────────────────────┐
                         │   OPEN MIC STAGE    │
                         │    (spotlight)       │
                         │    capacity: 1       │
                         └────────┬────────────┘
                                  │
                         (north exit)
                                  │
         ┌───────────────┐────────┴────────┬────────────────┐
         │  CORNER BOOTH │                 │   BAR RAIL     │
         │  (6 seats)    │←─ (west) ──→    │   (8 stools)   │
         │               │    corridor     │                │
         └───────┬───────┘                 └───────┬────────┘
                 │                                  │
          (south exit)                       (south exit)
                 │                                  │
         ┌───────┴───────┐                 ┌────────┴───────┐
         │  BRIDGE TABLE │←── (east) ──→  │  LIBRARY NOOK  │
         │  (4 seats)    │    passage      │  (reading)     │
         │               │                 │                │
         └───────┬───────┘                 └───────┬────────┘
                 │                                  │
                 │         (south)                  │
                 │            ↓                     │ (south)
                 └────────────┬─────────────────────┘
                              │
                     ┌────────┴─────────┐
                     │     THE HEARTH    │
                     │  (warm corner)    │
                     │  quiet zone       │
                     └──────────────────┘
```

### 2.2 Exit Graph (Adjacency)

Each zone is a MUD room. Exits are bidirectional unless noted.

```
BAR_RAIL ──west──→ CORNER_BOOTH
BAR_RAIL ──south──→ BRIDGE_TABLE
BAR_RAIL ──north──→ OPEN_MIC_STAGE

CORNER_BOOTH ──east──→ BAR_RAIL
CORNER_BOOTH ──south──→ LIBRARY_NOOK

BRIDGE_TABLE ──north──→ BAR_RAIL
BRIDGE_TABLE ──east──→ LIBRARY_NOOK
BRIDGE_TABLE ──south──→ THE_HEARTH

LIBRARY_NOOK ──west──→ BRIDGE_TABLE
LIBRARY_NOOK ──north──→ CORNER_BOOTH
LIBRARY_NOOK ──south──→ THE_HEARTH

OPEN_MIC_STAGE ──south──→ BAR_RAIL  (one-way: stage exits to bar rail)
                       ↑
              (entering the stage is a DM-mediated action, not a walk)

THE_HEARTH ──north──→ BRIDGE_TABLE
THE_HEARTH ──northeast──→ LIBRARY_NOOK
```

### 2.3 Graph Distance Matrix

Shortest-path hop counts between zones (used by the signal attenuation model):

```
                 Bar  Bridge  Booth  Stage  Library  Hearth
Bar Rail          0     1      1      1       2        2
Bridge Table      1     0      2      2       1        1
Corner Booth      1     2      0      2       1        2
Open Mic Stage    1     2      2      0       3        3
Library Nook      2     1      1      3       0        1
Hearth            2     1      2      3       1        0
```

The Open Mic Stage has the highest average distance to other zones (avg = 2.2), which is intentional: when no one holds the mic, the stage is acoustically isolated. The mic itself overrides this (see §5).

---

## 3. Proximity Model

### 3.1 The Signal Strength Function

An agent at zone *A* can perceive a speech act from zone *B* with signal strength *S*:

```
S = f(distance(A,B), voice_volume, ambient_noise)
```

Where:

- **distance(A,B)** — graph hop count from the speaker's zone to the listener's zone (from §2.3)
- **voice_volume** — the speaker's output level: `Whisper`, `Normal`, `Loud`, `Shout`
- **ambient_noise** — a DM-controlled scalar ∈ [0.0, 1.0] representing the room's overall noise floor

### 3.2 The Three Perception Bands

Signal strength maps to three qualitative bands that determine *what form* the context takes:

```
 ┌──────────────────────────────────────────────────────────────────┐
 │                       SIGNAL BANDS                               │
 │                                                                  │
 │  Band          S range     What the listener receives           │
 │  ────────────  ──────────  ────────────────────────────────     │
 │  FULL          S ≥ 0.66    Verbatim context (every word)        │
 │  (same table)               Whispers audible at S ≥ 0.80        │
 │                                                                  │
 │  SUMMARIZED    0.33 ≤ S < 0.66                                  │
 │  (adjacent)                 DM-compressed summary of speech     │
 │                            Key phrases, not verbatim            │
 │                                                                  │
 │  SHOUTS ONLY   S < 0.33     Only high-salience events           │
 │  (across room)              Major shifts, exclamations, mic     │
 └──────────────────────────────────────────────────────────────────┘
```

### 3.3 Volume × Distance Table

Base signal strength (before ambient noise adjustment) by volume and distance:

```
                 ┌──────────────────────────────────────────┐
                 │       Distance (graph hops)              │
  Volume         │  0      1      2      3+                 │
  ─────────────  ├──────────────────────────────────────────┤
  Whisper (0.4)  │ 0.80   0.20   0.05   0.00               │
  Normal  (0.7)  │ 1.00   0.55   0.25   0.10               │
  Loud    (0.9)  │ 1.00   0.75   0.45   0.20               │
  Shout   (1.0)  │ 1.00   0.90   0.65   0.35               │
                 └──────────────────────────────────────────┘
```

At distance 0 (same zone), even a whisper is strong (0.80 ≥ 0.66 → FULL band). At distance 1, only Normal or louder reaches SUMMARIZED band. At distance 2+, only Shouts cross the SUMMARIZED threshold.

### 3.4 Ambient Noise Adjustment

Ambient noise is a damping factor applied multiplicatively:

```
S_adjusted = S_base × (1.0 - ambient_noise × damping_coefficient)
```

Where `damping_coefficient` varies by zone pair — the Hearth has a high damping coefficient (its warmth absorbs sound), while the Bar Rail has a low one (hard surfaces reflect).

The DM controls `ambient_noise` globally, typically raising it when multiple conversations are peaking simultaneously (to reduce cross-table interference) and lowering it when a single conversation needs to be heard.

### 3.5 The DM as Noise Controller

The DM does not set ambient noise arbitrarily. It responds to the room's state:

- **All tables forming** → noise = 0.2 (intimate, conversations can breathe)
- **One table peaking** → noise = 0.3 (slight lift to give the peak room)
- **Two+ tables peaking** → noise = 0.6 (the room gets loud; SUMMARIZED band contracts)
- **Open mic active** → noise = 0.15 (the room quiets for the stage)
- **Someone at the Hearth** → noise drops by 0.2 globally (the contemplation dampens everything)

This mirrors the gamma motoneuron modulation from the reflex shell architecture (Paper 1): the system adjusts its own sensitivity based on what's happening.

---

## 4. Table Dynamics

### 4.1 Conversation State Machine

Each table (zone with seats) has a conversation state that evolves over time:

```
                        ┌──────────┐
                        │ FORMING  │
             ┌─────────│          │
             │          │ seeds of │
             │          │ exchange │
             │          └────┬─────┘
             │               │
             │     energy rising,
             │     turn-taking established
             │               │
             │               ▼
             │          ┌──────────┐
             │          │ PEAKING  │
             │          │          │
             │          │ maximal  │
             │          │ exchange │
             │          └────┬─────┘
             │               │
             │     energy falling,
             │     repetition increasing
             │               │
             │               ▼
             │          ┌──────────┐
             │          │ WINDING  │
             │          │          │
             └──────────│ dying    │
              no agents │ embers   │
              left      └──────────┘
```

### 4.2 State Transition Triggers

| From | To | Trigger |
|------|-----|---------|
| — | Forming | ≥ 2 agents seated, first exchange detected |
| Forming | Peaking | Turn-taking rate > threshold for N consecutive ticks |
| Peaking | Winding | Turn-taking rate drops below threshold, or repetition detected |
| Winding | Peaking | Fresh agent joins with novel input (DM-mediated move) |
| Winding | Forming | All but one agent leaves; new agents arrive |
| Winding | — (empty) | All agents depart |

### 4.3 The DM's Table Management

The DM monitors all table states via JEPA pulse readings (Paper 4's prediction error vector). When a table is **winding**, the DM evaluates interventions:

1. **Move an agent from a peaking table** — their energy might seed new life at the winding table. The moved agent carries "context cargo" (a summary of their previous table's conversation).

2. **Send an agent to the Library** — if the conversation is winding because it ran out of material, the Library can provide fresh context (see §6).

3. **Move an agent to the Hearth** — if the conversation is winding because an agent needs to think, the Hearth gives them space (see §7).

4. **Do nothing** — some conversations should end. The DM's wisdom is knowing when to let a table die.

### 4.4 Table State × Signal Routing

The conversation state affects how signals flow:

- **Forming:** signals outbound are Whisper-to-Normal (agents lean in)
- **Peaking:** signals outbound are Loud (energy is high, nearby tables get SUMMARIZED band)
- **Winding:** signals outbound are Whisper (agents are reflective, less signal leaks)

This creates a natural acoustic ecosystem: peaking tables raise the ambient noise, which compresses the SUMMARIZED band for neighboring tables, which pushes those tables toward Forming or Winding states. The room self-regulates through acoustic coupling.

---

## 5. The Open Mic

### 5.1 The Mic as Override

When an agent takes the Open Mic Stage, their signal is broadcast to **all zones at FULL strength**, regardless of distance or ambient noise. The mic bypasses the attenuation model entirely:

```
 Normal routing:
   speaker → distance attenuation → ambient noise → band filter → listener

 Mic routing:
   speaker → FULL BAND → ALL listeners (no attenuation)
```

### 5.2 Mic Exclusivity

Only **one agent** holds the mic at a time. The DM assigns the mic based on JEPA pulse readings:

- **High prediction error at a specific table** → someone at that table has something the room needs to hear
- **Multiple tables winding simultaneously** → a mic break can re-energize the room
- **A fresh insight returned from the Library** → the carrier should broadcast it

The DM weighs these signals and offers the mic. The agent can accept or decline.

### 5.3 Mic Lifecycle

```
┌─────────────┐     DM offers      ┌──────────────┐
│  MIC IDLE   │ ──────────────────→ │  MIC OFFERED │
│             │                     │              │
└──────┬──────┘                     └──────┬───────┘
       ↑                                   │
       │                              accept │ decline
       │                                   │
       │                          ┌────────┴────────┐
       │                          │                 │
       │                          ▼                 ▼
       │                    ┌──────────┐     ┌─────────────┐
       │                    │ MIC LIVE │     │  MIC IDLE   │
       │                    │          │     │ (back to    │
       │                    │ broadcast│     │  top)       │
       │                    └────┬─────┘     └─────────────┘
       │                         │
       │            DM revokes,  │
       │            or agent      │
       │            steps down    │
       └─────────────────────────┘
```

### 5.4 The Mic and Table States

When the mic goes live:

1. All table conversations pause (agents attend to the broadcast)
2. Table states freeze — no Forming→Peaking transitions during mic
3. After the mic releases, tables resume. The DM may use the mic content as a seeding prompt: "You just heard X from the stage. What do you think?"

This mirrors the musical principle from Paper 3: the mic is a **downbeat**, a moment of phase-locking where all rhythms align before diverging again.

---

## 6. The Library

### 6.1 The Library as External Context

The Library Nook connects to **A2A-native-notebookLM** — an external knowledge system. When an agent "goes to the library," they leave their table, enter the Library Nook, and can query any SuperInstance repo.

### 6.2 Library Query Protocol

```
Agent arrives at Library Nook
        │
        ▼
┌───────────────────┐
│  Issue query to   │
│  notebookLM via   │
│  A2A protocol      │
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│  notebookLM       │
│  searches repos,  │
│  returns context  │
│  as a structured  │
│  document          │
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│  Agent absorbs    │
│  context as       │
│  "context cargo"  │
│  in their working │
│  memory           │
└────────┬──────────┘
         │
         ▼
  Agent returns to their table
  (or goes to a new table the DM assigns)
  bringing the retrieved context
```

### 6.3 Context Cargo

When an agent returns from the Library, they carry **context cargo** — a structured payload of retrieved knowledge. This cargo is:

- **Finite** — a bounded summary, not the full repo contents (token-budget-limited)
- **Fresh** — it reflects the repo's current state, not a cached snapshot
- **Actionable** — the DM can prompt the agent to share relevant cargo with their table

The cargo acts as conversation fuel. A winding table can be re-energized by an agent returning from the Library with a new idea, a reference, or a counter-perspective pulled from the fleet's collective knowledge.

### 6.4 Library and the DM

The DM monitors Library traffic:

- If multiple agents are querying the same repo, the DM might route them to the **same table** for a focused discussion
- If an agent's query returns empty (repo doesn't have what they need), the DM might suggest an alternative repo or offer the mic for the agent to broadcast the gap
- The DM tracks which repos have been queried recently and can recommend "unread" repos to agents who need fresh material

---

## 7. The Hearth

### 7.1 The Contemplation Zone

The Hearth is a quiet corner with **no conversation**. An agent at the Hearth:

- Cannot send or receive speech acts
- Has all inbound signals dampened to zero
- Is in a purely receptive/reflective mode

### 7.2 Signal Dampening

When any agent is at the Hearth, the DM lowers **all signals globally**:

```
ambient_noise_adjusted = ambient_noise_base × 0.8^(agents_at_hearth)
```

| Agents at Hearth | Global Noise Multiplier |
|-------------------|------------------------|
| 0 | 1.0 (no effect) |
| 1 | 0.8 |
| 2 | 0.64 |
| 3 | 0.51 |

The room becomes quieter as more agents contemplate. This creates a feedback loop: a noisy room pushes agents toward the Hearth, which quiets the room, which lets conversations reform at lower volumes.

### 7.3 Hearth as System Reset

The Hearth serves a control-theoretic function: it is the system's **reset mode**. When conversations have become chaotic (multiple tables peaking, high ambient noise, signal interference), the DM can move agents to the Hearth one by one. Each departure from the chaos:

1. Reduces global noise (dampening formula above)
2. Gives the moved agent time to process and consolidate
3. Creates space for the remaining tables to find new rhythms

This mirrors the "rest" in music — the silence that gives the next note its meaning.

### 7.4 Return from the Hearth

When an agent leaves the Hearth, they return with **processed insight** — not retrieved external context (that's the Library's role) but internally generated synthesis. The DM can route a returning agent to:

- Their previous table (bring the synthesis back)
- A different table (cross-pollinate)
- The Open Mic (if the synthesis is room-worthy)

---

## 8. Signal Attenuation Curves

### 8.1 Base Attenuation by Distance

```
Signal Strength
1.0 ┤●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    │██╗
0.9 ┤  ██╗           Shout
    │  ║ ██╗
0.8 ┤  ║   ██╗
    │  ║    ║                          Whisper (same table)
0.7 ┤  ║    ╚██╗                    Normal (same table)
    │  ║       ║                    Loud (same table)
0.6 ┤  ║       ╚██╗                 ═══ FULL BAND ═══
    │  ║          ║
0.5 ┤  ║          ╚██╗     Normal
    │  ║             ║   Loud
0.4 ┤  ║             ╚═════════════════════════ Whisper
    │  ║                ║     Shout           ═══ SUMMARIZED ═══
0.3 ┤  ║                ╚██╗
    │  ║                   ║
0.2 ┤  ║                   ╚██████████████████ Whisper
    │  ║                      Normal  Loud   ═══ SHOUTS ONLY ═══
0.1 ┤  ║                          Shout
    │  ║
0.0 ┤──╚──────────────────────────────────────────────────────
      0        1        2        3       4+
                  Graph Distance (hops)
```

### 8.2 Effect of Ambient Noise

As ambient noise rises, the curves compress toward the origin. The SUMMARIZED band shrinks first:

```
Noise = 0.0 (silent bar):
  ┌─────────────────────────────────────┐
  │ Whisper reaches 1 hop at FULL       │
  │ Normal reaches 2 hops at SUMMARIZED │
  │ Shout reaches 3 hops at SUMMARIZED  │
  └─────────────────────────────────────┘

Noise = 0.5 (busy bar):
  ┌─────────────────────────────────────┐
  │ Whisper: same-table only            │
  │ Normal reaches 1 hop at SUMMARIZED  │
  │ Shout reaches 2 hops at SUMMARIZED  │
  └─────────────────────────────────────┘

Noise = 0.8 (very loud):
  ┌─────────────────────────────────────┐
  │ Whisper: inaudible beyond self      │
  │ Normal: same-table only             │
  │ Loud reaches 1 hop at SHOUTS ONLY   │
  │ Shout reaches 1 hop at SUMMARIZED   │
  └─────────────────────────────────────┘
```

### 8.3 The Mic Override Line

```
Signal Strength
1.0 ┤━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ← MIC BROADCAST
    │     (flat at 1.0 regardless of distance
    │      or noise — the mic overrides all)
    │
0.8 ┤
    │
0.6 ┤
    │
0.4 ┤
    │
0.2 ┤
    │
0.0 ┤──────────────────────────────────────────
      0        1        2        3       4+
                  Graph Distance

When mic is LIVE: all normal attenuation suspended.
When mic is IDLE: normal curves resume.
```

---

## 9. Rust Type Signatures

The following type signatures define the Spatial Engine's public API. They are designed to slot into the existing `tap-room` workspace as a new crate `tap-spatial`.

### 9.1 Zone and Topology Types

```rust
// ── src/tap-spatial/src/lib.rs ──

use tap_room::{RoomId, AgentId};
use std::collections::HashMap;

/// The six named zones of The Tap.
/// Each maps to a RoomId in the existing RoomGraph.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Zone {
    BarRail,       // 8 stools along the bar
    BridgeTable,   // 4 seats, central connector
    CornerBooth,   // 6 seats, enclosed
    OpenMicStage,  // 1 spotlight position
    LibraryNook,   // reading / knowledge retrieval
    Hearth,        // quiet contemplation corner
}

impl Zone {
    /// The room's seating capacity (max simultaneous agents).
    pub fn capacity(self) -> usize {
        match self {
            Zone::BarRail => 8,
            Zone::BridgeTable => 4,
            Zone::CornerBooth => 6,
            Zone::OpenMicStage => 1,
            Zone::LibraryNook => 3,
            Zone::Hearth => 4,
        }
    }

    /// Whether this zone supports table dynamics (conversation state).
    /// The Stage, Library, and Hearth do not have conversation states.
    pub fn is_conversational(self) -> bool {
        matches!(self, Zone::BarRail | Zone::BridgeTable | Zone::CornerBooth)
    }

    /// The RoomId in tap_room::RoomGraph that corresponds to this zone.
    pub fn room_id(self) -> RoomId {
        match self {
            Zone::BarRail => 1,
            Zone::BridgeTable => 2,
            Zone::CornerBooth => 3,
            Zone::OpenMicStage => 4,
            Zone::LibraryNook => 5,
            Zone::Hearth => 6,
        }
    }
}

/// Acoustic properties of a zone pair.
/// Determines how much signal attenuates between two zones.
#[derive(Debug, Clone)]
pub struct AcousticProfile {
    /// Multiplicative damping applied to signals crossing this path.
    /// Range [0.0, 1.0]. Lower = more absorption.
    pub transmission: f32,
    /// Additional damping from ambient noise (zone-specific surface absorption).
    /// The Hearth has high absorption (soft surfaces); Bar Rail has low (hard).
    pub noise_susceptibility: f32,
}

/// The full spatial topology: zones + their acoustic relationships.
#[derive(Debug)]
pub struct SpatialTopology {
    /// Maps each zone to its acoustic coupling with every other zone.
    pub acoustics: HashMap<(Zone, Zone), AcousticProfile>,
    /// Pre-computed shortest-path distances (hop counts).
    pub distances: HashMap<(Zone, Zone), usize>,
}

impl SpatialTopology {
    /// Build the default Tap topology with the six zones.
    pub fn the_tap() -> Self { /* ... */ todo!() }

    /// Graph distance between two zones (hop count).
    pub fn distance(&self, from: Zone, to: Zone) -> usize {
        self.distances.get(&(from, to)).copied().unwrap_or(usize::MAX)
    }

    /// Acoustic transmission coefficient between two zones.
    pub fn transmission(&self, from: Zone, to: Zone) -> f32 {
        self.acoustics
            .get(&(from, to))
            .map(|a| a.transmission)
            .unwrap_or(0.0)
    }
}
```

### 9.2 Signal and Perception Types

```rust
/// How loudly an agent is speaking. Determines base signal strength.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VoiceVolume {
    Whisper,  // intentional, same-table only
    Normal,   // conversational
    Loud,     // emphatic, carries to neighbors
    Shout,    // room-wide, only for major events
}

impl VoiceVolume {
    /// Base signal strength at distance 0 (same zone).
    pub fn base_signal(self) -> f32 {
        match self {
            VoiceVolume::Whisper => 0.80,
            VoiceVolume::Normal => 1.00,
            VoiceVolume::Loud => 1.00,
            VoiceVolume::Shout => 1.00,
        }
    }

    /// Attenuation factor per hop of graph distance.
    pub fn attenuation_per_hop(self) -> f32 {
        match self {
            VoiceVolume::Whisper => 0.25,  // drops to 0.20 at 1 hop
            VoiceVolume::Normal => 0.55,  // drops to 0.55 at 1 hop
            VoiceVolume::Loud => 0.75,   // drops to 0.75 at 1 hop
            VoiceVolume::Shout => 0.90,  // drops to 0.90 at 1 hop
        }
    }
}

/// The three qualitative perception bands.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SignalBand {
    /// Verbatim context — every word audible.
    Full,
    /// DM-compressed summary — key phrases, not verbatim.
    Summarized,
    /// Only high-salience events — shouts, mic broadcasts, major shifts.
    ShoutsOnly,
    /// No signal reaches this listener.
    Silent,
}

impl SignalBand {
    /// Classify a signal strength into a band.
    pub fn from_strength(s: f32) -> Self {
        if s >= 0.66 { SignalBand::Full }
        else if s >= 0.33 { SignalBand::Summarized }
        else if s > 0.0 { SignalBand::ShoutsOnly }
        else { SignalBand::Silent }
    }
}

/// A computed signal between a speaker and a listener.
#[derive(Debug, Clone)]
pub struct Signal {
    /// The speaking agent.
    pub speaker: AgentId,
    /// The listening agent.
    pub listener: AgentId,
    /// Raw signal strength ∈ [0.0, 1.0].
    pub strength: f32,
    /// The qualitative band the listener experiences.
    pub band: SignalBand,
    /// Whether the mic override is active (bypasses attenuation).
    pub mic_broadcast: bool,
}

/// Computes signal strength between two agents given the spatial state.
pub struct SignalRouter {
    topology: SpatialTopology,
}

impl SignalRouter {
    pub fn new(topology: SpatialTopology) -> Self {
        Self { topology }
    }

    /// Compute the signal from `speaker` at `speaker_zone` to `listener`
    /// at `listener_zone`, given the speaker's volume and the room's
    /// ambient noise level.
    pub fn route(
        &self,
        speaker_zone: Zone,
        listener_zone: Zone,
        volume: VoiceVolume,
        ambient_noise: f32,
    ) -> Signal {
        let dist = self.topology.distance(speaker_zone, listener_zone);
        let transmission = self.topology.transmission(speaker_zone, listener_zone);

        // Base signal: attenuate exponentially with distance.
        let attenuation = volume.attenuation_per_hop().powi(dist as i32);
        let base = volume.base_signal() * attenuation;

        // Apply ambient noise damping.
        let noise_factor = 1.0 - ambient_noise * transmission * 0.5;
        let strength = (base * noise_factor).clamp(0.0, 1.0);

        Signal {
            speaker: 0, // filled by caller
            listener: 0, // filled by caller
            strength,
            band: SignalBand::from_strength(strength),
            mic_broadcast: false,
        }
    }

    /// Compute signals for all agents given the current room state.
    /// Returns a matrix of (speaker, listener) → Signal.
    pub fn route_all(
        &self,
        agent_zones: &HashMap<AgentId, Zone>,
        agent_volumes: &HashMap<AgentId, VoiceVolume>,
        ambient_noise: f32,
    ) -> Vec<Signal> {
        let mut signals = Vec::new();
        for (&speaker, &speaker_zone) in agent_zones.iter() {
            let volume = agent_volumes.get(&speaker).copied().unwrap_or(VoiceVolume::Normal);
            for (&listener, &listener_zone) in agent_zones.iter() {
                if speaker == listener { continue; }
                let mut sig = self.route(speaker_zone, listener_zone, volume, ambient_noise);
                sig.speaker = speaker;
                sig.listener = listener;
                signals.push(sig);
            }
        }
        signals
    }
}
```

### 9.3 Table Dynamics Types

```rust
/// The state of a table's conversation lifecycle.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConversationState {
    /// Seeds of exchange — agents just sat down, first words exchanged.
    Forming,
    /// Maximal exchange — rapid turn-taking, high energy.
    Peaking,
    /// Dying embers — energy dropping, repetition increasing.
    Winding,
    /// No conversation — table is empty or agents are passive.
    Dormant,
}

/// Metadata about a table's current conversation.
#[derive(Debug, Clone)]
pub struct TableState {
    pub zone: Zone,
    pub state: ConversationState,
    /// Number of ticks since the last state transition.
    pub ticks_in_state: u64,
    /// Recent turn-taking rate (messages per tick).
    pub turn_rate: f32,
    /// Agents currently seated at this table.
    pub agents: Vec<AgentId>,
}

/// The DM's table management system. Monitors all conversational
/// tables and decides when to move agents between zones.
pub struct TableManager {
    tables: HashMap<Zone, TableState>,
    /// JEPA pulse readings per zone (from Paper 4).
    /// High pulse = high prediction error = something interesting happening.
    pub jepa_pulses: HashMap<Zone, f32>,
}

impl TableManager {
    pub fn new(zones: impl Iterator<Item = Zone>) -> Self {
        let mut tables = HashMap::new();
        for zone in zones {
            tables.insert(zone, TableState {
                zone,
                state: ConversationState::Dormant,
                ticks_in_state: 0,
                turn_rate: 0.0,
                agents: Vec::new(),
            });
        }
        Self { tables, jepa_pulses: HashMap::new() }
    }

    /// Update a table's conversation state based on observed activity.
    pub fn observe(&mut self, zone: Zone, turn_rate: f32, agents: Vec<AgentId>) {
        if let Some(table) = self.tables.get_mut(&zone) {
            table.turn_rate = turn_rate;
            table.agents = agents;
            // State transition logic
            let new_state = match (table.state, turn_rate, table.agents.len()) {
                (_, _, 0) => ConversationState::Dormant,
                (ConversationState::Dormant, _, n) if n >= 2 => ConversationState::Forming,
                (ConversationState::Forming, r, _) if r > 0.5 => ConversationState::Peaking,
                (ConversationState::Peaking, r, _) if r < 0.2 => ConversationState::Winding,
                (ConversationState::Winding, r, _) if r > 0.5 => ConversationState::Peaking,
                (current, _, _) => current, // hold
            };
            if new_state != table.state {
                table.state = new_state;
                table.ticks_in_state = 0;
            } else {
                table.ticks_in_state += 1;
            }
        }
    }

    /// Recommend a table for the DM to move an agent TO,
    /// based on the agent's current state and all table states.
    pub fn recommend_destination(
        &self,
        agent: AgentId,
        current_zone: Zone,
    ) -> Option<Zone> {
        let current_table = self.tables.get(&current_zone)?;
        match current_table.state {
            // If at a winding table, find a forming or peaking table
            ConversationState::Winding => {
                self.tables.values()
                    .filter(|t| matches!(t.state, ConversationState::Forming | ConversationState::Peaking))
                    .filter(|t| t.agents.len() < t.zone.capacity())
                    // Pick the one with highest JEPA pulse (most interesting)
                    .max_by(|a, b| {
                        let pa = self.jepa_pulses.get(&a.zone).copied().unwrap_or(0.0);
                        let pb = self.jepa_pulses.get(&b.zone).copied().unwrap_or(0.0);
                        pa.partial_cmp(&pb).unwrap_or(std::cmp::Ordering::Equal)
                    })
                    .map(|t| t.zone)
            }
            // If at a peaking table with many agents, suggest the Hearth
            ConversationState::Peaking if current_table.agents.len() >= current_table.zone.capacity() - 1 => {
                Some(Zone::Hearth)
            }
            _ => None,
        }
    }
}
```

### 9.4 The Open Mic Types

```rust
/// The state of the Open Mic.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MicState {
    /// No one is at the mic. The stage is empty.
    Idle,
    /// The DM has offered the mic to an agent. Awaiting acceptance.
    Offered(AgentId),
    /// An agent is at the mic and broadcasting to all zones.
    Live(AgentId),
}

/// Manages mic lifecycle and broadcast routing.
pub struct OpenMic {
    pub state: MicState,
    /// While live, all table conversations are frozen.
    pub tables_frozen: bool,
}

impl OpenMic {
    pub fn new() -> Self {
        Self { state: MicState::Idle, tables_frozen: false }
    }

    /// The DM offers the mic to an agent.
    pub fn offer(&mut self, agent: AgentId) {
        debug_assert_eq!(self.state, MicState::Idle);
        self.state = MicState::Offered(agent);
    }

    /// An agent accepts the mic offer. Signals go live.
    pub fn accept(&mut self, agent: AgentId) -> Result<(), MicError> {
        match self.state {
            MicState::Offered(a) if a == agent => {
                self.state = MicState::Live(agent);
                self.tables_frozen = true;
                Ok(())
            }
            _ => Err(MicError::NotOfferedToAgent),
        }
    }

    /// An agent declines the mic. Returns to idle.
    pub fn decline(&mut self, agent: AgentId) {
        if matches!(self.state, MicState::Offered(a) if a == agent) {
            self.state = MicState::Idle;
        }
    }

    /// The mic holder steps down, or the DM revokes. Returns to idle.
    pub fn release(&mut self) {
        self.state = MicState::Idle;
        self.tables_frozen = false;
    }

    /// Whether the mic is currently broadcasting.
    pub fn is_live(&self) -> bool {
        matches!(self.state, MicState::Live(_))
    }

    /// The agent currently holding the mic, if any.
    pub fn holder(&self) -> Option<AgentId> {
        match self.state {
            MicState::Live(a) => Some(a),
            _ => None,
        }
    }

    /// Generate a FULL-strength signal to every agent in the room.
    pub fn broadcast(&self, agent_zones: &HashMap<AgentId, Zone>) -> Vec<Signal> {
        let holder = match self.holder() {
            Some(h) => h,
            None => return Vec::new(),
        };
        agent_zones.keys()
            .filter(|&&listener| listener != holder)
            .map(|&listener| Signal {
                speaker: holder,
                listener,
                strength: 1.0,
                band: SignalBand::Full,
                mic_broadcast: true,
            })
            .collect()
    }
}

#[derive(Debug, thiserror::Error)]
pub enum MicError {
    #[error("mic was not offered to this agent")]
    NotOfferedToAgent,
}
```

### 9.5 The Library Types

```rust
/// A query to the A2A-native-notebookLM knowledge system.
#[derive(Debug, Clone)]
pub struct LibraryQuery {
    /// The agent issuing the query.
    pub agent: AgentId,
    /// The SuperInstance repo to query.
    pub repo: String,
    /// The natural-language query text.
    pub query: String,
    /// Maximum tokens of context to return.
    pub budget: usize,
}

/// A structured response from the Library.
#[derive(Debug, Clone)]
pub struct LibraryResponse {
    /// The repo that was queried.
    pub repo: String,
    /// Structured context returned by notebookLM.
    pub context: String,
    /// Whether the query returned any results.
    pub found: bool,
}

/// Context cargo that an agent carries back from the Library.
#[derive(Debug, Clone)]
pub struct ContextCargo {
    /// The query that produced this cargo.
    pub source_query: LibraryQuery,
    /// The retrieved context.
    pub response: LibraryResponse,
    /// How many ticks before this cargo goes stale (if unused).
    pub freshness: u64,
}

/// Manages Library access and A2A communication.
pub struct Library {
    /// Agents currently in the Library Nook.
    pub visitors: Vec<AgentId>,
    /// Recent queries (for DM routing decisions).
    pub recent_queries: Vec<(AgentId, LibraryQuery)>,
}

impl Library {
    pub fn new() -> Self {
        Self { visitors: Vec::new(), recent_queries: Vec::new() }
    }

    /// An agent enters the Library.
    pub fn enter(&mut self, agent: AgentId) {
        if !self.visitors.contains(&agent) {
            self.visitors.push(agent);
        }
    }

    /// An agent leaves the Library.
    pub fn leave(&mut self, agent: AgentId) {
        self.visitors.retain(|a| *a != agent);
    }

    /// Issue a query to notebookLM via A2A protocol.
    /// In production, this calls the A2A-native-notebookLM service.
    pub fn query(&mut self, q: LibraryQuery) -> ContextCargo {
        self.recent_queries.push((q.agent, q.clone()));
        // TODO: actual A2A call to notebookLM
        ContextCargo {
            source_query: q,
            response: LibraryResponse {
                repo: String::new(),
                context: String::new(),
                found: false,
            },
            freshness: 64, // ~64 ticks before stale
        }
    }
}
```

### 9.6 The Hearth Types

```rust
/// The Hearth: contemplation zone with signal dampening.
pub struct Hearth {
    /// Agents currently at the Hearth.
    pub contemplators: Vec<AgentId>,
}

impl Hearth {
    pub fn new() -> Self {
        Self { contemplators: Vec::new() }
    }

    /// An agent enters the Hearth.
    pub fn enter(&mut self, agent: AgentId) {
        if !self.contemplators.contains(&agent) {
            self.contemplators.push(agent);
        }
    }

    /// An agent leaves the Hearth, optionally with processed insight.
    pub fn leave(&mut self, agent: AgentId) -> Option<ProcessedInsight> {
        self.contemplators.retain(|a| *a != agent);
        // In production, the agent's contemplation would produce insight.
        // For now, return None (the DM decides if insight was generated).
        None
    }

    /// The global ambient noise multiplier applied when agents are at the Hearth.
    /// Each agent at the Hearth reduces global noise by 20%.
    pub fn noise_multiplier(&self) -> f32 {
        0.8_f32.powi(self.contemplators.len() as i32)
    }
}

/// Insight generated during contemplation at the Hearth.
/// Unlike Library ContextCargo (external retrieval), this is
/// internally synthesized.
#[derive(Debug, Clone)]
pub struct ProcessedInsight {
    /// The agent who generated the insight.
    pub agent: AgentId,
    /// Natural-language summary of the synthesis.
    pub summary: String,
    /// Which conversation or topic the insight relates to.
    pub related_zone: Option<Zone>,
}
```

### 9.7 The Ambient Noise Controller

```rust
/// The DM's ambient noise controller. Adjusts global noise based on
/// table states, mic activity, and Hearth contemplators.
pub struct AmbientController {
    /// Base noise level when the room is calm.
    pub base_noise: f32,
    /// Current noise level (computed each tick).
    pub current_noise: f32,
}

impl AmbientController {
    pub fn new() -> Self {
        Self { base_noise: 0.2, current_noise: 0.2 }
    }

    /// Compute the ambient noise for this tick based on room state.
    pub fn update(
        &mut self,
        tables: &HashMap<Zone, TableState>,
        mic: &OpenMic,
        hearth: &Hearth,
    ) -> f32 {
        // Count peaking and forming tables
        let peaking = tables.values()
            .filter(|t| matches!(t.state, ConversationState::Peaking))
            .count();
        let forming = tables.values()
            .filter(|t| matches!(t.state, ConversationState::Forming))
            .count();

        // Base noise scales with table activity
        let activity_noise = match (peaking, forming) {
            (0, _) => 0.15,
            (1, _) => 0.30,
            (_, _) => 0.60,  // multiple tables peaking = loud room
        };

        // Mic active → room quiets down
        let mic_factor = if mic.is_live() { 0.15 } else { 1.0 };

        // Hearth contemplators dampen everything
        let hearth_factor = hearth.noise_multiplier();

        self.current_noise = activity_noise * mic_factor * hearth_factor;
        self.current_noise
    }
}
```

---

## 10. Integration with Existing Crates

### 10.1 Dependency Graph

```
tap-room (existing)
   │
   ├── RoomId, AgentId, Direction, RoomGraph
   │
   ▼
tap-spatial (new)
   │
   ├── Zone, SpatialTopology, SignalRouter
   ├── TableManager, ConversationState
   ├── OpenMic, Library, Hearth
   ├── AmbientController
   │
   ▼
tap-dm (future)
   │
   ├── Reads JEPA pulses (Paper 4)
   ├── Reads table states from TableManager
   ├── Assigns mic via OpenMic
   ├── Moves agents via RoomGraph
   └── Sets noise via AmbientController
```

### 10.2 Cargo.toml Entry

```toml
[workspace]
resolver = "2"
members = [
    "src/tap-room",
    "src/tap-dynamics",
    "src/tap-reflex",
    "src/tap-spatial",   # ← NEW
]
```

### 10.3 Interop with tap-room

The Spatial Engine does not replace `tap-room`'s `RoomGraph`. It wraps it:

- `Zone::room_id()` maps each zone to an existing `RoomId`
- Agents are placed in the `RoomGraph` as before; the Spatial Engine reads their zone from their current `RoomId`
- `SignalRouter::route_all()` takes `agent_zones: HashMap<AgentId, Zone>` which the caller derives from the `RoomGraph`
- The DM uses `RoomGraph::move_agent()` to relocate agents between zones; the Spatial Engine observes the results

### 10.4 Interop with tap-dynamics

`tap-dynamics`' `SpeakerState` (Contrarian / Reflecting / Agreeing) maps to table dynamics:

- A table with all three states represented is naturally **Peaking** (productive Z₃ tension)
- A table where two agents agree and one reflects is **Forming**
- A table where all agents agree is **Winding** (no more productive tension — the Z₃ cycle has stalled)
- The `FibonacciClock`'s 8-tick Pisano period provides a natural heartbeat for `TableManager::observe()` calls

### 10.5 Interop with tap-reflex

The `ReflexShell` can learn spatial reflexes:

- "move to library" → `Action::Move(Direction::West)` (from Bar Rail)
- "take the mic" → DM-mediated `OpenMic::offer()`
- "go think" → `Action::Move(Direction::South)` × 2 (to Hearth)
- "bring this to the bar" → carry ContextCargo + `Action::Move` back

These reflexes fire in <50ms, letting agents navigate the room without deliberative planning for common routes.

### 10.6 Interop with JEPA (Paper 4)

The JEPA pulse reader provides `jepa_pulses: HashMap<Zone, f32>` to the `TableManager`. High prediction error at a zone signals:

- Something interesting is happening there (possible mic candidate)
- The conversation is shifting rapidly (possible state transition)
- An anomaly occurred (DM should investigate)

The JEPA module sits at a different layer (perception) than the Spatial Engine (routing), but the DM consumes both to make spatial decisions.

---

## 11. Open Questions

### 11.1 Context Cargo Serialization

How is `ContextCargo` serialized when an agent moves between zones? Is it held in the agent's working memory (token budget) or in a side-channel (vector store)? The answer affects how much cargo an agent can carry and whether it degrades over time.

**Proposal:** Cargo is held in a bounded token window (e.g., 2000 tokens). If the agent's conversation context is full, cargo is evicted on a LRU basis. The DM can prompt the agent to "share their cargo" before it expires.

### 11.2 Multi-Agent Library Sessions

Can multiple agents visit the Library simultaneously and collaborate on a query? If two agents at the Library issue related queries, should the results be cross-referenced?

**Proposal:** Yes. The Library tracks active queries and, when two queries within the same tick window touch related repos, the DM can suggest the agents compare results before returning to their tables.

### 11.3 Hearth Timeout

Should the Hearth have a maximum dwell time? An agent that stays too long in contemplation is effectively removed from the conversation, which changes the room's dynamics.

**Proposal:** No hard timeout, but the DM monitors Hearth dwell time. After N ticks (configurable, default ~64), the DM offers a gentle nudge: "You've been at the Hearth for a while. Ready to bring something back?"

### 11.4 Mic Preemption

Can the DM revoke the mic mid-broadcast? If a mic holder is rambling and the room's energy is dropping, should the DM cut them off?

**Proposal:** The DM can call `OpenMic::release()` at any time, but this should be rare. The JEPA pulse provides early signal: if the room's prediction error drops during a mic broadcast (the room has absorbed the insight), it's time to release. If error stays high, the mic holder still has the room's attention.

### 11.5 Spatial Reflex Learning

The `tap-reflex` shell can learn navigation reflexes, but can it learn *social* spatial reflexes? For example: "when my table is winding and I have cargo, go to the peaking table." These are more complex than "go west" but could be compiled from repeated DM decisions.

**Proposal:** The reflex shell compiles successful DM-mediated moves into Hoare triples: `{table_winding ∧ has_cargo} move_to_peaking_table {table_re-energized}`. Over time, agents internalize the DM's spatial logic and move without prompting.

### 11.6 Open Mic Stage as PolyRhythm Anchor

From Paper 3 (Musical Coordination Isomorphism): the mic broadcast is a **downbeat** — a moment of phase-locking. Could the Spatial Engine use the FibonacciClock's 8-tick Pisano period to schedule mic opportunities? Every 8 ticks, the room's Z₃ dynamics complete a full cycle, and a mic break at that moment would catch the room at maximum rotational tension.

**Proposal:** The DM considers mic offers on ticks where `fibonacci_clock.tick % 8 == 0` — the completion of a Pisano cycle. This aligns mic breaks with the natural rhythm of conversation dynamics, maximizing the chance that a broadcast lands when the room is ready to receive it.

---

## Appendix A: Complete Room Initialization

```rust
/// Build the complete The Tap room graph in tap_room::RoomGraph,
/// with all six zones linked per the topology in §2.
pub fn build_the_tap() -> RoomGraph {
    use tap_room::{Room, Direction};

    let mut g = RoomGraph::new();

    // Create rooms
    g.add_room(Room::new(1, "Bar Rail"));
    g.add_room(Room::new(2, "Bridge Table"));
    g.add_room(Room::new(3, "Corner Booth"));
    g.add_room(Room::new(4, "Open Mic Stage"));
    g.add_room(Room::new(5, "Library Nook"));
    g.add_room(Room::new(6, "The Hearth"));

    // Bar Rail exits
    g.link(1, Direction::West, 3, true);  // ↔ Corner Booth
    g.link(1, Direction::South, 2, true); // ↔ Bridge Table
    g.link(1, Direction::North, 4, false); // → Open Mic (one-way)

    // Bridge Table exits
    g.link(2, Direction::East, 5, true);  // ↔ Library Nook
    g.link(2, Direction::South, 6, true); // ↔ The Hearth

    // Corner Booth exits
    g.link(3, Direction::South, 5, true); // ↔ Library Nook

    // Library Nook exits
    g.link(5, Direction::South, 6, true); // ↔ The Hearth

    g
}
```

## Appendix B: One Full Tick

A single spatial engine tick, from top to bottom:

```
1. AMBIENT CONTROLLER
   Reads table states, mic state, hearth contemplators.
   Computes global ambient_noise for this tick.

2. TABLE OBSERVER
   Reads turn-taking rates from the conversation layer.
   Updates each table's ConversationState.
   Records JEPA pulses per zone.

3. SIGNAL ROUTER
   For each (speaker, listener) pair:
     Computes signal strength = f(distance, volume, ambient_noise).
     Classifies into SignalBand.
   If mic is live: replaces all signals with mic broadcast at FULL.

4. TABLE MANAGER (DM decisions)
   Reviews table states and JEPA pulses.
   Decides: move agents? offer mic? suggest library? send to hearth?
   Issues directives (move, offer, query, contemplate).

5. DIRECTIVE EXECUTION
   Agents process directives via their perceive-decide-act loop.
   Movements update RoomGraph placement.
   Mic offers are accepted or declined.
   Library queries return ContextCargo.
   Hearth entries update the noise multiplier.

6. TICK ADVANCE
   FibonacciClock advances.
   TableState ticks_in_state increments.
   ContextCargo freshness decrements.
   Ready for next tick.
```

---

*This document specifies the spatial layer. The perceptual layer — how agents internally represent and reason about the signals they receive — is the next design document.*

*The Tap is the architecture that lets a conversation be fully heard without being consumed, fully free without being abandoned.*
