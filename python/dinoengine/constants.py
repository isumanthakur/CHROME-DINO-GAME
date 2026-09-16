"""Tunable constants for the Dino engine.

Coordinate system
-----------------
World space is a fixed ``WORLD_W x WORLD_H`` box. ``x`` grows to the right and
``y`` grows *downward* (canvas-native), so ``GROUND_Y`` is a large number and
"higher in the air" means a *smaller* ``y``.

Every entity stores ``y`` as the position of its **feet** (its bottom edge).
That makes gravity, ground contact and the duck/stand height swap trivial:
standing up never moves the feet, it only grows the box upward.

All units are world pixels and seconds. Nothing here depends on frame rate.
"""

# --- world -----------------------------------------------------------------
WORLD_W = 960
WORLD_H = 320
GROUND_Y = 258.0          # y of the ground surface the dino stands on

FIXED_DT = 1.0 / 120.0    # engine sub-step; see game.Game.advance
MAX_FRAME_DT = 0.10       # clamp for tab-switch / breakpoint spikes

# --- dino ------------------------------------------------------------------
DINO_X = 96.0
DINO_W = 46.0
DINO_H = 50.0
DINO_DUCK_W = 62.0
DINO_DUCK_H = 30.0

# The drawn dino is chunky and round, so the hitbox is inset to keep collisions
# feeling fair -- you die when the *body* hits, not when a stray pixel does.
HITBOX_INSET_X = 7.0
HITBOX_INSET_TOP = 6.0

GRAVITY = 2600.0          # falling, and ascending after the jump key is let go
ASCEND_HOLD_GRAVITY = 2000.0   # ascending while jump is still held -> floatier
JUMP_VELOCITY = -760.0    # apex ~144px held, ~36px tapped
JUMP_CUT_VELOCITY = -430.0     # velocity clamp applied on early release
FAST_FALL_GRAVITY = 4600.0     # duck pressed mid-air -> slam back down

COYOTE_TIME = 0.08        # grace period to still jump just after walking off
JUMP_BUFFER = 0.12        # grace period for a jump pressed just before landing

# --- run / speed -----------------------------------------------------------
START_SPEED = 380.0
MAX_SPEED = 1080.0
SPEED_RAMP = 7.5          # px/s gained per second of play (~93s to top speed)

SCORE_PER_PX = 0.022
MILESTONE = 100           # confetti + chime every N points

# --- obstacles -------------------------------------------------------------
CACTUS_SMALL_W = 22.0
CACTUS_SMALL_H = 30.0
CACTUS_BIG_W = 28.0
CACTUS_BIG_H = 52.0

PTERO_W = 50.0
PTERO_H = 30.0
# Height of the *bottom* of a pterodactyl above the ground, per band. These
# are tuned against the *hitboxes*, not the drawn sizes: a standing dino's box
# reaches 44px up (50 tall, 6 inset) and a ducking one reaches 24px.
#   low  (0)  -> box overlaps either stance  -> must jump
#   mid  (34) -> above a duck, below a stand -> must duck (or clear it entirely)
#   high (76) -> above everything            -> free fly-over, pure fake-out
PTERO_BANDS = (0.0, 34.0, 76.0)
PTERO_MIN_SCORE = 260     # birds only show up once you have warmed up

# Spawn gap as a multiple of current speed. The minimum is held above a full
# jump's 0.70s airtime (0.82s of travel, leaving margin for the speed ramp
# during the approach), so there is always ground to land on between two
# obstacles no matter how fast the game gets.
GAP_MIN_FACTOR = 0.82
GAP_MAX_FACTOR = 1.45
GAP_FLOOR = 190.0

# --- scenery ---------------------------------------------------------------
CLOUD_PARALLAX = 0.22
BUMP_PARALLAX = 1.0
MAX_PARTICLES = 160

# --- day / night -----------------------------------------------------------
NIGHT_CYCLE = 900.0       # score units for one full day -> night -> day loop
NIGHT_START = 0.55        # triangle-wave thresholds for the smoothstep
NIGHT_FULL = 0.90

# --- juice -----------------------------------------------------------------
SHAKE_ON_DEATH = 13.0
SHAKE_ON_LAND = 2.2
SHAKE_DECAY = 9.0         # exponential decay rate per second
DUST_INTERVAL = 0.085     # while running on the ground
BLINK_MIN = 1.6
BLINK_MAX = 4.5
BLINK_DURATION = 0.12
