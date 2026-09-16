"""Shared helpers for driving the engine headlessly in tests."""

from dinoengine import Game
from dinoengine.inputs import DUCK_HELD, JUMP_HELD, JUMP_PRESSED

FRAME = 1.0 / 60.0


def started(seed: int = 1) -> Game:
    """A game already in the ``playing`` phase."""
    game = Game(seed=seed)
    game.start()
    return game


def run(game: Game, frames: int, bits: int = 0, dt: float = FRAME):
    """Advance ``frames`` frames holding ``bits``, returning the last snapshot."""
    snapshot = game.snapshot()
    for _ in range(frames):
        snapshot = game.advance(dt, bits)
    return snapshot


def jump_arc(game: Game, hold: bool):
    """Perform one jump and report ``(peak_height, airtime_seconds)``."""
    from dinoengine import constants as C

    peak = 0.0
    airtime = 0.0
    left_ground = False
    for i in range(400):
        bits = JUMP_PRESSED if i == 0 else 0
        if hold:
            bits |= JUMP_HELD
        snapshot = game.advance(1 / 120.0, bits)
        height = C.GROUND_Y - snapshot["dino"]["y"]
        if height > 0.0:
            left_ground = True
            airtime += 1 / 120.0
        peak = max(peak, height)
        if left_ground and snapshot["dino"]["grounded"]:
            break
    return peak, airtime


def clear_obstacles(game: Game) -> None:
    """Empty the field so a test can place exactly the obstacle it cares about."""
    game.obstacles.clear()
    game.spawner.next_gap = 1e9
