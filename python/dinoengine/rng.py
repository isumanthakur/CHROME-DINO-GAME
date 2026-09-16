"""A seeded xorshift32 generator.

The engine never touches :mod:`random`. Every stochastic decision -- obstacle
choice, spawn gaps, cloud drift, confetti spread -- flows through one seeded
``Rng``, so a given seed always replays the exact same run. That is what makes
the pytest suite able to assert on real gameplay instead of on mocks.
"""


class Rng:
    """Deterministic 32-bit xorshift PRNG."""

    __slots__ = ("state",)

    def __init__(self, seed: int = 0x9E3779B9) -> None:
        self.seed(seed)

    def seed(self, seed: int) -> None:
        masked = seed & 0xFFFFFFFF
        # xorshift is degenerate at zero, so nudge it to a known good constant.
        self.state = masked if masked else 0x9E3779B9

    def next_u32(self) -> int:
        x = self.state
        x ^= (x << 13) & 0xFFFFFFFF
        x ^= x >> 17
        x ^= (x << 5) & 0xFFFFFFFF
        self.state = x & 0xFFFFFFFF
        return self.state

    def random(self) -> float:
        """Float in ``[0, 1)``."""
        return self.next_u32() / 4294967296.0

    def uniform(self, low: float, high: float) -> float:
        return low + (high - low) * self.random()

    def randint(self, low: int, high: int) -> int:
        """Integer in the inclusive range ``[low, high]``."""
        return low + int(self.random() * (high - low + 1))

    def choice(self, items):
        return items[min(len(items) - 1, int(self.random() * len(items)))]

    def chance(self, probability: float) -> bool:
        return self.random() < probability
