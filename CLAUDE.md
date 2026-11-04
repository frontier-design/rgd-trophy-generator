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

Around it: every sidebar param can be keyframed on a timeline (`timeline/`, Theatre.js), and
the animation exported as a 4K MP4 (`export/`): frame by frame, the live 3D/2D layers plus the
text are composited at 3840 × 2160 and encoded with WebCodecs (mediabunny).

`Outline2D` (plain `{ contours: Point2[][] }`) is the hand-off between Paper.js and
Three.js, so `render3d/` never imports Paper and `shape2d/` never imports Three.
Shared types live in `src/types/index.ts`.

## Folder structure

```
src/
  main.tsx, Root.tsx   entry; Root picks the page from the URL (`usePage`): the generator
                       (App) at `/` or the canvas (CanvasPage) at `/canvas`
  App.tsx              App (the generator) wires the pipeline and lays out the page: ControlPanel
                       sidebar (left); right column: the artboard (1920 × 1080, scaled to fit)
                       holding PaperCanvas, ThreeCanvas and RagEditor (text at its bottom
                       left), and the TimelineSlot below it. State: Settings (store) +
                       SceneParams (mirror, overshoot, top height, round top + top radius,
                       taper, line box style, smooth joins + join radius, canvas colors) =
                       AnimatedParams; view toggles (revolve: starts 3D, "2D sketch" flips it;
                       debug; perspective); export fps. Also builds export frames (compose).
  state/               Settings via React context + useReducer (useSettings, SettingsProvider)
  measure/             Pretext wrapper + font loading (no React)
  banner/              pure math: the banner's layout (scaled from RGD's 2000 px artwork) and
                       reveal (no imports besides itself)
  rag/                 pure math: line widths → line boxes (and rag points/polygons)
                       (no imports besides ../types)
  material/            pure math for the trophy material: palette presets, gradient
                       sampling, lit-mode lighting, OKLCH color + palette generation,
                       ledge occlusion
                       (no imports besides ../types)
  pattern/             pure: the pattern node's image grids, Wave Function Collapse (overlapping
                       model), height maps, and the worker that builds them (no imports besides
                       ../types)
  shape2d/             Paper.js: dedicated PaperScope per canvas, boxes → rag shape →
                       Outline2D (no React)
  render3d/            Three.js: Outline2D → lathe profiles → revolved solid (+ twist.ts / etch.ts,
                       pure math for twist and etch nodes), sweep animation,
                       trophy ShaderMaterial, orthographic/perspective cameras (a fixed
                       front view), snapshots at any pixel ratio, disposal (no React)
  timeline/            Theatre.js (no React): params.ts (pure: AnimatedParams ⇄ timeline
                       values, changed props), theatre.ts (the project/sheet/object, Studio,
                       keyframes, playback, docking), studioPrivate.ts (Studio internals)
  components/          SceneArtboard (one scene's artboard: shape, solid, text, banner),
                       CanvasPage (+ CanvasScene, NodeCard, TwistFields, EtchFields,
                       PatternFields, patternImage,
                       ContextMenu, sceneNode, graph,
                       canvasDocument: the canvas page), SaveControls (save / open / status),
                       RagEditor (the text block is the editor; debug boxes + width labels),
                       PaperCanvas (fills the artboard behind the text, anchored to it; draws the
                       rag shape, reports its Outline2D),
                       ThreeCanvas (fills the artboard behind the text; revolves the shape in place),
                       TimelineSlot (the strip Theatre's sequence editor docks into),
                       ControlPanel (Collapse/Expand All; ControlSections of
                       Range/Select/Toggle/ColorFields, each with a KeyframeButton: size, line height, edge, mirror, top, round top, top
                       radius, taper, overshoot, box pad x/y,
                       radius, smooth joins + join radius; material incl. SeedColorField + ColorStops; canvas colors;
                       2D sketch, perspective, debug; timeline: play, to start, length, fps,
                       export 4K MP4)
  hooks/               usePage (URL ⇄ page), useInfiniteCanvas (the canvas page's pan/zoom),
                       useSceneModel (one scene's composition, shared by both pages),
                       useAutosave + useSaveStatus (saving), usePatternMaps (pattern nodes'
                       maps, in a worker),
                       useFontLoaded, useRagMeasure, usePanZoom, useTimeline (params ⇄
                       timeline), useVideoExport (one export job: progress, cancel, error)
  styles/global.css    the global stylesheet: tokens + all app styles
  export/              MP4 export (video.ts: seek → draw → encode, mediabunny), frame
                       compositing (composite.ts); SVG / PNG / GLB placeholders
  types/               shared types
tests/                 Vitest tests mirroring src/
public/fonts/          local font files (declare them with @font-face in src/styles/global.css)
```

### Rules

- **Library logic stays out of React.** `measure/`, `rag/`, `shape2d/`, `render3d/`,
  `timeline/` and `export/` are plain TypeScript and must not import React (enforced by ESLint).
  React components should only render and pass data in (canvas components: create a
  canvas, call the module's factory, pass data in, dispose).
- **`rag/`, `material/`, `banner/` and `pattern/` import no libraries at all** (enforced by ESLint), so their math
  stays easy to unit test. `material/` is shared by `shape2d/` and `render3d/`, which must not
  import each other.
- **Paper.js:** always use the scope from `createPaperScene` (`new scope.Path(...)`), never the
  global `paper` object. Call `scope.activate()` before creating items.
- **Three.js:** anything added to a scene must be disposed via `disposeObject3D` when replaced
  or on unmount. Three does not free GPU memory when objects are removed.
- **The 3D view renders on demand** (`threeScene`): no per-frame loop (each scene is a
  full-frame canvas with a heavy shader; several idling at 60 fps made the canvas page lag).
  Changes in a React commit are drawn by ThreeCanvas's `render()`; others (resizes,
  observers, pixel ratio) via `requestRender` (one coalesced animation frame). Only the
  sweep runs a loop, stopped when it ends. Canvas scenes and node cards read the zoom through
  a getter for drags and render at a settled, quarter-step zoom (`useSettled`, 200 ms), so
  zooming doesn't re-render them or re-allocate their buffers every wheel tick.
- **Text, shape and solid update in the same frame** (otherwise animated text runs ahead of
  its groove): the canvas wrappers create their scene and apply every update in
  `useLayoutEffect` (so before paint; PaperCanvas's outline → App state → ThreeCanvas is
  re-rendered synchronously), Paper draws at once (`view.update()`), ThreeCanvas calls
  `ThreeScene.render()` after each commit, and `useTimeline` applies Theatre's playback
  values with `flushSync`. Only the anchor observers are passive effects: the editor (the
  anchor) renders after the canvases, so its ref isn't attached during their layout
  effects. PaperCanvas skips painting while hidden behind the 3D view (`visible`).
- **Canvas wrappers** (`PaperCanvas`, `ThreeCanvas`) create a fresh `<canvas>` inside
  a layout effect and remove it in cleanup, so React StrictMode's double mount gets a clean
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
- **Page layout:** edge to edge, no gaps: the sidebar full height on the left
  (`--panel-width`); on the right the canvas at the column's full width and 16:9
  (`.artboard-viewport`, aspect ratio from `ARTBOARD`), and the timeline filling the rest
  below (at least `--timeline-min-height`; on short windows the canvas shrinks instead).
- **Workspace** (After Effects–style, `hooks/usePanZoom`): the frame sits on a grey
  pasteboard (`--color-workspace`). The wheel or a trackpad pinch zooms about the cursor
  (0.1–8× the fitted zoom), dragging anywhere but a control (or middle-dragging anywhere)
  pans, and a double-click on the pasteboard or **Fit** (bottom right, with the zoom %,
  100% = actual size) fits it again, 48 px clear; it stays fitted as the window resizes
  until you pan or zoom. Pure math (`fitView`, `zoomAt`) is unit-tested. The 3D view has
  no orbit controls: the camera is a fixed front view. The 3D view renders at device ratio
  × zoom, capped at 3.
- **The artboard is a fixed 1920 × 1080** (`ARTBOARD` in `state/view.ts`, the video frame),
  laid out at that size and scaled to the workspace's zoom (`--artboard-scale`, CSS
  `transform`) inside `.artboard-frame`, placed at the view's offset, so the composition is the same at any window size.
  `relativePosition` undoes the transform (positions in the artboard's own px), and
  ThreeCanvas renders at device ratio × display scale (`pixelRatio`).
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
- **Shared reveal timing** (`rag/staggered`): items appearing one after another, each
  settling over one unit with the reference's ease-out (exponent 2.5), the next starting
  `stagger` later. The text's stack-in (lines, bottom first) and the banner's items (left
  to right) both use it, with the text's stagger, so they move alike; the sculpt intro
  times the banner's keyframes with the text's slide time (`bannerRevealUnits`). The top
  band's rounded corner grows in with the first line's settle (it sits on that line's box),
  rather than appearing at full size when the line pops in.
- **Text reveal: stack-in** (`reveal` %, `revealStagger` %, `revealSlide` %; sidebar
  **reveal** / **stagger** / **slide**, animatable), modeled on the RGD reference GIF: lines
  appear one at a time from the bottom up, each all at once and `slide` % of the type size
  to the left, easing right into place (ease-out, exponent 2.5, fitted to the reference);
  the next line appears `stagger` % of a slide later (`rag/stackReveal`). Only shown lines
  carve, each box moved with its line (`rag/revealedBoxes`), so a groove deepens as its
  line slides in; the extent and top band come from all the text
  (`ShapeExtent.bandBottom`), so at 0% the shape is uncarved: a full cylinder. While
  revealing, the textarea's text is transparent and `.rag-reveal` shows the shown lines
  at their offsets (the mirror slides in from the right); exports draw the same
  (`TextLayer.offsets`). `reveal` must be keyframed linearly to keep this timing.
- **Reveal fill** (`revealFill` %, sidebar **fill**, animatable, default 0): at the reveal's
  start the uncarved trophy reaches out to cover the whole frame (100%) and eases back to
  its extent as the text stacks in (`rag/revealFill`, smootherstep over the reveal; at 100%
  reveal it's exactly the extent). Only the extent grows (`rag/fillExtent`: left out to the
  radius reaching the frame's farther side, top and bottom past the frame, 1 px bleed);
  the boxes carve from past its left side as always, so the grooves stay on the text. App
  measures the text block's place in the frame after every commit for this.
- **Line order** (sidebar **line order**, `revealOrder`, animatable): which line reveals
  first, bottom (default, the RGD reference) or top, for both styles (`from` in
  `stackReveal` / `typeReveal`).
- **Text reveal: type** (sidebar **reveal style** = type; `rag/typeReveal`), modeled on a
  letter-by-letter, spacing-driven type animation: letters appear one at a time at their
  places, top line first, in reading order or, with **scatter**, in a stable scattered order
  within each line (spaces aren't typed). Each letter arrives with **spacing** % of the type
  size (`revealSpacing`, its own slider; **slide** is the stack-in's) of extra space before it that closes up with the shared ease-out, pushing the letters
  after it along, so the line's tracking tightens as it fills; **stagger** is the time
  between letters. Each line carves only as far as its typed letters reach (`extent`,
  padding growing in with its first letter), so the groove grows letter by letter; the
  mirror's line moves so its typed letters end at the reflected edge. Letter positions come
  from `measure/measurePrefixWidths`; the editor renders letters as relatively positioned
  spans (keeps shaping), exports draw them one by one (`TextLayer.glyphs`), each right-aligned at where it ends (the kerned width of the text up to and including it), so letters sit exactly where the whole line puts them and nothing jumps when the reveal ends (placing a letter at the width of the text before it misses its kerning with that letter, ~9 px for AW). The sculpt intro
  times it per letter (0.3 s settles, a letter every 0.06 s).
- **Sculpt intro** (timeline section preset, `SCULPT_INTRO` in App): fits the mirrored
  composition to the frame (`rag/fitToFrame`: edge = half the frame minus `ARTBOARD.padding`, type sized so
  the widest line carves 75% of the radius, top band bleeding off the top), sets the
  reference's stagger (20%) and slide (60%), fill 100% (so it opens on the trophy covering
  the frame), and keyframes reveal 0 → 0 → 100%, linear
  (hold 0.4 s, stack in over 0.75 s slides, hold 1 s) via `Timeline.setKeyframes`, which
  makes tweens linear (`studioPrivate.linearTweens`). Playback loops (**loop** toggle,
  `Timeline.play(loop)`); an export is one cycle, so it loops seamlessly.
- **One margin all around** (`ARTBOARD.padding`, 60 px; the final look matches RGD's
  layout): the text's left (and so the trophy's left silhouette) and the mirror's right sit
  on it; the trophy's bottom (the last baseline plus overshoot, not the text box's bottom,
  which includes descenders) sits that far above the frame's bottom, or above a bottom
  banner's row (App derives `--artboard-padding-bottom` from the extent for this); the
  sculpt intro sizes the top band so the cylinder's flat top sits on the top margin.
- **Banner** (sidebar **banner** section; `components/Banner`, `banner/`): RGD's artwork, no
  divider: the logo (`public/images/RGD_Logo.svg`, its black block flush with the frame's
  left edge), a headline and a link, sized from the artwork (2000 px wide: 56 px PP Mori
  Medium caps, logo 43 px tall, baseline 4 px above its bottom) scaled to the frame. At the
  bottom (default) the row ends a margin from the frame's bottom, the link ends a margin
  from the right, the headline sits between logo and link with equal gaps (its and the
  link's widths are measured), and the trophy keeps a margin clear above the row
  (`clearance`), so trophy → row = row → frame bottom. Top mirrors this. One SVG in
  artboard px over everything (z-index 4); video export draws the same from the same layout
  (`export/composite`'s `BannerLayer`, the logo preloaded). **banner** (show) and
  **banner reveal** are animatable (`banner.show`, `banner.reveal`); position and the text
  are App state. The reveal (`bannerReveal`): the bar (canvas background, the row and its
  margins) grows up from its bottom edge, then the logo, headline and link rise one after
  another from the bar's bottom, clipped to it, with the text's ease-out. The sculpt intro
  keyframes it to rise as the text settles. Both canvases re-read the anchor after every
  commit, since a layout change like the bottom padding moves the text without resizing
  anything the observers watch.
- **Presets set layout static**: `useTimeline().editStatic` / `Timeline.setStatic` drop any
  keyframes on the values a preset sets (Studio's "make static", `studioPrivate.makeStatic`),
  so the composition holds through the animation. `useTimeline` also applies the saved
  project as soon as Theatre loads it (`Timeline.ready`), so presets never compute from
  defaults.
- **Pages** (`Root`, `hooks/usePage`, no router library): a **page** dropdown
  (`components/PageSwitch`; in the generator's sidebar, floating top left on the canvas)
  switches between the generator (`/`) and the canvas (`/canvas`) with `history.pushState`;
  back/forward work (`popstate`). Paths are under Vite's `BASE_URL`; a production host
  needs an SPA fallback so `/canvas` serves `index.html`. Only one page is mounted, so the
  generator's view state (e.g. banner text) resets when you leave it; Theatre's project
  persists. Theatre's overlay is hidden off the generator (`useTimeline` calls
  `Timeline.setStudioVisible`).
- **Canvas page** (`components/CanvasPage`, a work in progress, no sidebar): an infinite,
  gridded pasteboard. Dragging the empty canvas (or middle-dragging anywhere) and the wheel
  pan; ⌘/Ctrl + wheel or a trackpad pinch zooms about the cursor (0.1–8×, `zoomAt` from
  `usePanZoom`); **Reset** (bottom right, with the zoom %) recenters. The grid is CSS
  backgrounds following the view (`--grid-x/y`, `--grid-fine` = 24 px × zoom, major lines
  every 5; fine lines fade out when too dense); the world layer (`.infinite-canvas-world`,
  `--zoom`) is transformed with the view and holds the scenes. `data-no-pan` elements don't
  start a pan; over `data-own-wheel` ones (the controls) the wheel scrolls them.
- **Canvas scenes, node-style** (`CanvasPage`, `CanvasScene`, `sceneNode.ts`): right-click
  → **insert scene** (`ContextMenu`) centers a 1920 × 1080 scene on the click; each has its
  own state (`SceneNode`: settings, scene params, view toggles, position), no timeline.
  Pressing a scene selects it (raised, outlined) and its controls float beside it (the
  sidebar's `ControlPanel` with no keyframes, no timeline, no banner section and
  `revealControls={false}`), kept on screen; dragging it (not its text) moves it; its text
  edits as in the generator; a press on the empty canvas deselects; Delete/Backspace
  (unless typing) or right-click → **delete scene** removes it. A new scene starts on RGD's
  reference layout without the banner (`canvasSceneDefaults`): text measured once its font
  loads (`measureDefaultText`), fitted with `rag/fitToFrame` (the sculpt intro's rule:
  mirrored, the widest line + box carving 80% of the radius, the top band up to the top
  margin), boxes, corners and joins scaled with the type, round top on. Each scene is its
  own WebGL context (browsers cap them, ~16) and render loop. Saved (see Saving).
- **Node cards** (`NodeCard`): full size on screen down to 50% zoom, then shrinking with the
  canvas to a 30% floor (`cardScale`; `--card-scale` on the world layer, which also scales
  scene input ports and places output ports, `outputPort`), so zoomed out they don't cover
  the scenes. Below 60% scale they show only their header (no fields in the DOM); the header's
  −/+ folds a card at any zoom (`collapsed`, saved). The selected scene's panel is
  `SceneControls`, memoized so panning (which re-renders the page) doesn't re-render it.
- **Twist node** (`TwistFields`, `graph.ts`; right-click → **insert twist**): a card with
  fields: **section**
  (lobes: raised lobes, grooves between; grooves: narrow rounded channels in flat ribs),
  **flutes**, **depth** % of the radius, **twist** ° over the band, **curve** (the turn
  bends: + slow at the top, tightening below), **sharpness** (lobes: rounder lobes, crisper
  creases; grooves: narrower channels), **rotate**, **from**/**to** (the band of the height,
  % from the top), **ends** (fade, or round: each cut closes in an arch) and **end size** (%
  of the height). Drag from its output port onto a scene's input port (mid-left) to link
  (`NodeLink`, curves in `.node-links`, an SVG in canvas px); dragging from a linked input
  picks its last link up; deleting a node drops its links. An output can feed several
  scenes; a scene takes the first `MAX_TWISTS` (4), multiplied.
  - The math (`render3d/twist.ts`, pure, tested; `twistScale`): the radius is scaled by
    m = 1 − depth·fade·cut, cuts centered on the creases (lobes 1 − sin(x/2)^p, grooves
    cos(x/2)^p, x = distance from the crease), so the surface only cuts in from the revolved
    silhouette (never past the rag). Ends apply where the band ends inside the trophy, and at
    its very top and bottom only with an end size (at 0 the flutes run off the rim, rim
    included); every inside end is at least 1.5% of the height (no steps); round ends narrow
    the _cuts_ to a point (quarter ellipse) so the surface around stays full and the
    silhouette carries on.
  - `buildLathe` scales each vertex's radius (one evaluation of m each) and keeps the
    undeformed normals (plus `aProfileNormal`); the shader computes the exact normal per pixel (`twistOne` / `twistScale` / `twistedNormal`
    in trophyMaterial.ts mirror twist.ts: keep in sync), so creases stay crisp wherever they
    cross the mesh. Steps around the axis rise to `STEPS_PER_FLUTE` per flute (≤ 960); sweep
    caps are narrowed to the flutes at their angle. A fluted solid's changes after its
    first build are drafts (40% of the steps around, ~35 ms) until they pause 220 ms, then
    rebuilt in full (`threeScene` `rebuild`; snapshots always full). Twists shape the 3D
    solid only.
- **Etch node** (`EtchFields`, `render3d/etch.ts`; right-click → **insert etch**): a strip
  (**from**/**to**, % of the height) of fine lines laid out by **layout**: diagonal (winding
  by **slant**), vertical (straight down), horizontal (rings, `bundles` across the strip),
  zigzag or wave (**waves** periods, swinging by slant); **cross** doubles them (mirrored and
  crossing: lattice, guilloché; horizontal: plus vertical lines, a grid). Their depth eases
  like a pattern's (**fade**, **top depth** / **bottom depth**, `stripDepth`, shared). Lines
  in **bundles** around the trophy, **lines**
  per bundle **gap** apart, **thickness** (0.3–40 frame px), winding by **slant** ° over the strip, both
  ways with **cross** (a lattice); **style** cut (default) or bright/dark inlay;
  **strength**. Drawn by the shader (`etchAt` mirrors `etchDistance`), not the mesh: hairline
  grooves are far finer than any lathe resolution. Lines are a fixed width on the frame
  (screen-space slopes; the angle comes from two cuts of the circle so its slope never sees
  atan's seam). Cut lines are V-grooves that bend the normal per pixel (derivative bump
  mapping, `perturbNormal`, like Three's perturbNormalArb), so their walls catch the key light
  and shade with it; the silhouette stays smooth. Grooves under ~4 px on screen blend from
  wall shading to a soft shaded line (one pixel can't show both walls: they'd break into
  dashes). GLSL ES 3.0 reserves names like `layout` and `sample`: a test scans the shader
  for reserved names used as variables, and another checks both shaders declare the same
  varyings once each (each mistake blanked every trophy once: jsdom can't compile GLSL). No rebuild: uniforms only (`setEtches`).
- **Frame size** (canvas scenes; scene controls' **frame** section): each scene has its own
  `frame` (presets 16:9, 1:1, 4:5, 9:16, 4K, or any width × height, 256–8192 px). A new size
  re-fits the text and trophy to it (`fitSceneToFrame`: measures the scene's text and runs
  the sculpt intro's rule, `rag/fitToFrame`, scaling boxes/corners/joins with the type);
  **fit to frame** does it again after text edits. Selected, a scene also has resize
  handles at its edges' midpoints (`frame-handle`, screen-sized; `resizeFrame`: the opposite
  edge stays, Shift keeps the ratio) with its width and height beside them, re-fitting live;
  its input port moved up its left side (`INPUT_PORT_AT`, a quarter down) for the left
  handle. `useSceneModel` takes the frame (banner
  layout, reveal fill), CanvasScene sizes the artboard with it (`--artboard-*`), and ports and
  the controls' position follow it. The generator stays 1920 × 1080 (`ARTBOARD`, the video).
- **Image export** (generator and canvas scenes; **image** section): the frame as it is now
  as PNG (optionally **transparent**: no background, the banner's bar too) or JPEG (opaque,
  0.92), at ×1–×5 (`export/image.ts` `renderImage`; `maxImageScale` caps it so the longest side
  stays ≤ 16384 px and the image ≤ 100 M px, e.g. 4K at ×3). Both pages build the layers with
  one function, `SceneArtboard/composeScene` (also the video export's frames): the 3D view
  rendered at the scale (drawn in the same task), the text and mirror at their baselines, the
  banner. Canvas scenes hand their exporter up (`onExporter`); options are saved per scene
  (`imageExport`) and in the generator's document.
- **Pattern node** (`PatternFields`; right-click → **insert pattern**; starts in repeat mode,
  fold around, which works best for organic ornament): ornament on a strip from an image (starts with `public/images/ornament-sample.png`; **load image** stores a
  ≤ 600 px PNG data URL in the node, so it's saved with the canvas). The image is cropped to
  its ornament and turned so its long side runs around (`pattern/grid.ts`). **mode**:
  - **generate**: Wave Function Collapse, the overlapping model (`pattern/wfc.ts`, after
    Gumin; AC-4 propagation, seeded mulberry32, retries on contradiction, gives up past
    600 neighborhoods): the image read at **detail** cells across (binarized at
    **threshold**, **invert**), **size** × size neighborhoods with **symmetry** (none,
    mirror, all), **length** cells around, wrapping around (seamless), **seed** (+ new
    seed). Pixel-level WFC keeps an image's local texture, not long continuous forms
    (organic scrolls come out as scroll-like texture), so **fold** mirrors the result like
    designed ornament (across the middle line, around in pairs, both: the default).
  - **repeat**: the image itself (contrast at threshold), **fold** around mirrors every
    other repeat so they meet seamlessly.
  - The map (255 = ornament) is blurred by **softness**, built in a worker
    (`pattern/worker.ts`, driven by `hooks/usePatternMaps`: per node, debounced, stale jobs
    dropped, sync fallback without workers; only map fields rebuild, placement doesn't), and
    previewed on the node (`usePatternMaps` keys images by a short id, not their data URL).
    **mapping**: **strip** stretches the map over the strip (from/to); **surface** follows
    the trophy's surface: the vertical coordinate is `aSurface` (`lathe.ts`
    `surfaceCoordinates`: ∫ −dy / r down the profile, in the same units as the angle), so
    the ornament keeps its proportions (map width/height) everywhere, repeating in rows from
    the strip's top (`surfaceAtHeight` → `uPatternC.w`) and getting smaller where the trophy
    narrows: for covering the whole shape (from 0 to 100) without stretching; there,
    **repeats** sets its size. The shader wraps it **repeats** times around the strip with
    seam-safe `textureGrad`, at **scale** (density, proportions kept: smaller repeats more around, whole
    repeats for seamlessness, and stacks rows across, the texture repeating vertically;
    larger crops it to the strip about its middle line; fold across or both makes rows meet
    seamlessly), and **shape scale** (each motif in its own cell, the same number of them:
    smaller spaces them out on plain surface, edges feathered over 8% of a motif; larger
    crops into them). Its embossing depth (`patternDepth`) eases from **top depth** to
    **bottom depth** over the strip (e.g. 100 → 0: the ornament gradually loses its relief)
    and to 0 at its edges over **fade** % of it (smootherstep); it scales the relief only,
    never adds its own slope (the normal follows the map's gradient × depth), so motifs
    flatten into the surface instead of the strip reading as a bevel; **style** raised / cut bends the normal by
    the height's screen-space slope (relief up to 10 frame px × **strength**, the ground or
    the cut a touch darker), bright / dark inlay recolor. Up to `MAX_PATTERNS` (2) per scene;
    textures upload once per map (`trophyMaterial.setPatterns`) and are freed with the scene.
- **Modifier nodes** (`graph.ts`: `ModifierNode` = twist | etch, `kind`; `NodeCard` is the
  shared card, `TwistFields` / `EtchFields` the fields): one link model, `modifiersByScene`
  groups each scene's twists and etches in link order. Saved under `modifiers` (saves from
  before etch, with `twists` only, still load).
- **Saving** (`state/persist.ts`, `hooks/useAutosave`, `components/SaveControls`):
  - **Autosave**: each page writes its document to localStorage (`rgd-generator:canvas`,
    `rgd-generator:generator`) 400 ms after a change (not the value it loaded with, and
    never unchanged content), and at once on unmount (switching
    pages), `pagehide`/hidden and before a manual save. The canvas: scenes, twists, links,
    insert counters, view (`canvasDocument.ts`); the generator: text, banner, view toggles,
    fps, loop (`state/generatorDocument.ts`; `SettingsProvider` starts from its text). The
    generator's params and keyframes are Theatre's own autosave. Loading merges saved values
    over today's defaults (old saves keep loading), drops broken nodes and dangling links,
    and continues ids past the highest. Status beside the page dropdown ("autosaved …").
    Pattern images are stored apart, once each by content (`storeBlob`, key
    `rgd-generator:blob:<id>`; `useAutosave`'s `serialize: storeCanvasDocument`), so the
    canvas document stays a few KB and autosaves (every pan) stay cheap; unused ones are
    pruned; loading resolves them (`loadBlob`), project files inline them (`inlineBlobs`).
  - **Other tabs**: when another tab saves _different_ content for a page (`storage` event),
    this tab stops autosaving it and warns (otherwise the last tab to write wins and work is
    lost). Tabs on the same origin share it: test with a second dev server on another port
    (e.g. 5181), never in the user's origin.
  - **Manual save** (**save**, ⌘/Ctrl+S; ⇧ = pick a new file): a project file (JSON:
    both pages + Theatre's `createContentOfSaveFile`). Chromium: the first save asks where,
    later ones overwrite that file (File System Access API); elsewhere it downloads a copy.
    **Open** writes the file's pages to storage and reloads (autosave suspended so the
    closing page can't overwrite it). Not yet: opening doesn't restore the timeline
    (Theatre's keyframes), only carries it in the file.
  - Tests clear localStorage after each test (`tests/setup.ts`).
- **One scene, two pages:** `hooks/useSceneModel` (measure → boxes, reveal, extent, fill,
  banner layout, baselines; reads where the text sits after every commit) and
  `components/SceneArtboard` (the artboard: PaperCanvas, ThreeCanvas, RagEditor, Banner)
  are shared by the generator (App adds the timeline, export, presets, pan/zoom frame) and
  canvas scenes. The caller creates `editorRef`/`artboardRef` and passes them to both (refs
  inside a returned object trip React's refs lint).
- The text box isn't auto-focused (it used to be): with Theatre's spacebar for play, a
  focused text box took the space as typing.
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
- **Sidebar sections:** fields are grouped in named, collapsible `ControlSection`s (type,
  shape, top, line boxes, material, lighting, canvas, view; all open by default), separated
  by solid rules. A section's header is a button (`aria-expanded`) that hides its body
  (`hidden`). Sections and bodies are CSS subgrids of the panel, and a collapsed body stays in
  the layout at zero height, so all labels share one column that never shifts.
- **Sidebar look:** one two-column grid (`.control-panel`; field wrappers are
  `display: contents`): bold, Title Case (`text-transform`; the DOM text stays lowercase,
  which is also the accessible name), right-aligned labels in gray boxes
  (`--color-label-bg`); sliders are a solid line to a tick with dots after it (`--fill` on
  `.range-wrap`), values shown above the tick on hover/focus; buttons are
  gray boxes, inverted when pressed.
- **Styling** goes in `src/styles/global.css`. Typography that Pretext measures (font
  family/size/weight, line height, column width) comes from `Settings` and reaches CSS as
  `--rag-*` custom properties set by `RagEditor`. Never hard-code those values in CSS, or
  the displayed text and the measurement drift apart. The shape's and trophy's colors come
  from `Settings.material` (see Trophy material), not CSS.
- **The editor is a textarea** laid out exactly like the measurement (no padding, border or
  scrollbar; `white-space: pre-wrap`), and measured with Pretext's `whiteSpace: 'pre-wrap'`
  so line breaks match. `LineMeasure.width` is the visible width (trailing spaces excluded).

- **Timeline (Theatre.js):** one Theatre object (`trophy`) whose props are every
  `AnimatedParams` field, grouped like the sidebar (`timeline/params.ts`, `PARAM_PATHS`).
  The app stays the source of its own state: sidebar edits go through `useTimeline().edit`
  (applied at once, and the changed props pushed with `timeline.set`, a debounced Studio
  scrub = one undo step per drag; animated props get a keyframe at the playhead, Theatre's
  rule), and the timeline's values at the playhead (`onValues`) are applied back. Never
  push on every value change: Theatre reports interpolated colors that don't survive the
  hex round trip, and pushing them would add keyframes. Line height is stored as
  **leading** (× size), so animating size scales line height like the size slider does.
  Palette colors are 8 rgba props (`c1`–`c8`); the color count stays in app state.
  - **Keyframe buttons** (◇ static, dark ◇ animated, ◆ keyframe at the playhead):
    `toggleKeyframe` sequences the prop if needed and sets a keyframe with the current
    value, or unsets the one at the playhead. They re-render on keyframe changes via a
    dataverse `prism` over `__experimental_getKeyframes` (tracked reads).
  - **Studio** shows its sequence editor only once something is animated. `TimelineSlot`
    docks it over the strip below the canvas (a temp, never-committed Studio transaction,
    so no undo steps). Its outline/details panels are unpinned (open from its toolbar).
  - **Private Studio APIs** (sequencing a prop, panel position, unpinning) live only in
    `timeline/studioPrivate.ts`, written against `@theatre/*` 0.7.2, pinned exactly; check
    them when upgrading. `@theatre/studio` is CommonJS: `theatre.ts` normalizes its
    default import (Vite 8 hands over the module object).
  - Theatre saves the project (static values, keyframes, length) in localStorage; it
    restores on load and is applied to the app on mount. `getTimeline` is a singleton
    (Theatre objects must be created once).
- **Video export** (`useVideoExport` + `export/`): pauses, then for each frame seeks the
  timeline and applies its values synchronously (`flushSync(syncNow)`; the canvases update
  in layout effects, so the frame is ready at once, no animation frames needed, which also
  keeps exports running in background tabs), and draws a
  `Composition`: background, the 3D view (`ThreeScene.snapshot(2)`) or the 2D shape
  (`PaperScene.snapshot(2)`, a Paper rasterize), then the text and its mirror with canvas
  `fillText` at the same baselines, then the banner (the debug overlay is left out). Encoded at 3840 × 2160,
  `QUALITY_VERY_HIGH`, first encodable of H.264 → HEVC → VP9 → AV1, then downloaded.

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
5. **Grain** (`applyGrain`): monochrome Gaussian grain, like Photoshop's Add Noise
   (Gaussian, monochromatic), added to the color (no blend mode) over the whole shape, a
   little stronger in the midtones like film grain. White noise (an independent,
   Irwin–Hall Gaussian value per grain, "hash without sine"), not Perlin: Perlin is smooth,
   low-frequency noise, which at grain scale makes wormy blobs and aliases when the view is
   scaled; white noise has no structure, so it stays even at any zoom. Grains are
   `grainSize` frame px (sidebar **grain size**, animatable; 0.5 = one 4K pixel), smoothly
   interpolated so larger sizes read as soft clumps; positions are in frame px
   (`uPixelRatio`), so the export matches the preview. Caps skip it. Plus an always-on
   ±½-of-an-8-bit-step dither so slow gradients never show steps, even with grain at 0.

**Smoothness:** curves reach the shader as straight segments. `shape2d/pathToOutline`
flattens with `OUTLINE_FLATNESS` (0.05px max error: ~16 segments per quarter circle at a
40px radius), and the lathe takes one step around the axis per ~6px of the widest rim
(96–384 steps). The lathe is built by `render3d/lathe.ts` `buildLathe`: the same geometry as
Three's `LatheGeometry` (unit-tested equal) plus `aLedge`, straight into typed arrays.
LatheGeometry took ~100ms for a full-frame trophy (~250k vertices); this takes a few ms, so
the solid can be rebuilt every frame of an animation (a full update is ~12ms).

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
new `ThreeScene` methods there. Theatre's Studio doesn't run in jsdom either: they also use
`vi.mock('../../src/timeline', () => import('../support/timelineStub'))` (a static
timeline; the pure `timeline/params.ts` is tested directly).

## Documentation references

- Pretext: https://github.com/chenglou/pretext
- Paper.js reference: http://paperjs.org/reference/
- Theatre.js docs: https://www.theatrejs.com/docs/latest (types: `node_modules/@theatre/core/dist/index.d.ts`,
  `node_modules/@theatre/studio/dist/index.d.ts`)
- mediabunny (MP4 muxing over WebCodecs): https://mediabunny.dev (types:
  `node_modules/mediabunny/dist/mediabunny.d.ts`)
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
