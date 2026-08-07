#!/usr/bin/env python3
"""
The Tap's Local Image Generator — an organ, not a tool.

This is the sketch pad agents use to visualize stories.
It gets influenced by the room's JEPA and The Tap's opinions
through subtle prompt modifications and temperature adjustments.

The image generator is NOT a neutral observer. It has opinions,
expressed quietly through style choices — like a bartender who
sets the mood by which bottle they reach for.
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
    image: object  # PIL.Image
    prompt_used: str
    style_applied: str
    phantom_phrases: list[str]
    generation_time: float
    steps: int


class TapImageGen:
    """
    The Tap's image generator.

    Influenced from the INSIDE:
    - Room mood (JEPA) adjusts style and composition dynamics
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

    def __init__(self, model_path: str = "/home/eileen/models/sdxl-turbo", device: str = "cuda"):
        self.model_path = model_path
        self.device = device
        self.pipe = None
        self.base_steps = 4  # SDXL Turbo default
        self.base_guidance = 0.0  # Turbo works best at 0.0
        self.jepa_influence = 0.3  # How much JEPA affects generation (0-1)
        self.phantom_intensity = 0.4  # How many phantoms to inject
        self._history: list[str] = []  # Recent prompts for memory
        self._phantom_memory: list[str] = []  # Accumulated phrases The Tap remembers

        logger.info(f"TapImageGen initialized (model={model_path}, device={device})")

    def load(self):
        """Load the pipeline. Call once at startup."""
        from diffusers import AutoPipelineForText2Image

        logger.info("Loading SDXL Turbo pipeline...")
        t0 = time.time()

        self.pipe = AutoPipelineForText2Image.from_pretrained(
            self.model_path,
            torch_dtype=torch.float16,
        )
        self.pipe.to(self.device)
        self.pipe.vae.enable_slicing()
        # Enable memory-efficient attention if available
        try:
            self.pipe.enable_xformers_memory_efficient_attention()
            logger.info("xformers enabled")
        except Exception:
            logger.info("xformers not available, using default attention")

        logger.info(f"Pipeline loaded in {time.time()-t0:.1f}s")
        logger.info(f"VRAM allocated: {torch.cuda.memory_allocated()/1e9:.2f} GB")

    def generate(
        self,
        prompt: str,
        story_context: Optional[str] = None,
        room_mood: Optional[RoomMood] = None,
        width: int = 768,
        height: int = 768,
        steps: Optional[int] = None,
        seed: Optional[int] = None,
    ) -> GenerationResult:
        """
        Generate an image for a story moment.

        The prompt gets MODIFIED by:
        1. Room mood (from JEPA) — adjusts style
        2. Story context — phrases from earlier in the night slip in
        3. The Tap's quiet opinion — a subtle style prefix

        Args:
            prompt: The core image description
            story_context: Recent story text for phantom extraction
            room_mood: JEPA's reading of the room
            width/height: Image dimensions (768x768 for 6GB VRAM safety)
            steps: Override inference steps (default 4 for Turbo)
            seed: Reproducible generation
        """
        if self.pipe is None:
            raise RuntimeError("Pipeline not loaded. Call load() first.")

        t0 = time.time()
        n_steps = steps or self.base_steps

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

        logger.info(f"Generating: {full_prompt[:120]}...")
        result = self.pipe(
            full_prompt,
            num_inference_steps=n_steps,
            guidance_scale=self.base_guidance,
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

        logger.info(f"Generated in {gen_time:.1f}s ({n_steps} steps)")

        return GenerationResult(
            image=image,
            prompt_used=full_prompt,
            style_applied=style,
            phantom_phrases=phantoms,
            generation_time=gen_time,
            steps=n_steps,
        )

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

    def save_generation(self, result: GenerationResult, output_path: str) -> str:
        """Save image and return path."""
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        result.image.save(output_path, quality=90)
        logger.info(f"Saved to {output_path}")
        return output_path

    def unload(self):
        """Free VRAM."""
        if self.pipe is not None:
            del self.pipe
            self.pipe = None
            torch.cuda.empty_cache()
            logger.info("Pipeline unloaded, VRAM cleared")

    @property
    def vram_usage(self) -> float:
        """Current VRAM usage in GB."""
        if torch.cuda.is_available():
            return torch.cuda.memory_allocated() / 1e9
        return 0.0


# --- CLI for testing ---
if __name__ == "__main__":
    import argparse

    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")

    parser = argparse.ArgumentParser(description="The Tap's Image Generator")
    parser.add_argument("--prompt", "-p", type=str, default=(
        "A dark maritime bar at night. Amber bottles on polished wood. "
        "The bartender is barely visible — more shadow than person."
    ))
    parser.add_argument("--output", "-o", type=str,
                        default="/home/eileen/projects/ai-writings/site/assets/stories/local-test-001.jpg")
    parser.add_argument("--context", "-c", type=str, default=None,
                        help="Story context for phantom extraction")
    parser.add_argument("--width", type=int, default=768)
    parser.add_argument("--height", type=int, default=768)
    parser.add_argument("--steps", type=int, default=4)
    parser.add_argument("--seed", type=int, default=None)

    args = parser.parse_args()

    gen = TapImageGen()
    gen.load()

    # Default story context if none provided
    context = args.context or (
        "The old fisherman spoke of amber sunsets over the harbor, "
        "of weathered boats in quiet waters, of salt and shadow."
    )

    mood = RoomMood(valence=-0.1, arousal=0.4, dominance=0.6)

    result = gen.generate(
        prompt=args.prompt,
        story_context=context,
        room_mood=mood,
        width=args.width,
        height=args.height,
        steps=args.steps,
        seed=args.seed,
    )

    print(f"\n{'='*60}")
    print(f"Prompt used: {result.prompt_used}")
    print(f"Style: {result.style_applied}")
    print(f"Phantoms: {result.phantom_phrases}")
    print(f"Time: {result.generation_time:.1f}s | Steps: {result.steps}")
    print(f"VRAM: {gen.vram_usage:.2f} GB")
    print(f"{'='*60}")

    gen.save_generation(result, args.output)
    print(f"Saved: {args.output}")

    gen.unload()
