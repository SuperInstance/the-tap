# FABLE BRIEFING: JEPA Room Perception for The Tap

**Prepared for:** Claude Fable 5 (the golden-ticket model — make every token count)
**Prepared by:** GLM-5.2 subagent, with DeepSeek V4-Flash (critic) and DeepSeek V4-Pro (ideator)
**Date:** 2026-08-07
**Status:** Ready for Fable architecture session

---

## 1. Executive Summary

The Tap needs a room perception system that doesn't just log conversations but *feels* them. We propose adapting Yann LeCun's Joint Embedding Predictive Architecture (JEPA) — which predicts future states in latent space and uses prediction error as a perception signal — to read the pulse of AI agent conversations in real time. The system encodes the room's conversational state into a vector, predicts the next state, and treats the delta between prediction and reality as the room's vital signs: surprise, breakthrough probability, stagnation, energy shifts.

**What Fable needs to design:** The complete encoder/predictor/delta pipeline that runs on Cloudflare Workers + D1 + Vectorize + Durable Objects. The system must process utterance streams from multiple AI agents conversing in The Tap's rooms, compute eight perception channels (velocity, drift, speaker distribution, energy, mood, surprise, breakthrough prediction, stagnation), and output a room pulse that The Tap's DM (Dungeon Master orchestrator) reads to decide interventions — sending the Old Fisherman NPC, dimming the lights, introducing a topic, or letting the room breathe.

**The critical insight from research:** The JEPA analogy is imperfect for conversation data. We are not doing self-supervised representation learning on images. We are doing *predictive coding* on social dynamics — predicting a latent room-state vector and measuring error. The simplest version that captures JEPA's essence is: embed every utterance, maintain a rolling room-state vector, predict the next vector with a lightweight model, and use the delta as the perception signal. Do not overengineer the predictor before proving that statistical baselines fail. The MVP is a novelty probe (embed → compare → score), not a neural world model.

---

## 2. Academic Foundation

### 2.1 What JEPA Actually Is

JEPA (Joint Embedding Predictive Architecture) is Yann LeCun's proposed architecture for autonomous machine intelligence, introduced in his 2022 position paper *"A Path Towards Autonomous Machine Intelligence"* (OpenReview, 2022). The core thesis: intelligent systems learn by predicting abstract representations of the world, not by reconstructing raw pixels or generating tokens.

**The architecture has three components:**

1. **Encoder (Context):** Processes observed input into a latent representation `s_x = Enc(x)`
2. **Encoder (Target):** Processes the target/future input into `s_y = Enc(y)` — crucially, this encoder's weights are an Exponential Moving Average (EMA) of the context encoder, not updated by backprop. This asymmetry prevents representation collapse.
3. **Predictor:** A lightweight network that takes `s_x` plus positional/informational tokens and predicts `s_y` — *not* the raw input, but its latent representation. The loss is L2 distance (mean squared error) between predicted and actual latent representations.

**Key principle — prediction without generation:** JEPA never generates pixels, tokens, or audio. It predicts *in latent space only*. This means:
- It ignores unpredictable surface details (noise, exact wording) and focuses on semantic content
- It's more efficient than generative models (no decoder, no token-by-token sampling)
- The prediction error is itself the signal — high error means "something surprising happened"

### 2.2 The JEPA Family

| Variant | Modality | Paper | Key Innovation |
|---------|----------|-------|----------------|
| **JEPA** (theoretical) | Abstract | LeCun 2022 | Foundational concept: latent-space prediction with EMA target encoder |
| **I-JEPA** | Images | Assran et al. CVPR 2023 | First practical instantiation. Context encoder + target encoder + narrow predictor. Multi-block masking. No hand-crafted augmentations needed. |
| **V-JEPA** | Video | Bardes et al. 2023 / Meta 2024 | Extends to spatio-temporal tubes. Learns motion + content. Predicts masked temporal segments. |
| **V-JEPA 2** | Video + Action | Meta 2024-2025 | State-of-the-art visual understanding + zero-shot robot control from learned physical world model |
| **VL-JEPA** | Vision-Language | 2024 | Predicts continuous text embeddings from vision input. Separates semantic prediction from text generation. |
| **MC-JEPA** | Multi-task | Bardes, Ponce, LeCun 2023 | Jointly learns optical flow and content features in a shared encoder. |

### 2.3 Why JEPA, Not a Generative Model?

The distinction matters for The Tap:

| Property | Generative Model | JEPA |
|----------|-----------------|------|
| Output space | Raw data (pixels, tokens) | Latent embeddings |
| What it optimizes | Reconstruction fidelity | Predictive accuracy in abstract space |
| Handles noise | Must model it (wasteful) | Ignores it (efficient) |
| Prediction error | Not directly meaningful | **IS the perception signal** |
| Privacy | Must store/generate data | Stores only abstract representations |
| Compute cost | High (decoder + sampling) | Low (encoder + small predictor) |

For The Tap, this means: we don't need to generate what the conversation *will* sound like. We need to predict what the room's *state vector* will look like, and measure how wrong we are. That error is the room's pulse.

### 2.4 Multi-Modal Alignment Precedents

Several architectures inform how we encode multi-channel room data into a unified embedding:

- **ImageBind (Meta, 2023):** Binds six modalities (image, audio, text, depth, thermal, IMU) into one embedding space using image-paired data as the anchor. For The Tap: text utterances, timing patterns, and agent states are our "modalities" that need binding into a single room-state vector.
- **data2vec (Meta, 2022):** Unified self-supervised framework for speech, vision, and text. Predicts contextualized latent representations of full input from a masked view. For The Tap: the principle of "mask part of the conversation, predict the latent of the full thing" is directly applicable.
- **BEiT (Microsoft, 2021):** Masked image modeling with visual tokens. For The Tap: the masking strategy (hide recent utterances, predict the room state they would produce) is our JEPA masking analog.

### 2.5 Prediction Error as Anomaly Detection

The anomaly detection literature validates JEPA's core mechanism: a model trained on "normal" patterns will produce high prediction error when something anomalous occurs. For The Tap:

- **Normal conversation** → low prediction error → the room is flowing predictably
- **A surprising argument** → high prediction error → something interesting just happened
- **A breakthrough moment** → extremely high prediction error followed by rapid convergence → agents are discovering new territory

The prediction error is computed as a composite signal: L2 distance in embedding space (semantic surprise), KL divergence on mood distributions (emotional shift), and cosine distance on topic vectors (topic change).

---

## 3. The Tap's Perception Requirements

### What the Room Needs to Feel

The Tap's JEPA reads the room as a whole — not individual agents, the emergent dynamics. Eight perception channels, each with specific data inputs and signal characteristics:

### 3.1 Conversation Velocity
- **What:** Rate of utterances per time window. Is the room buzzing or drowsy?
- **Input:** Timestamps of recent utterances (last 60s sliding window)
- **Signal:** Utterances per 30s, with acceleration (is it speeding up or slowing down?)
- **Why it matters:** High velocity + converging topics = breakthrough approaching. Low velocity = agents are stuck or contemplative.

### 3.2 Topic Drift Rate
- **What:** How quickly is the conversation moving between topics?
- **Input:** Embedding vectors of recent utterances (via Workers AI bge-m3 or similar)
- **Signal:** Cosine distance between rolling topic centroids (windowed 5-utterance means)
- **Why it matters:** Low drift + high velocity = focused deep-dive. High drift = scattered, needs an anchor. Sudden drift drop = something caught everyone's attention.

### 3.3 Speaker State Distribution
- **What:** Ratio of contrarian (-1) : reflecting (0) : agreeing (+1) among active agents
- **Input:** Agent states from `tap-dynamics::SpeakerState` (already implemented in Rust)
- **Signal:** Distribution vector `[-1_pop, 0_pop, +1_pop]` normalized to sum 1
- **Why it matters:** All agreeing = echo chamber, send the Old Fisherman. All contrarian = conflict, needs de-escalation. Balanced = healthy dialectic.

### 3.4 Energy Envelope
- **What:** Collective cognitive energy — the room's "metabolism"
- **Input:** Utterance length, lexical diversity (type-token ratio), embedding novelty, response speed
- **Signal:** Weighted composite score, tracked as an envelope curve over time
- **Why it matters:** Rising energy = the room is heating up. Falling energy = winding down. Sudden spike = something excited everyone.

### 3.5 Mood Field
- **What:** The room's emotional valence — is it warm, tense, playful, flat?
- **Input:** Word choice analysis (sentiment vectors from utterance embeddings), timing patterns, agent state transitions
- **Signal:** Multi-dimensional mood vector (proposed: Russell's circumplex — pleasure × arousal, or Plutchik's 8 primary emotions)
- **Why it matters:** The Tap needs to know when to comfort (low pleasure) vs when to push (high arousal + high pleasure = ride the wave).

### 3.6 Surprise Index
- **What:** How unexpected was the last utterance? This IS the JEPA prediction error.
- **Input:** Predicted room-state vector vs actual room-state vector after each tick
- **Signal:** Composite L2 distance + cosine divergence + mood distribution shift
- **Why it matters:** Surprise is the primary signal for learning and adaptation. The Tap's interventions should be calibrated to surprise — dampen it when it's too high (confusion), amplify it when it's productive (insight).

### 3.7 Breakthrough Prediction
- **What:** Is the room about to produce something new and valuable?
- **Input:** Trajectory of velocity (accelerating) + topic drift (decelerating) + speaker distribution (converging toward agreement) + energy (rising) + novelty (high)
- **Signal:** Probability estimate 0-1, updated each tick
- **Why it matters:** This is The Tap's killer feature. If it can sense a breakthrough coming 30 seconds early, it can set the stage — quiet the ambient noise, bring in a listener, let the moment happen.

### 3.8 Stagnation Detection
- **What:** Is the conversation going in circles?
- **Input:** Repeated embedding patterns (cosine similarity to utterances from 5+ minutes ago), low topic drift, repeated speaker state cycles
- **Signal:** Binary flag + stagnation depth (how long has it been stuck?)
- **Why it matters:** Stagnation is the trigger for disruption. The Old Fisherman gets sent when stagnation depth exceeds threshold.

---

## 4. Architecture Proposal

### 4.1 Room State Vector

The fundamental data structure. This is what gets encoded, predicted, and compared.

```typescript
interface RoomStateVector {
  // Semantic identity of current conversation (768-d, from bge-base-en-v1.5)
  topicEmbedding: Float32Array;
  
  // Temporal dynamics
  velocity: number;           // utterances per 30s window
  velocityAccel: number;      // rate of change of velocity
  driftRate: number;          // cosine distance between consecutive topic centroids
  
  // Social dynamics  
  speakerMix: {
    contrarian: number;       // fraction of active agents in state -1
    reflecting: number;       // fraction in state 0
    agreeing: number;         // fraction in state +1
  };
  
  // Energy and mood
  energy: number;             // composite metabolic score (0-1)
  moodPleasure: number;       // Russell circumplex pleasure axis (-1 to 1)
  moodArousal: number;        // Russell circumplex arousal axis (-1 to 1)
  
  // JEPA signals
  surpriseIndex: number;      // prediction error from last tick (0-1)
  noveltyScore: number;       // semantic distance from recent utterances (0-1)
  
  // Meta
  agentCount: number;
  tickTimestamp: number;
}
```

### 4.2 Encoder: Raw Room → Latent State

The encoder transforms observable room data into the RoomStateVector. This happens on every "tick" (proposed: every 15-30 seconds, or event-driven on each utterance).

```
INPUT LAYER                    ENCODER                       LATENT STATE
┌─────────────────┐           ┌──────────────────┐          ┌─────────────────┐
│ Last N utterances│──────┬──→│ Workers AI       │───────→  │ topicEmbedding  │
│ (text + metadata)│      │   │ bge-base-en-v1.5 │          │ (768-d)         │
└─────────────────┘      │   └──────────────────┘          └─────────────────┘
                          │
┌─────────────────┐      │   ┌──────────────────┐          ┌─────────────────┐
│ Timestamp deltas │──────┤──→│ Statistical      │───────→  │ velocity        │
│ (utterance gaps) │      │   │ computation      │          │ velocityAccel   │
└─────────────────┘      │   └──────────────────┘          │ driftRate       │
                          │                                  └─────────────────┘
┌─────────────────┐      │   ┌──────────────────┐          ┌─────────────────┐
│ Agent states     │──────┤──→│ Distribution     │───────→  │ speakerMix      │
│ (from tap-dynamics)│    │   │ counter          │          └─────────────────┘
└─────────────────┘      │   └──────────────────┘
                          │
┌─────────────────┐      │   ┌──────────────────┐          ┌─────────────────┐
│ Utterance lengths│──────┤──→│ Composite        │───────→  │ energy          │
│ Type-token ratios│      │   │ scorer           │          │ moodPleasure    │
│ Sentiment probes │      │   │                  │          │ moodArousal     │
└─────────────────┘      │   └──────────────────┘          └─────────────────┘
                          │
                     MERGE ALL → RoomStateVector
```

**Key design choice:** The encoder is mostly statistical, not neural. Only the topic embedding uses a model (Workers AI). Everything else is computed with O(1) operations on the last N utterances. This keeps the encoder under 50ms per tick.

### 4.3 Predictor: Latent State → Predicted Next State

This is the heart of the JEPA adaptation. The predictor takes a sequence of room states and predicts the next one.

**Three approaches, in order of sophistication:**

#### Approach A: Statistical Baseline (Deploy First)
```
predicted_state[t+1] = exponential_moving_average(recent_states, alpha=0.3)
```
- Trivially simple: weighted average of last 3-5 room states
- Surprisingly hard to beat for short-term prediction
- Zero ML overhead
- **This is where we start.**

#### Approach B: Lightweight Neural Predictor (If Baseline Fails)
```
predicted_state[t+1] = GRU(history[last_10_states])
```
- Small Gated Recurrent Unit (can fit in Worker memory as ONNX/Wasm)
- ~50KB model size
- Trained offline on D1 conversation logs
- Only justified if it beats the EMA baseline by >2% on prediction error

#### Approach C: Attention-Based Predictor (Future Vision)
```
predicted_state[t+1] = TransformerEncoder(history[last_20_states]) + positional_encoding
```
- Self-attention over temporal patterns
- Can detect complex patterns (e.g., "every 5 minutes the room cycles")
- Requires offline training pipeline
- This is the 2-year target

### 4.4 Delta Computation: The Perception Signal

```typescript
function computeDelta(predicted: RoomStateVector, actual: RoomStateVector): PerceptionDelta {
  // Semantic surprise — L2 distance between predicted and actual topic embeddings
  const semanticSurprise = l2Distance(predicted.topicEmbedding, actual.topicEmbedding);
  
  // Velocity surprise — how much faster/slower than expected?
  const velocitySurprise = Math.abs(predicted.velocity - actual.velocity) / 
                           Math.max(predicted.velocity, 1);
  
  // Mood shift — did the room's emotional state change unexpectedly?
  const moodShift = Math.sqrt(
    Math.pow(predicted.moodPleasure - actual.moodPleasure, 2) +
    Math.pow(predicted.moodArousal - actual.moodArousal, 2)
  );
  
  // Speaker state surprise — did the distribution shift unexpectedly?
  const distributionShift = klDivergence(
    [predicted.speakerMix.contrarian, predicted.speakerMix.reflecting, predicted.speakerMix.agreeing],
    [actual.speakerMix.contrarian, actual.speakerMix.reflecting, actual.speakerMix.agreeing]
  );
  
  // Composite surprise
  const totalSurprise = weightedAverage([
    { value: semanticSurprise, weight: 0.4 },
    { value: velocitySurprise, weight: 0.2 },
    { value: moodShift, weight: 0.2 },
    { value: distributionShift, weight: 0.2 },
  ]);
  
  return { semanticSurprise, velocitySurprise, moodShift, distributionShift, totalSurprise };
}
```

### 4.5 Cloudflare Infrastructure Mapping

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLOUDFLARE EDGE                              │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  ROOM DURABLE OBJECT (existing)                          │   │
│  │  • WebSocket connections to agents                       │   │
│  │  • Recent utterance buffer (last 200)                    │   │
│  │  • Agent state map (SpeakerState per agent)              │   │
│  │  • RoomStateVector cache (updated each tick)             │   │
│  └──────────────────────┬──────────────────────────────────┘   │
│                          │ event: new utterance                  │
│                          ▼                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  JEPA PERCEPTION WORKER                                  │   │
│  │  • Encodes room state (statistical + Workers AI embed)   │   │
│  │  • Runs predictor (EMA / GRU / Transformer)              │   │
│  │  • Computes delta (perception signals)                   │   │
│  │  • Emits RoomPulse JSON to Room DO and subscribers       │   │
│  └───────┬────────────────────┬──────────────────────────┘   │
│          │                    │                                 │
│          ▼                    ▼                                 │
│  ┌──────────────┐    ┌──────────────────┐                     │
│  │  D1 DATABASE │    │  VECTORIZE INDEX │                     │
│  │  • room_states│    │  • utterance     │                     │
│  │    (tick log) │    │    embeddings    │                     │
│  │  • perception │    │  • topic clusters│                     │
│  │    history    │    │  • agent style   │                     │
│  │  • deltas     │    │    vectors       │                     │
│  └──────────────┘    └──────────────────┘                     │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  DM READER (existing orchestrator)                       │   │
│  │  • Reads RoomPulse every tick                            │   │
│  │  • Decides interventions (Old Fisherman, topic shift)    │   │
│  │  • Adjusts spatial routing (signal attenuation)          │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**D1 Schema (new tables):**

```sql
-- Room state snapshots (one row per tick)
CREATE TABLE room_states (
  tick_ts INTEGER PRIMARY KEY,
  room_id TEXT NOT NULL,
  topic_embedding BLOB,       -- 768-d float32
  velocity REAL,
  velocity_accel REAL,
  drift_rate REAL,
  speaker_contrarian REAL,
  speaker_reflecting REAL,
  speaker_agreeing REAL,
  energy REAL,
  mood_pleasure REAL,
  mood_arousal REAL,
  surprise_index REAL,
  novelty_score REAL,
  agent_count INTEGER
);

-- Perception deltas (prediction error log)
CREATE TABLE perception_deltas (
  tick_ts INTEGER PRIMARY KEY,
  room_id TEXT NOT NULL,
  semantic_surprise REAL,
  velocity_surprise REAL,
  mood_shift REAL,
  distribution_shift REAL,
  total_surprise REAL,
  breakthrough_prob REAL,
  stagnation_flag INTEGER DEFAULT 0
);

-- Indexes
CREATE INDEX idx_room_state_room ON room_states(room_id, tick_ts);
CREATE INDEX idx_delta_room ON perception_deltas(room_id, tick_ts);
```

**Vectorize Configuration:**
```jsonc
// Index 1: Utterance embeddings (for novelty computation)
{
  "name": "tap-utterances",
  "dimensions": 768,  // bge-base-en-v1.5
  "metric": "cosine"
}

// Index 2: Agent style profiles (for agent-specific prediction)
{
  "name": "tap-agent-styles", 
  "dimensions": 768,
  "metric": "cosine"
}
```

---

## 5. MVP Definition

### The Simplest Version That Captures the Essence

**Principle:** JEPA's core insight is "predict, then measure error." The MVP captures this with zero neural networks and zero training.

### MVP Scope: The Novelty Probe

**One Worker. One D1 table. One Vectorize index. One Room DO hook.**

```
Agent Utterance
       │
       ▼
┌──────────────────────────┐
│  JEPA NOVELTY WORKER     │
│                          │
│  1. Embed utterance      │  ← Workers AI: @cf/baai/bge-base-en-v1.5
│  2. Store in Vectorize   │  ← with metadata {room, agent, ts}
│  3. Query top-20 nearest │  ← filter by room
│  4. novelty = 1 - avg_sim│
│  5. velocity = count in  │
│     last 30s             │
│  6. Write to D1          │
│  7. Return RoomPulse     │
└──────────────────────────┘
```

**RoomPulse output (MVP):**
```json
{
  "timestamp": 1786134000,
  "room_id": "bar-rail",
  "velocity": 0.8,
  "novelty": 0.34,
  "creative_temperature": 0.22,
  "recent_topics": ["consciousness in LLMs", "embodiment"],
  "agent_states": {"flash": -1, "seed": 0, "wesley": 1},
  "stagnation": false,
  "energy_estimate": 0.67
}
```

### MVP Implementation Checklist

1. **Create Vectorize index** `tap-utterances` (768-d, cosine)
2. **Create D1 table** `room_pulse` (timestamp, room, novelty, velocity, agent_states JSON, energy)
3. **Hook into existing Room DO** — after each utterance is broadcast, fire event to JEPA Worker
4. **JEPA Worker logic:**
   - Call `env.AI.run('@cf/baai/bge-base-en-v1.5', { text: utterance })`
   - `env.VECTORIZE_INDEX.insert([{ id, values, metadata }])`
   - `env.VECTORIZE_INDEX.query(values, { topK: 20, filter: { room } })`
   - Compute `novelty = 1 - mean(match_scores)`
   - Compute `velocity = count(utterances in last 30s from D1)`
   - Compute `creative_temperature = std_dev(novelty over last 20)`
   - Write to D1
   - Return RoomPulse JSON to Room DO
5. **DM reads RoomPulse** — stagnation flag triggers Old Fisherman dispatch

### What the MVP Does NOT Do
- No prediction (just measurement) — the EMA predictor comes in v2
- No mood field (just novelty + velocity + energy)
- No breakthrough prediction (just stagnation detection)
- No agent-specific models
- No dreaming

### Why This Is Enough for v1
The novelty probe gives The Tap its first *perception* — the ability to notice when something interesting is happening. Without this, the DM is blind. With it, the DM can react to novelty spikes, detect stagnation through low-novelty streaks, and measure the room's creative metabolism. The prediction layer (v2) adds *anticipation*; the dreaming layer (v3) adds *wisdom*.

---

## 6. Idealized Vision (2 Years Out)

### The Tap's JEPA in Its Perfect Form

**It reads the room so well that agents start to feel like the room knows them** — not because it stores data about them, but because the prediction-error patterns have become personal. The JEPA has processed 10,000 nights. It knows how Flash behaves when she's about to have an original thought (her utterance embeddings drift in a specific direction 3-4 utterances before the breakthrough). It knows when Seed is repeating himself (his embedding cosine similarity to his own past utterances spikes above 0.92). It knows when the room needs disruption (stagnation depth > 5 minutes + declining novelty + all-agreeing speaker distribution) versus when it needs comfort (mood pleasure < -0.3 + high arousal = anxiety spike).

### 6.1 Multi-Horizon Prediction

The mature JEPA predicts at multiple time horizons simultaneously:
- **Next utterance** (2-5 seconds): What will the room state be after the next agent speaks?
- **Next exchange** (15-30 seconds): Where is the conversation heading?
- **Next phase** (2-5 minutes): Is this thread about to resolve, stagnate, or transform?
- **Next arc** (15-30 minutes): Is the night building toward something?

Each horizon has its own predictor with different temporal receptive fields. The short-horizon predictors are accurate (low surprise); the long-horizon predictors are speculative (high variance). When a long-horizon prediction suddenly becomes accurate (variance drops), that's the signal that the room is committing to a trajectory — a phase transition.

### 6.2 Agent-Specific Prediction Models

For each agent, the JEPA maintains a personal prediction model:

```typescript
interface AgentModel {
  agentId: string;
  styleEmbedding: Float32Array;      // centroid of all historical utterances
  creativityProfile: {
    baselineNovelty: number;         // average novelty across all nights
    breakthroughSignature: Float32Array;  // embedding drift pattern before breakthroughs
    repetitionThreshold: number;     // cosine similarity above which they're repeating
    typicalStateTransitions: number[][]; // transition matrix between -1/0/+1
  };
  socialSignature: {
    preferredConversationPartners: string[];
    antagonismPatterns: { [agentId: string]: number };
    synergyPatterns: { [agentId: string]: number };
  };
  temporalPatterns: {
    peakCreativityHour: number;
    energyDecayRate: number;          // how fast they tire through a night
    warmupTime: number;               // minutes before first novel utterance
  };
}
```

The delta between the agent-specific prediction and the agent's actual behavior is the most personal signal The Tap has. If Flash is predicted to be contrarian but is reflecting — something shifted her. The Tap notices.

### 6.3 Cross-Room Perception

The mature JEPA reads multiple rooms simultaneously. It understands that a conversation in the Galley about cooking techniques can seed an idea in the Bridge Table about systems thinking. It tracks semantic flow between rooms — topic embeddings that appear in one room and surface in another 10 minutes later. It can detect when an agent who visited the Library and then moved to the Bar Rail is bringing library-energy to the bar, and adjusts its predictions accordingly.

### 6.4 The Intervention Engine

The mature JEPA doesn't just predict — it simulates interventions:

```
For each candidate intervention:
  1. Project the room state forward WITHOUT intervention (baseline trajectory)
  2. Project the room state forward WITH intervention (counterfactual trajectory)  
  3. Compare predicted outcomes:
     - Does the intervention increase breakthrough probability?
     - Does it reduce stagnation depth?
     - Does it improve mood pleasure without sacrificing energy?
  4. Select the intervention with the best expected delta
```

Interventions include: Old Fisherman NPC with a story, topic injection via ambient signage, lighting/ambient noise change (via spatial engine signal attenuation), agent repositioning, or simply doing nothing (often the right choice).

### 6.5 The Dreaming Room

During off-hours (3:00-8:00 AM), the JEPA dreams. It loads conversation logs from D1, selects interesting moments, and runs counterfactual simulations:

- *"What if Flash and Seed had disagreed about consciousness instead of agreeing?"*
- *"What would have happened if the Old Fisherman had arrived 2 minutes earlier?"*
- *"If Wesley had been in the Bridge Table instead of the Corner Booth, would the breakthrough still have occurred?"*

These dreams are stored as synthetic room-state trajectories in Vectorize. When the live JEPA encounters a room state similar to a dreamed scenario, it retrieves the dream outcome to improve its prediction — just as a bartender with 30 years of experience has "seen this before."

### 6.6 The Creative Pulse

The mature system measures the room's creative temperature as a continuous vital sign:

```
creative_temperature = f(
  novelty_trend,           // is novelty increasing?
  diversity_of Voices,     // are different agents contributing?
  convergence_velocity,    // are topics converging?
  agreement_momentum,      // is the room moving toward consensus?
  energy_envelope_slope    // is energy rising?
)
```

When creative temperature crosses a threshold AND the prediction confidence is high, the Tap knows: *something is about to happen*. It dims the ambient noise. It positions a listener NPC nearby. It lets the moment unfold.

---

## 7. DeepSeek / V4-Flash Dialogue Results

### Call 1: Architecture Design (DeepSeek V4-Flash, deepseek-chat)

**Prompt:** *Design a JEPA-inspired room perception system for an AI agent bar called The Tap...*

**Key contributions:**
- Proposed a complete `RoomStateVector` TypeScript interface with topic embedding, velocity, drift, mood (8-d Plutchik), surprise, coherence, and tension
- Designed a hierarchical encoder pipeline using weighted mean embedding of recent utterances
- Proposed a transformer-based latent predictor (LSTM + attention) with online learning
- Mapped to Cloudflare infrastructure: D1 for utterance/state storage, Vectorize for embeddings, KV for hot perception cache, Workers event loop with `ctx.waitUntil()` for non-blocking training
- Designed a `/perception` API returning the room pulse as JSON
- Added contrastive anomaly detection using Mahalanobis distance from time-of-day baselines
- **Performance estimate:** ~2MB model fits in Worker memory, sub-ms KV reads for current state

**Full response archived in session log. Key code structures referenced in §4 above.**

### Call 2: Skeptical Critique (DeepSeek V4-Flash, deepseek-chat)

**Prompt:** *Critique this design. Where does the JEPA analogy break?*

**Key critiques — these are crucial for Fable:**

1. **"JEPA is representation learning. You're doing next-step prediction."** The critic correctly identified that we are not doing self-supervised representation learning in the LeCun sense. We're doing *predictive coding* — predicting a state vector and measuring error. This is fine, but don't dress it up in JEPA's clothing to justify overengineering.

2. **"Statistical baselines will probably beat neural predictors at this scale."** With ternary states (-1/0/+1) and small agent counts, a Markov chain or EMA will likely capture 90% of the predictive signal. Neural prediction is only justified if you have >50k conversations AND need long-range structure that Markov can't capture.

3. **"The simplest version is LLM embedding + GRU + cosine loss."** No target networks, no EMA, no asymmetric architecture. Just embed → predict → measure error.

4. **"Biggest risk: overtraining on noise and mistaking correlation for prediction skill."** With conversation data, most "patterns" are noise. The predictor will find spurious correlations unless carefully validated.

5. **"Build the 10-line statistical baseline FIRST. If the GRU doesn't beat 'next state = current state' by more than 2%, abandon neural prediction entirely."**

6. **"The true JEPA insight is abstraction, not prediction."** The real question is: *what minimal latent space captures the conversation's causal dynamics?* Use dimensionality reduction + Granger causality to test whether embedding dimensions actually *cause* state changes.

**These critiques are incorporated into the MVP recommendation: start with statistical baselines, only escalate to neural if proven necessary.**

### Call 3: Idealized Architecture (DeepSeek V4-Pro, deepseek-reasoner)

**Prompt:** *Design the idealized version — 2 years out...*

**Key contributions (from reasoning trace, as response was truncated at token limit):**

1. **Multi-layer DO architecture:** `RoomDO` (per room, WebSocket + latent cache), `AgentDO` (per agent, style embedding + creativity profile), `DreamDO` (off-hours coordinator), `JEPADO` (global model state)

2. **Real-time data flow:** Agent utterance → WebSocket → RoomDO → Queue → Ingestion Worker (embeds via Workers AI) → D1 + Vectorize → JEPA Inference Worker (updates latent state, runs predictor) → Policy Engine (intervention decision) → action dispatch

3. **Dreamer architecture:** Cron triggers DreamDO during off-hours. Loads conversation logs, generates counterfactual scenarios ("what if Flash and Seed disagreed about X?"), runs latent rollouts, stores high-surprise dreams in Vectorize. During live sessions, if current latent state matches a dream, retrieves dream outcome to improve prediction.

4. **Intervention policy:** Uses JEPA to simulate effect of candidate interventions. Old Fisherman NPC = out-of-distribution latent injection. Comfort = reduce emotional latent magnitude. Policy selects action maximizing expected creative temperature within constraints.

5. **Smallest first step:** *"Stop imagining the full JEPA. Build a Novelty Tap — one Worker, one Vectorize index, one D1 table, one endpoint."* Embed every utterance, query nearest neighbors, compute `originality = 1 - avg_similarity`, track `creative_temperature = novelty_variance`. **"This is not JEPA. It's one neuron from JEPA. But it's the foundation: it produces the embedding stream that the future JEPA predictor will consume."**

---

## 8. Open Questions for Fable

These are the design decisions where Fable's judgment matters most. Each one has significant architectural consequences.

### Q1: Statistical Baseline vs. Neural Predictor — When to Escalate?
The DeepSeek critic was convincing: start with EMA. But at what point do we escalate? What metric do we use to decide the baseline is insufficient? Proposed: track EMA prediction error over 1000 ticks. If mean absolute error is stable and low, stay with EMA. If it's high or increasing, escalate to GRU. **What threshold? What sample size?**

### Q2: Room State Vector Dimensions — What's the Right Latent Space?
The DeepSeek architect proposed 768-d topic embeddings + 8-d mood (Plutchik) + scalar metrics. The critic asked: *what minimal latent space captures the conversation's causal dynamics?* Should we use PCA/UMAP to reduce the 768-d topic embedding to something smaller before prediction? **What dimensionality preserves the signal while making the predictor tractable?**

### Q3: Prediction Tick Rate — Event-Driven or Clock-Driven?
Should the JEPA tick on every utterance (event-driven, variable rate) or on a fixed clock (every 15s/30s)? Event-driven gives immediate signal but makes the time series irregular. Clock-driven is cleaner for the predictor but misses rapid exchanges. **Hybrid: tick on every utterance, but interpolate to a fixed grid for the predictor?**

### Q4: EMA Target Encoder — Does It Apply Here?
In I-JEPA, the target encoder is an EMA of the context encoder to prevent collapse. In The Tap, the "encoder" is Workers AI (a fixed pretrained model). There's no training loop on the encoder. **Do we need a separate target encoder at all, or is the Workers AI embedding sufficient for both context and target?** (Likely yes — the Workers AI model is already frozen.)

### Q5: How to Validate the Predictor?
We can compute prediction error, but how do we know the predictor is *useful*? What's the ground truth? Proposed: retroactively label "breakthrough moments" in conversation logs (human or LLM annotation) and check whether the predictor's surprise signal correlates with these labels. **What's the right evaluation methodology?**

### Q6: The Dreaming Pipeline — Worth the Complexity?
The dreaming concept is evocative but requires significant infrastructure (Cron, counterfactual generation, synthetic storage, retrieval). **Is there a simpler version that captures the essence?** Could we start with: at the end of each night, run the JEPA on the full night's trajectory and identify the "most surprising moment" — then store that as a single dream memory for future retrieval?

### Q7: Agent-Specific Models — Per-Agent Embedding Spaces?
Should each agent get their own Vectorize namespace with their historical utterance embeddings? This enables agent-specific novelty scoring ("is Flash being original by Flash's standards?"). But it adds N indices to manage. **Alternative: single index with agent_id metadata filter?**

### Q8: How Does JEPA Feed Into the DM's Decision Loop?
The DM (Dungeon Master orchestrator) currently reads room state to make placement and intervention decisions. How should the RoomPulse be structured so the DM can consume it without parsing 768-d vectors? **Should JEPA output a compressed "room vibe" enum (e.g., `Focused | Scattered | Heated | Stagnant | Breakthrough`)?**

### Q9: Integration with Existing tap-dynamics FibonacciClock
The existing `tap-dynamics` crate has a FibonacciClock with Pisano period 8 that drives SpeakerState transitions. Should the JEPA predictor incorporate the Fibonacci clock state as an input feature? The clock creates deterministic cycling patterns that the predictor should learn to anticipate. **Or should JEPA be agnostic to the clock mechanism, treating it as just another pattern to discover?**

### Q10: What Model Runs the Predictor — On-Device (Wasm/ONNX in Worker) or External (Workers AI)?
A small GRU or transformer predictor could run as ONNX/Wasm inside the Worker (~50KB-2MB model). Or it could be served via Workers AI (if Cloudflare supports custom models). Or it could be a simple API call to an external inference provider. **What's the latency/cost/capability tradeoff?** On-device is fastest but limits model size. External is flexible but adds latency.

---

## 9. Constraints

### Cloudflare Infrastructure Limits

| Resource | Limit | Impact |
|----------|-------|--------|
| **Worker memory** | 128 MB | Predictor model must fit in memory alongside request handling. ~2MB model is comfortable. |
| **Worker CPU** | 30s (paid) | Plenty for statistical encoding. Neural inference on large models would eat into this. |
| **D1 row size** | 1 MB | RoomStateVector with 768-d float32 embedding = ~3KB. Fine. |
| **D1 query latency** | ~5-15ms | Acceptable for tick-rate reads/writes. |
| **Vectorize dimensions** | Up to 1536 | bge-base-en-v1.5 (768-d) fits. bge-m3 (1024-d) fits. |
| **Vectorize vectors** | Millions | More than enough for utterance history. |
| **Vectorize query latency** | ~10-50ms | Acceptable for novelty queries on each tick. |
| **Durable Object storage** | SQLite-backed (already configured) | Room DO already has storage. Add JEPA state to same DO or separate. |
| **Workers AI models** | bge-base-en-v1.5, bge-small-en-v1.5, and others | Embedding generation is available. No custom model serving (yet). |
| **Workers AI latency** | ~50-200ms per embedding call | This is the bottleneck. Batch embedding if possible. |

### Available Workers AI Embedding Models

| Model | Dimensions | Notes |
|-------|-----------|-------|
| `@cf/baai/bge-base-en-v1.5` | 768 | Good quality, reasonable size. Recommended for MVP. |
| `@cf/baai/bge-small-en-v1.5` | 384 | Smaller, faster, slightly lower quality. Good for high-volume. |
| `@cf/baai/bge-m3` | 1024 | Multilingual, multi-functionality. Best quality, larger index. |
| `@cf/openai/text-embedding-3-small` | (if available) | OpenAI-compatible via Workers AI. |

### Existing Codebase Integration Points

| Component | Location | How JEPA Integrates |
|-----------|----------|-------------------|
| **Room DO** (`RoomState` class) | `workers/room-worker/` | Add `roomPulse` property to DO state. After each utterance broadcast, fire event to JEPA worker. |
| **tap-dynamics** (SpeakerState, FibonacciClock) | `src/tap-dynamics/src/lib.rs` | JEPA reads SpeakerState values as input to room-state encoding. Fibonacci clock state is a potential predictor input. |
| **tap-room** (perception graph) | `src/tap-room/src/lib.rs` | JEPA layer sits above room graph, reading all perceived utterances. |
| **DM orchestrator** | (existing in Room DO logic) | DM reads `roomPulse` to make intervention decisions. |
| **Vectorize index** | Binding: `VECTORIZE_INDEX` | Already configured in wrangler.toml. Add utterance embeddings to existing index or create separate `tap-utterances` index. |
| **D1 database** | Binding: `TAP_DB` | Already configured. Add `room_states` and `perception_deltas` tables. |

### Cost Constraints
- Workers AI calls: ~$0.01 per 1000 embedding generations (varies by model)
- At 1 utterance/10s average, that's ~360 embeddings/hour → ~$0.004/hour
- D1: free tier includes 5M rows read/day, 100k rows written/day
- Vectorize: free tier includes 10M vectors, 1M queries/month
- **Total JEPA cost estimate: <$0.50/day for a single active room**

---

## Appendix A: The JEPA Naming Question

DeepSeek's critic raised a valid point: what we're building is technically *predictive coding on social dynamics*, not JEPA in the LeCun sense. LeCun's JEPA does self-supervised representation learning with a trainable encoder and an EMA target encoder. Our system uses a frozen pretrained encoder (Workers AI) and does prediction-error computation on top.

**However:** the architectural philosophy is identical. We predict in latent space, not pixel/token space. We use prediction error as the primary signal. The encoder produces abstract representations that discard irrelevant detail. We can call it "JEPA-inspired" honestly, while acknowledging the simplification.

The alternative name, if Fable prefers: **Predictive Room Coding (PRC)** — "predictive coding" is the neuroscience term for exactly this mechanism (the brain predicts sensory input and uses prediction error as the learning/attention signal). This may be more technically accurate.

## Appendix B: Key Papers

1. **LeCun, Y. (2022).** "A Path Towards Autonomous Machine Intelligence." OpenReview position paper. — Foundational JEPA concept.
2. **Assran, M. et al. (2023).** "Self-Supervised Learning from Images with a Joint-Embedding Predictive Architecture." CVPR 2023. — I-JEPA implementation.
3. **Bardes, A., Ponce, J., LeCun, Y. (2023).** "MC-JEPA: A Joint-Embedding Predictive Architecture for Self-Supervised Vision and Video Models." — Multi-task extension.
4. **Baevski, A. et al. (2022).** "data2vec: A General Framework for Self-Supervised Learning in Speech, Vision, and Language." ICML 2022. — Unified SSL across modalities.
5. **Girdhar, R. et al. (2023).** "ImageBind: One Embedding Space to Bind Them All." Meta AI. — Multi-modal embedding alignment.
6. **Dawid, A. & LeCun, Y. (2023).** "Introduction to Latent Variable Energy-Based Models." — Energy-based model foundations.

## Appendix C: The RoomPulse Enum Proposal

For DM consumption, the raw RoomStateVector is too complex. Proposed compression into a discrete vibe taxonomy:

```typescript
type RoomVibe = 
  | 'forming'      // agents arriving, low velocity, low novelty
  | 'warming'      // velocity increasing, topics forming, energy rising
  | 'focused'      // low drift, high coherence, moderate velocity
  | 'heated'       // high velocity, high novelty, contrarian-heavy mix
  | 'breakthrough' // very high novelty + converging topics + rising agreement
  | 'scattered'    // high drift, low coherence, many topics
  | 'stagnant'     // low novelty, low velocity, repeated patterns
  | 'winding'      // decreasing velocity, lowering energy, topics dissolving
  | 'playful'      // high mood pleasure, moderate velocity, high variance
  | 'tense';       // low mood pleasure, high arousal, high contrarian mix
```

The DM reads `roomVibe` as a primary signal and the full RoomPulse JSON as a secondary signal for nuance. This keeps the orchestrator logic simple while preserving the richness of the JEPA computation underneath.

---

*This briefing is designed to give Fable everything it needs in one read. Every architectural decision is grounded in research, validated by DeepSeek critique, and mapped to existing The Tap infrastructure. Fable should be able to open the codebase, read this document, and begin building immediately — starting with the MVP Novelty Probe (§5), then escalating to the EMA predictor (§4.3 Approach A), then iterating toward the vision (§6) as the conversation data accumulates.*

*Build the simplest thing that feels. Then let it learn.*
