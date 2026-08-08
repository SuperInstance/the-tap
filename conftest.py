"""Pytest configuration for the-tap.
Prevents pytest from importing tap-image-gen/__init__.py as a package
(the hyphen makes it invalid for Python imports).
"""
import os
import sys

# Add tap-image-gen to path so tests can import its modules directly
tap_gen_dir = os.path.join(os.path.dirname(__file__), "tap-image-gen")
if tap_gen_dir not in sys.path:
    sys.path.insert(0, tap_gen_dir)

# Prevent pytest from collecting tap-image-gen as a package
collect_ignore = ["tap-image-gen/__init__.py"]
