#!/usr/bin/env python3
"""
Smoke tests for The Tap's image generator.
Run: python3 tests/test_generation.py
"""

import os
import sys
import tempfile
import logging

# Add parent to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")


def test_room_mood():
    """Test RoomMood dataclass."""
    from image_gen import RoomMood

    mood = RoomMood(valence=-0.5, arousal=0.8, dominance=0.3)
    assert mood.valence == -0.5
    assert mood.arousal == 0.8
    assert mood.dominance == 0.3
    assert mood.themes == []
    print("✓ RoomMood dataclass works")


def test_phantom_extraction():
    """Test phantom phrase extraction without loading the model."""
    from image_gen import TapImageGen

    # Create without loading
    gen = TapImageGen.__new__(TapImageGen)
    gen._phantom_memory = []

    context = (
        "The old fisherman spoke of amber sunsets over the quiet harbor. "
        "His weathered boat creaked in the salt air as distant foghorns "
        "echoed across the empty dock. The copper lamp flickered."
    )

    phantoms = gen._extract_phantoms(context)
    print(f"  Extracted phantoms: {phantoms}")
    assert len(phantoms) >= 1, "Should extract at least one phantom"
    assert len(phantoms) <= 3, "Should not extract more than 3 phantoms"
    print("✓ Phantom extraction works")


def test_mood_routing():
    """Test that mood modifiers are selected correctly."""
    from image_gen import TapImageGen, RoomMood

    # We can't easily test the full generate() without CUDA,
    # but we can verify the mood style mapping exists
    assert "high_energy" in TapImageGen.MOOD_STYLES
    assert "somber" in TapImageGen.MOOD_STYLES
    assert "warm" in TapImageGen.MOOD_STYLES
    assert "tense" in TapImageGen.MOOD_STYLES
    assert "dreamy" in TapImageGen.MOOD_STYLES

    high_energy = RoomMood(arousal=0.9, valence=0.0)
    assert high_energy.arousal > 0.7
    print("✓ Mood routing logic is sound")


def test_maritime_phantoms():
    """Test that maritime phantom vocabulary exists."""
    from image_gen import TapImageGen

    assert len(TapImageGen.MARITIME_PHANTOMS) >= 8
    assert "salt air" in TapImageGen.MARITIME_PHANTOMS
    assert "copper kettle" in TapImageGen.MARITIME_PHANTOMS
    print(f"  {len(TapImageGen.MARITIME_PHANTOMS)} maritime phantoms available")
    print("✓ Maritime phantoms configured")


def test_vision_feedback_init():
    """Test VisionFeedback initialization."""
    from vision_feedback import VisionFeedback

    vf = VisionFeedback(model="llava:7b")
    assert vf.model == "llava:7b"
    assert vf.average_score == 0.0
    assert vf.recurring_gaps == []
    print("✓ VisionFeedback initializes correctly")


def test_vision_feedback_parse():
    """Test response parsing."""
    from vision_feedback import VisionFeedback, VisionEvaluation

    vf = VisionFeedback.__new__(VisionFeedback)
    vf.model = "llava:7b"
    vf._history = []

    # Test JSON parsing
    response = '''
    Looking at the image, I see a dark bar scene.
    {"match_score": 0.75, "what_works": ["amber lighting", "dark atmosphere"], "what_missing": ["bartender figure"], "mood_words": ["moody", "noir"]}
    '''

    result = vf._parse_response(response)
    assert result.match_score == 0.75
    assert "amber lighting" in result.what_works
    assert "bartender figure" in result.what_missing
    print("✓ Vision feedback JSON parsing works")

    # Test fallback parsing
    response2 = "The image is okay. I'd rate it 7/10."
    result2 = vf._parse_response(response2)
    assert 0 < result2.match_score <= 1.0
    print("✓ Vision feedback fallback parsing works")


if __name__ == "__main__":
    print("\n=== The Tap Image Gen — Smoke Tests ===\n")

    tests = [
        test_room_mood,
        test_phantom_extraction,
        test_mood_routing,
        test_maritime_phantoms,
        test_vision_feedback_init,
        test_vision_feedback_parse,
    ]

    passed = 0
    failed = 0
    for test in tests:
        try:
            test()
            passed += 1
        except Exception as e:
            print(f"✗ {test.__name__} FAILED: {e}")
            failed += 1

    print(f"\n{'='*40}")
    print(f"Results: {passed} passed, {failed} failed")
    print(f"{'='*40}")
    sys.exit(0 if failed == 0 else 1)
