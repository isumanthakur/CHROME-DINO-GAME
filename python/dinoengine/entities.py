"""Plain data holders for everything that lives in the world.

These are deliberately dumb: they carry state and geometry, never behaviour.
Movement lives in :mod:`physics`, creation in :mod:`spawner`, and the rules
that tie them together in :mod:`game`. Keeping them passive is what lets the
same objects be simulated in Python and drawn by JavaScript without either
side needing to know how the other works.
"""

from dataclasses import dataclass

from . import constants as C


@dataclass
class Dino:
    """The player. ``y`` is the feet; ``vy`` is positive downward."""

    y: float = C.GROUND_Y
    vy: float = 0.0
    ducking: bool = False
    grounded: bool = True

    # input grace windows (see physics.step_dino)
    coyote: float = 0.0
    buffer: float = 0.0

    # presentation state the renderer reads straight off the wire
    run_phase: float = 0.0     # drives the leg cycle, advances with distance
    squash: float = 1.0        # 1.0 = neutral; <1 squashed, >1 stretched
    blink: float = 0.0         # seconds of blink remaining
    blink_timer: float = 2.0   # seconds until the next blink
    face: str = "happy"        # happy | jump | duck | dizzy

    @property
    def width(self) -> float:
        return C.DINO_DUCK_W if self.ducking else C.DINO_W

    @property
    def height(self) -> float:
        return C.DINO_DUCK_H if self.ducking else C.DINO_H

    @property
    def x(self) -> float:
        # The dino never moves horizontally -- the world scrolls past it.
        return C.DINO_X

    def hitbox(self):
        """Forgiving AABB as ``(left, top, right, bottom)``."""
        left = self.x + C.HITBOX_INSET_X
        right = self.x + self.width - C.HITBOX_INSET_X
        top = self.y - self.height + C.HITBOX_INSET_TOP
        return left, top, right, self.y


@dataclass
class Obstacle:
    """A cactus cluster or a pterodactyl. ``y`` is the bottom edge."""

    kind: str          # cactus_small | cactus_big | ptero
    x: float
    y: float
    w: float
    h: float
    variant: int = 0   # picks which silly drawing the renderer uses
    count: int = 1     # cacti per cluster
    wing: float = 0.0  # pterodactyl flap phase, 0..1

    def hitbox(self):
        return self.x, self.y - self.h, self.x + self.w, self.y


@dataclass
class Cloud:
    x: float
    y: float
    scale: float = 1.0
    puffs: tuple = ()   # pre-rolled blob offsets so a cloud keeps its shape


@dataclass
class Bump:
    """A pebble or tuft on the ground strip. Pure decoration."""

    x: float
    size: float
    kind: int


@dataclass
class Particle:
    x: float
    y: float
    vx: float
    vy: float
    life: float
    max_life: float
    size: float
    kind: str          # dust | confetti | poof
    hue: float = 0.0
    spin: float = 0.0
    rot: float = 0.0
