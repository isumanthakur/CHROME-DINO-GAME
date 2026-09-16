/**
 * runtime.js -- boots CPython inside the browser and hands back a game handle.
 *
 * Pyodide is CPython compiled to WebAssembly. We load it, copy the `python/`
 * package into its in-memory filesystem, import `bridge`, and from then on the
 * only thing JavaScript ever says to Python is:
 *
 *     bridge.step(dt, bits) -> JSON string
 *
 * One float and one int in, one string out. No proxy objects are built per
 * frame, which is what keeps a 60fps loop across a language boundary viable.
 */

import { loadPyodide } from './vendor/pyodide/pyodide.mjs';

/** Pyodide is vendored under web/vendor/ rather than pulled from a CDN, so the
 *  game has no third-party runtime dependency: clone the repo, serve it, done.
 *  `import.meta.url` keeps this correct under a project sub-path such as
 *  `username.github.io/CHROME-DINO-GAME/`. */
const PYODIDE_INDEX = new URL('./vendor/pyodide/', import.meta.url).href;

/** Engine source, copied into Pyodide's virtual filesystem at /game. */
const PACKAGE_FILES = [
  'dinoengine/__init__.py',
  'dinoengine/constants.py',
  'dinoengine/mathutil.py',
  'dinoengine/rng.py',
  'dinoengine/entities.py',
  'dinoengine/inputs.py',
  'dinoengine/collision.py',
  'dinoengine/physics.py',
  'dinoengine/spawner.py',
  'dinoengine/particles.py',
  'dinoengine/game.py',
  'bridge.py',
];

/** Resolve a path in `python/` relative to this module, so sub-path hosting
 *  (like `user.github.io/CHROME-DINO-GAME/`) works with no configuration. */
function pythonUrl(relativePath) {
  return new URL(`../python/${relativePath}`, import.meta.url).href;
}

/**
 * Boot the Python engine.
 * @param {(stage: string, progress: number) => void} onProgress
 * @returns {Promise<{step: Function, newGame: Function, info: object}>}
 */
export async function bootEngine(onProgress = () => {}) {
  onProgress('Waking up the Python runtime', 0.05);
  const pyodide = await loadPyodide({ indexURL: PYODIDE_INDEX });

  onProgress('Unpacking the game engine', 0.62);
  const sources = await Promise.all(
    PACKAGE_FILES.map(async (name) => {
      const response = await fetch(pythonUrl(name));
      if (!response.ok) {
        throw new Error(`Could not fetch python/${name} (${response.status})`);
      }
      return [name, await response.text()];
    }),
  );

  pyodide.FS.mkdirTree('/game/dinoengine');
  for (const [name, source] of sources) {
    pyodide.FS.writeFile(`/game/${name}`, source, { encoding: 'utf8' });
  }

  onProgress('Importing dinoengine', 0.86);
  pyodide.runPython('import sys\nif "/game" not in sys.path: sys.path.insert(0, "/game")');
  const bridge = pyodide.pyimport('bridge');

  const info = JSON.parse(bridge.engine_info());
  onProgress('Ready', 1);

  return {
    info,
    /** Advance one frame. Returns the decoded snapshot object. */
    step: (dt, bits) => JSON.parse(bridge.step(dt, bits)),
    /** Start a fresh run, optionally seeded for a reproducible game. */
    newGame: (seed = null) => JSON.parse(bridge.new_game(seed)),
  };
}
