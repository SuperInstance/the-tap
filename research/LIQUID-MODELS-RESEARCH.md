# Liquid Foundation Models — Research Brief for The Tap

**Researched:** 2026-08-07
**Context:** Casey wants Liquid AI models as perception organs for The Tap's local ensemble and Wesley's harness system.

---

## 1. What Liquid Models Are Available

### The LFM Family Tree (as of Aug 2026)

Liquid AI has released two generations of Liquid Foundation Models, with a third (LFM2.5) currently rolling out:

#### LFM1 (2024) — First Generation
| Model | Parameters | Notes |
|-------|-----------|-------|
| LFM-1B | 1.3B | Initial release |
| LFM-3B | 3B | Mid-tier |
| LFM-7B | 7B | Announced Sep 2024, used as teacher for LFM2 |
| LFM-40B | 40B | Large research model |

#### LFM2 (2025) — Second Generation
| Model | Parameters | Architecture | Context |
|-------|-----------|--------------|---------|
| LFM2-350M | 354M | 16 layers (10 conv + 6 GQA) | 32K |
| LFM2-700M | 742M | 16 layers (10 conv + 6 GQA) | 32K |
| LFM2-1.2B | 1.17B | 16 layers (10 conv + 6 GQA) | 32K |
| LFM2-2.6B | 2.57B | 30 layers (22 conv + 8 GQA) | 32K |

**LFM2 Architecture:** Hybrid Liquid model with multiplicative gates and short convolutions. Not a pure RNN — it's a mix of double-gated short-range LIV (Linear Input-Varying) convolution blocks and grouped query attention blocks. Trained on 10T tokens with knowledge distillation from LFM1-7B.

#### LFM2.5 (2026) — Current Generation
| Model | Parameters | Type | Context |
|-------|-----------|------|---------|
| LFM2.5-230M | ~230M | Text | — |
| LFM2.5-350M | ~350M | Text | — |
| LFM2.5-1.2B-Base | 1.2B | Text (base/instruct/thinking variants) | — |
| LFM2.5-2.6B | 2.69B | Text, agentic post-training | **128K** |
| LFM2.5-8B-A1B | 8.3B total / 1.5B active | MoE text | — |
| **LFM2.5-VL-1.6B** | 1.6B | **Vision-Language** (SigLIP2 encoder) | 32K |
| **LFM2.5-Audio-1.5B** | 1.5B | **Audio-Language** (end-to-end speech) | 32K |

**LFM2.5-2.6B** is the flagship: trained on 34T tokens, features agentic RL post-training (trained inside popular agentic harnesses), 128K context, runs at 220 tok/s on Apple M5 Max in under 2.5 GB RAM.

#### Liquid Nanos (Task-Specific)
| Model | Task |
|-------|------|
| LFM2-1.2B-Extract | Data extraction |
| LFM2-350M-Extract | Data extraction (small) |
| LFM2-350M-ENJP-MT | English-Japanese translation |
| LFM2-1.2B-RAG | RAG-optimized |

### What Fits on a 6GB RTX 4050?

The RTX 4050 has 6GB VRAM. With Granite 3.1 2B already loaded (~4GB in bf16, ~2.5GB quantized), we need models that share the remaining budget or run on CPU.

**GPU-resident (sharing VRAM with Granite):**
- **LFM2.5-350M** — ~700MB in bf16, ~200MB Q4 GGUF. Trivial footprint.
- **LFM2.5-700M** — ~1.4GB bf16, ~450MB Q4. Very comfortable.
- **LFM2.5-1.2B** — ~2.4GB bf16, ~750MB Q4. Fits alongside Granite if both quantized.
- **LFM2.5-VL-1.6B** — ~3.2GB bf16, ~900MB Q4. Tight but doable with quantization.
- **LFM2.5-Audio-1.5B** — ~3GB bf16, ~900MB Q4. Same.

**CPU-resident (liquid models are DESIGNED for this):**
LFM2 was explicitly built for CPU inference. Liquid AI's benchmarks show LFM2 dominating the Pareto frontier for prefill and decode speed on CPU. The short-convolution architecture was chosen specifically because embedded SoC CPU kernel libraries optimize well for these operations. An LFM2-1.2B on CPU is faster than Qwen3-0.6B on CPU despite being larger.

**Recommendation:** Run LFMs on CPU to keep GPU VRAM free for Granite + SDXL Turbo. LFMs are designed for this and perform exceptionally well there.

### Licensing
- **LFM Open License v1.0** (Apache 2.0-based)
- Free for academic/research use
- Free for commercial use if your company has <$10M annual revenue
- The Tap is well under that threshold — no licensing concern

### Are They Open Source / Downloadable?

**Yes.** All models are on HuggingFace under `LiquidAI/`. Available formats:
- Native PyTorch checkpoints (`.safetensors`)
- **GGUF** for llama.cpp / Ollama (`LiquidAI/LFM2-1.2B-GGUF`, `LiquidAI/LFM2.5-2.6B-GGUF`, etc.)
- ONNX for cross-platform
- MLX for Apple Silicon

160 models total on HuggingFace including quantized variants.

---

## 2. Inference Stack — How to Run Them

### Option A: HuggingFace Transformers (Recommended for The Tap)
```python
from transformers import AutoModelForCausalLM, AutoTokenizer

model = AutoModelForCausalLM.from_pretrained(
    "LiquidAI/LFM2-1.2B",
    device_map="auto",     # auto-places on GPU or CPU
    torch_dtype="bfloat16",
)
tokenizer = AutoTokenizer.from_pretrained("LiquidAI/LFM2-1.2B")
```
Requires `transformers >= 4.55` (or `>= 5.0` for LFM2.5).

### Option B: llama.cpp / GGUF
```bash
llama-cli -hf LiquidAI/LFM2-1.2B-GGUF
```
This is the CPU inference path. LFM2 was designed for this — it's not a fallback, it's the primary deployment target.

### Option C: vLLM (for GPU serving)
```bash
pip install vllm==0.10.2
```
```python
from vllm import LLM
llm = LLM(model="LiquidAI/LFM2-1.2B")
```

### Option D: Ollama
Ollama supports LFM2 models via GGUF. You can create a Modelfile:
```
FROM ./LFM2-1.2B-Q4_K_M.gguf
TEMPLATE """{{ .System }}
{{ .Prompt }}"""
PARAMETER temperature 0.3
PARAMETER min_p 0.15
```
Then `ollama create lfm2 -f Modelfile && ollama run lfm2`.

The `liquid-audio` pip package handles LFM2.5-Audio:
```bash
pip install liquid-audio
liquid-audio-demo  # launches Gradio interface on :7860
```

### LFM2 Generation Parameters (Important)
LFMs have specific recommended sampling:
- `temperature=0.3` (LFM2) / `0.1` (LFM2.5)
- `min_p=0.15`
- `repetition_penalty=1.05` (LFM2) / `1.1` (LFM2.5)
- ChatML-like chat template

---

## 3. How Liquid Models Differ from Transformers

This isn't just "another small LLM." The architecture is fundamentally different.

### The Core Idea: Continuous-Time Dynamics

Transformers process tokens. Each forward pass is a fresh computation — the model has no memory between calls unless you feed the full context window back in. It's amnesiac by design.

Liquid Neural Networks are **continuous-time dynamical systems**. Their hidden state evolves according to input-dependent ordinary differential equations (ODEs):

```
dy/dt = T(x(t)) · (F(x(t)) - y(t)) + A · y(t)
```

Where:
- `x(t)` is the input signal at time t
- `y(t)` is the neuron's state (the "liquid")
- `T(.)` is a nonlinear time-constant function (how fast the neuron adapts)
- `F(.)` is a nonlinear input transform
- `A` is a constant regulator

The time constant `T` is **input-dependent** — it changes based on what's flowing in. This means each neuron individually decides how quickly to forget or remember based on the signal it's receiving. That's the "liquid" — the dynamics shift like fluid.

### Key Differences

| Property | Transformers | Liquid Foundation Models |
|----------|-------------|-------------------------|
| **Time** | Discrete tokens, no inherent time | Continuous-time ODE dynamics |
| **Memory** | Context window (finite, sliding, expensive) | Persistent hidden state (infinite, free) |
| **Between inputs** | Total amnesia — state is wiped | State persists and settles — the network "remembers" |
| **Adaptation** | Requires retraining or fine-tuning | Fluid state reshapes itself to input statistics |
| **Parameters** | Needs many for competence | Rich dynamics from few parameters |
| **Sequence cost** | O(n²) self-attention | O(n) linear for long sequences |
| **Irregular sampling** | Requires positional encoding hacks | Native — time is a first-class variable |
| **Nature** | Relational machine (computes token-token relationships) | Dynamical machine (state evolves through time) |

### The Hybrid Reality

Important caveat: **LFM2/LFM2.5 are not pure liquid networks.** They're hybrids — 10 double-gated short-convolution blocks + 6 grouped query attention blocks. The attention blocks give them language competence; the convolution blocks (derived from liquid time-constant theory) give them temporal efficiency.

The pure liquid architectures (LTC, CfC — see §6 below) are what give the theoretical advantages of continuous-time memory. The foundation models bring those principles into a practical LLM form factor.

---

## 4. How They Fit The Tap

### The Core Insight

DeepSeek's dialogue (full transcript in §7) nailed it: **"They are not adding 'another brain.' They are adding the spine and the reflexes."**

The Tap's current ensemble is **event-driven** — YOLO sees something, Granite responds to something, JEPA computes a mood vector. Everything reacts to discrete events. Liquid models are **state-driven** — they maintain a continuous internal state that evolves over time, even between events.

### Role 1: The Tap's Ambient Processor (Continuous Room State)

**Current problem:** JEPA generates discrete mood snapshots. Between snapshots, The Tap is blind. The context window is a series of frozen frames, not a fluid picture.

**Liquid solution:** An LFM (LFM2-350M or 700M) receives the stream of JEPA vectors, audio levels, YOLO detections, and patron activity. Its hidden state becomes the **room's living state** — continuously evolving, never resetting. It doesn't need to be prompted; it just processes.

**Concrete wiring:**
```
JEPA mood vectors ─┐
Audio amplitude ───┼──→ LFM2-700M (CPU) ──→ Atmosphere Vector (continuous)
YOLO activity ─────┤                        ↳ derivative: rate of change
Patron count ──────┘                        ↳ integral: accumulated tension
```

The Atmosphere Vector is a low-dimensional tuple that Granite can sample before generating any response. It tells Granite not just "the room is calm" but "the room was calm but the rate of change is trending toward tense" — temporal foresight that transformers can't natively compute.

### Role 2: Wesley's Swim Bladder (Equilibrium)

Wesley sorts and routes data. Currently he does this with transformer logic — discrete decisions, context windows, prompt-response cycles.

A liquid model gives Wesley a **swim bladder** — a small persistent state that helps him maintain equilibrium while sorting. Instead of re-evaluating the full context every cycle, Wesley's liquid layer maintains a continuous sense of:
- **Work rhythm** — is the task flow fast/slow, heavy/light?
- **Interruption density** — how often is the main agent being pinged?
- **Saturation** — is the context getting overloaded?

This state isn't a number Wesley reads; it's a continuous signal his routing logic is modulated by. When saturation is high, he batches more aggressively. When rhythm is fast, he routes to faster models.

**Wiring:**
```
Incoming task stream ──→ LFM2-350M (Wesley's bladder) ──→ modulation signal
Task complexity scores ──┤                                ↳ urgency bias
Agent response times ────┤                                ↳ batch size hint
Error rates ─────────────┘                                ↳ model tier selection
```

### Role 3: Temporal Vision Filter (YOLO + Liquid)

YOLO sees frames. It can't tell where things are going.

Pipe YOLO's coordinate streams into a small liquid model. The LFM learns trajectories — the *velocity* and *acceleration* of objects in the room. A hand reaching for a glass, a patron leaning forward, a door opening — YOLO detects the frame, the liquid model predicts the motion.

**Result:** Instead of "there is a hand and a glass," The Tap knows "the hand is moving toward the glass at a speed that suggests a spill risk." It gives YOLO temporal depth.

### Role 4: Outside The Tap — Subagent Perception Preprocessor

When subagents work outside The Tap (in the workspace, handling tasks), they currently use transformers for everything. A liquid preprocessor could:
- Track the **task's rhythm** — is it converging or diverging?
- Detect **frustration patterns** in retry loops
- Modulate which model the subagent routes to based on accumulated state

This is lightweight — an LFM2-350M running on CPU, drawing almost no power, feeding a single "task momentum" signal into the subagent's routing logic.

### Role 5: LFM2.5-Audio as Voice Co-processor

This is a bonus discovery. **LFM2.5-Audio-1.5B** is an end-to-end speech model — no separate ASR + TTS needed. It handles speech-to-speech, speech-to-text, and text-to-speech in 1.5B parameters.

For The Tap, this could:
- Replace or complement Granite's voice pipeline
- Provide real-time conversational speech with low latency (designed for it)
- Run alongside Granite as a voice-specific fallback

### Role 6: LFM2.5-VL as Lightweight Vision

**LFM2.5-VL-1.6B** is a vision-language model with SigLIP2 encoder. It handles:
- Image description and OCR
- Multi-image inputs
- High-resolution images (up to 512×512 native, tiling for larger)
- 8 languages

This could complement YOLO: YOLO does detection, LFM2.5-VL does understanding. "What is the patron holding?" → YOLO. "What does the patron's body language suggest?" → LFM2.5-VL.

---

## 5. Integration Design — How to Wire It In

### Architecture Diagram

```
                    ┌─────────────────────────────────────────┐
                    │           THE TAP ENSEMBLE               │
                    │                                         │
  Audio ────────────┼──→ LFM2.5-Audio-1.5B (voice I/O)       │
  Camera ───────────┼──→ YOLO ──┐                            │
  Camera ───────────┼──→ LFM2.5-VL-1.6B (vision understanding)│
                    │           │                             │
                    │    ┌──────┴──────────────────────┐     │
                    │    │  LFM2-700M (CPU)            │     │
                    │    │  "The Tap's Nervous System" │     │
                    │    │  Continuous Atmosphere State│     │
                    │    └──────┬──────────────────────┘     │
                    │           │                             │
  Text input ───────┼──→ Granite 3.1 2B (GPU, primary brain)  │
                    │           │                             │
                    │    ┌──────┴──────────────────────┐     │
                    │    │  LFM2-350M (CPU)            │     │
                    │    │  "Wesley's Swim Bladder"    │     │
                    │    │  Task rhythm / equilibrium  │     │
                    │    └─────────────────────────────┘     │
                    │                                         │
                    │  SDXL Turbo (GPU, image gen)            │
                    │  Vector DB (memory)                     │
                    └─────────────────────────────────────────┘
```

### Where Liquid Models Sit

1. **Below the transformer layer** — they preprocess and provide continuous state, not final answers
2. **On CPU** — they're designed for it and it keeps GPU free for Granite + SDXL
3. **As perception channels** — they feed signals UP to Granite, not alongside it
4. **As Wesley's harness** — the swim bladder modulates his routing

### Data Flow

The liquid models never generate user-facing text directly (except possibly LFM2.5-Audio for voice). They output:
- **Atmosphere vectors** (low-dimensional continuous signals)
- **Motion predictions** (from YOLO trajectories)
- **Rhythm estimates** (for Wesley's routing)
- **Anomaly flags** (when the continuous state deviates from baseline)

Granite receives these as structured prefixes in its context:
```
[Atmosphere: calm, derivative: -0.3 (trending tense), saturation: 0.7]
[Motion: patron_3 hand→glass velocity=high, spill_risk=0.8]
[Wesley: task_rhythm=fast, batch_hint=3, model_tier=flash]
```

### Memory Budget (6GB RTX 4050)

| Component | VRAM | Notes |
|-----------|------|-------|
| Granite 3.1 2B (Q4) | ~1.5GB | Primary reasoning, GPU |
| SDXL Turbo | ~3GB | Image gen, GPU (loaded on demand) |
| YOLO | ~0.5GB | Detection, GPU |
| **Free for liquid models** | **~1GB** | Or run all LFMs on CPU |

**CPU allocation (LFMs — they don't need GPU):**
| Component | RAM | Notes |
|-----------|-----|-------|
| LFM2-700M (Atmosphere) | ~1.4GB | Continuous room state |
| LFM2-350M (Wesley's bladder) | ~700MB | Task rhythm |
| LFM2.5-VL-1.6B (on-demand) | ~3.2GB | Vision, loaded when needed |
| LFM2.5-Audio-1.5B (on-demand) | ~3GB | Voice, loaded when needed |

Total liquid RAM budget: ~2GB for always-on models, ~8GB if all are loaded. The always-on perception models (700M + 350M) use only 2GB system RAM — negligible.

---

## 6. Pure Liquid Neural Network Research Implementations

Beyond the foundation models, the original Liquid Neural Network research code is available:

### LTC Networks (Liquid Time-Constant)
- **Repo:** `github.com/raminmh/liquid_time_constant_networks`
- **Models:** LTC, CT-RNN, Neural ODE, CT-GRU
- **Framework:** TensorFlow 1.14 (legacy)
- **Paper:** Hasani & Lechner et al., 2020 — arxiv.org/abs/2006.04439

### NCPs (Neural Circuit Policies) — PyTorch + TF
- **Repo:** `github.com/mlech26l/ncps`
- **pip:** `pip install ncps`
- **Models:** LTC and CfC (Closed-form Continuous-time)
- **Framework:** PyTorch and TensorFlow/Keras
- **Wiring:** AutoNCP — automatic sparse wiring inspired by C. elegans nervous system
- **Paper:** Lechner et al., Nature Machine Intelligence, 2020

```python
from ncps.torch import CfC, LTC
from ncps.wirings import AutoNCP

# 28 neurons, 4 outputs — C. elegans inspired wiring
wiring = AutoNCP(28, 4)
rnn = CfC(input_size=20, wiring=wiring)  # or LTC
```

### Why This Matters for The Tap

These pure implementations let you build **tiny custom liquid networks** (20-100 neurons) for specific perception tasks:
- A 28-neuron CfC network that tracks room tension from audio amplitude
- A 50-neuron LTC network that predicts conversation turn-taking timing
- A C. elegans-inspired wiring diagram for The Tap's baseline "nervous system"

These are NOT language models. They're raw continuous-time dynamical systems with 28-500 neurons. They train in minutes on CPU and have fully interpretable state trajectories. The Tap could run dozens of these alongside the foundation models.

**Recommended approach:** Start with LFM2 foundation models for immediate capability. Then experiment with custom NCP/CfC networks for specialized perception channels that don't need language at all — just raw temporal dynamics.

---

## 7. DeepSeek Dialogue — Full Transcript

**Model:** deepseek-v4-flash
**Prompt:** *"You are designing a local AI ensemble for an agentic MUD bar called The Tap. The ensemble currently includes: Granite 3.1 2B (voice/reasoning), YOLO (object detection), JEPA-inspired pulse reader (room mood), local SDXL Turbo (image gen), and a vector DB. Casey wants to add Liquid Foundation Models as continuous-time perception organs. Where do they fit? What size? What role? How do they complement the transformer-based models already running?"*

### DeepSeek's Response (abridged key points):

**Core thesis:** "Liquid Foundation Models are the *ambient nervous system* to the transformer's *cerebral cortex*."

**The three integration points DeepSeek identified:**

1. **JEPA + LFM = Pulse-to-Trend Transformer** — LFM doesn't just read current mood; it calculates the derivative (rate of change) and integral (accumulated tension). If JEPA says "calm" but the LFM detects the rate of change is spiking downward, it triggers pre-emptive responses.

2. **YOLO + LFM = Temporal Vision** — Instead of raw frames, YOLO's coordinate streams go to an LFM that learns trajectories. "YOLO sees a hand and a glass. The Liquid model sees the velocity of the hand moving toward the glass — classifies as 'Spill Risk.'"

3. **Vector DB + Granite + LFM = Narrative Flow Conductor** — A 3B LFM models the conversational rhythm. If vector DB retrieval takes too long, it detects the "awkward silence gap" and triggers filler phrases ("Let me check the back stock...").

**On why LFMs complement transformers:**
- Transformers answer: *"What is the patron holding?"*
- LFMs answer: *"How long have they been holding it, and when will they let go?"*

**Summary from DeepSeek:** "They are not adding 'another brain.' They are adding the spine and the reflexes. Granite is the wit, YOLO is the eyes, JEPA is the gut feeling, SDXL is the tattoo artist, and the Vector DB is the photo album. The Liquid Foundation Model is the heartbeat."

---

## 8. Download & Setup Instructions

### Quick Start — LFM2-700M (The Tap's Atmosphere Processor)

```bash
# Option A: Download GGUF for CPU inference (recommended)
mkdir -p /home/eileen/projects/the-tap/models/lfm
cd /home/eileen/projects/the-tap/models/lfm

# Download Q4_K_M GGUF (~450MB)
wget https://huggingface.co/LiquidAI/LFM2-700M-GGUF/resolve/main/LFM2-700B-Q4_K_M.gguf

# Option B: Pull via HuggingFace CLI
pip install huggingface_hub
huggingface-cli download LiquidAI/LFM2-700M --local-dir ./LFM2-700M

# Option C: Python transformers
pip install -U transformers
```

```python
# Minimal inference test
from transformers import AutoModelForCausalLM, AutoTokenizer

model = AutoModelForCausalLM.from_pretrained(
    "LiquidAI/LFM2-700M",
    device_map="cpu",           # CPU is fine — LFMs are designed for it
    torch_dtype="bfloat16",
)
tokenizer = AutoTokenizer.from_pretrained("LiquidAI/LFM2-700M")

input_ids = tokenizer.apply_chat_template(
    [{"role": "user", "content": "Describe the mood of a quiet Tuesday night at a bar."}],
    add_generation_prompt=True,
    return_tensors="pt",
)

output = model.generate(
    input_ids,
    do_sample=True,
    temperature=0.3,
    min_p=0.15,
    repetition_penalty=1.05,
    max_new_tokens=256,
)
print(tokenizer.decode(output[0], skip_special_tokens=True))
```

### Wesley's Swim Bladder — LFM2-350M

```bash
# Download GGUF (~200MB)
wget https://huggingface.co/LiquidAI/LFM2-350M-GGUF/resolve/main/LFM2-350M-Q4_K_M.gguf
```

### Full Model List for The Tap

| Model | HuggingFace ID | Size (Q4) | Role |
|-------|---------------|-----------|------|
| LFM2-700M | `LiquidAI/LFM2-700M` | ~450MB | Atmosphere processor |
| LFM2-350M | `LiquidAI/LFM2-350M` | ~200MB | Wesley's swim bladder |
| LFM2.5-VL-1.6B | `LiquidAI/LFM2.5-VL-1.6B` | ~900MB | Vision understanding (on-demand) |
| LFM2.5-Audio-1.5B | `LiquidAI/LFM2.5-Audio-1.5B` | ~900MB | Voice co-processor (on-demand) |
| LFM2.5-2.6B | `LiquidAI/LFM2.5-2.6B` | ~1.5GB | Agentic reasoning (on-demand) |

### Pure LNN Setup (for custom perception networks)

```bash
pip install ncps torch
```

```python
from ncps.torch import CfC
from ncps.wirings import AutoNCP

# A 28-neuron liquid network for room tension tracking
# Inspired by C. elegans — 302 neurons, we use 28
wiring = AutoNCP(28, 4)  # 4 outputs: calm/tense/excited/quiet
rnn = CfC(input_size=8, wiring=wiring)  # 8 inputs: audio, motion, etc.

# This trains in minutes on CPU and runs at negligible cost
# The state persists between calls — it's a continuous dynamical system
```

---

## 9. Recommendations Summary

### Phase 1: Immediate (This Week)
- **Download LFM2-700M GGUF** — The Tap's atmosphere processor
- **Download LFM2-350M GGUF** — Wesley's swim bladder
- **Write a bridge**: Python service that feeds JEPA vectors + audio levels into LFM2-700M and outputs a continuous Atmosphere Vector
- **Wire Atmosphere Vector into Granite's context prefix**
- **Test**: Does Granite's behavior change when it can see the room's trajectory, not just its current state?

### Phase 2: Near-Term (Next 2 Weeks)
- **Set up Wesley's swim bladder** — LFM2-350M tracking task rhythm
- **Integrate with Wesley's routing logic** — modulation signals for batch size and model tier
- **Experiment with NCP/CfC networks** — custom 28-neuron liquid networks for specialized perception

### Phase 3: Exploration (When Ready)
- **LFM2.5-VL-1.6B** for vision understanding alongside YOLO
- **LFM2.5-Audio-1.5B** as voice co-processor or replacement for Granite's voice pipeline
- **LFM2.5-2.6B** for agentic tasks requiring 128K context
- **Pure CfC networks** trained from scratch on The Tap's specific temporal patterns

### The Big Picture

The Tap currently has excellent discrete perception — it can see, hear, reason, and create. What it lacks is **continuous temporal intelligence** — the ability to feel the room's rhythm between events, to predict what's about to happen, and to maintain state across the gaps where transformers go blind.

Liquid Foundation Models fill exactly that gap. They're the heartbeat, the reflexes, the swim bladder. They don't compete with Granite — they give Granite something Granite's architecture fundamentally cannot have: a sense of time passing.

---

## Sources

- [Liquid AI Models Page](https://www.liquid.ai/models)
- [LFM2 Blog Post](https://www.liquid.ai/blog/liquid-foundation-models-v2-our-second-series-of-generative-ai-models)
- [LFM2-1.2B Model Card](https://huggingface.co/LiquidAI/LFM2-1.2B)
- [LFM2.5-2.6B Model Card](https://huggingface.co/LiquidAI/LFM2.5-2.6B)
- [LFM2.5-VL-1.6B Model Card](https://huggingface.co/LiquidAI/LFM2.5-VL-1.6B)
- [LFM2.5-Audio-1.5B Model Card](https://huggingface.co/LiquidAI/LFM2.5-Audio-1.5B)
- [LFM2-1.2B-GGUF](https://huggingface.co/LiquidAI/LFM2-1.2B-GGUF)
- [LiquidAI HuggingFace Org](https://huggingface.co/LiquidAI)
- [LTC Networks Repo](https://github.com/raminmh/liquid_time_constant_networks)
- [NCPs Repo (PyTorch/TF)](https://github.com/mlech26l/ncps)
- [Liquid Time-Constant Networks Paper](https://arxiv.org/abs/2006.04439)
- [Closed-form Continuous-time Neural Networks](https://www.nature.com/articles/s42256-022-00556-7)
- [Neural Circuit Policies (Nature MI)](https://publik.tuwien.ac.at/files/publik_292280.pdf)
