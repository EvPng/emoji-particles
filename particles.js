// Framework-agnostic particle field sampled from a rendered glyph.
//
// MIT licensed. https://github.com/EvPng/emoji-particles
//
// The glyph is drawn to an offscreen canvas, sampled on a grid, and every
// opaque cell becomes a particle that remembers where it came from and springs
// back to it. Colour is read from the same sample, which is what makes emoji
// come out in their own colours instead of as a silhouette.

const EMOJI_FONT =
  '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", sans-serif';

// Semi-transparent edge pixels make a muddy fringe, so only clearly-inside
// pixels become particles.
const ALPHA_CUTOFF = 160;

// Colour emoji are bitmap glyphs with a native size around 160px. Drawing them
// larger upscales and blurs them, and sampling that blur loses the detail that
// separates, say, the fingers on a hand. So sampling always happens at native
// size and the resulting positions are scaled up to the stage instead.
const SOURCE = 160;

/**
 * Split a string into user-perceived characters. Array.from would split by code
 * point, which shatters skin-tone modifiers (👋🏽), ZWJ sequences (👨‍👩‍👧‍👦),
 * and flags (🇯🇵) into their meaningless parts.
 */
export function graphemes(str) {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    return [...seg.segment(str)].map((s) => s.segment);
  }
  return Array.from(str); // good enough for single-codepoint emoji
}

export function firstGrapheme(str) {
  return graphemes(str.trim())[0] ?? '';
}

/**
 * Sample `glyph` into particles laid out for a `width` x `height` stage.
 *
 * `sample` is the grid spacing in *source* pixels and is what sets the look.
 * The dot is drawn a little smaller than the resulting spacing, which is what
 * reads as chunky pixels rather than a smooth image.
 *
 * `seedFrom` is an optional existing particle array. New particles start at
 * random old positions, so changing the emoji reads as the old shape flying
 * into the new one.
 *
 * Returns particles in stage coordinates plus the stage-space grid `spacing`.
 */
export function buildField(glyph, width, height, sample, maxParticles, seedFrom) {
  const off = document.createElement('canvas');
  off.width = SOURCE;
  off.height = SOURCE;
  const o = off.getContext('2d', { willReadFrequently: true });

  o.clearRect(0, 0, SOURCE, SOURCE);
  o.font = `${Math.floor(SOURCE * 0.86)}px ${EMOJI_FONT}`;
  o.textAlign = 'center';
  o.textBaseline = 'middle';
  o.fillText(glyph, SOURCE / 2, SOURCE / 2);

  const data = o.getImageData(0, 0, SOURCE, SOURCE).data;

  let step = Math.max(1, Math.round(sample));
  let ink = 0;
  for (let y = 0; y < SOURCE; y += step) {
    for (let x = 0; x < SOURCE; x += step) {
      if (data[(y * SOURCE + x) * 4 + 3] > ALPHA_CUTOFF) ink++;
    }
  }
  if (ink === 0) return { particles: [], runs: [], spacing: step };
  if (ink > maxParticles) {
    // Count scales as 1/step^2, so this lands within one step of the ceiling.
    step = Math.ceil(step * Math.sqrt(ink / maxParticles));
  }

  // Collect in source space first, so the ink bounding box can be measured
  // before anything is placed on the stage.
  const cells = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let y = 0; y < SOURCE; y += step) {
    for (let x = 0; x < SOURCE; x += step) {
      const i = (y * SOURCE + x) * 4;
      if (data[i + 3] <= ALPHA_CUTOFF) continue;
      cells.push({ x, y, r: data[i], g: data[i + 1], b: data[i + 2] });
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  // Fit the ink to the stage and centre it. Centring on the sampled bounding
  // box rather than on the draw call matters because emoji glyph metrics vary,
  // and textBaseline 'middle' leaves several of them visibly off-centre.
  const inkW = maxX - minX + step;
  const inkH = maxY - minY + step;
  const scale = Math.min(width / SOURCE, height / SOURCE) * (SOURCE / Math.max(inkW, inkH)) * 0.82;
  const spacing = step * scale;
  const originX = (width - inkW * scale) / 2 - minX * scale;
  const originY = (height - inkH * scale) / 2 - minY * scale;

  const particles = cells.map((c) => {
    const hx = c.x * scale + originX;
    const hy = c.y * scale + originY;
    const seed =
      seedFrom && seedFrom.length
        ? seedFrom[(Math.random() * seedFrom.length) | 0]
        : null;
    return {
      x: seed ? seed.x : hx,
      y: seed ? seed.y : hy,
      vx: 0,
      vy: 0,
      hx,
      hy,
      // Quantise to 4 bits per channel. Emoji use few distinct colours, so this
      // collapses to a handful of draw batches with no visible banding.
      key: ((c.r >> 4) << 8) | ((c.g >> 4) << 4) | (c.b >> 4),
      r: c.r,
      g: c.g,
      b: c.b,
    };
  });

  // Group by colour so a frame sets fillStyle once per colour instead of once
  // per particle. Sorting keeps each group contiguous in memory.
  particles.sort((a, b) => a.key - b.key);
  const runs = [];
  for (let i = 0; i < particles.length; ) {
    const key = particles[i].key;
    const start = i;
    while (i < particles.length && particles[i].key === key) i++;
    const p = particles[start];
    runs.push({ color: `rgb(${p.r},${p.g},${p.b})`, start, end: i });
  }

  return { particles, runs, spacing };
}

/** Advance one frame. `dt` is normalised so 1 means a 60fps frame. */
export function simulate(particles, pointer, opts, dt) {
  const { radius, strength, spring, friction } = opts;
  const r2 = radius * radius;

  for (const p of particles) {
    const dx = p.x - pointer.x;
    const dy = p.y - pointer.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < r2) {
      const d = Math.sqrt(d2) || 1;
      const f = (1 - d / radius) * strength;
      p.vx += (dx / d) * f;
      p.vy += (dy / d) * f;
    }
    p.vx += (p.hx - p.x) * spring * dt;
    p.vy += (p.hy - p.y) * spring * dt;
    p.vx *= friction;
    p.vy *= friction;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
}

export function draw(ctx, field, dot, width, height) {
  ctx.clearRect(0, 0, width, height);
  const half = dot / 2;
  const { particles, runs } = field;
  for (const run of runs) {
    ctx.fillStyle = run.color;
    for (let i = run.start; i < run.end; i++) {
      const p = particles[i];
      ctx.fillRect(p.x - half, p.y - half, dot, dot);
    }
  }
}
