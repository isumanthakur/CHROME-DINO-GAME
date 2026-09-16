"""The goofy layer: dust puffs, milestone confetti and death poofs.

Particles are simulated in Python alongside everything else rather than being
faked in CSS, so they inherit the same fixed timestep and the same seeded RNG.
A replay of a seed produces the identical confetti burst.

The pool is hard-capped at :data:`constants.MAX_PARTICLES`; when it is full the
oldest particles are dropped, which keeps the per-frame payload bounded no
matter how much chaos is happening.
"""

import math

from . import constants as C
from .entities import Particle


class Particles:
    """A small, bounded, purely cosmetic particle system."""

    def __init__(self, rng):
        self.rng = rng
        self.items = []

    def clear(self) -> None:
        self.items.clear()

    def _add(self, particle: Particle) -> None:
        if len(self.items) >= C.MAX_PARTICLES:
            del self.items[0]
        self.items.append(particle)

    # -- emitters -----------------------------------------------------------
    def dust(self, x: float, y: float, speed: float, count: int = 1) -> None:
        """Little scuffs kicked up by running feet."""
        for _ in range(count):
            self._add(
                Particle(
                    x=x + self.rng.uniform(-6.0, 6.0),
                    y=y,
                    vx=-speed * self.rng.uniform(0.18, 0.34),
                    vy=self.rng.uniform(-70.0, -18.0),
                    life=self.rng.uniform(0.28, 0.52),
                    max_life=0.52,
                    size=self.rng.uniform(2.5, 5.5),
                    kind="dust",
                )
            )

    def confetti(self, x: float, y: float, count: int = 26) -> None:
        """Milestone celebration. Yes, the dino deserves it."""
        for _ in range(count):
            self._add(
                Particle(
                    x=x + self.rng.uniform(-18.0, 18.0),
                    y=y + self.rng.uniform(-14.0, 14.0),
                    vx=self.rng.uniform(-150.0, 90.0),
                    vy=self.rng.uniform(-330.0, -110.0),
                    life=self.rng.uniform(0.8, 1.5),
                    max_life=1.5,
                    size=self.rng.uniform(3.5, 7.0),
                    kind="confetti",
                    hue=self.rng.uniform(0.0, 360.0),
                    spin=self.rng.uniform(-9.0, 9.0),
                    rot=self.rng.uniform(0.0, 6.28),
                )
            )

    def poof(self, x: float, y: float, count: int = 18) -> None:
        """The puff of embarrassment on impact."""
        for _ in range(count):
            angle = self.rng.uniform(0.0, 6.2831853)
            power = self.rng.uniform(60.0, 240.0)
            self._add(
                Particle(
                    x=x,
                    y=y,
                    vx=power * math.cos(angle),
                    vy=power * math.sin(angle) - 60.0,
                    life=self.rng.uniform(0.4, 0.9),
                    max_life=0.9,
                    size=self.rng.uniform(4.0, 9.0),
                    kind="poof",
                )
            )

    # -- simulation ---------------------------------------------------------
    def update(self, dt: float) -> None:
        gravity = 900.0
        alive = []
        for p in self.items:
            p.life -= dt
            if p.life <= 0.0:
                continue
            p.vy += gravity * dt * (0.35 if p.kind == "dust" else 1.0)
            p.x += p.vx * dt
            p.y += p.vy * dt
            p.rot += p.spin * dt
            if p.kind != "dust" and p.y > C.GROUND_Y:
                # Cheap bounce so confetti settles on the ground instead of
                # sinking through it.
                p.y = C.GROUND_Y
                p.vy *= -0.32
                p.vx *= 0.7
            alive.append(p)
        self.items = alive
