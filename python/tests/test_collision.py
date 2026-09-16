"""Collision fairness.

The original checked ``getComputedStyle(...).left`` against hard-coded pixel
ranges on a 10ms timer, independently of the CSS animation actually driving the
cactus. That is why it both killed you in mid-air and let you stroll through
obstacles. Here the same simulation owns both boxes.
"""

from dinoengine import constants as C
from dinoengine.collision import overlaps
from dinoengine.entities import Obstacle
from dinoengine.inputs import DUCK_HELD, JUMP_HELD, JUMP_PRESSED
from helpers import clear_obstacles, run, started


def place(game, kind, band=0.0, width=None, height=None, x=None):
    """Drop a single obstacle right in front of the dino."""
    clear_obstacles(game)
    sizes = {
        "cactus_small": (C.CACTUS_SMALL_W, C.CACTUS_SMALL_H),
        "cactus_big": (C.CACTUS_BIG_W, C.CACTUS_BIG_H),
        "ptero": (C.PTERO_W, C.PTERO_H),
    }
    default_w, default_h = sizes[kind]
    obstacle = Obstacle(
        kind=kind,
        x=C.DINO_X + 260.0 if x is None else x,
        y=C.GROUND_Y - band,
        w=width or default_w,
        h=height or default_h,
    )
    game.obstacles.append(obstacle)
    return obstacle


def test_boxes_that_do_not_touch_do_not_collide():
    assert not overlaps((0, 0, 10, 10), (11, 0, 20, 10))
    assert not overlaps((0, 0, 10, 10), (0, 11, 10, 20))
    assert overlaps((0, 0, 10, 10), (5, 5, 15, 15))


def test_running_into_a_cactus_is_fatal():
    game = started()
    place(game, "cactus_small")
    snapshot = run(game, 180, 0)
    assert snapshot["phase"] == "over"


def test_jumping_over_a_small_cactus_survives():
    game = started()
    place(game, "cactus_small")
    # Jump when the cactus is about a third of a second away.
    snapshot = game.snapshot()
    pressed = False
    for _ in range(180):
        bits = 0
        if not pressed and game.obstacles:
            lead = (game.obstacles[0].x - C.DINO_X - C.DINO_W) / game.speed
            if lead < 0.30:
                bits = JUMP_HELD | JUMP_PRESSED
                pressed = True
        elif pressed and not snapshot["dino"]["grounded"]:
            bits = JUMP_HELD
        snapshot = game.advance(1 / 60.0, bits)
        if snapshot["phase"] == "over":
            break
    assert snapshot["phase"] == "playing", "a well-timed jump must clear a cactus"


def test_mid_band_pterodactyl_hits_a_standing_dino():
    game = started()
    place(game, "ptero", band=C.PTERO_BANDS[1])
    snapshot = run(game, 180, 0)
    assert snapshot["phase"] == "over", "the duck band must actually threaten you"


def test_mid_band_pterodactyl_is_survivable_by_ducking():
    game = started()
    place(game, "ptero", band=C.PTERO_BANDS[1])
    snapshot = run(game, 180, DUCK_HELD)
    assert snapshot["phase"] == "playing", "ducking must clear the mid band"


def test_low_pterodactyl_must_be_jumped_not_ducked():
    ducked = started()
    place(ducked, "ptero", band=C.PTERO_BANDS[0])
    assert run(ducked, 180, DUCK_HELD)["phase"] == "over"


def test_high_pterodactyl_is_a_harmless_fake_out():
    game = started()
    place(game, "ptero", band=C.PTERO_BANDS[2])
    snapshot = run(game, 180, 0)
    assert snapshot["phase"] == "playing", "the high band should fly clean over"


def test_hitbox_is_smaller_than_the_drawing():
    """Forgiveness: you should never die to a pixel you cannot see hitting."""
    game = started()
    left, top, right, bottom = game.dino.hitbox()
    assert left > game.dino.x
    assert right < game.dino.x + game.dino.width
    assert top > game.dino.y - game.dino.height
    assert bottom == C.GROUND_Y


def test_no_tunnelling_at_top_speed():
    """A thin obstacle at max speed must still register, not teleport through."""
    game = started()
    game.speed = C.MAX_SPEED
    place(game, "cactus_small", width=8.0, x=C.WORLD_W)
    snapshot = run(game, 240, 0)
    assert snapshot["phase"] == "over", "fixed sub-steps must prevent tunnelling"
