# The original (2021)

This is the first version of this project, exactly as I wrote it in my first year of
college — my first project of any kind. It is kept here on purpose, not out of
sentimentality: the rewrite in the parent directory is best understood against it, and
the [main README](../README.md) compares them line by line.

Open `index.html` directly in a browser to play it.

It does not work very well. The interesting part is *why*:

- **The jump is a 500ms CSS keyframe** (`animateDino`), so every jump is identical. You
  cannot control the height, and the JavaScript has no idea where the dino actually is —
  it has to ask the browser with `getComputedStyle`.
- **Collision compares strings to magic numbers.** A `setInterval` every 10ms reads
  `getComputedStyle(block).left`, parses it, and checks it against the hard-coded range
  `blockLeft >= 20 && blockLeft <= 45`. Because the cactus is moved by a *separate* CSS
  animation, those two clocks drift — which is why it kills you in mid-air and lets you
  walk through cacti.
- **The score never resets.** `let playerScore = 0` inside the keydown handler shadows the
  outer variable, so the reset writes to a local that is immediately discarded.
- **Pressing Space twice doubles your score.** Each press starts another `setInterval`
  without clearing the previous one.
- **Pressing Enter insults you.** I was eighteen.

Everything above is fixed in the rewrite, and most of it is now covered by a test.
