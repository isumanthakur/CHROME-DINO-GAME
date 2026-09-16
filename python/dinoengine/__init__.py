"""``dinoengine`` -- the pure-Python simulation behind the Dino game.

The package has no third-party dependencies and no browser dependencies, which
is the whole point: the exact same modules run

* under CPython, where pytest drives them headlessly in CI, and
* inside the browser under Pyodide (CPython compiled to WebAssembly), where
  :mod:`bridge` wires them to a canvas.

JavaScript owns pixels, keys and sound. Python owns the rules.
"""

from .game import OVER, PAUSED, PLAYING, READY, Game

__all__ = ["Game", "READY", "PLAYING", "PAUSED", "OVER", "__version__"]
__version__ = "2.0.0"
