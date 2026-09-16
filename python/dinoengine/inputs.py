"""Input decoding.

The JavaScript side owns keyboards, touch and gamepads; it boils all of that
down to a single integer bitmask per frame and hands it over. One int crosses
the JS/WASM boundary instead of an object, which keeps the per-frame cost of
talking to Python at roughly nothing.

"Held" bits describe the current state of a key. "Pressed" bits are edges --
they are true for exactly the frame a key went down, and :meth:`Input.consume`
clears them so a single press can never be spent twice across sub-steps.
"""

from dataclasses import dataclass

JUMP_HELD = 1
DUCK_HELD = 2
JUMP_PRESSED = 4
DUCK_PRESSED = 8
START = 16
PAUSE = 32
RESTART = 64


@dataclass
class Input:
    jump_held: bool = False
    duck_held: bool = False
    jump_pressed: bool = False
    duck_pressed: bool = False
    start: bool = False
    pause: bool = False
    restart: bool = False

    @classmethod
    def from_bits(cls, bits: int) -> "Input":
        return cls(
            jump_held=bool(bits & JUMP_HELD),
            duck_held=bool(bits & DUCK_HELD),
            jump_pressed=bool(bits & JUMP_PRESSED),
            duck_pressed=bool(bits & DUCK_PRESSED),
            start=bool(bits & START),
            pause=bool(bits & PAUSE),
            restart=bool(bits & RESTART),
        )

    def consume_edges(self) -> None:
        """Drop the one-shot bits, keeping the held ones."""
        self.jump_pressed = False
        self.duck_pressed = False
        self.start = False
        self.pause = False
        self.restart = False
