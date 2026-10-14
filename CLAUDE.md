# RGD Generator

A typography tool that measures the rag (ragged edge) of a text block, turns it into
2D vector shapes, and renders those shapes in 3D.

## Data flow

Data flows in one direction. Each stage is its own module and is testable on its own:

```
Settings (text, font, size, column width, line height)          state/
  → LineMeasure[]   line widths, measured by Pretext             measure/
  → LineBox[]       one padded, rounded box per line, and the     rag/
                    ShapeExtent (text's left, top band, last
                    baseline from the font's metrics)
  → Outline2D       Paper.js: the extent minus the boxes, up to   shape2d/
                    the right edge (boolean subtract), flattened
  → THREE.Mesh      revolved (lathe) around the right edge,      render3d/
                    shaded by the trophy material (material/ +
                    render3d/trophyMaterial.ts)
```

`Outline2D` (plain `{ contours: Point2[][] }`) is the hand-off between Paper.js and
Three.js, so `render3d/` never imports Paper and `shape2d/` never imports Three.
Shared types live in `src/types/index.ts`.

## Folder structure

```
src/
  main.tsx, App.tsx    entry; App wires the whole pipeline, holds view state, and lays out
                       the page: ControlPanel sidebar (left) + full-height bordered artboard (right)
                       holding PaperCanvas, ThreeCanvas and RagEditor (text at its bottom left).
                       View state: revolve (starts true: 3D; "2D sketch" flips it), mirror
                       (starts true), debug, perspective, line box style, top height,
                       overshoot, round top + top radius, taper, smooth joins + join radius,
                       canvas colors (background, text)
  state/               Settings via React context + useReducer (useSettings, SettingsProvider)
  measure/             Pretext wrapper + font loading (no React)
  rag/                 pure math: line widths → line boxes (and rag points/polygons)
                       (no imports besides ../types)
  material/            pure math for the trophy material: palette presets, gradient
                       sampling, lit-mode lighting, OKLCH color + palette generation,
                       ledge occlusion
                       (no imports besides ../types)
  shape2d/             Paper.js: dedicated PaperScope per canvas, boxes → rag shape →
                       Outline2D (no React)
  render3d/            Three.js: Outline2D → lathe profiles → revolved solid, sweep animation,
                       trophy ShaderMaterial, orthographic/perspective cameras, orbit
                       controls, disposal (no React)
  components/          RagEditor (the text block is the editor; debug boxes + width labels),
                       PaperCanvas (fills the artboard behind the text, anchored to it; draws the
                       rag shape, reports its Outline2D),
                       ThreeCanvas (fills the artboard behind the text; revolves the shape in place),
                       ControlPanel (Range/Select/ToggleFields: size, line height, edge, mirror, top, round top, top
                       radius, taper, overshoot, box pad x/y,
                       radius, smooth joins + join radius; material incl. SeedColorField + ColorStops; canvas colors;
                       2D sketch, perspective, debug)
  hooks/               useFontLoaded, useRagMeasure
  styles/global.css    the global stylesheet: tokens + all app styles
  export/              SVG / PNG / GLB export placeholders
  types/               shared types
tests/                 Vitest tests mirroring src/
public/fonts/          local font files (declare them with @font-face in src/styles/global.css)
```

### Rules

- **Library logic stays out of React.** `measure/`, `rag/`, `shape2d/`, `render3d/` and
  `export/` are plain TypeScript and must not import React (enforced by ESLint).
  React components should only render and pass data in (canvas components: create a
  canvas, call the module's factory, pass data in, dispose).
- **`rag/` and `material/` import no libraries at all** (enforced by ESLint), so their math
  stays easy to unit test. `material/` is shared by `shape2d/` and `render3d/`, which must not
  import each other.
- **Paper.js:** always use the scope from `createPaperScene` (`new scope.Path(...)`), never the
  global `paper` object. Call `scope.activate()` before creating items.
- **Three.js:** anything added to a scene must be disposed via `disposeObject3D` when replaced
  or on unmount. Three does not free GPU memory when objects are removed.
- **Canvas wrappers** (`PaperCanvas`, `ThreeCanvas`) create a fresh `<canvas>` inside
  `useEffect` and remove it in cleanup, so React StrictMode's double mount gets a clean
  canvas, scope and WebGL context each time. Reusing one canvas breaks Three.js, because
  `ThreeScene.dispose()` force-loses the WebGL context.
- **Fonts:** never measure before the font has loaded (`useFontLoaded` / `ensureFontLoaded`).
  Pretext measures with canvas, so an unloaded font silently measures as the fallback font.
  Use a named font family (default: PP Mori semibold 600, tight 1.0 × size leading, like the
  RGD reference; a variable font in `public/fonts/` declared
  with `@font-face` in `global.css` and preloaded in `index.html`); Pretext is inaccurate
  with `system-ui`. Pretext only sees variable axes that appear in the canvas font string
  (weight does; `font-variation-settings` would not).
  Font loading is keyed on family + weight only (`toFontLoadQuery`), so size changes
  don't re-trigger it.
- **Both canvases fill the artboard and are anchored to the editor** (`observeAnchor`,
  positions relative to the canvas), so the shape and solid can extend past the text block
  (padding, top band). The artboard clips everything at its border.
- **The shape's extent** (`rag/shapeExtent`, a `ShapeExtent`): left = the text's left side
  (x = 0, never the padded boxes' left); top = the first box's top raised by `topHeight` (the
  top band: no words, so full width, revolving into a full-width top section); bottom = the
  last line's baseline plus `overshoot` (default 3px, sidebar slider), so the shape sits on
  the type and reads as optically aligned with it (a flat edge exactly on the baseline
  looks slightly high). The baseline uses the font's
  ascent/descent from canvas (`measure/measureFontMetrics`, measured once the font is
  ready) and CSS's rule: half the leading plus the ascent below the line top
  (`rag/lineBaseline`). Checked against the browser's baseline to within half a pixel. The
  magenta edge guide spans the extent; the debug overlay also draws every line's baseline
  (`.rag-baseline`, `--color-baseline`).
- **Top band: taper + rounded corner** (`shape2d/topBand.ts`, pure geometry): the band is
  built as its own path: a trapezoid when tapered (**taper** 0–90%: the top edge starts
  that share of the way from the text's left side to the edge, so the trophy's top circle
  thins out), with an optional fillet at its bottom-left corner (**round top** + **top
  radius**) tangent to both edges at any corner angle (r / tan(θ/2) from the corner). The
  fillet is capped by the band's visible bottom edge (to where the first box starts curving)
  and its side. `ragShapeFromBoxes` unites the band with the region below FIRST and carves
  the boxes after: uniting with an already-carved region can leave a shared edge ending
  exactly on a box's curve, where Paper's union silently returns nothing (regression test
  in tests/shape2d/boxShape.test.ts).
- **In-place 3D:** both cameras show the z = 0 plane at 1 unit per CSS px (perspective by
  distance, orthographic by frustum size), and `setViewOffset` pins the solid to the
  editor's on-screen position (`ThreeScene.setAnchor`). Keep that invariant, or the solid
  detaches from the rag. Orthographic (exact front view) is the default.
- **The right edge is the column width** (`Settings.columnWidth`): it's both the width
  text wraps at and the revolve axis, so the rag never crosses it. The **edge** slider
  edits it; the magenta `.rag-edge` guide marks it.
- **Smooth joins** (`shape2d/joinFillets.ts`, pure geometry): where consecutive lines'
  boxes meet, the shape has a sharp corner (the narrower box's side meets the wider box's
  top or bottom: a right angle when they overlap past the corner radius, a spike or cusp
  when they barely do). `joinFillets` returns a fillet tangent to both sides (externally
  tangent to a rounded corner), shrunk to end on straight parts (before the wider box's
  corner curve; on a box with joins at both ends, before the halfway point between them).
  `ragShapeFromBoxes` subtracts each fillet's notch (corner region minus its disc) last.
  On by default (sidebar **smooth joins** + **join radius**, default 16px).
- **Line boxes decide the shape.** `rag/lineBoxes` turns lines + `LineBoxStyle` (padding,
  radius) into `LineBox[]`; the overlay draws them and `shape2d/` carves the rag shape with
  the same data, so they always match. Radii are clamped there once (CSS and Paper.js clamp
  differently). Boxes never affect measurement or line height. Width labels stay anchored
  to the measured line, not the padded box.
- **Type size** changes go through the `setFontSize` action, which scales line height
  by the same factor.
- **Mirror** (on by default; the reference layout is the trophy between two text blocks):
  `RagEditor` draws a read-only, right-aligned copy of the measured lines (`.rag-mirror`)
  in the column's reflection across the edge (edge → edge + column width). Same line
  widths, so its rag mirrors the original's exactly, and the trophy's right half meets it.
  The 2D sketch also draws the shape's reflection (`PaperScene.showRag`, `mirror`), but only
  the original half goes to 3D (the lathe is symmetric anyway). The composition centers on
  the edge (`.artboard[data-mirror='on']`). Mirrored, the revolve sweep starts from both flat
  halves (±90°) and turns them toward each other (`ThreeScene.setMirror`; four caps), so the
  handoff from the mirrored 2D sketch is seamless.
- **3D first:** the view opens on the finished trophy with no sweep (`ThreeCanvas`
  `animateIn` false on load); **2D Sketch** flips to the flat view, and going back plays the
  sweep.
- **Canvas colors** (`CanvasColors`, sidebar **background** / **text** pickers): view-only,
  set as `--color-artboard-bg` / `--color-canvas-text` on `.artboard` (defaults in
  `state/view.ts` and `global.css`). The 3D view is transparent, so the background shows
  through.
- **Sidebar look:** one two-column grid (`.control-panel`; field wrappers are
  `display: contents`): bold, Title Case (`text-transform`; the DOM text stays lowercase,
  which is also the accessible name), right-aligned labels in gray boxes
  (`--color-label-bg`); sliders are a solid line to a tick with dots after it (`--fill` on
  `.range-wrap`), values shown above the tick on hover/focus; dotted dividers; buttons are
  gray boxes, inverted when pressed.
- **Styling** goes in `src/styles/global.css`. Typography that Pretext measures (font
  family/size/weight, line height, column width) comes from `Settings` and reaches CSS as
  `--rag-*` custom properties set by `RagEditor`. Never hard-code those values in CSS, or
  the displayed text and the measurement drift apart. The shape's and trophy's colors come
  from `Settings.material` (see Trophy material), not CSS.
- **The editor is a textarea** laid out exactly like the measurement (no padding, border or
  scrollbar; `white-space: pre-wrap`), and measured with Pretext's `whiteSpace: 'pre-wrap'`
  so line breaks match. `LineMeasure.width` is the visible width (trailing spaces excluded).

## Trophy material

The revolved trophy uses a custom shader with two **shading** modes. Its look lives in
`Settings.material` (state/, `updateMaterial` action) and is edited in the sidebar's
**material** section.

- **Lit** (default; the RGD trophy reference, made as Illustrator 3D Revolve + Photoshop
  layers): a grayscale lighting pass recolored through the palette as a **gradient map**
  (darkest stop = shadow, lightest = highlight), which is what makes the color "pass from
  the highlight" (deep green → mauve → steel blue → sage → cream → white with the `studio`
  palette). Lighting = ambient + wrapped diffuse from a key light (**light angle** around the
  subject, **light height**, **softness** = how far light wraps, a softer shadow edge) +
  a Blinn highlight (**highlight**, **highlight size**), darkened toward the silhouette
  (edge depth) and under ledges (ledge), plus airbrushed unevenness (wobble). Mirrors the
  pure, tested `material/lighting.ts` (`lightDirection`, `litLuminance`). Offset/scale move
  and stretch the map along the light; tilt and edge hue don't apply. Defaults were tuned by
  eye against the reference (side-on key light from the right).
- **Painted** (the original look, modeled on `docs/reference/material-ref.png`): matte,
  airbrushed vessels with the palette painted along the height in diagonal bands, color
  deepening and hue-shifting toward the silhouette, dark bands under ledges, no highlights.
  The lighting sliders don't apply.

Every palette (presets, custom, generated) works in both modes.

**Palettes:** six presets (`material/palettes.ts`) or `'custom'`, which uses
`MaterialSettings.customColors` (`#rrggbb`, top → bottom). The sidebar always shows the
current palette's colors (`ColorStops`); editing, adding or removing one switches to
`'custom'` seeded from what was shown. Custom colors persist while browsing presets. Colors
are evenly spaced stops; 2 to `MAX_STOPS` (8, the shader's uniform array size, defined once
in `material/`). Use `materialStops(look)` / `paletteColors(look)` rather than reading
presets directly, so custom palettes work everywhere.

**Generate from one color** (`material/generate.ts`, sidebar's **generate** picker): builds
a `MAX_STOPS`-color ramp in OKLCH (`material/oklab.ts`), dark (top) → light (bottom) in
perceptually even lightness steps, with the seed at its own lightness. Hue turns toward
blue-violet (280°) in the darks and warm yellow (95°) in the lights (the painter's hue
shift); chroma eases toward the ends and is reduced only as far as needed to fit sRGB
(gamut mapping keeps hue and lightness). Generating sets `palette: 'custom'`, stores
`seedColor`, and sets `banding` to 0.

**Banding** (`MaterialSettings.banding`, `uBanding`): how stops blend. 1 = smoothstep per
segment (soft bands; the gradient eases in and out of each stop, like the reference), 0 =
linear (no pause at stops; seamless with dense, generated stops). `samplePalette` and the
shader mix between the two by this amount.

**Why a `ShaderMaterial`** (`render3d/trophyMaterial.ts`) and not `onBeforeCompile`: the look
comes entirely from the shader with no lights (the scene has none). A built-in material
would bring the lighting pipeline only to be overridden, and `onBeforeCompile` patches
internal shader chunks by string replacement, which breaks silently across Three.js versions.

How the fragment shader builds the color:

1. **Gradient**: a band coordinate (`bandCoord`): depth from the solid's top over its height
   (0 = top, 1 = bottom) plus `tilt` × distance from the axis over the height, so bands are
   straight diagonals across the body. Then low-frequency 3D value noise around the revolve
   (via cos/sin of the angle, so no seam) and along the height for wobble, offset/scale
   (`gradientCoord`), and a smoothstep blend between stops (`samplePalette`). Positions are
   in "solid space" (world position minus `uSolidOrigin`), so caps and the lathe agree
   whatever their mesh rotation. All of this mirrors the pure, unit-tested functions in
   `material/gradient.ts`; keep them in sync.
2. **Edge depth + edge hue**: fresnel `1 - |n·v|` mixes toward an edge tone: the "deep" tone
   (`color² × 0.85`, darker and more saturated) hue-rotated by `edgeHue` degrees about the
   gray axis (`hueRotate`; negative turns orange → crimson, lavender → blue). `v` is
   `(0,0,1)` for the orthographic camera (`isOrthographic`, provided by Three.js) and
   `-viewPosition` for perspective.
3. **Ledge shadow**: downward-facing normals, plus `aLedge`, a per-vertex occlusion
   precomputed along the lathe profile (`material/ledgeOcclusion`: how far a point sits under
   an overhang), mix toward a darker deep tone. Upward tops read slightly lighter.
4. **Back faces** (inside an open, partial sweep): normals flipped, shaded as interior shade.
5. **Grain**: screen-space hash noise, plus an always-on ±½-of-an-8-bit-step dither so slow
   gradients (dark bands, wide rims) never show steps, even with grain at 0.

**Smoothness:** curves reach the shader as straight segments. `shape2d/pathToOutline`
flattens with `OUTLINE_FLATNESS` (0.05px max error: ~16 segments per quarter circle at a
40px radius), and the lathe takes one step around the axis per ~6px of the widest rim
(96–384 steps; a rebuild is ~6ms even at the maximum, fine for the per-frame sweep).

Colors are **sRGB in and out**: stops are uploaded as plain `Vector3`s (a `THREE.Color` would
be converted to linear) and the shader omits `colorspace_fragment`, so the 3D colors match
the 2D canvas exactly.

**2D sketch in lit mode:** `litFrontRamp` lights a cylinder seen from the front (left
silhouette → right silhouette) and gradient-maps it; the Paper shape gets that gradient
across the trophy's width (`RagStyle.across`), so the sketch reads as the flat front of the
lit trophy. The sweep's first frame is then close to, not identical to, the sketch.

**2D ↔ 3D handoff (painted):** the 2D shape (Paper.js) is filled with the same gradient: the palette
densely sampled over `gradientSpan` (`gradientRamp`; outside the span the color is a
constant end stop, so the gradient's padding is exact), laid along the tilted band
direction by `tiltedGradientLine` (unit-tested to reproduce `bandCoord` at any point). The
sweep's flat caps use a second material instance sharing every uniform but with `uFlat = 1`
(gradient and tilt only: no wobble, ledge or grain), so the first frame of the sweep is
identical to the 2D shape.

| Uniform                                             | Source             | Meaning                                   |
| --------------------------------------------------- | ------------------ | ----------------------------------------- |
| `uStopColors[8]`, `uStopPositions[8]`, `uStopCount` | palette/colors     | gradient stops, top → bottom              |
| `uHeightRange`                                      | solid's bounds     | normalizes height for the gradient        |
| `uSolidOrigin`                                      | solid's group      | origin of solid space (axis, mid-height)  |
| `uGradientOffset`, `uGradientScale`                 | offset, scale      | shift / stretch the bands                 |
| `uTilt`                                             | tilt               | band slope (diagonal bands)               |
| `uBanding`                                          | banding            | stop blend: 1 soft bands, 0 linear        |
| `uWobble`                                           | wobble             | noise in band transitions                 |
| `uEdgeDepth`                                        | edge depth         | fresnel deepening toward the silhouette   |
| `uEdgeHue`                                          | edge hue           | hue rotation of the edge tone (degrees)   |
| `uLedgeShadow`                                      | ledge              | darkening under ledges (and lighter tops) |
| `uGrain`                                            | grain              | screen-space noise amount                 |
| `uFlat`                                             | cap vs surface     | 1 = plain gradient (caps)                 |
| `uShading`                                          | shading            | 1 lit (gradient map), 0 painted           |
| `uLightDir`                                         | light angle/height | key light, view space (`lightDirection`)  |
| `uAmbient`, `uSoftness`                             | ambient, softness  | shadow-side light, wrap of the lit side   |
| `uHighlight`, `uHighlightSize`                      | highlight, size    | Blinn highlight strength and spread       |
| attribute `aLedge`                                  | lathe profile      | precomputed occlusion under overhangs     |

**GLB export (planned):** custom shader materials don't export to glTF. To export, bake the
look first: either per-vertex colors (evaluate the same gradient/fresnel-free terms in JS per
vertex, using `material/` functions and `aLedge`, into a `color` attribute on a
`MeshBasicMaterial`; the fresnel term is view-dependent, so bake it for the front view or
leave it out), or render the shader into a texture over the lathe's UVs (u = around, v =
along the profile) with a render target and assign it as `map`.

## Commands

```sh
npm run dev          # Vite dev server
npm run build        # typecheck (tsc -b) + production build
npm run typecheck    # tsc -b --noEmit (app, tests, config)
npm run lint         # ESLint
npm run format       # Prettier (write); format:check to verify
npm test             # Vitest, single run; test:watch for watch mode
```

Tests run in jsdom with the `canvas` package installed, so Paper.js (and Pretext's canvas
measurement) work in Node. WebGL does not: tests rendering the whole App (which shows 3D by
default) use `vi.mock('../../src/render3d', () => import('../support/render3dStub'))`; add
new `ThreeScene` methods there.

## Documentation references

- Pretext: https://github.com/chenglou/pretext
- Paper.js reference: http://paperjs.org/reference/
- Three.js docs: https://threejs.org/docs/
  - ShaderMaterial: https://threejs.org/docs/#api/en/materials/ShaderMaterial
  - Material.onBeforeCompile: https://threejs.org/docs/#api/en/materials/Material.onBeforeCompile
- React docs: https://react.dev/
- Vite docs: https://vite.dev/
- Vitest docs: https://vitest.dev/

**Before using any library API, check these references and the installed packages' type
definitions instead of relying on memory.** APIs change between versions. Useful local files:

- `node_modules/@chenglou/pretext/dist/layout.d.ts` and `node_modules/@chenglou/pretext/README.md`
- `node_modules/paper/dist/paper.d.ts` (types are a global `paper` namespace; some runtime
  methods such as `PaperScope#remove` are missing, so check `paper/dist/paper-core.js`)
- `node_modules/@types/three/src/`
