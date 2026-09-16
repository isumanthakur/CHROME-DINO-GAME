/**
 * palette.js -- the day and night colour schemes, and the blend between them.
 *
 * The engine hands the renderer a single `night` value from 0 (noon) to 1
 * (midnight). Every colour in the scene is the same-named entry from the two
 * palettes below, mixed by that number, so dusk is genuinely interpolated
 * rather than being a third hand-made theme that can drift out of sync.
 */

export const DAY = {
  skyTop: '#a8ddf5', skyBottom: '#e6f7fb', sun: '#ffe5a3', sunGlow: '#fff3cf',
  cloud: '#ffffff', cloudShade: '#dceefb',
  ground: '#f3e3c3', groundEdge: '#d9c194', groundLine: '#c7ab7c',
  bump: '#d9c194', grass: '#8ed9a4',
  dino: '#7ed99f', dinoDark: '#4bb87b', dinoBelly: '#eafff2', dinoSpike: '#4bb87b',
  cactus: '#74cf93', cactusDark: '#44a86f', cactusFlower: '#ff9ec7',
  ptero: '#c9a6f5', pteroDark: '#9a6fd8', pteroBeak: '#ffcf6b',
  eye: '#2b3a4a', blush: '#ffb3c6', dust: '#d9c194', poof: '#ffffff',
  text: '#3f5166', textSoft: '#7b8ca0',
};

export const NIGHT = {
  skyTop: '#16203c', skyBottom: '#33406e', sun: '#f4f1e0', sunGlow: '#b9c6ef',
  cloud: '#4a5885', cloudShade: '#39456d',
  ground: '#3c4468', groundEdge: '#2b3150', groundLine: '#242942',
  bump: '#2b3150', grass: '#3f6f63',
  dino: '#5fae86', dinoDark: '#3a7d5d', dinoBelly: '#bfe6d2', dinoSpike: '#3a7d5d',
  cactus: '#4f9070', cactusDark: '#2f6b51', cactusFlower: '#c9739b',
  ptero: '#8f77c4', pteroDark: '#6a4ca3', pteroBeak: '#d8a94f',
  eye: '#1a2233', blush: '#c98298', dust: '#2b3150', poof: '#cfd8f0',
  text: '#e8eeff', textSoft: '#9fb0d0',
};

function hexToRgb(hex) {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Blend two hex colours. `t` of 0 returns `a`, 1 returns `b`. */
export function mix(a, b, t) {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const bl = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r},${g},${bl})`;
}

/** Build the fully-resolved palette for a given night amount. */
export function paletteFor(night) {
  const resolved = {};
  for (const key of Object.keys(DAY)) {
    resolved[key] = night <= 0 ? DAY[key]
      : night >= 1 ? NIGHT[key]
      : mix(DAY[key], NIGHT[key], night);
  }
  return resolved;
}
