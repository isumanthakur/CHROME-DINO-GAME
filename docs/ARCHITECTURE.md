# Architecture notes

Longer-form notes on *why* the code is shaped the way it is. The
[README](../README.md) covers the layout and the headline diagrams; this file is for the
decisions that needed more room than a diagram caption.

---

## 1. The boundary

Everything in this project follows from one decision: **the simulation is Python and the
presentation is JavaScript, and the line between them is never crossed.**

That line is enforced by the shape of the data, not by discipline. What Python hands back
each frame is a JSON document of primitives — no objects, no references, no callbacks. The
renderer physically cannot mutate game state, because it never receives any.

`test_bridge.py::test_payload_contains_only_json_primitives` walks 400 frames of output
and asserts that every leaf is a `str`, `int`, `float`, `bool` or `None`. If someone ever
returns a dataclass directly, CI fails.

### Cost of the boundary

The obvious worry is that calling into WebAssembly sixty times a second is expensive. It
is not, provided you do not build proxy objects:

| Approach | Per-frame cost |
|---|---|
| Return a `dict` and let Pyodide proxy it | Allocates a JS proxy per entity, per frame |
| Return `json.dumps(...)` as a `str` | One serialise + one `JSON.parse` |

The second is what `bridge.py` does. Measured in Chromium: **p50 0.20ms, p95 0.30ms,
worst observed 1.3ms** against a 16.67ms budget. Typical payload is around 1KB; the test
suite fails the build if it ever exceeds 32KB.

### Why not a Web Worker?

Moving Pyodide to a worker would keep the main thread free, but it makes `step()`
asynchronous. That costs a frame of input latency and makes the render loop
significantly harder to reason about. At 1.8% of the frame budget there is nothing to
win. If the engine ever grew heavy enough to matter, a worker is the escape hatch — and
because the boundary is already "one int in, one string out", moving it would be a local
change to `runtime.js` and nothing else.

---

## 2. Coordinate system

`y` grows **downward** (canvas-native), and every entity stores `y` as the position of
its **feet** rather than its top-left corner.

This sounds like a small thing and is not. Ducking swaps the dino between a 46×50 box and
a 62×30 box. With top-left anchoring, every stance change needs a compensating position
fix, and forgetting one puts the dino through the floor. With feet anchoring, standing up
simply grows the box upward and the contact point never moves — there is no correction to
forget.

```
              ← w →
            ┌───────┐  ── y - h   (top, derived)
            │       │
            │       │
            └───┬───┘
          ──────●──────  ── y      (feet, stored)
             GROUND_Y
```

Obstacles use the same convention, which is why `collision.py` can treat a cactus and the
dino identically.

---

## 3. Hitboxes are smaller than the drawings

The dino's collision box is inset 7px horizontally and 6px from the top. Cacti are drawn
with a trunk about half the obstacle's width, so the arms fit *inside* the box rather
than poking out of it.

Both choices point the same way: **the player should never die to something they could
not see hit them**, and should never clip an obstacle that visibly missed. Press `H`
in-game to see the boxes the Python is actually comparing.

The bird bands are tuned against the hitboxes rather than the art, which is the only
reason they work:

| Band | Bottom edge above ground | Standing box reaches 44px | Ducking box reaches 24px | Result |
|---|---|---|---|---|
| low | 0px | hit | hit | **must jump** |
| mid | 34px | hit | clear | **must duck** |
| high | 76px | clear | clear | free fly-over |

The first version of this used bands of 0/48/86 — and the 48px "duck" band sailed clean
over a standing dino, threatening nothing at all. It was caught by
`test_mid_band_pterodactyl_hits_a_standing_dino`, which exists precisely because that
kind of bug is invisible while playing (you just never notice a bird you were never going
to hit).

---

## 4. Difficulty

Two numbers control the entire difficulty curve:

```python
SPEED_RAMP = 7.5      # px/s gained per second played
MAX_SPEED  = 1080.0   # plateau, reached after ~93s
```

Spawn gaps are expressed as a **multiple of the current speed**, not as fixed pixels:

```python
GAP_MIN_FACTOR = 0.82
GAP_MAX_FACTOR = 1.45
```

The consequence is that *reaction time stays roughly constant* as the game speeds up. The
game gets harder because obstacles are denser and faster in absolute terms, not because
it gradually stops being physically possible.

The floor of 0.82 is not arbitrary: a full-height jump is airborne for 0.70s, and 0.82s
of travel leaves margin for the speed still ramping during the approach. That guarantees
there is always ground to land on between two obstacles.

`test_consecutive_obstacles_are_never_unclearable` measures the real edge-to-edge gap
between every live pair across three seeds and 150 simulated seconds, converts it to
seconds of travel, and fails if any is under a full jump's airtime. It caught a real bug:
the gap was originally measured spawn-to-spawn, so a wide cactus cluster silently
consumed the clearance behind it and could produce a genuinely impossible pair.

---

## 5. Determinism

The engine never imports `random`. Every stochastic decision — obstacle choice, spawn
gaps, cloud shape, confetti spread, blink timing — flows through a single seeded
xorshift32 in `rng.py`.

This matters for three reasons:

1. **The tests can assert on real gameplay.** No mocking, no stubbing out the spawner —
   the suite plays actual games and checks actual outcomes.
2. **Bugs reduce to two numbers.** A seed plus an input sequence replays a run exactly.
3. **It proves the boundary is clean.** If any hidden state leaked in from JavaScript,
   replays would diverge. `test_same_seed_same_run` compares 900 frames of full snapshots.

`Game.reset()` derives each new run's seed from the previous state, so consecutive games
differ — but passing an explicit seed always reproduces a specific run.

---

## 6. React's role

React renders **menus, not frames**. The game loop writes directly to the canvas and
calls `setState` only when something the DOM actually displays has changed: the phase, or
the integer score.

At 60fps with a score ticking ~20 times a second, that is roughly 20 React renders per
second instead of 60 full-tree reconciliations — and the canvas is untouched by any of
them.

Two things deliberately bypass React entirely:

- **Day/night HUD colours.** The render loop writes `--hud-ink` and friends straight onto
  the `.stage` element as CSS custom properties, bucketed so it happens a handful of
  times per cycle rather than every frame. Routing a continuously-varying colour through
  React state would mean re-rendering on every frame, which is exactly what the split is
  meant to avoid.
- **The debug flag.** `debug` is mirrored into a ref, because putting it in the effect's
  dependency array would tear down and rebuild the entire loop — resetting frame timing —
  every time you pressed `H`.

### Canvas sizing

`renderer.resize()` reads `getBoundingClientRect()`, which forces a layout. Calling that
in the frame loop means a forced reflow sixty times a second, so it is driven by a
`ResizeObserver` instead — which also catches the cases a `window.resize` listener misses:
CSS changes, container reflow, and a phone's URL bar sliding away.

---

## 7. Art

There are no image files. Every visual is Canvas2D path work in `renderer.js`:

- It stays crisp at any resolution and device pixel ratio.
- The day/night cycle is one interpolation over a palette table (`palette.js`) rather
  than two sets of assets that can drift apart.
- Variants are parameters, not files — three cactus shapes and two bird colourings cost
  nothing.

The trade-off is that drawing code is hard to review by reading. That is what
`dev/sprite-sheet.html` is for: it imports `drawScene()` and lays out every obstacle
variant and dino pose on one canvas. Building it immediately exposed that the cacti were
rendering as pills with a notch bitten out of them — invisible at gameplay scale and
motion, obvious on a static sheet.

`drawScene(ctx, snapshot)` is exported separately from the `Renderer` class specifically
so the art can be rendered outside the game, into any context, without standing up a
960×320 canvas.

---

## 8. Input

Keyboards, touch and clicks all collapse into a single integer before reaching Python.

- **Held** bits mirror current key state.
- **Pressed** bits are edges, cleared by `Input.consume_edges()` after the first
  sub-step of a frame — so one keypress can never fire two jumps even when a frame runs
  several sub-steps.
- `event.repeat` is ignored, or OS autorepeat would machine-gun the jump buffer.
- Window `blur` clears all held keys, so alt-tabbing mid-jump does not leave a key stuck
  down.

A subtle one: the `JUMP_PRESSED` edge is only set on a real `keydown`. A test that sends
it on every frame will see the dino bunny-hop forever — which is the jump buffer working
correctly, not a bug, and is why `test_dino_always_returns_to_the_ground` sends the edge
once and then merely holds the key.

---

## 9. What would come next

Honest list of things this does not do:

- **No Web Worker.** Fine today; see §1 for when it would stop being fine.
- **No gamepad support.** `input.js` is the only file that would need to change.
- **Cold load is ~14MB.** Vendoring the runtime is a deliberate trade (see the README);
  the alternative is a CDN and a dependency that can break the demo.
- **No leaderboard.** Scores are `localStorage` only. A real one needs a server, which
  would end the "static site" property that makes this deployable anywhere.
- **The renderer has no test coverage.** The engine is thoroughly tested because it is
  pure logic; the drawing code is verified by eye against the sprite sheet. Pixel-diffing
  canvas output is possible but brittle.
