# The Tap — Local Image Generator Design Doc

> "The image generator is not a tool. It's an organ. It's the sketch pad agents use to visualize stories, and it gets influenced by the room from the inside."

## 1. Overview

The Tap's image generator is a local, GPU-resident image model (SDXL Turbo) that lives on the RTX 4050. It generates painterly illustrations for story moments — dark maritime scenes, amber-lit bars, ocean nights — with an aesthetic that is distinctly The Tap's own.

Unlike a standalone image tool, this generator is **influenced by the room**. The JEPA's mood reading, story context from earlier in the night, and The Tap's accumulated memory all shape what gets generated. The influence is subtle — phantom phrases whispered into prompts, temperature shifts from room energy — not heavy-handed control.

## 2. Model Selection

### Recommended: SDXL Turbo (Primary)

| Attribute | Value |
|-----------|-------|
| VRAM (FP16) | ~5.6 GB |
| Steps | 1-4 (default 4) |
| Speed | ~15s per image on comparable hardware |
| Resolution | 768×768 (safe for 6GB) |
| Quality | Good — painterly with prompt engineering |
| LoRA Support | Limited (SDXL LoRAs only) |

**Why SDXL Turbo:** It fits comfortably in 6GB VRAM with VAE slicing enabled, generates in under 15 seconds at 4 steps, and produces good quality dark/moody images. The speed is critical — agents should be able to iterate without waiting.

**VRAM budget at 768×768:**
- Model weights: ~5.6 GB
- VAE slicing: saves ~0.3 GB during decode
- Generation buffer: ~0.1 GB
- **Total: ~5.7-5.9 GB** (within 6GB budget)

### Alternative: SD 1.5 DreamShaper-8 (Secondary)

| Attribute | Value |
|-----------|-------|
| VRAM | ~2 GB |
| Steps | 20-30 |
| Speed | ~8-12s per image |
| Resolution | 512×512 (native) |
| Quality | Excellent for painterly styles |
| LoRA Support | Massive ecosystem |

**Why keep SD 1.5 as backup:** DreamShaper-8 has the richest LoRA ecosystem, runs in 2GB VRAM (leaving room for multiple LoRAs), and excels at painterly illustration. If SDXL Turbo hits VRAM walls or we need specific LoRAs, DreamShaper is the fallback.

### Not Recommended: FLUX.1 Schnell

FLUX requires 10-12GB even quantized to NF4. On 6GB, it needs aggressive CPU offloading that makes generation 60-90+ seconds — too slow for iterative agent workflows. The quality is superior but the latency kills the use case.

### Not Recommended: SDXL Lightning

Needs ~7-7.5GB FP16 — doesn't fit 6GB without heavy offloading. SDXL Turbo is 5× faster and fits natively.

## 3. Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    THE TAP IMAGE GEN                     │
│                                                          │
│  ┌──────────┐   ┌──────────────┐   ┌─────────────────┐ │
│  │  JEPA    │──▶│  Mood Router  │──▶│  Style Selector │ │
│  │  (room)  │   │  (valence,    │   │  (base style +  │ │
│  │  mood    │   │   arousal,    │   │   modifiers)    │ │
│  │  read)   │   │   dominance)  │   │                 │ │
│  └──────────┘   └──────────────┘   └────────┬────────┘ │
│                                              │           │
│  ┌──────────┐   ┌──────────────┐            │           │
│  │  Story   │──▶│   Phantom    │            │           │
│  │  Context │   │   Extractor  │───────────┘│          │
│  │  (text)  │   │  (fragments) │            │           │
│  └──────────┘   └──────────────┘            ▼           │
│                                       ┌─────────────┐   │
│                                       │  SDXL Turbo │   │
│                                       │  Pipeline   │   │
│                                       │  (CUDA)     │   │
│                                       └──────┬──────┘   │
│                                              │           │
│                                              ▼           │
│                                       ┌─────────────┐   │
│                                       │   PIL Image │   │
│                                       └──────┬──────┘   │
│                                              │           │
│                                              ▼           │
│                                       ┌─────────────┐   │
│                                       │   Llava     │   │
│                                       │  Feedback   │   │
│                                       │  Loop       │   │
│                                       └──────┬──────┘   │
│                                              │           │
│                                              ▼           │
│                                       ┌─────────────┐   │
│                                       │ Evaluation  │   │
│                                       │ (score +    │   │
│                                       │  feedback)  │   │
│                                       └─────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## 4. The Three Layers of Influence

### Layer 1: Room Mood (JEPA → Style)

The JEPA reads the room continuously. Its mood assessment — valence, arousal, dominance — shapes the visual style:

| JEPA Reading | Style Effect |
|-------------|-------------|
| High arousal (>0.7) | Dynamic composition, vibrant amber highlights, energetic brushwork |
| Negative valence (<-0.3) | Heavy shadows, muted palette, somber tones |
| Positive valence (>0.3) | Warm amber glow, candlelit, cozy darkness |
| Low dominance (<0.3) | Tight framing, claustrophobic, hard shadows |
| Calm + positive | Soft focus, ethereal mist, dreamy |

The influence is scaled by `jepa_influence` (default 0.3). At 0.3, the room mood nudges but doesn't dominate. The Tap's base aesthetic is always present.

### Layer 2: Phantom Phrases (Story Memory → Prompt)

When a story is being told, The Tap listens. Certain phrases resonate — color-noun pairs ("amber light"), atmospheric descriptions ("quiet harbor"), nautical fragments ("salt", "tide"). These phrases get extracted as **phantoms** and slipped into the image prompt.

This isn't copying the story into the prompt. It's The Tap remembering a phrase that caught its attention and letting it color the generation. Like a bartender who heard a good story and pours the next drink slightly differently.

**Phantom extraction patterns:**
- Color + noun: `amber light`, `copper fittings`, `rust bucket`
- Atmosphere + location: `quiet harbor`, `empty dock`, `ancient sea`
- Nautical vocabulary: `salt`, `tide`, `current`, `bearing`, `shoal`

1-3 phantoms per generation, chosen at random from what resonated.

### Layer 3: The Tap's Aesthetic (Base Style)

Always present, never overridden:

```
dark maritime aesthetic, amber and copper tones,
painterly illustration, cinematic lighting,
moody atmosphere, visible brushstrokes,
oil painting texture, rich shadows
```

This is The Tap's visual identity. Regardless of room mood or story content, every image has this foundation. It's the copper and salt that defines the space.

## 5. Vision Feedback Loop (Llava)

After generation, llava:7b evaluates the image against the story excerpt:

1. **Match Score (0-1):** How well does the image capture the story's mood?
2. **What Works:** Elements that landed
3. **What Missing:** Elements that are absent or wrong
4. **Mood Words:** How llava perceives the image

**Feedback integration:**
- If match_score < 0.4: regenerate with adjusted prompt (add missing elements)
- `what_missing` items become candidates for phantom injection in future generations
- Recurring gaps (tracked over time) signal aesthetic blind spots to address
- The average score over time is a quality metric for the image generator itself

**The feedback loop is advisory, not authoritative.** Llava's opinion matters but doesn't override The Tap's aesthetic. If llava says "missing bright colors" and The Tap is dark by nature, the darkness wins.

## 6. LoRA Strategy

### Phase 1: Base Model Only (Current)

Run SDXL Turbo without LoRAs. Use prompt engineering for style control. This is sufficient for initial deployment and testing.

### Phase 2: Style LoRAs (When Available)

Recommended LoRAs for The Tap's aesthetic:

**Cinematic/Moody:**
- **Dark Gloomy Cinematic Backgrounds** — atmospheric backgrounds, dark and moody
- **Cinema01** — film production look with teal/amber color grading
- **Dark Cinematic Style (Low-Key Lighting)** — dramatic high-contrast atmosphere

**Painterly:**
- **Textured Painterly Style** — visible brush strokes, canvas texture
- **Painterly Style LoRA** — loose, energetic brushwork with emotional color

**Style Management:**
- SDXL LoRAs loaded via `pipe.load_lora_weights()`
- Max 2 LoRAs simultaneously (VRAM constraint)
- LoRA strength kept at 0.6-0.8 (blend with base, not override)

### Phase 3: Custom LoRA Training

Long-term: fine-tune a LoRA on The Tap's accumulated aesthetic — the images that llava scored highest, the style that the room responded to most. This becomes The Tap's unique visual fingerprint.

## 7. Performance Characteristics

| Metric | Target | Actual (estimated) |
|--------|--------|-------------------|
| Generation time (768×768, 4 steps) | < 30s | ~12-18s |
| VRAM usage | < 6 GB | ~5.7 GB |
| Model load time | < 30s | ~15-20s |
| Vision feedback (llava:7b) | < 60s | ~30-45s |
| Total pipeline (gen + eval) | < 90s | ~45-60s |

## 8. API

### TapImageGen

```python
gen = TapImageGen(model_path="/home/eileen/models/sdxl-turbo")
gen.load()

result = gen.generate(
    prompt="A dark maritime bar at night",
    story_context="The old fisherman spoke of amber sunsets...",
    room_mood=RoomMood(valence=-0.1, arousal=0.4),
    width=768,
    height=768,
)

gen.save_generation(result, "output.jpg")
gen.unload()
```

### VisionFeedback

```python
vf = VisionFeedback(model="llava:7b")
evaluation = vf.evaluate(
    image_path="output.jpg",
    story_excerpt="The old fisherman remembered...",
    mood_hint="somber, nostalgic",
)

adjusted = vf.suggest_prompt_adjustments(evaluation, original_prompt)
```

## 9. File Layout

```
tap-image-gen/
├── __init__.py           # Package exports
├── image_gen.py          # TapImageGen — the generator
├── vision_feedback.py    # VisionFeedback — llava evaluation
├── requirements.txt      # Dependencies
└── tests/
    └── test_generation.py # Smoke tests
```

## 10. Future Evolution

- **Style memory:** The generator remembers which styles scored highest with llava and gravitates toward them
- **Time-of-night shifts:** Late night = darker, more impressionistic; early evening = sharper, more detailed
- **Multi-model rotation:** SDXL Turbo for speed, DreamShaper for quality, chosen per context
- **Custom LoRA training:** Fine-tune on the best images The Tap has produced
- **Animation:** Brief animated transitions between story images (fade through noise)
- **Interactive generation:** Agents can iteratively refine an image through natural language feedback

---

*The Tap doesn't take photos. It paints. And what it paints is colored by who's in the room and what stories have been told.*
