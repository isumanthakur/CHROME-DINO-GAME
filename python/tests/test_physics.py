"""Jump feel: the thing the original version got most wrong.

The 2021 build ran a fixed 500ms CSS keyframe, so every jump was identical and
you could not react to anything. These tests pin down the variable-height jump
and the two forgiveness windows.
"""

import pytest

from dinoengine import constants as C
from dinoengine.inputs import DUCK_HELD, JUMP_HELD, JUMP_PRESSED
from helpers import clear_obstacles, jump_arc, run, started


def test_held_jump_goes_higher_than_a_tap():
    held_peak, held_air = jump_arc(started(), hold=True)
    tap_peak, tap_air = jump_arc(started(), hold=False)

    assert held_peak > tap_peak * 2.5, "holding jump must matter a lot"
    assert held_air > tap_air


def test_tap_clears_a_small_cactus_but_not_a_big_one():
    tap_peak, _ = jump_arc(started(), hold=False)
    assert tap_peak > C.CACTUS_SMALL_H, "a short hop must clear small cacti"
    assert tap_peak < C.CACTUS_BIG_H, "a short hop must NOT trivialise big cacti"


def test_full_jump_clears_everything_on_the_ground():
    held_peak, _ = jump_arc(started(), hold=True)
    assert held_peak > C.CACTUS_BIG_H + 20.0
    assert held_peak > C.PTERO_H + 20.0


def test_dino_always_returns_to_the_ground():
    game = started()
    clear_obstacles(game)
    run(game, 1, JUMP_HELD | JUMP_PRESSED)   # the press edge fires once...
    snapshot = run(game, 240, JUMP_HELD)     # ...then jump is merely held down
    assert snapshot["dino"]["grounded"], "holding jump must not levitate the dino"
    assert snapshot["dino"]["y"] == pytest.approx(C.GROUND_Y)


def test_cannot_double_jump():
    """A second press while airborne must not re-launch the dino."""
    game = started()
    clear_obstacles(game)
    run(game, 1, JUMP_HELD | JUMP_PRESSED)
    mid = run(game, 20, JUMP_HELD)
    apex_velocity = mid["dino"]["vy"]
    after = run(game, 1, JUMP_HELD | JUMP_PRESSED)
    assert after["dino"]["vy"] > apex_velocity, "velocity should keep falling, not reset"


def test_ducking_changes_the_hitbox():
    game = started()
    clear_obstacles(game)
    standing = run(game, 5, 0)["dino"]
    ducking = run(game, 5, DUCK_HELD)["dino"]

    assert ducking["h"] < standing["h"]
    assert ducking["w"] > standing["w"], "ducking makes the dino long and flat"
    assert ducking["ducking"] is True


def test_cannot_jump_while_ducking():
    game = started()
    clear_obstacles(game)
    snapshot = run(game, 30, DUCK_HELD | JUMP_HELD | JUMP_PRESSED)
    assert snapshot["dino"]["grounded"], "duck should suppress the jump"


def test_duck_in_air_is_a_fast_fall():
    normal = started()
    clear_obstacles(normal)
    run(normal, 1, JUMP_HELD | JUMP_PRESSED)
    normal_snapshot = run(normal, 24, JUMP_HELD)

    slammed = started()
    clear_obstacles(slammed)
    run(slammed, 1, JUMP_HELD | JUMP_PRESSED)
    slammed_snapshot = run(slammed, 24, DUCK_HELD)

    assert slammed_snapshot["dino"]["y"] > normal_snapshot["dino"]["y"], \
        "fast-falling should put the dino closer to the ground"


def test_jump_buffer_fires_on_landing():
    """A jump pressed just before touchdown is remembered, not swallowed."""
    game = started()
    clear_obstacles(game)
    run(game, 1, JUMP_HELD | JUMP_PRESSED)

    # Fall until we are within the buffer window of the ground.
    for _ in range(400):
        snapshot = game.advance(1 / 120.0, JUMP_HELD)
        height = C.GROUND_Y - snapshot["dino"]["y"]
        if snapshot["dino"]["vy"] > 0 and height < 12.0:
            break

    # Press during the descent, then stop pressing entirely.
    game.advance(1 / 120.0, JUMP_PRESSED | JUMP_HELD)
    airborne = any(
        not game.advance(1 / 120.0, 0)["dino"]["grounded"] for _ in range(12)
    )
    assert airborne, "the buffered press should have launched a new jump"


def test_coyote_time_allows_a_late_jump():
    game = started()
    clear_obstacles(game)
    # Nudge the dino off the ground without jumping, as if it walked off a lip.
    game.dino.grounded = False
    game.dino.y = C.GROUND_Y - 4.0
    game.dino.coyote = C.COYOTE_TIME

    snapshot = game.advance(1 / 120.0, JUMP_HELD | JUMP_PRESSED)
    assert snapshot["dino"]["vy"] < 0.0, "a jump inside coyote time must launch"
