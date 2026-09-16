"""The engine must be perfectly reproducible.

Determinism is not a nicety here -- it is what lets the rest of this suite
assert on real gameplay, and what makes a bug report reducible to a seed plus
an input sequence.
"""

from dinoengine import Game
from dinoengine.rng import Rng
from helpers import FRAME


def play(seed, script):
    """Replay a fixed input script and return every snapshot."""
    game = Game(seed=seed)
    game.start()
    return [game.advance(FRAME, bits) for bits in script]


def make_script(length=900):
    """A deterministic pseudo-random input script (no RNG dependency)."""
    return [(i * 37) % 5 for i in range(length)]


def test_same_seed_same_run():
    script = make_script()
    assert play(1234, script) == play(1234, script)


def test_different_seeds_diverge():
    script = make_script()
    a = play(1234, script)
    b = play(9999, script)
    assert a != b, "different seeds should produce different worlds"


def test_frame_rate_does_not_change_the_outcome():
    """60Hz and 144Hz must simulate the same world.

    This is the payoff of the fixed-timestep accumulator: the *rendered* frame
    count differs, but the simulated state at a given wall-clock time matches.
    """
    slow = Game(seed=77)
    slow.start()
    for _ in range(120):                 # 2 seconds at 60Hz
        slow.advance(1 / 60.0, 0)

    fast = Game(seed=77)
    fast.start()
    for _ in range(288):                 # 2 seconds at 144Hz
        fast.advance(1 / 144.0, 0)

    # They agree to within a single sub-step. They cannot be bit-identical:
    # 1/144 does not divide evenly into the 1/120 sub-step, so the 144Hz run
    # ends with a fraction of a step still banked in the accumulator, waiting
    # to be spent on the next frame. That leftover is the mechanism working,
    # not drift -- it is bounded by one sub-step forever, however long you play.
    one_substep = slow.speed * (1 / 120.0)
    assert abs(slow.distance - fast.distance) < one_substep
    assert abs(slow.snapshot()["score"] - fast.snapshot()["score"]) <= 1
    assert slow.snapshot()["phase"] == fast.snapshot()["phase"]


def test_a_huge_frame_delta_cannot_skip_the_world():
    """Tab-out spikes must be clamped, not integrated."""
    game = Game(seed=5)
    game.start()
    game.dino.y = -5000.0
    game.advance(10.0, 0)                # ten seconds in one frame
    game.dino.y = -5000.0
    assert game.distance < 500.0, "a 10s delta must be clamped, not simulated"


def test_rng_is_stable_and_never_degenerates():
    a = Rng(42)
    b = Rng(42)
    assert [a.next_u32() for _ in range(50)] == [b.next_u32() for _ in range(50)]

    zero_seeded = Rng(0)
    assert zero_seeded.next_u32() != 0, "seed 0 must not lock the generator"

    values = [Rng(3).random() for _ in range(1)]
    assert 0.0 <= values[0] < 1.0


def test_rng_stays_in_range():
    rng = Rng(8)
    for _ in range(2000):
        assert 0.0 <= rng.random() < 1.0
        assert 3 <= rng.randint(3, 7) <= 7
        assert rng.choice((1, 2, 3)) in (1, 2, 3)
