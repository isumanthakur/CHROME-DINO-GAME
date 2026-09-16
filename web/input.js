/**
 * input.js -- turns keyboards, touches and mouse clicks into one integer.
 *
 * The engine wants a bitmask (see python/dinoengine/inputs.py). "Held" bits
 * mirror the current key state; "pressed" bits are edges that survive exactly
 * one engine frame, so a press is never counted twice or silently dropped
 * between frames.
 */

export const BITS = {
  JUMP_HELD: 1,
  DUCK_HELD: 2,
  JUMP_PRESSED: 4,
  DUCK_PRESSED: 8,
  START: 16,
  PAUSE: 32,
  RESTART: 64,
};

const JUMP_KEYS = new Set(['Space', 'ArrowUp', 'KeyW', 'Enter', 'NumpadEnter']);
const DUCK_KEYS = new Set(['ArrowDown', 'KeyS']);
const PAUSE_KEYS = new Set(['KeyP', 'Escape']);
const RESTART_KEYS = new Set(['KeyR']);

export class InputManager {
  constructor(target = window) {
    this.target = target;
    this.jumpHeld = false;
    this.duckHeld = false;
    this.pendingEdges = 0;
    this._bound = [];
    this._touchStartY = null;
  }

  /** Bits for this frame. Reading them clears the one-shot edges. */
  consume() {
    let bits = this.pendingEdges;
    if (this.jumpHeld) bits |= BITS.JUMP_HELD;
    if (this.duckHeld) bits |= BITS.DUCK_HELD;
    this.pendingEdges = 0;
    return bits;
  }

  /** Let on-screen buttons and overlay clicks feed the same pipeline. */
  press(bit) {
    this.pendingEdges |= bit;
    if (bit === BITS.JUMP_PRESSED) this.jumpHeld = true;
    if (bit === BITS.DUCK_PRESSED) this.duckHeld = true;
  }

  release(bit) {
    if (bit === BITS.JUMP_PRESSED) this.jumpHeld = false;
    if (bit === BITS.DUCK_PRESSED) this.duckHeld = false;
  }

  attach(canvas) {
    const onKeyDown = (event) => {
      if (event.repeat) {
        // Autorepeat must not re-fire the press edge, or holding jump would
        // machine-gun the jump buffer.
        return;
      }
      const code = event.code;
      if (JUMP_KEYS.has(code)) {
        event.preventDefault();
        this.jumpHeld = true;
        this.pendingEdges |= BITS.JUMP_PRESSED | BITS.START;
      } else if (DUCK_KEYS.has(code)) {
        event.preventDefault();
        this.duckHeld = true;
        this.pendingEdges |= BITS.DUCK_PRESSED;
      } else if (PAUSE_KEYS.has(code)) {
        event.preventDefault();
        this.pendingEdges |= BITS.PAUSE;
      } else if (RESTART_KEYS.has(code)) {
        this.pendingEdges |= BITS.RESTART;
      } else {
        return;
      }
    };

    const onKeyUp = (event) => {
      if (JUMP_KEYS.has(event.code)) this.jumpHeld = false;
      if (DUCK_KEYS.has(event.code)) this.duckHeld = false;
    };

    // Releasing focus mid-jump would otherwise leave a key stuck down.
    const onBlur = () => {
      this.jumpHeld = false;
      this.duckHeld = false;
    };

    this._listen(this.target, 'keydown', onKeyDown);
    this._listen(this.target, 'keyup', onKeyUp);
    this._listen(this.target, 'blur', onBlur);

    if (canvas) this._attachTouch(canvas);
  }

  /** Tap the top half to jump, the bottom half to duck; swipe down also ducks. */
  _attachTouch(canvas) {
    const onStart = (event) => {
      event.preventDefault();
      const touch = event.changedTouches[0];
      const rect = canvas.getBoundingClientRect();
      this._touchStartY = touch.clientY;
      const inLowerHalf = touch.clientY - rect.top > rect.height * 0.62;
      if (inLowerHalf) {
        this.duckHeld = true;
        this.pendingEdges |= BITS.DUCK_PRESSED;
      } else {
        this.jumpHeld = true;
        this.pendingEdges |= BITS.JUMP_PRESSED | BITS.START;
      }
    };

    const onMove = (event) => {
      if (this._touchStartY === null) return;
      const dy = event.changedTouches[0].clientY - this._touchStartY;
      if (dy > 40 && !this.duckHeld) {
        this.jumpHeld = false;
        this.duckHeld = true;
        this.pendingEdges |= BITS.DUCK_PRESSED;
      }
    };

    const onEnd = (event) => {
      event.preventDefault();
      this._touchStartY = null;
      this.jumpHeld = false;
      this.duckHeld = false;
    };

    this._listen(canvas, 'touchstart', onStart, { passive: false });
    this._listen(canvas, 'touchmove', onMove, { passive: false });
    this._listen(canvas, 'touchend', onEnd, { passive: false });
    this._listen(canvas, 'touchcancel', onEnd, { passive: false });
  }

  _listen(element, type, handler, options) {
    element.addEventListener(type, handler, options);
    this._bound.push([element, type, handler, options]);
  }

  detach() {
    for (const [element, type, handler, options] of this._bound) {
      element.removeEventListener(type, handler, options);
    }
    this._bound = [];
  }
}
