"""Obstacle generation: fair gaps, sane variety, no runaway memory."""

from dinoengine import Game
from dinoengine import constants as C
from helpers import clear_obstacles, run, started


def collect_obstacles(seed, seconds=180):
    """Play a hands-off run and record every obstacle as it spawns."""
    game = Game(seed=seed)
    game.start()
    game.dino.y = -5000.0          # park the dino far out of reach
    game.dino.grounded = False

    seen = {}
    for _ in range(int(seconds * 60)):
        snapshot = game.advance(1 / 60.0, 0)
        game.dino.y = -5000.0      # keep it out of the way every frame
        game.dino.vy = 0.0
        for obstacle in game.obstacles:
            seen.setdefault(id(obstacle), (obstacle, game.score, game.speed))
    return [v for v in seen.values()], game


# A full-height jump keeps the dino airborne for roughly this long. Any two
# consecutive obstacles must be further apart than that, or there would be no
# ground left to land on between them -- an unwinnable pair.
FULL_JUMP_AIRTIME = 0.70


def test_consecutive_obstacles_are_never_unclearable():
    """Measure the real gap between live obstacles, in seconds of travel."""
    worst = {}
    for seed in (1, 77, 4242):
        game = Game(seed=seed)
        game.start()
        game.dino.y = -5000.0
        for _ in range(150 * 60):
            game.advance(1 / 60.0, 0)
            game.dino.y = -5000.0
            game.dino.vy = 0.0
            ordered = sorted(game.obstacles, key=lambda o: o.x)
            for left, right in zip(ordered, ordered[1:]):
                seconds = (right.x - (left.x + left.w)) / game.speed
                if seconds < worst.get(seed, 1e9):
                    worst[seed] = seconds

    for seed, seconds in worst.items():
        assert seconds > FULL_JUMP_AIRTIME, (
            f"seed {seed}: obstacles only {seconds:.2f}s apart, "
            f"but a jump lasts {FULL_JUMP_AIRTIME}s"
        )


def test_every_obstacle_kind_shows_up():
    records, _ = collect_obstacles(seed=11, seconds=300)
    kinds = {r[0].kind for r in records}
    assert "cactus_small" in kinds
    assert "cactus_big" in kinds
    assert "ptero" in kinds, "birds must eventually appear"


def test_birds_hold_off_until_the_player_has_warmed_up():
    records, _ = collect_obstacles(seed=11, seconds=300)
    for obstacle, score, _ in records:
        if obstacle.kind == "ptero":
            assert score >= C.PTERO_MIN_SCORE, "no birds before the warm-up score"


def test_birds_use_only_the_designed_bands():
    records, _ = collect_obstacles(seed=11, seconds=300)
    for obstacle, _, _ in records:
        if obstacle.kind == "ptero":
            band = C.GROUND_Y - obstacle.y
            assert band in C.PTERO_BANDS


def test_cacti_stand_on_the_ground():
    records, _ = collect_obstacles(seed=5, seconds=120)
    for obstacle, _, _ in records:
        if obstacle.kind.startswith("cactus"):
            assert obstacle.y == C.GROUND_Y


def test_offscreen_obstacles_are_recycled():
    """Lists must not grow without bound over a long run."""
    game = started()
    game.dino.y = -5000.0
    for _ in range(60 * 240):
        game.advance(1 / 60.0, 0)
        game.dino.y = -5000.0
        game.dino.vy = 0.0
    assert len(game.obstacles) < 12
    assert len(game.clouds) < 40
    assert len(game.bumps) < 80


def test_particles_are_capped():
    game = started()
    clear_obstacles(game)
    for _ in range(400):
        game.particles.confetti(200.0, 100.0, count=30)
        game.advance(1 / 60.0, 0)
    assert len(game.particles.items) <= C.MAX_PARTICLES


def test_scenery_is_prefilled_so_the_sky_is_not_empty():
    game = Game(seed=9)
    snapshot = game.snapshot()
    assert len(snapshot["clouds"]) >= 2
    assert len(snapshot["bumps"]) >= 5
