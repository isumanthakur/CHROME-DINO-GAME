"""The game itself: state machine, fixed-timestep loop, scoring, day/night.

Why a fixed timestep
--------------------
The browser hands us whatever delta the last frame happened to take -- 16.7ms
normally, 40ms when something hitches, 250ms when you switch tabs. Integrating
physics with that number directly makes the jump height depend on your monitor
and lets a fast obstacle *teleport through* the dino between two frames.

So :meth:`Game.advance` takes the real frame delta, adds it to an accumulator,
and runs as many :data:`constants.FIXED_DT` sub-steps as fit. Physics only ever
sees one constant, small dt. That makes the simulation deterministic, identical
on a 60Hz laptop and a 144Hz monitor, and immune to tunnelling: at top speed an
obstacle moves 9px per sub-step, well under its own width.

Phases
------
``ready`` -> ``playing`` <-> ``paused`` -> ``over`` -> ``ready``
"""

from . import constants as C
from .collision import hits_any
from .entities import Dino
from .inputs import Input
from .mathutil import clamp, decay, smoothstep
from .particles import Particles
from .physics import step_blink, step_dino, step_run_cycle
from .rng import Rng
from .spawner import Spawner

READY = "ready"
PLAYING = "playing"
PAUSED = "paused"
OVER = "over"


class Game:
    """One playable run. Create once, call :meth:`advance` every frame."""

    def __init__(self, seed: int = 20210101):
        self.base_seed = seed
        self.rng = Rng(seed)
        self.spawner = Spawner(self.rng)
        self.particles = Particles(self.rng)
        self.dino = Dino()
        self.obstacles = []
        self.clouds = []
        self.bumps = []
        self.reset(seed)

    # ------------------------------------------------------------------ setup
    def reset(self, seed=None) -> None:
        """Wipe the world back to the title screen."""
        if seed is None:
            # Vary the seed per run so consecutive games are not identical,
            # while still being exactly reproducible when a seed is given.
            seed = (self.rng.next_u32() ^ 0x5BF03635) & 0xFFFFFFFF
        self.base_seed = seed
        self.rng.seed(seed)

        self.phase = READY
        self.time = 0.0
        self.distance = 0.0
        self.speed = C.START_SPEED
        self.score = 0.0
        self.next_milestone = C.MILESTONE
        self.shake = 0.0
        self.night = 0.0
        self.accumulator = 0.0
        self.dust_timer = 0.0
        self.death_time = 0.0

        self.dino = Dino()
        self.obstacles.clear()
        self.clouds.clear()
        self.bumps.clear()
        self.particles.clear()
        self.spawner.reset()
        self.spawner.prefill(self.clouds, self.bumps)

    def start(self) -> None:
        """Leave the title screen and begin running."""
        if self.phase in (READY, OVER):
            if self.phase == OVER:
                self.reset()
            self.phase = PLAYING

    # ------------------------------------------------------------------- loop
    def advance(self, dt: float, bits: int) -> dict:
        """Advance by a real frame delta and return a render snapshot.

        ``dt`` is seconds since the last frame; ``bits`` is the packed input
        mask described in :mod:`inputs`.
        """
        inp = Input.from_bits(bits)
        events: list = []

        self._handle_meta_input(inp, events)

        dt = clamp(dt, 0.0, C.MAX_FRAME_DT)
        if self.phase == PLAYING:
            self.accumulator += dt
            guard = 0
            while self.accumulator >= C.FIXED_DT and guard < 32:
                self._fixed_step(C.FIXED_DT, inp, events)
                # Edges are one-shot: the first sub-step spends them so a
                # single keypress cannot trigger two jumps.
                inp.consume_edges()
                self.accumulator -= C.FIXED_DT
                guard += 1
        else:
            # Frozen phases still animate scenery so menus are not static.
            self._idle_step(dt)

        return self.snapshot(events)

    def _handle_meta_input(self, inp, events: list) -> None:
        """Phase transitions: start, pause, restart."""
        if inp.pause and self.phase in (PLAYING, PAUSED):
            self.phase = PAUSED if self.phase == PLAYING else PLAYING
            events.append("pause" if self.phase == PAUSED else "resume")
            return

        if inp.restart and self.phase in (PLAYING, PAUSED, OVER):
            self.reset()
            self.phase = PLAYING
            events.append("start")
            return

        if inp.start or inp.jump_pressed:
            if self.phase == READY:
                self.phase = PLAYING
                events.append("start")
            elif self.phase == OVER and self.death_time > 0.45:
                # Short lockout so the keypress that killed you does not
                # instantly restart the run before you have read the score.
                self.reset()
                self.phase = PLAYING
                events.append("start")

    def _fixed_step(self, dt: float, inp, events: list) -> None:
        self.time += dt

        # Speed ramps linearly with time played, then plateaus.
        self.speed = min(C.MAX_SPEED, self.speed + C.SPEED_RAMP * dt)
        distance_step = self.speed * dt
        self.distance += distance_step

        previous_score = self.score
        self.score += distance_step * C.SCORE_PER_PX
        if int(previous_score) != int(self.score):
            events.append("tick")

        step_dino(self.dino, inp, dt, events)
        step_blink(self.dino, self.rng, dt)
        step_run_cycle(self.dino, self.speed, dt)

        if "land" in events:
            self.shake = max(self.shake, C.SHAKE_ON_LAND)
            self.particles.dust(self.dino.x + 12.0, C.GROUND_Y, self.speed, count=7)

        self._emit_run_dust(dt)

        self.spawner.update_obstacles(self.obstacles, distance_step, self.speed,
                                      self.score)
        self.spawner.update_clouds(self.clouds, distance_step)
        self.spawner.update_bumps(self.bumps, distance_step)
        self.particles.update(dt)

        self._update_milestones(events)
        self._update_night()
        self.shake = decay(self.shake, C.SHAKE_DECAY, dt)

        if hits_any(self.dino.hitbox(), self.obstacles):
            self._die(events)

    def _idle_step(self, dt: float) -> None:
        """Keep the world breathing on the title / game-over / pause screens."""
        if self.phase == OVER:
            self.death_time += dt
        drift = 26.0 * dt
        for cloud in self.clouds:
            cloud.x -= drift * C.CLOUD_PARALLAX
        self.clouds[:] = [c for c in self.clouds if c.x > -200.0]
        self.particles.update(dt)
        self.shake = decay(self.shake, C.SHAKE_DECAY, dt)
        step_blink(self.dino, self.rng, dt)
        if self.phase == READY:
            # Idle-jog the dino on the title screen so it looks eager.
            self.dino.run_phase = (self.dino.run_phase + dt * 2.2) % 1.0

    # ---------------------------------------------------------------- helpers
    def _emit_run_dust(self, dt: float) -> None:
        if not self.dino.grounded:
            return
        self.dust_timer -= dt
        if self.dust_timer <= 0.0:
            self.dust_timer = C.DUST_INTERVAL
            self.particles.dust(self.dino.x + 8.0, C.GROUND_Y, self.speed)

    def _update_milestones(self, events: list) -> None:
        if self.score < self.next_milestone:
            return
        self.next_milestone += C.MILESTONE
        self.particles.confetti(self.dino.x + 24.0, self.dino.y - 60.0)
        events.append("milestone")

    def _update_night(self) -> None:
        """Smooth day -> night -> day triangle wave driven by score."""
        phase = (self.score % C.NIGHT_CYCLE) / C.NIGHT_CYCLE
        triangle = 1.0 - abs(2.0 * phase - 1.0)
        self.night = smoothstep(C.NIGHT_START, C.NIGHT_FULL, triangle)

    def _die(self, events: list) -> None:
        self.phase = OVER
        self.death_time = 0.0
        self.shake = C.SHAKE_ON_DEATH
        self.dino.face = "dizzy"
        self.dino.ducking = False
        self.particles.poof(self.dino.x + 22.0, self.dino.y - 24.0)
        events.append("death")

    # --------------------------------------------------------------- snapshot
    def snapshot(self, events=None) -> dict:
        """Serialise the world into the plain dict the renderer consumes.

        Only primitives go in here -- no Python objects cross the boundary, so
        the JS side can treat a frame as inert data.
        """
        dino = self.dino
        return {
            "phase": self.phase,
            "time": round(self.time, 3),
            "score": int(self.score),
            "speed": round(self.speed, 1),
            "distance": round(self.distance, 1),
            "night": round(self.night, 4),
            "shake": round(self.shake, 3),
            "deathTime": round(self.death_time, 3),
            "dino": {
                "x": dino.x,
                "y": round(dino.y, 2),
                "w": dino.width,
                "h": dino.height,
                "vy": round(dino.vy, 1),
                "ducking": dino.ducking,
                "grounded": dino.grounded,
                "runPhase": round(dino.run_phase, 4),
                "squash": round(dino.squash, 4),
                "blinking": dino.blink > 0.0,
                "face": dino.face,
            },
            "obstacles": [
                {
                    "kind": o.kind,
                    "x": round(o.x, 2),
                    "y": round(o.y, 2),
                    "w": o.w,
                    "h": o.h,
                    "variant": o.variant,
                    "count": o.count,
                    "wing": round(o.wing, 3),
                }
                for o in self.obstacles
            ],
            "clouds": [
                {
                    "x": round(c.x, 1),
                    "y": round(c.y, 1),
                    "scale": round(c.scale, 3),
                    "puffs": [[round(p[0], 1), round(p[1], 1), round(p[2], 1)]
                              for p in c.puffs],
                }
                for c in self.clouds
            ],
            "bumps": [
                {"x": round(b.x, 1), "size": round(b.size, 2), "kind": b.kind}
                for b in self.bumps
            ],
            "particles": [
                {
                    "x": round(p.x, 1),
                    "y": round(p.y, 1),
                    "size": round(p.size, 2),
                    "kind": p.kind,
                    "hue": round(p.hue, 1),
                    "rot": round(p.rot, 3),
                    "alpha": round(clamp(p.life / p.max_life, 0.0, 1.0), 3),
                }
                for p in self.particles.items
            ],
            "events": events or [],
        }
