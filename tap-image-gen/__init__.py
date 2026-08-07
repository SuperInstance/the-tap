"""
The Tap Image Generator package.

An organ of The Tap — not a separate tool.
Generates story illustrations influenced by room mood and memory.
"""

from .image_gen import TapImageGen, RoomMood, GenerationResult, MODELS, select_model
from .vision_feedback import VisionFeedback, VisionEvaluation

__all__ = [
    "TapImageGen",
    "RoomMood",
    "GenerationResult",
    "MODELS",
    "select_model",
    "VisionFeedback",
    "VisionEvaluation",
]
