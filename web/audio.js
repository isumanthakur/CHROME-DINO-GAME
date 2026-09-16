/**
 * audio.js -- a tiny chiptune layer synthesised with WebAudio.
 *
 * No audio files: every sound is a few oscillators and a gain envelope, which
 * keeps the repository light and means nothing extra to download. The engine
 * reports named events each frame ("jump", "land", "milestone", ...) and this
 * module maps them to noises.
 *
 * Browsers block audio until a user gesture, so the context is created lazily
 * on the first real interaction and resumed if it was suspended.
 */

const SOUNDS = {
  jump:      { type: 'square',   from: 520, to: 880, duration: 0.13, gain: 0.16 },
  land:      { type: 'sine',     from: 220, to: 120, duration: 0.10, gain: 0.13 },
  duck:      { type: 'sawtooth', from: 360, to: 200, duration: 0.09, gain: 0.07 },
  unduck:    { type: 'sine',     from: 260, to: 380, duration: 0.07, gain: 0.05 },
  start:     { type: 'square',   from: 440, to: 660, duration: 0.18, gain: 0.15 },
  pause:     { type: 'triangle', from: 440, to: 220, duration: 0.14, gain: 0.12 },
  resume:    { type: 'triangle', from: 220, to: 440, duration: 0.14, gain: 0.12 },
};

/** Little arpeggios, played as a sequence of (semitone, delay) pairs. */
const JINGLES = {
  milestone: [[0, 0], [4, 0.07], [7, 0.14], [12, 0.21]],
  death:     [[0, 0], [-3, 0.09], [-7, 0.2], [-12, 0.34]],
};

const BASE_NOTE = 523.25; // C5

export class Audio {
  constructor() {
    this.context = null;
    this.master = null;
    this.muted = false;
    this._tickCount = 0;
  }

  /** Called from a user gesture; safe to call repeatedly. */
  unlock() {
    if (!this.context) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.context = new Ctx();
      this.master = this.context.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') this.context.resume();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) {
      // Ramp rather than jump, to avoid a click on toggle.
      this.master.gain.setTargetAtTime(muted ? 0 : 0.55, this.context.currentTime, 0.02);
    }
  }

  _blip({ type, from, to, duration, gain }, detune = 0) {
    if (!this.context || this.muted) return;
    const now = this.context.currentTime;
    const osc = this.context.createOscillator();
    const env = this.context.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(from, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, to), now + duration);
    if (detune) osc.detune.value = detune;

    // Fast attack, exponential release -- the classic 8-bit envelope.
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(gain, now + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(env).connect(this.master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  _jingle(steps, { type = 'square', gain = 0.13, duration = 0.13 } = {}) {
    if (!this.context || this.muted) return;
    for (const [semitone, delay] of steps) {
      const frequency = BASE_NOTE * Math.pow(2, semitone / 12);
      window.setTimeout(
        () => this._blip({ type, from: frequency, to: frequency, duration, gain }),
        delay * 1000,
      );
    }
  }

  /** A soft click every 100 points, so scoring has a heartbeat. */
  _tick() {
    this._tickCount += 1;
    if (this._tickCount % 100 !== 0) return;
    this._blip({ type: 'sine', from: 1200, to: 1200, duration: 0.04, gain: 0.05 });
  }

  /** Play everything the engine reported for this frame. */
  handleEvents(events) {
    if (!events || !this.context || this.muted) return;
    for (const event of events) {
      if (event === 'tick') {
        this._tick();
      } else if (event === 'milestone') {
        this._jingle(JINGLES.milestone);
      } else if (event === 'death') {
        this._jingle(JINGLES.death, { type: 'sawtooth', gain: 0.16, duration: 0.2 });
      } else if (SOUNDS[event]) {
        this._blip(SOUNDS[event]);
      }
    }
  }
}
