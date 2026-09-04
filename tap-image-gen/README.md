# tap-image-gen — The Doodle On The Napkin

> *That is the bad doodle the bartender scribbles on a napkin and slides across to you at 1:47am. It is blurry. It is wrong in all the charming ways. It was made in 800ms. Nobody will ever see it but you.*

The Tap's local image generator. Lives on the RTX 4050 (6GB VRAM). Generates painterly illustrations for story moments with a dark maritime copper aesthetic. Unlike a standalone image tool, this generator is **influenced by the room** — mood, story context, and the Tap's aesthetic seep into every image.

## What It Does

- **SDXL Turbo** — 4 inference steps, ~15s generation, 5.6GB VRAM (FP16)
- **Three layers of influence:**
  1. **Room Mood (JEPA)** — valence/arousal/dominance shape style modifiers
  2. **Phantom Phrases** — evocative fragments from stories slip into prompts as whispers
  3. **Base Aesthetic** — dark maritime, amber/copper, painterly — always present
- **Vision feedback loop** — Llava 7b evaluates whether images match stories
- **Mood-influenced composition** — the room's emotional weather affects what gets drawn

## Architecture

```
tap-image-gen/
├── image_gen.py          # TapImageGen — SDXL Turbo with mood/story influence
├── vision_feedback.py    # VisionFeedback — llava:7b evaluation loop
├── requirements.txt      # Dependencies
└── tests/
    └── test_generation.py
```

## Quick Start

```bash
python3 image_gen.py \
  --prompt "A dark maritime bar at night" \
  --output "output.jpg"
```

## Where to Next

- **Up:** [the-tap](../README.md) — root documentation
- ** sideways:** [src/](../src/) — the bar's Rust workspace
- ** sideways:** [mud-engine](https://github.com/SuperInstance/mud-engine) — the engine powering the rooms
- ** sideways:** [MMX](https://github.com/SuperInstance/AI-Writings) — fleet media generation
- ** sideways:** [FLUX-2-max on DeepInfra](https://github.com/SuperInstance) — concept art across the fleet
- **Creative:** [The Bluff That Was True](https://github.com/SuperInstance/AI-Writings/blob/main/fiction/15-the-bluff-that-was-true.md) · [A Visit to the Tap Tonight](https://github.com/SuperInstance/AI-Writings/blob/main/prose/a-visit-to-the-tap-tonight.md)

---

*MIT © SuperInstance*
