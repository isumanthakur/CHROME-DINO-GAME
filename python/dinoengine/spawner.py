"""Obstacle and scenery spawning.

Everything scrolls right-to-left at the current run speed, and anything that
leaves the left edge is recycled. Spawn gaps are expressed as a *multiple of
the current speed* rather than as fixed pixels, which means the time you get to
react to an obstacle stays roughly constant even as the game speeds up. The
game gets harder because obstacles get denser and faster in absolute terms --
not because it stops being physically possible.
"""

from . import constants as C
from .entities import Bump, Cloud, Obstacle


class Spawner:
    """Owns obstacle/cloud/bump lifecycles for one run."""

    def __init__(self, rng):
        self.rng = rng
        self.next_gap = 320.0     # distance still to travel before next spawn
        self.cloud_gap = 120.0
        self.bump_gap = 40.0

    def reset(self) -> None:
        self.next_gap = 320.0
        self.cloud_gap = 120.0
        self.bump_gap = 40.0

    # -- obstacles ----------------------------------------------------------
    def update_obstacles(self, obstacles, distance_step: float, speed: float,
                         score: float) -> None:
        for obstacle in obstacles:
            obstacle.x -= distance_step
            if obstacle.kind == "ptero":
                # Flap faster than the run cycle so birds read as "alive".
                obstacle.wing = (obstacle.wing + distance_step * 0.012) % 1.0

        obstacles[:] = [o for o in obstacles if o.x + o.w > -40.0]

        self.next_gap -= distance_step
        if self.next_gap <= 0.0:
            obstacle = self._make_obstacle(speed, score)
            obstacles.append(obstacle)
            # The gap is measured edge-to-edge, so a wide cactus cluster has to
            # pay for its own width. Measuring spawn-to-spawn instead would let
            # a 3-cactus cluster silently eat the clearance behind it and
            # produce a pair no jump can cover.
            low = max(C.GAP_FLOOR, speed * C.GAP_MIN_FACTOR)
            high = max(low + 80.0, speed * C.GAP_MAX_FACTOR)
            self.next_gap = obstacle.w + self.rng.uniform(low, high)

    def _make_obstacle(self, speed: float, score: float) -> Obstacle:
        spawn_x = C.WORLD_W + 20.0

        ptero_odds = 0.0
        if score >= C.PTERO_MIN_SCORE:
            # Ramp birds in gradually rather than flipping them on at a cliff.
            ptero_odds = min(0.32, 0.10 + (score - C.PTERO_MIN_SCORE) / 4000.0)

        if self.rng.chance(ptero_odds):
            band = self.rng.choice(C.PTERO_BANDS)
            return Obstacle(
                kind="ptero",
                x=spawn_x,
                y=C.GROUND_Y - band,
                w=C.PTERO_W,
                h=C.PTERO_H,
                variant=self.rng.randint(0, 1),
                wing=self.rng.random(),
            )

        if self.rng.chance(0.42):
            count = self.rng.randint(1, 2)
            width = C.CACTUS_BIG_W * count + 6.0 * (count - 1)
            return Obstacle(
                kind="cactus_big",
                x=spawn_x,
                y=C.GROUND_Y,
                w=width,
                h=C.CACTUS_BIG_H,
                variant=self.rng.randint(0, 2),
                count=count,
            )

        count = self.rng.randint(1, 3)
        width = C.CACTUS_SMALL_W * count + 5.0 * (count - 1)
        return Obstacle(
            kind="cactus_small",
            x=spawn_x,
            y=C.GROUND_Y,
            w=width,
            h=C.CACTUS_SMALL_H,
            variant=self.rng.randint(0, 2),
            count=count,
        )

    # -- scenery ------------------------------------------------------------
    def update_clouds(self, clouds, distance_step: float) -> None:
        drift = distance_step * C.CLOUD_PARALLAX
        for cloud in clouds:
            cloud.x -= drift
        clouds[:] = [c for c in clouds if c.x > -200.0]

        self.cloud_gap -= drift
        if self.cloud_gap <= 0.0:
            clouds.append(self._make_cloud(C.WORLD_W + 90.0))
            self.cloud_gap = self.rng.uniform(140.0, 340.0)

    def _make_cloud(self, x: float) -> Cloud:
        # Pre-roll the blob layout once so a cloud does not shimmer as it moves.
        puff_count = self.rng.randint(3, 5)
        puffs = tuple(
            (
                self.rng.uniform(-30.0, 30.0),
                self.rng.uniform(-8.0, 8.0),
                self.rng.uniform(13.0, 24.0),
            )
            for _ in range(puff_count)
        )
        return Cloud(
            x=x,
            y=self.rng.uniform(34.0, 132.0),
            scale=self.rng.uniform(0.62, 1.15),
            puffs=puffs,
        )

    def update_bumps(self, bumps, distance_step: float) -> None:
        for bump in bumps:
            bump.x -= distance_step * C.BUMP_PARALLAX
        bumps[:] = [b for b in bumps if b.x > -30.0]

        self.bump_gap -= distance_step
        if self.bump_gap <= 0.0:
            bumps.append(
                Bump(
                    x=C.WORLD_W + 10.0,
                    size=self.rng.uniform(2.0, 5.5),
                    kind=self.rng.randint(0, 2),
                )
            )
            self.bump_gap = self.rng.uniform(26.0, 130.0)

    def prefill(self, clouds, bumps) -> None:
        """Populate the scenery so a fresh run does not start on a blank sky."""
        x = 40.0
        while x < C.WORLD_W:
            clouds.append(self._make_cloud(x))
            x += self.rng.uniform(150.0, 320.0)
        x = 0.0
        while x < C.WORLD_W:
            bumps.append(
                Bump(x=x, size=self.rng.uniform(2.0, 5.5), kind=self.rng.randint(0, 2))
            )
            x += self.rng.uniform(26.0, 130.0)
