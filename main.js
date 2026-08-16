import { buildField, simulate, draw, firstGrapheme, graphemes } from './particles.js';

// dot sits at 0.7x the grid spacing, which is what reads as chunky pixels
// rather than a smooth image. The two scale together.
const SITE = {
  sample: 4,
  dot: 3.5,
  radius: 60,
  strength: 1.5, // the Push/Pull control owns the sign
  spring: 0.08,
  friction: 0.9,
};

// The stage is much bigger than an inline glyph, so the influence radius scales
// with it. Sampling density does not: it is set in source-glyph space so the
// pixel texture stays put at any stage size.
const SCALE = 3;

// Safety net only. The grid spacing sets the look; this stops a pathologically
// solid glyph from melting a phone.
const MAX_PARTICLES = 4000;

// Only spatial values scale with the stage. strength is an acceleration and
// spring/friction are unitless, so both stay as authored.
const PHYSICS = {
  radius: SITE.radius * SCALE,
  strength: SITE.strength,
  spring: SITE.spring,
  friction: SITE.friction,
};

const SHUFFLE = [
  '👋', '🌻', '🍄', '🐙', '🦋', '🍉', '🌈', '🔥', '🪐', '🐝',
  '🍋', '🐬', '🌵', '🎈', '🧊', '🍄‍🟫', '🦩', '🌙', '🍊', '🐳',
  '🌼', '🫐', '🦚', '🍁', '⚡', '🐌', '🌺', '🍇', '🐠', '🪴',
  '❤️', '👻', '❄️', '🍭', '🥬', '🥐', '🏈', '🍓', '🌶️', '🪷'
];

const canvas = document.getElementById('canvas');
const stage = document.getElementById('stage');
const input = document.getElementById('input');
const shuffleBtn = document.getElementById('shuffle');
const modeBtns = [...document.querySelectorAll('.mode')];
const countEl = document.getElementById('count');
const emptyEl = document.getElementById('empty');
const ctx = canvas.getContext('2d');

const pointer = { x: -9999, y: -9999 };
let field = { particles: [], runs: [], step: 2 };
let glyph = input.value;
let size = { w: 0, h: 0 };
let pull = true; // negative strength: the cursor attracts

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function resize() {
  const rect = stage.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  size = { w: Math.floor(rect.width), h: Math.floor(rect.height) };
  canvas.width = Math.floor(size.w * dpr);
  canvas.height = Math.floor(size.h * dpr);
  canvas.style.width = `${size.w}px`;
  canvas.style.height = `${size.h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function rebuild(seed) {
  if (size.w === 0 || size.h === 0) return;
  field = buildField(glyph, size.w, size.h, SITE.sample, MAX_PARTICLES, seed);
  countEl.textContent = field.particles.length.toLocaleString();
  // Some inputs (a plain space, an unsupported sequence) render nothing.
  emptyEl.hidden = field.particles.length > 0;
}

function setGlyph(next) {
  const g = firstGrapheme(next);
  if (!g || g === glyph) return;
  glyph = g;
  if (input.value !== g) input.value = g;
  rebuild(field.particles); // fly from the old shape into the new one
}

// --- interaction ---------------------------------------------------------

function movePointer(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = clientX - rect.left;
  pointer.y = clientY - rect.top;
}

stage.addEventListener('pointermove', (e) => movePointer(e.clientX, e.clientY));
stage.addEventListener('pointerdown', (e) => {
  movePointer(e.clientX, e.clientY);
  stage.setPointerCapture(e.pointerId);
});
stage.addEventListener('pointerleave', () => {
  pointer.x = -9999;
  pointer.y = -9999;
});
// Dragging on a touch screen should push particles, not scroll the page.
stage.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

// Hold the field to a single grapheme. maxlength cannot do this: it counts
// UTF-16 code units, so it would cut 👋 in half and shred longer sequences.
// The newest grapheme wins, so typing another emoji replaces the current one
// instead of being ignored.
input.addEventListener('input', () => {
  const parts = graphemes(input.value);
  if (!parts.length) return; // let the field be cleared
  const g = parts[parts.length - 1];
  if (input.value !== g) input.value = g;
  setGlyph(g);
});

shuffleBtn.addEventListener('click', () => {
  let next = glyph;
  while (next === glyph) next = SHUFFLE[(Math.random() * SHUFFLE.length) | 0];
  setGlyph(next);
});

function setMode(mode, focus) {
  pull = mode === 'pull';
  for (const btn of modeBtns) {
    const on = btn.dataset.mode === mode;
    btn.setAttribute('aria-checked', String(on));
    // Roving tabindex: the group is one tab stop, arrows move within it.
    btn.tabIndex = on ? 0 : -1;
    if (on && focus) btn.focus();
  }
}

for (const btn of modeBtns) {
  btn.addEventListener('click', () => setMode(btn.dataset.mode));
  btn.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    setMode(pull ? 'push' : 'pull', true);
  });
}

const ro = new ResizeObserver(() => {
  const before = size.w;
  resize();
  if (size.w !== before) rebuild();
});
ro.observe(stage);

// --- loop ----------------------------------------------------------------

let last = 0;

function frame(now) {
  const dt = Math.min(now - last || 16, 32) / 16;
  last = now;

  if (!reduceMotion.matches || pointer.x > -9999) {
    simulate(field.particles, pointer, { ...PHYSICS, strength: pull ? -PHYSICS.strength : PHYSICS.strength }, dt);
  }
  // Dot follows the spacing actually used, which may be wider than requested.
  draw(ctx, field, field.spacing * (SITE.dot / SITE.sample), size.w, size.h);
  requestAnimationFrame(frame);
}

// Emoji come from a system font, so sampling has to wait for fonts to be ready
// or it reads an empty or fallback shape.
async function start() {
  resize();
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  rebuild();
  requestAnimationFrame(frame);
}

start();
