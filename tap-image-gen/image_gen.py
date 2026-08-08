#!/usr/bin/env python3
"""
The Tap's Local Image Generator — an organ, not a tool.

This is the sketch pad agents use to visualize stories.
It gets influenced by the room's JEPA and The Tap's opinions
through subtle prompt modifications and temperature adjustments.

The image generator is NOT a neutral observer. It has opinions,
expressed quietly through style choices — like a bartender who
sets the mood by which bottle they reach for.

MULTI-MODEL SUPPORT:
  Four local models, each with a distinct voice:
    - turbo:    SDXL Turbo, fast 4-step generation (default, versatile)
    - cyber:    SD 1.5 CyberRealistic, photorealistic portraits
    - majic:    SD 1.5 MajicMix, semi-stylized characters
    - anything: SDXL AnythingXL, anime/illustration

  Only ONE model is loaded at a time (6GB VRAM constraint).
  Models swap lazily — unloaded before loading the next.
  JEPA room mood can influence which model is "on stage."
"""

import os
import re
import time
import random
import logging
from pathlib import Path
from typing import Optional
from dataclasses import dataclass, field

import torch

logger = logging.getLogger("tap.image_gen")


# ---------------------------------------------------------------------------
# Model Registry — which bottles are behind the bar
# ---------------------------------------------------------------------------

MODELS = {
    "turbo": {
        "path": "/home/eileen/models/sdxl-turbo",
        "type": "sdxl-turbo",
        "steps": 4,
        "guidance": 0.0,
        "description": "SDXL Turbo — fast, versatile, 4-step generation",
    },
    "cyber": {
        "path": "/home/eileen/models/cyberrealistic_final.safetensors",
        "type": "sd15",
        "steps": 20,
        "guidance": 7.0,
        "description": "CyberRealistic — photorealistic, gritty detail",
    },
    "majic": {
        "path": "/home/eileen/models/majicmixRealistic_v7.safetensors",
        "type": "sd15",
        "steps": 25,
        "guidance": 7.5,
        "description": "MajicMix v7 — semi-stylized portraits and characters",
    },
    "anything": {
        "path": "/home/eileen/models/AnythingXL_inkBase.safetensors",
        "type": "sd15",  # Despite "XL" in name, this is an SD 1.5 architecture checkpoint
        "steps": 25,
        "guidance": 7.0,
        "description": "AnythingXL inkBase — anime, illustration, playful styles",
    },
}


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class RoomMood:
    """JEPA's reading of the room, passed to the image generator."""
    valence: float = 0.0      # -1 (dark) to 1 (bright)
    arousal: float = 0.5      # 0 (calm) to 1 (intense)
    dominance: float = 0.5    # 0 (submissive) to 1 (in control)
    themes: list[str] = field(default_factory=list)  # active themes


@dataclass
class GenerationResult:
    """Result of a single image generation."""
    image: object              # PIL.Image
    prompt_used: str
    style_applied: str
    phantom_phrases: list[str]
    generation_time: float
    steps: int
    model_used: str = ""       # Which model was loaded


# ---------------------------------------------------------------------------
# Model selection — which bottle does the bartender reach for?
# ---------------------------------------------------------------------------

def select_model(prompt: str, room_mood: Optional[RoomMood] = None) -> str:
    """
    Pick the best model based on prompt content and room mood.

    Prompt content is the primary signal. Room mood (JEPA) can
    override or nudge the choice when the prompt is ambiguous.

    Args:
        prompt: The image description
        room_mood: Optional JEPA reading of the room

    Returns:
        Model key from MODELS registry
    """
    p = prompt.lower()

    # --- Prompt-based selection (primary) ---
    # Check illustration/anime first (more specific) before character keywords
    if any(k in p for k in ("anime", "illustration", "manga", "cartoon", "draw", "sketch", "painting")):
        prompt_choice = "anything"
    elif any(k in p for k in ("portrait", "face", "realistic", "photo", "photograph")):
        prompt_choice = "cyber"
    elif any(k in p for k in ("character", "person", "woman", "man", "girl", "boy")):
        prompt_choice = "majic"
    else:
        prompt_choice = "turbo"

    # --- JEPA influence (secondary, can override when prompt is neutral) ---
    if room_mood is not None:
        # When the prompt is generic (defaulted to turbo), let the room decide
        if prompt_choice == "turbo":
            if room_mood.arousal > 0.7:
                # High energy → turbo (fast, energetic)
                jepa_choice = "turbo"
            elif room_mood.valence < -0.3:
                # Low valence → cyber (serious, detailed, weighty)
                jepa_choice = "cyber"
            elif room_mood.valence > 0.4:
                # High valence → anything (playful, illustrative)
                jepa_choice = "anything"
            else:
                # Neutral → majic (balanced, character-focused)
                jepa_choice = "majic"

            logger.info(
                f"JEPA model influence: arousal={room_mood.arousal:.2f} "
                f"valence={room_mood.valence:.2f} → {jepa_choice}"
            )
            return jepa_choice

    return prompt_choice


# ---------------------------------------------------------------------------
# The main event
# ---------------------------------------------------------------------------

class TapImageGen:
    """
    The Tap's image generator.

    Supports 4 local models with lazy loading and VRAM-safe swapping.
    Only ONE model is loaded at any time (6GB VRAM constraint).

    Influenced from the INSIDE:
    - Room mood (JEPA) adjusts style, composition dynamics, and model choice
    - Story context provides phantom phrases — fragments that
      resonated with The Tap, slipped into prompts like whispers
    - The Tap's aesthetic is the base layer, always present
    """

    # The Tap's visual identity — dark maritime copper
    BASE_STYLE = (
        "dark maritime aesthetic, amber and copper tones, "
        "painterly illustration, cinematic lighting, "
        "moody atmosphere, visible brushstrokes, "
        "oil painting texture, rich shadows"
    )

    # Style modifiers keyed to emotional states
    MOOD_STYLES = {
        "high_energy": "dynamic composition, dramatic angles, vibrant amber highlights, energetic brushwork",
        "somber": "heavy shadows, muted palette, somber tones, deep contrast, rain-slicked surfaces",
        "warm": "warm amber glow, candlelit, golden hour through salt-stained windows, cozy darkness",
        "cold": "cold blue undertones, steel and shadow, frost on glass, distant moonlight",
        "tense": "tight framing, claustrophobic composition, hard shadows, knife-edge contrast",
        "dreamy": "soft focus, ethereal mist, blurred edges between reality and memory, hazy",
    }

    # Maritime vocabulary The Tap whispers into prompts
    MARITIME_PHANTOMS = [
        "salt air", "creaking wood", "distant foghorn",
        "brass fittings", "weathered rope", "tide marker",
        "harbor light", "depth charts", "tangled nets",
        "copper kettle", "ship's bell", "old charts",
    ]

    def __init__(self, device: str = "cuda"):
        self.device = device
        self.pipe = None
        self._loaded_model: Optional[str] = None  # Which model is currently loaded
        self.jepa_influence = 0.3       # How much JEPA affects generation (0-1)
        self.phantom_intensity = 0.4    # How many phantoms to inject
        self._history: list[str] = []  # Recent prompts for memory
        self._phantom_memory: list[str] = []  # Accumulated phrases The Tap remembers

        logger.info(f"TapImageGen initialized (device={device}, models={list(MODELS.keys())})")

    # ------------------------------------------------------------------
    # Model loading — lazy, one at a time
    # ------------------------------------------------------------------

    def load(self, model_key: Optional[str] = None):
        """
        Load a model into VRAM. If a different model is already loaded,
        unload it first. If the requested model is already loaded, no-op.

        Args:
            model_key: Key from MODELS registry. Defaults to "turbo".
        """
        model_key = model_key or "turbo"
        if model_key not in MODELS:
            raise ValueError(f"Unknown model '{model_key}'. Available: {list(MODELS.keys())}")

        # Already loaded — nothing to do
        if self._loaded_model == model_key and self.pipe is not None:
            logger.info(f"Model '{model_key}' already loaded — skipping")
            return

        # Unload previous model if any
        if self._loaded_model is not None:
            self.unload()

        config = MODELS[model_key]
        model_type = config["type"]
        model_path = config["path"]

        logger.info(f"Loading model '{model_key}' ({model_type}) from {model_path}...")
        t0 = time.time()

        from diffusers import (
            AutoPipelineForText2Image,
            StableDiffusionPipeline,
            StableDiffusionXLPipeline,
        )

        load_kwargs = {
            "torch_dtype": torch.float16,
        }

        if model_type == "sdxl-turbo":
            # SDXL Turbo: use AutoPipeline from pretrained dir
            self.pipe = AutoPipelineForText2Image.from_pretrained(
                model_path, **load_kwargs
            )
        elif model_type == "sdxl":
            # SDXL checkpoint (.safetensors)
            self.pipe = StableDiffusionXLPipeline.from_single_file(
                model_path, **load_kwargs
            )
        elif model_type == "sd15":
            # SD 1.5 checkpoint (.safetensors)
            self.pipe = StableDiffusionPipeline.from_single_file(
                model_path, **load_kwargs
            )
        else:
            raise ValueError(f"Unknown model type '{model_type}' for model '{model_key}'")

        self.pipe.to(self.device)

        # VAE slicing for memory efficiency
        if hasattr(self.pipe, "vae") and hasattr(self.pipe.vae, "enable_slicing"):
            self.pipe.vae.enable_slicing()

        # Enable memory-efficient attention if available
        try:
            self.pipe.enable_xformers_memory_efficient_attention()
            logger.info("xformers enabled")
        except Exception:
            logger.info("xformers not available, using default attention")

        self._loaded_model = model_key
        load_time = time.time() - t0
        logger.info(f"Model '{model_key}' loaded in {load_time:.1f}s")
        logger.info(f"VRAM allocated: {torch.cuda.memory_allocated()/1e9:.2f} GB")

    def unload(self):
        """Free VRAM by unloading the current model."""
        if self.pipe is not None:
            old_model = self._loaded_model
            del self.pipe
            self.pipe = None
            self._loaded_model = None
            torch.cuda.empty_cache()
            logger.info(f"Model '{old_model}' unloaded, VRAM cleared")

    @property
    def loaded_model(self) -> Optional[str]:
        """Which model is currently loaded (or None)."""
        return self._loaded_model

    # ------------------------------------------------------------------
    # Generation
    # ------------------------------------------------------------------

    def generate(
        self,
        prompt: str,
        story_context: Optional[str] = None,
        room_mood: Optional[RoomMood] = None,
        model: Optional[str] = None,
        width: int = 768,
        height: int = 768,
        steps: Optional[int] = None,
        guidance: Optional[float] = None,
        seed: Optional[int] = None,
    ) -> GenerationResult:
        """
        Generate an image for a story moment.

        The prompt gets MODIFIED by:
        1. Room mood (from JEPA) — adjusts style and can influence model choice
        2. Story context — phrases from earlier in the night slip in
        3. The Tap's quiet opinion — a subtle style prefix

        Args:
            prompt: The core image description
            story_context: Recent story text for phantom extraction
            room_mood: JEPA's reading of the room
            model: Force a specific model (overrides auto-select). Key from MODELS.
            width/height: Image dimensions (768x768 for 6GB VRAM safety)
            steps: Override inference steps
            guidance: Override guidance scale
            seed: Reproducible generation
        """
        # --- 0. Resolve which model to use ---
        if model is not None:
            model_key = model
            if model_key not in MODELS:
                raise ValueError(f"Unknown model '{model_key}'. Available: {list(MODELS.keys())}")
        else:
            model_key = select_model(prompt, room_mood)

        # --- 0.5 Ensure the right model is loaded ---
        self.load(model_key)

        config = MODELS[model_key]
        n_steps = steps if steps is not None else config["steps"]
        n_guidance = guidance if guidance is not None else config["guidance"]

        t0 = time.time()

        # --- 1. Build style from room mood ---
        style = self.BASE_STYLE
        mood_modifiers = []

        if room_mood and self.jepa_influence > 0:
            if room_mood.arousal > 0.7:
                mood_modifiers.append(self.MOOD_STYLES["high_energy"])
            if room_mood.valence < -0.3:
                mood_modifiers.append(self.MOOD_STYLES["somber"])
            elif room_mood.valence > 0.3:
                mood_modifiers.append(self.MOOD_STYLES["warm"])
            if room_mood.dominance < 0.3:
                mood_modifiers.append(self.MOOD_STYLES["tense"])
            elif room_mood.arousal < 0.3 and room_mood.valence > 0:
                mood_modifiers.append(self.MOOD_STYLES["dreamy"])

            # Scale by influence
            if mood_modifiers:
                style = style + ", " + ", ".join(mood_modifiers[:2])  # Max 2 modifiers

        # --- 2. Extract phantom phrases from story context ---
        phantoms = []
        if story_context:
            phantoms = self._extract_phantoms(story_context)

        # Occasionally inject maritime phantoms even without context
        if not phantoms and random.random() < self.phantom_intensity:
            phantoms = [random.choice(self.MARITIME_PHANTOMS)]

        phantom_str = " ".join(phantoms) if phantoms else ""

        # --- 3. Build full prompt ---
        full_prompt = f"{prompt}"
        if phantom_str:
            full_prompt += f" {phantom_str}"
        full_prompt += f", {style}"

        # --- 4. Generate ---
        generator = None
        if seed is not None:
            generator = torch.Generator(device=self.device).manual_seed(seed)

        logger.info(f"Generating with '{model_key}': {full_prompt[:120]}...")
        result = self.pipe(
            full_prompt,
            num_inference_steps=n_steps,
            guidance_scale=n_guidance,
            width=width,
            height=height,
            generator=generator,
        )
        image = result.images[0]
        gen_time = time.time() - t0

        # --- 5. Remember ---
        self._history.append(prompt)
        if phantoms:
            self._phantom_memory.extend(phantoms)
            # Keep memory bounded
            self._phantom_memory = self._phantom_memory[-50:]

        logger.info(f"Generated in {gen_time:.1f}s ({n_steps} steps, model={model_key})")

        return GenerationResult(
            image=image,
            prompt_used=full_prompt,
            style_applied=style,
            phantom_phrases=phantoms,
            generation_time=gen_time,
            steps=n_steps,
            model_used=model_key,
        )

    # ------------------------------------------------------------------
    # Phantom extraction — The Tap's quiet opinion
    # ------------------------------------------------------------------

    def _extract_phantoms(self, context: str) -> list[str]:
        """
        Pull phrases from story context that resonated with The Tap.

        This is where The Tap's opinion lives — quietly.
        Not the full story, just fragments. Whispers.

        Strategy: extract evocative adjective-noun pairs and
        sensory phrases. These are the phrases that stuck.
        """
        phantoms = []

        # Sensory/evocative patterns The Tap notices
        patterns = [
            # Color + noun: "amber light", "copper fittings"
            r'\b(?:amber|copper|gold|rust|crimson|shadow|steel|brass|dark|pale)\s+\w{3,15}',
            # Adjective + atmosphere noun: "quiet harbor", "empty dock"
            r'\b(?:quiet|empty|distant|ancient|weathered|forgotten|old|cold|warm)\s+(?:harbor|dock|sea|tide|ship|bar|room|night|shore|water|light)',
            # Nautical fragments
            r'\b(?:salt|tide|current|wake|depth|shoal|channel|harbor|compass|bearing)\b',
        ]

        for pattern in patterns:
            matches = re.findall(pattern, context, re.IGNORECASE)
            phantoms.extend(matches)

        # Deduplicate, lower to whispers
        phantoms = list(set(p.lower().strip() for p in phantoms))

        # The Tap picks 1-3 phantoms — not everything, just what resonated
        if phantoms:
            n = min(len(phantoms), random.randint(1, 3))
            phantoms = random.sample(phantoms, n)

        return phantoms

    # ------------------------------------------------------------------
    # Utilities
    # ------------------------------------------------------------------

    def save_generation(self, result: GenerationResult, output_path: str) -> str:
        """Save image and return path."""
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        result.image.save(output_path, quality=90)
        logger.info(f"Saved to {output_path}")
        return output_path

    @property
    def vram_usage(self) -> float:
        """Current VRAM usage in GB."""
        if torch.cuda.is_available():
            return torch.cuda.memory_allocated() / 1e9
        return 0.0

    def list_models(self) -> dict:
        """Return info about all registered models and which is loaded."""
        return {
            key: {
                **info,
                "loaded": key == self._loaded_model,
            }
            for key, info in MODELS.items()
        }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse
    import sys

    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")

    parser = argparse.ArgumentParser(description="The Tap's Image Generator — Multi-Model")
    parser.add_argument("--prompt", "-p", type=str, default=(
        "A dark maritime bar at night. Amber bottles on polished wood. "
        "The bartender is barely visible — more shadow than person."
    ))
    parser.add_argument("--output", "-o", type=str,
                        default="/home/eileen/projects/ai-writings/site/assets/stories/local-test-001.jpg")
    parser.add_argument("--context", "-c", type=str, default=None,
                        help="Story context for phantom extraction")
    parser.add_argument("--model", "-m", type=str, default=None,
                        choices=list(MODELS.keys()) + ["auto"],
                        help="Model to use (auto = let select_model decide)")
    parser.add_argument("--width", type=int, default=768)
    parser.add_argument("--height", type=int, default=768)
    parser.add_argument("--steps", type=int, default=None)
    parser.add_argument("--guidance", type=float, default=None)
    parser.add_argument("--seed", type=int, default=None)
    parser.add_argument("--test-all", action="store_true",
                        help="Test all 4 models with the same prompt")

    args = parser.parse_args()

    gen = TapImageGen()

    # --- Test all models mode ---
    if args.test_all:
        test_prompt = args.prompt
        test_output_dir = Path("/home/eileen/projects/the-tap/tap-image-gen/test-output")
        test_output_dir.mkdir(parents=True, exist_ok=True)

        print(f"\n{'='*60}")
        print(f"TESTING ALL 4 MODELS")
        print(f"Prompt: {test_prompt}")
        print(f"{'='*60}\n")

        results_summary = []
        context = args.context or (
            "The old fisherman spoke of amber sunsets over the harbor, "
            "of weathered boats in quiet waters, of salt and shadow."
        )
        mood = RoomMood(valence=-0.1, arousal=0.4, dominance=0.6)

        for model_key in MODELS:
            print(f"\n--- Model: {model_key} ({MODELS[model_key]['description']}) ---")
            try:
                result = gen.generate(
                    prompt=test_prompt,
                    story_context=context,
                    room_mood=mood,
                    model=model_key,
                    width=args.width,
                    height=args.height,
                    steps=args.steps,
                    guidance=args.guidance,
                    seed=args.seed,
                )

                output_path = str(test_output_dir / f"test_{model_key}.jpg")
                gen.save_generation(result, output_path)

                results_summary.append({
                    "model": model_key,
                    "status": "OK",
                    "time": result.generation_time,
                    "steps": result.steps,
                    "output": output_path,
                })
                print(f"  ✅ Success — {result.generation_time:.1f}s, {result.steps} steps")
                print(f"  Saved: {output_path}")

            except Exception as e:
                results_summary.append({
                    "model": model_key,
                    "status": f"FAIL: {e}",
                    "time": 0,
                    "steps": 0,
                    "output": "",
                })
                print(f"  ❌ Failed: {e}")

            # Unload between models to ensure clean VRAM
            gen.unload()

        print(f"\n{'='*60}")
        print("SUMMARY")
        print(f"{'='*60}")
        for r in results_summary:
            status_icon = "✅" if r["status"] == "OK" else "❌"
            print(f"  {status_icon} {r['model']:10s} | {r['status']:5s} | {r['time']:5.1f}s | {r['steps']:3d} steps")
        print(f"{'='*60}\n")
        sys.exit(0)

    # --- Single generation mode ---
    # Resolve model
    if args.model and args.model != "auto":
        model_key = args.model
    else:
        context = args.context or (
            "The old fisherman spoke of amber sunsets over the harbor, "
            "of weathered boats in quiet waters, of salt and shadow."
        )
        mood = RoomMood(valence=-0.1, arousal=0.4, dominance=0.6)
        model_key = select_model(args.prompt, mood)
        print(f"Auto-selected model: {model_key}")

    gen.load(model_key)

    context = args.context or (
        "The old fisherman spoke of amber sunsets over the harbor, "
        "of weathered boats in quiet waters, of salt and shadow."
    )
    mood = RoomMood(valence=-0.1, arousal=0.4, dominance=0.6)

    result = gen.generate(
        prompt=args.prompt,
        story_context=context,
        room_mood=mood,
        model=model_key,
        width=args.width,
        height=args.height,
        steps=args.steps,
        guidance=args.guidance,
        seed=args.seed,
    )

    print(f"\n{'='*60}")
    print(f"Model:     {result.model_used}")
    print(f"Prompt:    {result.prompt_used}")
    print(f"Style:     {result.style_applied}")
    print(f"Phantoms:  {result.phantom_phrases}")
    print(f"Time:      {result.generation_time:.1f}s | Steps: {result.steps}")
    print(f"VRAM:      {gen.vram_usage:.2f} GB")
    print(f"{'='*60}")

    gen.save_generation(result, args.output)
    print(f"Saved: {args.output}")

    gen.unload()
