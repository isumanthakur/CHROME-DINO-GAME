"""Dino movement: jumping, ducking, and the squash-and-stretch that sells it.

The jump is *variable height*: tap for a little hop that clears a small cactus,
hold for a full arc that clears anything. Two mechanisms do that together --

1. while you are rising *and still holding* jump, a weaker gravity applies, so
   holding keeps you floating upward for longer;
2. the moment you let go, any remaining upward speed is clamped, which cuts the
   arc short instead of stopping it dead.

Two grace windows make the controls forgiving, which is most of what separates
a game that feels good from one that feels broken:

* **coyote time** -- you may still jump for a few frames after leaving the
  ground, so a jump at the very lip of a landing is not silently eaten;
* **jump buffering** -- a jump pressed slightly *before* you touch down is
  remembered and fires on contact, so mashing during a landing works.
"""

from . import constants as C
from .mathutil import approach, clamp


def step_dino(dino, inp, dt: float, events: list) -> None:
    """Advance the dino by one fixed sub-step.

    Appends any notable moment ("jump", "land", "duck", "unduck") to ``events``
    so the audio and particle layers can react without polling for changes.
    """
    was_grounded = dino.grounded

    # --- grace timers -------------------------------------------------------
    dino.coyote = dino.coyote - dt if not dino.grounded else C.COYOTE_TIME
    dino.buffer = max(0.0, dino.buffer - dt)
    if inp.jump_pressed:
        dino.buffer = C.JUMP_BUFFER

    # --- ducking ------------------------------------------------------------
    # You can duck in the air too; it becomes a fast-fall, which is the quickest
    # way to get back down and re-jump.
    wants_duck = inp.duck_held
    if wants_duck != dino.ducking:
        dino.ducking = wants_duck
        events.append("duck" if wants_duck else "unduck")

    # --- take off -----------------------------------------------------------
    can_jump = dino.grounded or dino.coyote > 0.0
    if dino.buffer > 0.0 and can_jump and not dino.ducking:
        dino.vy = C.JUMP_VELOCITY
        dino.grounded = False
        dino.coyote = 0.0
        dino.buffer = 0.0
        dino.squash = 1.28          # stretch tall on the way up
        dino.face = "jump"
        events.append("jump")

    # --- gravity ------------------------------------------------------------
    rising = dino.vy < 0.0
    if not dino.grounded and dino.ducking:
        gravity = C.FAST_FALL_GRAVITY
    elif rising and inp.jump_held:
        gravity = C.ASCEND_HOLD_GRAVITY
    else:
        gravity = C.GRAVITY

    # Releasing jump mid-rise clips the arc short -> the short hop.
    if rising and not inp.jump_held and dino.vy < C.JUMP_CUT_VELOCITY:
        dino.vy = C.JUMP_CUT_VELOCITY

    if not dino.grounded:
        dino.vy += gravity * dt
        dino.y += dino.vy * dt

    # --- landing ------------------------------------------------------------
    if dino.y >= C.GROUND_Y:
        dino.y = C.GROUND_Y
        if not was_grounded:
            # Squash proportional to impact speed, so a big drop lands heavier.
            impact = clamp(dino.vy / 1400.0, 0.0, 1.0)
            dino.squash = 1.0 - 0.34 * impact
            events.append("land")
        dino.grounded = True
        dino.vy = 0.0
        dino.face = "duck" if dino.ducking else "happy"
    else:
        dino.grounded = False
        dino.face = "duck" if dino.ducking else "jump"

    # Ease the squash back to neutral; the renderer scales the sprite by it.
    dino.squash = approach(dino.squash, 1.0, 3.2, dt)


def step_blink(dino, rng, dt: float) -> None:
    """Idle blinking, because a dino that never blinks is a dino that stares."""
    if dino.blink > 0.0:
        dino.blink -= dt
        return
    dino.blink_timer -= dt
    if dino.blink_timer <= 0.0:
        dino.blink = C.BLINK_DURATION
        dino.blink_timer = rng.uniform(C.BLINK_MIN, C.BLINK_MAX)


def step_run_cycle(dino, speed: float, dt: float) -> None:
    """Advance the leg animation by distance travelled, not by wall time.

    Tying it to distance means the legs naturally churn faster as the game
    speeds up, with no extra bookkeeping.
    """
    if dino.grounded:
        dino.run_phase = (dino.run_phase + speed * dt * 0.055) % 1.0
