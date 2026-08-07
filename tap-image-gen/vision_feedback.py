#!/usr/bin/env python3
"""
Vision Feedback Loop — Llava evaluates The Tap's images.

This is the mirror. After generation, llava:7b looks at the image
and the story excerpt and asks: does this capture the mood?

The feedback doesn't just judge — it suggests. Like a regular
looking at a painting behind the bar and muttering what's missing.
"""

import json
import logging
import subprocess
import base64
import re
from pathlib import Path
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger("tap.vision_feedback")


@dataclass
class VisionEvaluation:
    """Result of llava evaluating an image against a story."""
    match_score: float       # 0-1, how well the image matches the story mood
    what_works: list[str]    # Elements that captured the story well
    what_missing: list[str]  # Elements that are absent or wrong
    mood_words: list[str]    # Words llava associates with the image
    raw_response: str        # Full llava response


class VisionFeedback:
    """
    Llava-based vision feedback for The Tap's image generator.

    Uses ollama to run llava:7b locally. The model sees the generated
    image and the story excerpt, then evaluates the match.

    This feedback feeds back into future generations:
    - If match_score < 0.4, regenerate with adjusted prompt
    - what_missing becomes fuel for phantom extraction
    - Over time, patterns in feedback shape The Tap's aesthetic
    """

    def __init__(self, model: str = "llava:7b"):
        self.model = model
        self._history: list[VisionEvaluation] = []
        logger.info(f"VisionFeedback initialized (model={model})")

    def evaluate(
        self,
        image_path: str,
        story_excerpt: str,
        mood_hint: Optional[str] = None,
    ) -> VisionEvaluation:
        """
        Ask llava: does this image match this story moment?

        Args:
            image_path: Path to the generated image
            story_excerpt: The story text the image should capture
            mood_hint: Optional mood description (e.g. "somber, tense")

        Returns:
            VisionEvaluation with score and feedback
        """
        image_path = str(Path(image_path).resolve())
        if not Path(image_path).exists():
            raise FileNotFoundError(f"Image not found: {image_path}")

        # Build the prompt for llava
        prompt = self._build_prompt(story_excerpt, mood_hint)

        # Call ollama
        response = self._call_ollama(image_path, prompt)
        evaluation = self._parse_response(response)

        self._history.append(evaluation)
        logger.info(
            f"Evaluation: score={evaluation.match_score:.2f}, "
            f"works={len(evaluation.what_works)}, "
            f"missing={len(evaluation.what_missing)}"
        )

        return evaluation

    def _build_prompt(self, story_excerpt: str, mood_hint: Optional[str]) -> str:
        """Build the evaluation prompt for llava."""
        mood_line = f" Target mood: {mood_hint}." if mood_hint else ""

        return (
            f"Look at this image carefully. Does it capture the mood of this story?{mood_line}\n\n"
            f"Story excerpt: \"{story_excerpt[:500]}\"\n\n"
            f"Respond in this exact JSON format:\n"
            f'{{"match_score": <0-1>, "what_works": ["element1", "element2"], '
            f'"what_missing": ["element1"], "mood_words": ["word1", "word2"]}}\n'
            f"Be specific about visual elements. Focus on mood, lighting, color, and composition."
        )

    def _call_ollama(self, image_path: str, prompt: str) -> str:
        """Call ollama with image + prompt via CLI."""
        try:
            cmd = [
                "ollama", "run", self.model,
                prompt,
            ]

            # Ollama CLI accepts images via stdin or special syntax
            # We use the ollama API approach for reliability
            import requests
            import urllib.request

            # Read and encode image
            with open(image_path, "rb") as f:
                img_b64 = base64.b64encode(f.read()).decode()

            # Use ollama's REST API
            payload = {
                "model": self.model,
                "prompt": prompt,
                "images": [img_b64],
                "stream": False,
                "options": {
                    "temperature": 0.3,  # Low temp for consistent evaluation
                    "num_predict": 500,
                },
            }

            req = urllib.request.Request(
                "http://localhost:11434/api/generate",
                data=json.dumps(payload).encode(),
                headers={"Content-Type": "application/json"},
            )

            with urllib.request.urlopen(req, timeout=120) as resp:
                result = json.loads(resp.read().decode())
                return result.get("response", "")

        except Exception as e:
            logger.error(f"Ollama call failed: {e}")
            # Fallback: try CLI
            try:
                result = subprocess.run(
                    ["ollama", "run", self.model, prompt],
                    capture_output=True, text=True, timeout=120,
                    input="",
                )
                return result.stdout
            except Exception as e2:
                logger.error(f"CLI fallback also failed: {e2}")
                return json.dumps({
                    "match_score": 0.5,
                    "what_works": ["unable to evaluate"],
                    "what_missing": ["evaluation failed"],
                    "mood_words": ["unknown"],
                })

    def _parse_response(self, response: str) -> VisionEvaluation:
        """Parse llava's response into structured evaluation."""
        # Try to extract JSON from the response
        try:
            # Find JSON in response
            json_match = re.search(r'\{[^{}]*\}', response, re.DOTALL)
            if json_match:
                data = json.loads(json_match.group())
                return VisionEvaluation(
                    match_score=float(data.get("match_score", 0.5)),
                    what_works=list(data.get("what_works", [])),
                    what_missing=list(data.get("what_missing", [])),
                    mood_words=list(data.get("mood_words", [])),
                    raw_response=response,
                )
        except (json.JSONDecodeError, ValueError) as e:
            logger.warning(f"Could not parse JSON from response: {e}")

        # Fallback: try to extract score from text
        score_match = re.search(r'(\d+\.?\d*)\s*\/\s*(?:1|10)', response)
        score = 0.5
        if score_match:
            score = float(score_match.group(1))
            if score > 1:
                score = score / 10.0

        return VisionEvaluation(
            match_score=score,
            what_works=[],
            what_missing=[],
            mood_words=[],
            raw_response=response,
        )

    def suggest_prompt_adjustments(
        self, evaluation: VisionEvaluation, original_prompt: str
    ) -> str:
        """
        Based on the evaluation, suggest prompt adjustments
        for the next generation if the match was poor.
        """
        if evaluation.match_score >= 0.7:
            return original_prompt  # Good enough, don't adjust

        adjustments = []
        for missing in evaluation.what_missing:
            # Translate missing elements into prompt additions
            adjustments.append(missing)

        if adjustments:
            return original_prompt + " " + " ".join(adjustments[:3])
        return original_prompt

    @property
    def average_score(self) -> float:
        """Running average of match scores."""
        if not self._history:
            return 0.0
        return sum(e.match_score for e in self._history) / len(self._history)

    @property
    def recurring_gaps(self) -> list[str]:
        """Elements frequently marked as missing — patterns to address."""
        from collections import Counter
        gaps = []
        for e in self._history:
            gaps.extend(e.what_missing)
        return [g for g, _ in Counter(gaps).most_common(5)]


# --- CLI for testing ---
if __name__ == "__main__":
    import argparse
    import sys

    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")

    parser = argparse.ArgumentParser(description="Vision Feedback Loop")
    parser.add_argument("image", type=str, help="Path to image")
    parser.add_argument("--story", "-s", type=str,
                        default="A dark night at sea. The old fisherman remembers.",
                        help="Story excerpt")
    parser.add_argument("--mood", "-m", type=str, default=None,
                        help="Mood hint")

    args = parser.parse_args()

    vf = VisionFeedback()
    result = vf.evaluate(args.image, args.story, args.mood)

    print(f"\n{'='*60}")
    print(f"Match Score: {result.match_score:.2f}")
    print(f"What Works: {result.what_works}")
    print(f"What Missing: {result.what_missing}")
    print(f"Mood Words: {result.mood_words}")
    print(f"{'='*60}")
    print(f"Raw: {result.raw_response[:200]}")
