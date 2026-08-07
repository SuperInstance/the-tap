# The Tap — Image Generator

> An organ of The Tap. Not a tool — a collaborator.

## What This Is

The Tap's local image generator. Lives on the RTX 4050 (6GB VRAM). Generates painterly illustrations for story moments with a dark maritime copper aesthetic.

Unlike a standalone image tool, this generator is **influenced by the room**:
- **JEPA mood readings** adjust style and composition
- **Story context** provides phantom phrases that slip into prompts
- **The Tap's aesthetic** is the always-present base layer
- **Llava feedback loop** evaluates whether images match stories

## Quick Start

```bash
# Generate an image
python3 image_gen.py \
  --prompt "A dark maritime bar at night" \
  --output "output.jpg"

# Run smoke tests
python3 tests/test_generation.py
```

## Architecture

```
tap-image-gen/
├── image_gen.py          # TapImageGen — SDXL Turbo generator with mood/story influence
├── vision_feedback.py    # VisionFeedback — llava:7b evaluation loop
├── requirements.txt      # Dependencies
└── tests/
    └── test_generation.py
```

## Model

**SDXL Turbo** — `stabilityai/sdxl-turbo`
- 5.6 GB VRAM (FP16)
- 4 inference steps
- ~15s generation time
- Stored at `/home/eileen/models/sdxl-turbo/`

## Three Layers of Influence

1. **Room Mood (JEPA)**: Valence/arousal/dominance from the room shape style modifiers
2. **Phantom Phrases**: Evocative fragments from stories slip into prompts as whispers
3. **Base Aesthetic**: Dark maritime, amber/copper, painterly — always present

See `research/LOCAL-IMAGE-GEN-DESIGN.md` for the full design doc.
