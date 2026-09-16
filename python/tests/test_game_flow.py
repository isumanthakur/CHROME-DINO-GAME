"""Phase transitions, scoring, speed ramp and the day/night cycle."""

import pytest

from dinoengine import OVER, PAUSED, PLAYING, READY, Game
from dinoengine import constants as C
from dinoengine.inputs import PAUSE, RESTART, START
from helpers import clear_obstacles, run, started


def test_a_new_game_waits_on_the_title_screen():
    game = Game(seed=3)
    assert game.snapshot()["phase"] == READY
    assert game.snapshot()["score"] == 0


def test_start_input_begins_the_run():
    game = Game(seed=3)
    assert run(game, 1, START)["phase"] == PLAYING


def test_score_only_climbs_while_playing():
    game = Game(seed=3)
    idle = run(game, 120, 0)["score"]
    assert idle == 0, "the title screen must not rack up points"

    game.start()
    clear_obstacles(game)
    playing = run(game, 120, 0)["score"]
    assert playing > 0


def test_score_is_monotonic():
    game = started()
    clear_obstacles(game)
    previous = 0
    for _ in range(600):
        score = game.advance(1 / 60.0, 0)["score"]
        assert score >= previous
        previous = score


def test_speed_ramps_up_then_plateaus():
    game = started()
    clear_obstacles(game)
    early = run(game, 60, 0)["speed"]
    later = run(game, 600, 0)["speed"]
    assert later > early, "the game must get faster"

    capped = run(game, 60 * 200, 0)["speed"]
    assert capped == pytest.approx(C.MAX_SPEED), "speed must plateau, not run away"


def test_pause_freezes_the_world():
    game = started()
    clear_obstacles(game)
    run(game, 60, 0)
    paused = run(game, 1, PAUSE)
    assert paused["phase"] == PAUSED

    frozen_score = paused["score"]
    still_frozen = run(game, 120, 0)
    assert still_frozen["score"] == frozen_score, "no points while paused"

    resumed = run(game, 1, PAUSE)
    assert resumed["phase"] == PLAYING


def test_restart_wipes_the_run():
    game = started()
    clear_obstacles(game)
    run(game, 300, 0)
    restarted = run(game, 1, RESTART)
    assert restarted["phase"] == PLAYING
    assert restarted["score"] == 0
    # abs=1.0 because the frame that restarts still simulates its remaining
    # sub-steps, nudging the speed a fraction above the start value.
    assert restarted["speed"] == pytest.approx(C.START_SPEED, abs=1.0)


def test_death_locks_out_an_instant_restart():
    """The keypress that killed you must not skip past the score screen."""
    game = started()
    game.obstacles.clear()
    game._die([])
    assert game.snapshot()["phase"] == OVER

    immediately = run(game, 1, START)
    assert immediately["phase"] == OVER, "too soon -- should still be on game over"

    run(game, 40, 0)                      # wait out the lockout
    assert run(game, 1, START)["phase"] == PLAYING


def test_night_falls_and_lifts_again():
    game = started()
    clear_obstacles(game)
    seen_day = False
    seen_night = False
    for _ in range(60 * 240):
        night = game.advance(1 / 60.0, 0)["night"]
        seen_day = seen_day or night < 0.05
        seen_night = seen_night or night > 0.95
        if seen_day and seen_night:
            break
    assert seen_day and seen_night, "the day/night cycle must complete"


def test_night_value_stays_in_range():
    game = started()
    clear_obstacles(game)
    for _ in range(60 * 60):
        night = game.advance(1 / 60.0, 0)["night"]
        assert 0.0 <= night <= 1.0


def test_events_are_reported_once():
    game = started()
    clear_obstacles(game)
    game.obstacles.clear()
    game._die([])
    # The death event was emitted on the step that killed us, not forever after.
    assert "death" not in run(game, 10, 0)["events"]
