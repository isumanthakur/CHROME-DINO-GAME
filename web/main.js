/**
 * main.js -- the React shell around the canvas.
 *
 * Division of labour, deliberately strict:
 *
 *   Python  decides what is true   (physics, collision, scoring, spawning)
 *   Canvas  draws what is true     (renderer.js)
 *   React   frames what is true    (menus, HUD, toasts, settings)
 *
 * React is *not* in the frame loop. Re-rendering a component tree sixty times a
 * second would be wasteful and would fight the canvas. Instead the loop writes
 * straight to the canvas, and only pushes state into React when something the
 * UI actually shows has changed -- the phase, or the displayed score.
 */

import { bootEngine } from './runtime.js';
import { Renderer, WORLD_W, WORLD_H } from './renderer.js';
import { InputManager, BITS } from './input.js';
import { Audio } from './audio.js';
import { LOADING_LINES, MILESTONE_CHEERS, DEATH_LINES, badgeFor, pick } from './messages.js';

const { createElement: h, useState, useEffect, useRef, useCallback } = React;

const STORAGE_KEY = 'chomp.save.v1';

/**
 * A small debug handle on `window`, for the browser console and for automated
 * play-tests. It is read-only from the game's point of view -- nothing in the
 * game loop ever reads it back, so poking at it cannot desync the simulation.
 *
 *   chomp.snapshot   the frame Python produced most recently
 *   chomp.engine     Python / engine version reported at boot
 *   chomp.fps        smoothed frames per second
 */
const debugHandle = { snapshot: null, engine: null, fps: 0 };
window.chomp = debugHandle;

// ------------------------------------------------------------------- storage

function loadSave() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) throw new Error('empty');
    const parsed = JSON.parse(raw);
    return {
      best: Number(parsed.best) || 0,
      runs: Number(parsed.runs) || 0,
      distance: Number(parsed.distance) || 0,
      muted: Boolean(parsed.muted),
    };
  } catch {
    // Private browsing, disabled storage, or first visit -- all fine.
    return { best: 0, runs: 0, distance: 0, muted: false };
  }
}

function persist(save) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
  } catch {
    /* storage unavailable; the game still plays, it just forgets. */
  }
}

// ----------------------------------------------------------------- components

/** World pixels -> a friendly distance. One world pixel is treated as a
 *  centimetre, which puts a typical run at a believable jogging pace. */
function formatDistance(worldPixels) {
  const metres = worldPixels / 100;
  if (metres >= 1000) return `${(metres / 1000).toFixed(2)} km`;
  if (metres >= 10) return `${Math.round(metres)} m`;
  return `${metres.toFixed(1)} m`;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;


function Toast({ text }) {
  return h('div', { className: 'toast' }, text);
}

function KeyCap({ children }) {
  return h('kbd', { className: 'keycap' }, children);
}

function LoadingScreen({ stage, progress, error, onRetry }) {
  if (error) {
    return h('div', { className: 'overlay' },
      h('div', { className: 'card card--error' },
        h('div', { className: 'card__emoji' }, '🦖💔'),
        h('h2', null, 'The dino could not wake up'),
        h('p', { className: 'muted' }, error),
        h('p', { className: 'muted small' },
          'This game runs real Python in your browser via Pyodide, so it needs ',
          'WebAssembly and a working connection to the CDN on first load.'),
        h('button', { className: 'btn', onClick: onRetry }, 'Try again')));
  }
  return h('div', { className: 'overlay' },
    h('div', { className: 'card' },
      h('div', { className: 'card__emoji bob' }, '🥚'),
      h('h2', null, 'Chomp!'),
      h('p', { className: 'muted' }, stage),
      h('div', { className: 'progress' },
        h('div', { className: 'progress__bar', style: { width: `${progress * 100}%` } })),
      h('p', { className: 'muted small' },
        'Booting CPython in WebAssembly — the first load is the big one.')));
}

function TitleScreen({ best, onStart }) {
  return h('div', { className: 'overlay overlay--tap', onClick: onStart },
    h('div', { className: 'card' },
      h('div', { className: 'card__emoji bob' }, '🦖'),
      h('h2', null, 'Chomp!'),
      h('p', { className: 'muted' }, 'A very goofy dino runner, powered by Python.'),
      h('div', { className: 'keys' },
        h('div', null, h(KeyCap, null, 'Space'), ' or ', h(KeyCap, null, '↑'), ' jump ',
          h('span', { className: 'muted small' }, '(hold to go higher)')),
        h('div', null, h(KeyCap, null, '↓'), ' duck'),
        h('div', null, h(KeyCap, null, 'P'), ' pause · ', h(KeyCap, null, 'R'), ' restart'),
        h('div', { className: 'muted small' }, 'On a phone: tap the top half to jump, the bottom half to duck.')),
      best > 0 ? h('p', { className: 'best' }, `Your best so far: ${best}`) : null,
      h('button', { className: 'btn btn--big', onClick: onStart }, 'Let’s go! 🌵')));
}

function PauseScreen({ onResume }) {
  return h('div', { className: 'overlay overlay--tap', onClick: onResume },
    h('div', { className: 'card' },
      h('div', { className: 'card__emoji' }, '⏸️'),
      h('h2', null, 'Paused'),
      h('p', { className: 'muted' }, 'The dino is having a little sit down.'),
      h('button', { className: 'btn', onClick: onResume }, 'Resume')));
}

function GameOverScreen({ score, best, isRecord, line, badge, onRestart }) {
  return h('div', { className: 'overlay overlay--tap', onClick: onRestart },
    h('div', { className: 'card' },
      h('div', { className: 'card__emoji wobble' }, isRecord ? '🏆' : '💫'),
      h('h2', null, isRecord ? 'New best!' : 'Game over'),
      h('p', { className: 'muted' }, line),
      h('div', { className: 'scoreline' },
        h('div', null, h('span', { className: 'muted small' }, 'score'),
          h('strong', null, score)),
        h('div', null, h('span', { className: 'muted small' }, 'best'),
          h('strong', null, best))),
      badge ? h('div', { className: 'badge' }, `${badge.emoji} ${badge.label}`) : null,
      h('button', { className: 'btn btn--big', onClick: onRestart }, 'Again! 🔁'),
      h('p', { className: 'muted small' }, 'or press Space')));
}

function Hud({ score, best, muted, onToggleMute, onPause, showPause }) {
  return h('div', { className: 'hud' },
    h('div', { className: 'hud__scores' },
      best > 0 ? h('span', { className: 'hud__best' }, `HI ${String(best).padStart(5, '0')}`) : null,
      h('span', { className: 'hud__score' }, String(score).padStart(5, '0'))),
    h('div', { className: 'hud__buttons' },
      showPause ? h('button', {
        className: 'iconbtn', onClick: onPause, 'aria-label': 'Pause',
      }, '⏸') : null,
      h('button', {
        className: 'iconbtn', onClick: onToggleMute,
        'aria-label': muted ? 'Unmute' : 'Mute',
      }, muted ? '🔇' : '🔊')));
}

function TouchControls({ inputRef }) {
  // The ref is read at event time, not at render time, so these buttons work
  // even on the first render -- before the frame-loop effect has created the
  // InputManager.
  const hold = (bit) => ({
    onTouchStart: (e) => { e.preventDefault(); inputRef.current?.press(bit); },
    onTouchEnd: (e) => { e.preventDefault(); inputRef.current?.release(bit); },
    onMouseDown: () => inputRef.current?.press(bit),
    onMouseUp: () => inputRef.current?.release(bit),
    onMouseLeave: () => inputRef.current?.release(bit),
  });
  return h('div', { className: 'touch' },
    h('button', { className: 'touch__btn', ...hold(BITS.JUMP_PRESSED) }, '⬆️ jump'),
    h('button', { className: 'touch__btn', ...hold(BITS.DUCK_PRESSED) }, '⬇️ duck'));
}

// ------------------------------------------------------------------- the app

function App() {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const rendererRef = useRef(null);
  const inputRef = useRef(null);
  const audioRef = useRef(null);
  const saveRef = useRef(loadSave());
  const toastIdRef = useRef(0);

  const [boot, setBoot] = useState({ stage: LOADING_LINES[0], progress: 0, error: null });
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState('ready');
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(saveRef.current.best);
  const [muted, setMuted] = useState(saveRef.current.muted);
  const [toasts, setToasts] = useState([]);
  const [debug, setDebug] = useState(false);
  const [result, setResult] = useState({ score: 0, isRecord: false, line: '', badge: null });

  const addToast = useCallback((text) => {
    const id = (toastIdRef.current += 1);
    setToasts((current) => [...current, { id, text }]);
    window.setTimeout(
      () => setToasts((current) => current.filter((t) => t.id !== id)),
      1500,
    );
  }, []);

  // --- boot the Python engine once -----------------------------------------
  useEffect(() => {
    let cancelled = false;
    let lineTimer = 0;

    // Rotate the loading quips so the wait has something to look at.
    let lineIndex = 0;
    lineTimer = window.setInterval(() => {
      lineIndex += 1;
      setBoot((b) => (b.error ? b : { ...b, stage: LOADING_LINES[lineIndex % LOADING_LINES.length] }));
    }, 1400);

    // The stage strings from bootEngine are ignored on purpose: the rotating
    // quips above are friendlier than "Unpacking the game engine".
    bootEngine((_stage, progress) => {
      if (!cancelled) setBoot((b) => ({ ...b, progress }));
    })
      .then((engine) => {
        if (cancelled) return;
        engineRef.current = engine;
        debugHandle.engine = engine.info;
        window.clearInterval(lineTimer);
        setReady(true);
      })
      .catch((err) => {
        if (cancelled) return;
        window.clearInterval(lineTimer);
        setBoot((b) => ({ ...b, error: err.message || String(err) }));
      });

    return () => { cancelled = true; window.clearInterval(lineTimer); };
  }, []);

  // The loop closes over `debug`, so it reads the flag through a ref. Putting
  // `debug` in the effect's dependency list instead would tear down and rebuild
  // the entire loop -- and reset the engine's frame timing -- on every toggle.
  const debugRef = useRef(false);
  useEffect(() => { debugRef.current = debug; }, [debug]);

  // --- the frame loop -------------------------------------------------------
  useEffect(() => {
    if (!ready) return undefined;

    const canvas = canvasRef.current;
    const renderer = new Renderer(canvas);
    const input = new InputManager();
    const audio = new Audio();
    rendererRef.current = renderer;
    inputRef.current = input;
    audioRef.current = audio;

    audio.setMuted(saveRef.current.muted);
    input.attach(canvas);
    renderer.resize();

    // Resizing reads layout (getBoundingClientRect), so it must not happen in
    // the frame loop -- that would force a reflow sixty times a second. A
    // ResizeObserver catches every case a window listener would, plus the ones
    // it would not: CSS changes, container reflow, a phone's URL bar sliding.
    const observer = new ResizeObserver(() => renderer.resize());
    observer.observe(canvas);
    const onResize = () => renderer.resize();
    window.addEventListener('orientationchange', onResize);

    // Any first gesture unlocks WebAudio, which browsers gate behind one.
    const unlock = () => audio.unlock();
    window.addEventListener('keydown', unlock, { once: true });
    window.addEventListener('pointerdown', unlock, { once: true });

    // Toggling the debug hitbox overlay is a dev affordance, not a game key.
    const onDebugKey = (e) => { if (e.code === 'KeyH') setDebug((d) => !d); };
    window.addEventListener('keydown', onDebugKey);

    let raf = 0;
    let last = performance.now();
    let lastPhase = 'ready';
    let lastScore = -1;
    let lastNightBucket = -1;

    const frame = (now) => {
      raf = window.requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;

      const snapshot = engineRef.current.step(dt, input.consume());
      debugHandle.snapshot = snapshot;
      // Exponential moving average, so the readout is not a jittery mess.
      debugHandle.fps = debugHandle.fps * 0.9 + (1 / Math.max(dt, 1e-4)) * 0.1;
      const palette = renderer.draw(snapshot);
      if (debugRef.current) renderer.drawHitboxes(snapshot);

      // Keep the DOM HUD legible as the sky darkens. Bucketing means this
      // writes a handful of times per day/night cycle rather than every frame.
      const nightBucket = Math.round(snapshot.night * 8);
      if (nightBucket !== lastNightBucket) {
        lastNightBucket = nightBucket;
        const stage = canvas.parentElement;
        stage.style.setProperty('--hud-ink', palette.text);
        stage.style.setProperty('--hud-ink-soft', palette.textSoft);
        stage.style.setProperty('--hud-glow', snapshot.night > 0.5
          ? 'rgba(0,0,0,.45)' : 'rgba(255,255,255,.6)');
        stage.style.setProperty('--overlay-veil', snapshot.night > 0.5
          ? 'rgba(22,32,60,.5)' : 'rgba(255,253,249,.55)');
      }

      audio.handleEvents(snapshot.events);

      // --- push to React only when something visible actually changed ------
      if (snapshot.score !== lastScore) {
        lastScore = snapshot.score;
        setScore(snapshot.score);
      }

      if (snapshot.events.includes('milestone')) {
        addToast(pick(MILESTONE_CHEERS));
      }

      if (snapshot.phase !== lastPhase) {
        const previous = lastPhase;
        lastPhase = snapshot.phase;
        setPhase(snapshot.phase);

        if (snapshot.phase === 'over') {
          const save = saveRef.current;
          const isRecord = snapshot.score > save.best;
          save.best = Math.max(save.best, snapshot.score);
          save.runs += 1;
          save.distance += Math.round(snapshot.distance);
          persist(save);
          setBest(save.best);
          setResult({
            score: snapshot.score,
            isRecord,
            line: isRecord ? 'a brand new personal best!' : pick(DEATH_LINES),
            badge: badgeFor(snapshot.score),
          });
        } else if (snapshot.phase === 'playing' && previous !== 'paused') {
          audio.unlock();
        }
      }
    };
    raf = window.requestAnimationFrame(frame);

    return () => {
      window.cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener('orientationchange', onResize);
      window.removeEventListener('keydown', onDebugKey);
      input.detach();
    };
  }, [ready, addToast]);

  // --- UI actions -----------------------------------------------------------
  const sendStart = useCallback(() => {
    audioRef.current?.unlock();
    inputRef.current?.press(BITS.START);
  }, []);

  const sendPause = useCallback(() => inputRef.current?.press(BITS.PAUSE), []);

  const toggleMute = useCallback(() => {
    setMuted((current) => {
      const next = !current;
      audioRef.current?.setMuted(next);
      saveRef.current.muted = next;
      persist(saveRef.current);
      return next;
    });
  }, []);

  // --- render ---------------------------------------------------------------
  const showLoading = !ready || boot.error;

  return h('div', { className: 'app' },
    h('header', { className: 'titlebar' },
      h('h1', null, h('span', { className: 'titlebar__emoji' }, '🦖'), 'Chomp!'),
      h('p', { className: 'titlebar__sub' },
        'physics by ',
        h('strong', null, 'Python'),
        ' · compiled to WebAssembly · rendered by React + canvas')),

    h('div', { className: 'stage' },
      h('canvas', {
        ref: canvasRef,
        className: 'stage__canvas',
        width: WORLD_W,
        height: WORLD_H,
        'aria-label': 'Dino game',
      }),

      ready && !boot.error
        ? h(Hud, {
            score, best, muted,
            onToggleMute: toggleMute,
            onPause: sendPause,
            showPause: phase === 'playing',
          })
        : null,

      h('div', { className: 'toasts' }, toasts.map((t) => h(Toast, { key: t.id, text: t.text }))),

      showLoading
        ? h(LoadingScreen, {
            stage: boot.stage, progress: boot.progress, error: boot.error,
            onRetry: () => window.location.reload(),
          })
        : phase === 'ready' ? h(TitleScreen, { best, onStart: sendStart })
        : phase === 'paused' ? h(PauseScreen, { onResume: sendPause })
        : phase === 'over' ? h(GameOverScreen, { ...result, best, onRestart: sendStart })
        : null),

    ready && !boot.error ? h(TouchControls, { inputRef }) : null,

    h('footer', { className: 'footer' },
      h('span', null, 'Press ', h(KeyCap, null, 'H'), ' to see the hitboxes Python is comparing.'),
      h('span', { className: 'footer__stats' },
        `${plural(saveRef.current.runs, 'run')} · ${formatDistance(saveRef.current.distance)} travelled`)));
}

ReactDOM.createRoot(document.getElementById('root')).render(h(App));
