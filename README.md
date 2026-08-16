# Emoji Particles

Type an emoji and it becomes a field of particles that scatter under the cursor and spring back.

No dependencies, no build step. Three files and an `index.html`.

## How it works

The emoji is drawn to an offscreen canvas and sampled on a grid. Every cell above an alpha cutoff becomes a particle that stores its home position and the RGB it was sampled from. Each frame, particles within the cursor radius take an impulse away from it (or toward it), a spring pulls them back home, and friction damps the result.

Four things in the implementation are worth naming.

**Colour comes from the glyph.** The sample reads RGB alongside alpha, so emoji render in their own colours rather than as a silhouette. Drawing that naively would mean a `fillStyle` change per particle, which destroys batching, so colours are quantised to 4 bits per channel and particles are sorted into contiguous runs. A frame sets `fillStyle` once per distinct colour, and emoji have few.

**Sampling happens at native resolution.** Colour emoji are bitmap glyphs around 160px. Drawing one at 400px upscales and blurs it, and sampling that blur merges detail that matters, like the gaps between fingers on 👋. So the glyph is always rendered at 160px and the resulting particle positions are scaled up to the stage instead.

**Density is set in source-glyph space, not by a particle budget.** The dot is drawn at 0.7x the grid spacing, and that ratio is what reads as chunky pixels instead of a smooth image. Deriving spacing from a particle count would make the texture change with the size of the stage.

**Input is split by grapheme.** `Array.from` splits by code point, which shatters skin-tone modifiers (👋🏽), ZWJ sequences (👨‍👩‍👧‍👦), and flags (🇯🇵) into meaningless parts. `Intl.Segmenter` keeps them whole.

## Tuning

The numbers live at the top of `main.js`:

| | | |
| --- | --- | --- |
| `sample` | 4 | grid spacing in source pixels. Lower is finer and smoother, higher is chunkier. |
| `dot` | 3.5 | dot size against a `sample` of 5. The ratio is what matters, not the value. |
| `radius` | 60 | cursor influence radius, scaled to the stage by `SCALE`. |
| `strength` | 1 | impulse per frame. The Push/Pull button owns the sign. |
| `spring` | 0.08 | pull back toward home. |
| `friction` | 0.9 | velocity damping. |

`MAX_PARTICLES` is a safety net rather than a design knob. If a solid glyph would exceed it, the grid widens until it fits, and the dot follows the spacing so the texture holds.

## Running it

Any static server:

```bash
python3 -m http.server 8000
```

## Notes

Emoji are drawn with the system emoji font, so the same input looks different on macOS, Windows, and Android. Rendering them identically everywhere would mean shipping a colour emoji font, which is around 10 MB.

## License

MIT. `particles.js` has no dependencies and no framework, so it can be lifted into another project on its own.
