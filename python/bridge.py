"""Pyodide entry point -- the only module that knows a browser exists.

JavaScript loads this once, then calls :func:`step` about sixty times a second.
The contract across the JS/WASM boundary is deliberately tiny:

    step(dt: float, bits: int) -> str   # a JSON document

Passing one float and one int in, and one JSON string out, avoids building
proxy objects for every entity each frame. Pyodide converts a Python ``str`` to
a JavaScript string directly, so a frame costs one serialise plus one
``JSON.parse`` -- microseconds against a 16ms budget.

Keeping this file separate from the engine is what lets the engine stay
testable: nothing in :mod:`dinoengine` imports anything browser-shaped.
"""

import json

from dinoengine import Game, __version__

_game = Game()


def new_game(seed=None) -> str:
    """Start a fresh run, optionally with a fixed seed for a repeatable game."""
    _game.reset(None if seed is None else int(seed))
    return json.dumps(_game.snapshot())


def step(dt: float, bits: int) -> str:
    """Advance one rendered frame and return the snapshot as JSON."""
    return json.dumps(_game.advance(float(dt), int(bits)))


def snapshot() -> str:
    """Re-read the current frame without advancing time."""
    return json.dumps(_game.snapshot())


def engine_info() -> str:
    """Version and build details, shown on the loading screen."""
    import sys

    return json.dumps(
        {
            "engine": __version__,
            "python": sys.version.split()[0],
            "implementation": sys.implementation.name,
        }
    )
