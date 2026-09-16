/**
 * renderer.js -- draws a frame. Every shape is procedural; there are no images.
 *
 * The renderer is deliberately *stateless with respect to gameplay*: it takes a
 * snapshot from Python and draws it, and it never decides anything. If you want
 * the dino to jump higher you change the Python, not this file. The only state
 * kept here is presentational and frame-local (the star field, the canvas size).
 *
 * World space is a fixed 960x320 box; the canvas is scaled to fit, so the game
 * looks identical on a phone and on a 4K monitor.
 */

import { paletteFor } from './palette.js';

export const WORLD_W = 960;
export const WORLD_H = 320;
const GROUND_Y = 258;

// ---------------------------------------------------------------- primitives

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.closePath();
}

/** Deterministic hash-noise, so decorative randomness never shimmers. */
function noise(seed) {
  const x = Math.sin(seed * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

// -------------------------------------------------------------------- scenery

function drawSky(ctx, palette, night, bounds) {
  // The sky is painted across the whole *visible* area rather than the world
  // box. On a screen taller than 3:1 the world is anchored to the bottom and
  // the extra room simply becomes more sky -- otherwise the page background
  // would show through as a hard band above the horizon.
  const top = bounds.top;
  const height = bounds.bottom - top;
  const gradient = ctx.createLinearGradient(0, top, 0, bounds.bottom);
  gradient.addColorStop(0, palette.skyTop);
  gradient.addColorStop(1, palette.skyBottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, top, WORLD_W, height);

  if (night > 0.15) {
    ctx.globalAlpha = Math.min(1, (night - 0.15) / 0.5);
    ctx.fillStyle = '#ffffff';
    const starSpan = GROUND_Y - 40 - top;
    for (let i = 0; i < 46; i += 1) {
      const x = noise(i * 3.7) * WORLD_W;
      const y = top + noise(i * 9.1) * starSpan;
      const twinkle = 0.55 + 0.45 * Math.sin(i * 2.1);
      circle(ctx, x, y, 0.8 + noise(i * 5.3) * 1.3 * twinkle);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

/** One celestial body that rotates through the sky: sun by day, moon by night. */
function drawSunMoon(ctx, palette, night, bounds) {
  const angle = Math.PI * (0.15 + night * 0.7);
  const x = WORLD_W * 0.78;
  // Keep it in the upper part of whatever sky is actually on screen.
  const skyTop = Math.max(bounds.top, GROUND_Y - 260);
  const y = skyTop + 92 - Math.cos(angle) * 30;
  const radius = 26;

  ctx.globalAlpha = 0.5;
  ctx.fillStyle = palette.sunGlow;
  circle(ctx, x, y, radius + 14);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = palette.sun;
  circle(ctx, x, y, radius);
  ctx.fill();

  if (night > 0.4) {
    // Bite a crescent out of it, and add craters, as night takes over.
    ctx.globalAlpha = (night - 0.4) / 0.6;
    ctx.fillStyle = palette.skyTop;
    circle(ctx, x + 11, y - 7, radius * 0.86);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function drawCloud(ctx, palette, cloud) {
  const { x, y, scale, puffs } = cloud;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  ctx.fillStyle = palette.cloudShade;
  for (const [dx, dy, r] of puffs) {
    circle(ctx, dx, dy + 5, r);
    ctx.fill();
  }
  ctx.fillStyle = palette.cloud;
  for (const [dx, dy, r] of puffs) {
    circle(ctx, dx, dy, r);
    ctx.fill();
  }
  ctx.restore();
}

function drawGround(ctx, palette, bumps, bounds) {
  ctx.fillStyle = palette.ground;
  ctx.fillRect(0, GROUND_Y, WORLD_W, Math.max(WORLD_H, bounds.bottom) - GROUND_Y);

  ctx.fillStyle = palette.groundEdge;
  ctx.fillRect(0, GROUND_Y, WORLD_W, 4);

  for (const bump of bumps) {
    if (bump.kind === 0) {
      ctx.fillStyle = palette.bump;
      circle(ctx, bump.x, GROUND_Y + 12 + bump.size, bump.size);
      ctx.fill();
    } else if (bump.kind === 1) {
      // A dash of texture on the ground line.
      ctx.fillStyle = palette.groundLine;
      ctx.fillRect(bump.x, GROUND_Y + 8, bump.size * 3.2, 1.8);
    } else {
      // A tiny tuft of grass poking up.
      ctx.strokeStyle = palette.grass;
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(bump.x, GROUND_Y + 1);
      ctx.lineTo(bump.x - bump.size * 0.6, GROUND_Y - bump.size * 1.5);
      ctx.moveTo(bump.x, GROUND_Y + 1);
      ctx.lineTo(bump.x + bump.size * 0.7, GROUND_Y - bump.size * 1.2);
      ctx.stroke();
    }
  }
}

// ------------------------------------------------------------------ obstacles

/** One chubby cactus: a narrow trunk with capsule arms and an optional flower.
 *
 * The trunk is only about half the obstacle's width, which leaves the rest for
 * the arms. That keeps the whole drawing inside the box Python collides
 * against, so an arm can never clip you without the cactus visibly hitting you.
 */
function drawCactus(ctx, palette, x, bottom, width, height, variant, index) {
  const cx = x + width / 2;
  // A slow sway keyed to world position, so a cactus does not visibly wobble
  // as it scrolls -- it keeps the same lean the whole way across.
  const sway = Math.sin((x + index * 40) * 0.02) * 1.2;

  const trunkW = width * 0.5;
  const armT = width * 0.28;              // arm thickness
  const armY = -height * 0.54;            // where arms leave the trunk
  const armUp = height * 0.3;             // how far the elbow reaches up
  const reach = width / 2;                // outer edge of an arm

  ctx.save();
  ctx.translate(cx + sway, bottom);

  // Every piece is drawn twice: a dark silhouette, then a slightly inset light
  // fill on top. That gives a consistent outline without stroking anything.
  const piece = (fn) => { fn(); };

  const trunk = (inset) => roundRect(
    ctx, -trunkW / 2 + inset, -height + inset,
    trunkW - inset * 2, height - inset, trunkW / 2,
  );
  const armHorizontal = (side, inset) => roundRect(
    ctx,
    side < 0 ? -reach + inset : trunkW * 0.2,
    armY - armT / 2 + inset,
    reach - trunkW * 0.2 - inset * 2,
    armT - inset * 2,
    armT / 2,
  );
  const armVertical = (side, inset) => roundRect(
    ctx,
    side < 0 ? -reach + inset : reach - armT + inset,
    armY - armT / 2 - armUp + inset,
    armT - inset * 2,
    armUp + armT - inset,
    armT / 2,
  );

  const hasLeftArm = variant !== 1;
  const hasRightArm = variant !== 0;

  // Dark pass.
  ctx.fillStyle = palette.cactusDark;
  if (hasLeftArm) { piece(() => armHorizontal(-1, 0)); ctx.fill(); piece(() => armVertical(-1, 0)); ctx.fill(); }
  if (hasRightArm) { piece(() => armHorizontal(1, 0)); ctx.fill(); piece(() => armVertical(1, 0)); ctx.fill(); }
  trunk(0); ctx.fill();

  // Light pass.
  ctx.fillStyle = palette.cactus;
  if (hasLeftArm) { piece(() => armHorizontal(-1, 1.6)); ctx.fill(); piece(() => armVertical(-1, 1.6)); ctx.fill(); }
  if (hasRightArm) { piece(() => armHorizontal(1, 1.6)); ctx.fill(); piece(() => armVertical(1, 1.6)); ctx.fill(); }
  trunk(1.6); ctx.fill();

  // A rib down the middle, plus prickles, to break up the flat fill.
  ctx.strokeStyle = palette.cactusDark;
  ctx.globalAlpha = 0.4;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, -height + trunkW * 0.6);
  ctx.lineTo(0, -trunkW * 0.4);
  ctx.stroke();
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1;
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i += 1) {
    const py = -height * (0.3 + i * 0.22);
    ctx.beginPath();
    ctx.moveTo(-trunkW * 0.28, py);
    ctx.lineTo(-trunkW * 0.5, py - 1.6);
    ctx.moveTo(trunkW * 0.28, py);
    ctx.lineTo(trunkW * 0.5, py - 1.6);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // A little flower hat on the showy variant.
  if (variant === 2) {
    ctx.fillStyle = palette.cactusFlower;
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * Math.PI * 2;
      circle(ctx, Math.cos(a) * 3.4, -height - 2 + Math.sin(a) * 3.4, 2.7);
      ctx.fill();
    }
    ctx.fillStyle = '#fff3cf';
    circle(ctx, 0, -height - 2, 1.9);
    ctx.fill();
  }
  ctx.restore();
}


function drawCactusCluster(ctx, palette, obstacle) {
  const single = (obstacle.w - 5 * (obstacle.count - 1)) / obstacle.count;
  for (let i = 0; i < obstacle.count; i += 1) {
    drawCactus(
      ctx, palette,
      obstacle.x + i * (single + 5),
      obstacle.y,
      single,
      // Vary the heights slightly within a cluster for a hand-drawn look.
      obstacle.h * (i === 1 ? 0.88 : 1),
      (obstacle.variant + i) % 3,
      i,
    );
  }
}

/** A chunky, slightly ridiculous pterodactyl. */
function drawPtero(ctx, palette, obstacle) {
  const { x, y, w, h, wing, variant } = obstacle;
  const cx = x + w / 2;
  const cy = y - h / 2;
  // Flap, plus a gentle bob so it does not look like it is on rails.
  const flap = Math.sin(wing * Math.PI * 2);
  const bob = Math.cos(wing * Math.PI * 2) * 2.5;

  ctx.save();
  ctx.translate(cx, cy + bob);

  // Far wing first, so the body overlaps it.
  ctx.fillStyle = palette.pteroDark;
  ctx.beginPath();
  ctx.moveTo(-2, -2);
  ctx.quadraticCurveTo(-24, -6 - flap * 16, -32, 4 - flap * 10);
  ctx.quadraticCurveTo(-18, 4, -2, 6);
  ctx.closePath();
  ctx.fill();

  // Body and tail.
  ctx.fillStyle = palette.ptero;
  roundRect(ctx, -w * 0.32, -h * 0.28, w * 0.64, h * 0.56, h * 0.28);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-w * 0.28, 0);
  ctx.lineTo(-w * 0.52, -5);
  ctx.lineTo(-w * 0.52, 5);
  ctx.closePath();
  ctx.fill();

  // Near wing.
  ctx.fillStyle = palette.ptero;
  ctx.beginPath();
  ctx.moveTo(-2, -1);
  ctx.quadraticCurveTo(-20, -4 + flap * 18, -28, 6 + flap * 12);
  ctx.quadraticCurveTo(-14, 6, -2, 8);
  ctx.closePath();
  ctx.fill();

  // Head, beak, crest and a big googly eye.
  ctx.fillStyle = palette.ptero;
  circle(ctx, w * 0.26, -h * 0.12, h * 0.3);
  ctx.fill();

  ctx.fillStyle = palette.pteroBeak;
  ctx.beginPath();
  ctx.moveTo(w * 0.38, -h * 0.2);
  ctx.lineTo(w * 0.64, -h * 0.04);
  ctx.lineTo(w * 0.38, h * 0.06);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = palette.pteroDark;
  ctx.beginPath();
  ctx.moveTo(w * 0.2, -h * 0.34);
  ctx.lineTo(w * 0.02, -h * 0.56);
  ctx.lineTo(w * 0.26, -h * 0.42);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  circle(ctx, w * 0.3, -h * 0.18, 4.6);
  ctx.fill();
  ctx.fillStyle = palette.eye;
  circle(ctx, w * 0.32 + (variant ? 1 : -0.5), -h * 0.18, 2.4);
  ctx.fill();

  ctx.restore();
}

// ----------------------------------------------------------------------- dino

function drawFace(ctx, palette, face, blinking, eyeX, eyeY) {
  if (face === 'dizzy') {
    // Two spirals of shame.
    ctx.strokeStyle = palette.eye;
    ctx.lineWidth = 1.8;
    for (const dx of [-0.5, 8]) {
      ctx.beginPath();
      for (let a = 0; a < Math.PI * 3.2; a += 0.3) {
        const r = 0.7 + a * 0.62;
        const px = eyeX + dx + Math.cos(a) * r;
        const py = eyeY + Math.sin(a) * r;
        if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    return;
  }

  if (blinking) {
    ctx.strokeStyle = palette.eye;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(eyeX - 3.5, eyeY);
    ctx.lineTo(eyeX + 3.5, eyeY);
    ctx.stroke();
    return;
  }

  // Big white eye with a pupil that leans in the direction of the action.
  ctx.fillStyle = '#ffffff';
  circle(ctx, eyeX, eyeY, 5.6);
  ctx.fill();

  const lean = face === 'jump' ? -1.2 : face === 'duck' ? 1.6 : 0.8;
  ctx.fillStyle = palette.eye;
  circle(ctx, eyeX + lean, eyeY + (face === 'jump' ? -1 : 0.4), 2.9);
  ctx.fill();

  // Glint. Cheap, but it is what makes it read as cute rather than dead-eyed.
  ctx.fillStyle = '#ffffff';
  circle(ctx, eyeX + lean - 1.3, eyeY - 1.6, 1.1);
  ctx.fill();
}

function drawDinoStanding(ctx, palette, dino) {
  const { runPhase, grounded, face, blinking } = dino;
  // Legs swing on a sine of the run phase; in the air they tuck into a pose.
  const swing = Math.sin(runPhase * Math.PI * 2);
  const frontLeg = grounded ? swing * 7 : -5;
  const backLeg = grounded ? -swing * 7 : 6;

  // Tail
  ctx.fillStyle = palette.dinoDark;
  ctx.beginPath();
  ctx.moveTo(-14, -30);
  ctx.quadraticCurveTo(-30, -30 + Math.sin(runPhase * Math.PI * 2) * 3, -28, -16);
  ctx.quadraticCurveTo(-22, -22, -13, -20);
  ctx.closePath();
  ctx.fill();

  // Legs (drawn before the body so they tuck behind it)
  ctx.strokeStyle = palette.dinoDark;
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-4, -12);
  ctx.lineTo(-4 + backLeg, -2);
  ctx.moveTo(6, -12);
  ctx.lineTo(6 + frontLeg, -2);
  ctx.stroke();

  // Feet
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-4 + backLeg, -2);
  ctx.lineTo(-1 + backLeg, -2);
  ctx.moveTo(6 + frontLeg, -2);
  ctx.lineTo(9 + frontLeg, -2);
  ctx.stroke();

  // Back spikes
  ctx.fillStyle = palette.dinoSpike;
  for (let i = 0; i < 4; i += 1) {
    const sx = -12 + i * 6;
    const sy = -36 - i * 2.2;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + 3, sy - 5.5);
    ctx.lineTo(sx + 6, sy);
    ctx.closePath();
    ctx.fill();
  }

  // Body
  ctx.fillStyle = palette.dino;
  roundRect(ctx, -16, -38, 30, 30, 13);
  ctx.fill();

  // Belly
  ctx.fillStyle = palette.dinoBelly;
  roundRect(ctx, -9, -24, 19, 16, 8);
  ctx.fill();

  // Head
  ctx.fillStyle = palette.dino;
  roundRect(ctx, 0, -50, 25, 23, 10);
  ctx.fill();
  // Snout
  roundRect(ctx, 16, -42, 12, 12, 5.5);
  ctx.fill();

  // Nostril + smile
  ctx.fillStyle = palette.dinoDark;
  circle(ctx, 25, -38, 1.2);
  ctx.fill();
  if (face !== 'dizzy') {
    ctx.strokeStyle = palette.dinoDark;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(20, -33, 3.6, 0.15, Math.PI - 0.4);
    ctx.stroke();
  } else {
    // A wobbly little "oh no" mouth.
    ctx.fillStyle = palette.eye;
    circle(ctx, 20, -33, 2.6);
    ctx.fill();
  }

  // Blush
  ctx.globalAlpha = 0.65;
  ctx.fillStyle = palette.blush;
  circle(ctx, 6, -33, 3.4);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Tiny arm
  ctx.strokeStyle = palette.dinoDark;
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.moveTo(9, -28);
  ctx.lineTo(15, -24 + (grounded ? Math.sin(runPhase * Math.PI * 2) * 2 : -3));
  ctx.stroke();

  drawFace(ctx, palette, face, blinking, 12, -42);
}

function drawDinoDucking(ctx, palette, dino) {
  const { runPhase, face, blinking } = dino;
  const swing = Math.sin(runPhase * Math.PI * 2);

  // Tail, stretched out flat behind
  ctx.fillStyle = palette.dinoDark;
  ctx.beginPath();
  ctx.moveTo(-18, -18);
  ctx.quadraticCurveTo(-36, -16, -34, -7);
  ctx.quadraticCurveTo(-26, -12, -17, -10);
  ctx.closePath();
  ctx.fill();

  // Scurrying legs
  ctx.strokeStyle = palette.dinoDark;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-8, -8);
  ctx.lineTo(-8 - swing * 6, -2);
  ctx.moveTo(4, -8);
  ctx.lineTo(4 + swing * 6, -2);
  ctx.stroke();

  // Low spikes
  ctx.fillStyle = palette.dinoSpike;
  for (let i = 0; i < 4; i += 1) {
    const sx = -16 + i * 6;
    ctx.beginPath();
    ctx.moveTo(sx, -22);
    ctx.lineTo(sx + 3, -26.5);
    ctx.lineTo(sx + 6, -22);
    ctx.closePath();
    ctx.fill();
  }

  // Long flat body
  ctx.fillStyle = palette.dino;
  roundRect(ctx, -20, -23, 38, 21, 10);
  ctx.fill();

  ctx.fillStyle = palette.dinoBelly;
  roundRect(ctx, -13, -13, 24, 11, 5.5);
  ctx.fill();

  // Head pushed forward
  ctx.fillStyle = palette.dino;
  roundRect(ctx, 10, -26, 24, 19, 9);
  ctx.fill();
  roundRect(ctx, 26, -20, 11, 10, 5);
  ctx.fill();

  ctx.fillStyle = palette.dinoDark;
  circle(ctx, 34, -16, 1.2);
  ctx.fill();

  ctx.globalAlpha = 0.65;
  ctx.fillStyle = palette.blush;
  circle(ctx, 16, -11, 3.2);
  ctx.fill();
  ctx.globalAlpha = 1;

  drawFace(ctx, palette, face, blinking, 22, -19);
}

function drawDino(ctx, palette, dino) {
  // Contact shadow first, under everything. It fades with altitude, which is
  // most of what tells you how high a jump actually went.
  const airHeight = Math.max(0, GROUND_Y - dino.y);
  ctx.save();
  ctx.globalAlpha = 0.16 * Math.max(0, 1 - airHeight / 150);
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.ellipse(dino.x + dino.w / 2, GROUND_Y + 3, dino.w * 0.42, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Origin at the feet, centred horizontally: squash then scales around the
  // contact point, which is what makes it read as weight rather than as the
  // whole sprite pulsing.
  const sy = dino.squash;
  const sx = 1 / Math.sqrt(Math.max(0.2, sy)); // rough volume preservation
  ctx.save();
  ctx.translate(dino.x + dino.w / 2, dino.y);
  ctx.scale(sx, sy);
  if (dino.ducking) drawDinoDucking(ctx, palette, dino);
  else drawDinoStanding(ctx, palette, dino);
  ctx.restore();
}

// ------------------------------------------------------------------ particles

function drawParticles(ctx, palette, particles) {
  for (const p of particles) {
    ctx.globalAlpha = p.alpha;
    if (p.kind === 'confetti') {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = `hsl(${p.hue}, 85%, 66%)`;
      ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
      ctx.restore();
    } else {
      ctx.fillStyle = p.kind === 'dust' ? palette.dust : palette.poof;
      circle(ctx, p.x, p.y, p.size * (p.kind === 'poof' ? p.alpha : 1));
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

// --------------------------------------------------------------------- public

/**
 * Draw one frame's worth of world, in world coordinates, into any context.
 *
 * Exported separately from `Renderer` so the art can be rendered outside the
 * game -- into a preview sheet, a thumbnail, or a test -- without having to
 * stand up a canvas that is exactly 960x320.
 */
export function drawScene(ctx, snapshot, {
  shake = true,
  bounds = { top: 0, bottom: WORLD_H },
} = {}) {
  const palette = paletteFor(snapshot.night);

  // The backdrop is drawn before the shake so it stays anchored; shaking the
  // sky too would read as an earthquake rather than as an impact.
  drawSky(ctx, palette, snapshot.night, bounds);
  drawSunMoon(ctx, palette, snapshot.night, bounds);

  ctx.save();
  if (shake && snapshot.shake > 0.05) {
    const amount = snapshot.shake;
    ctx.translate((Math.random() - 0.5) * amount, (Math.random() - 0.5) * amount);
  }

  for (const cloud of snapshot.clouds) drawCloud(ctx, palette, cloud);
  drawGround(ctx, palette, snapshot.bumps, bounds);

  for (const obstacle of snapshot.obstacles) {
    if (obstacle.kind === 'ptero') drawPtero(ctx, palette, obstacle);
    else drawCactusCluster(ctx, palette, obstacle);
  }

  drawDino(ctx, palette, snapshot.dino);
  drawParticles(ctx, palette, snapshot.particles);
  ctx.restore();

  return palette;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  /** Match the backing store to the element size and device pixel ratio. */
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width) return;
    const width = Math.round(rect.width * dpr);
    const height = Math.round(rect.height * dpr);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  draw(snapshot) {
    const { ctx } = this;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Always fit the world's *width*, so every player sees the same amount of
    // track ahead -- cropping horizontally would change how much warning you
    // get about an obstacle, which is a gameplay difference, not a visual one.
    // Spare vertical room becomes extra sky above the anchored horizon.
    const scale = this.canvas.width / WORLD_W;
    const offsetY = this.canvas.height - WORLD_H * scale;
    ctx.setTransform(scale, 0, 0, scale, 0, offsetY);

    // The visible slice, expressed in world coordinates, so the sky and ground
    // know how far they have to reach.
    const bounds = {
      top: -offsetY / scale,
      bottom: WORLD_H,
    };
    this.bounds = bounds;
    return drawScene(ctx, snapshot, { bounds });
  }

  /** Debug overlay: the boxes the Python collision code actually compares. */
  drawHitboxes(snapshot) {
    const { ctx } = this;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,64,129,0.95)';
    const d = snapshot.dino;
    const inset = 7;
    const insetTop = 6;
    ctx.strokeRect(d.x + inset, d.y - d.h + insetTop, d.w - inset * 2, d.h - insetTop);
    ctx.strokeStyle = 'rgba(33,150,243,0.95)';
    for (const o of snapshot.obstacles) {
      ctx.strokeRect(o.x, o.y - o.h, o.w, o.h);
    }
  }
}
