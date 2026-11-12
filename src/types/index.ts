/**
 * Shared types for the pipeline:
 *   Settings + text → LineMeasure[] → RagPoint[] → Outline2D → (Three.js mesh)
 *
 * These are plain data so every stage can be tested without the next stage's library.
 */

/** Gradient presets for the trophy material, based on docs/reference/material-ref.png. */
export type PaletteName = 'studio' | 'ember' | 'candy' | 'cobalt' | 'forest' | 'plum' | 'mustard'

/** A preset, or the user's own colors (`MaterialSettings.customColors`). */
export type PaletteChoice = PaletteName | 'custom'

/** The trophy material's look. Drives the shader's uniforms and the 2D shape's gradient. */
/** 'lit': a lighting pass recolored through the palette (a gradient map: dark stops are
 *  shadow, light stops highlight), like Illustrator's 3D Revolve + a Photoshop Gradient
 *  Map. 'painted': the palette painted along the height (the matte vessel look). */
export type Shading = 'lit' | 'painted'

export interface MaterialSettings {
  shading: Shading
  palette: PaletteChoice
  /** The user's own gradient colors (`#rrggbb`, top → bottom), used when palette is
   *  'custom'. Kept while browsing presets. */
  customColors: string[]
  /** The color the custom palette was last generated from (sidebar's "generate"). */
  seedColor: string
  /** How stops blend: 1 = soft bands (ease in/out of each stop), 0 = linear (seamless). */
  banding: number
  /** Shifts the bands along the height. Positive moves them down. */
  gradientOffset: number
  /** Stretches the bands around the middle of the height. > 1 makes them wider. */
  gradientScale: number
  /** Slope of the bands: 0 = horizontal, positive rises to the right (px per px). */
  tilt: number
  /** Noise in the band transitions, 0–1. */
  wobble: number
  /** Fresnel deepening toward the silhouette, 0–1. */
  edgeDepth: number
  /** Hue rotation of the edge color, in degrees (negative: orange → red, lavender → blue). */
  edgeHue: number
  /** Darkening under overhangs (and the lighter tone on tops), 0–1. */
  ledgeShadow: number
  /** Surface grain, 0–1. */
  grain: number
  /** Grain size in frame px (a 4K export has 2 px per frame px). */
  grainSize: number
  /** Lit mode: the key light's direction around the subject, degrees (0 = front, + = right). */
  lightAngle: number
  /** Lit mode: the key light's height, degrees (0 = level, 90 = overhead). */
  lightHeight: number
  /** Lit mode: light reaching the shadow side, 0–1. */
  ambient: number
  /** Lit mode: how far light wraps around the form (a softer shadow edge), 0–1. */
  softness: number
  /** Lit mode: highlight strength, 0–1.5. */
  highlight: number
  /** Lit mode: highlight size, 0 = tight and sharp, 1 = broad and soft. */
  highlightSize: number
}

/** User-controlled inputs. Owned by `state/`. */
export interface Settings {
  text: string
  /** A *named* font family (Pretext is inaccurate with `system-ui` / `-apple-system`). */
  fontFamily: string
  /** CSS font weight, e.g. 400 or 700. */
  fontWeight: number
  /** Font size in CSS px. */
  fontSize: number
  /** Column (max line) width in CSS px. */
  columnWidth: number
  /** Line height in CSS px. Pretext takes this at layout time, not prepare time. */
  lineHeight: number
  /** The trophy material (not a measurement input; it never affects layout). */
  material: MaterialSettings
}

/**
 * One measured line. Mirrors the fields we use from Pretext's `LayoutLine`
 * (`text`, `width`) plus the line's index; Pretext's segment cursors are not exposed.
 */
export interface LineMeasure {
  index: number
  text: string
  /** Visible width of the line in CSS px (trailing whitespace excluded). */
  width: number
}

/** A 2D point in CSS px, y pointing down (screen space). */
export interface Point2 {
  x: number
  y: number
}

/** A vertex of the rag contour, tagged with the line it came from. */
export interface RagPoint extends Point2 {
  lineIndex: number
}

/** Vertical font metrics at the current size, in px (from canvas, like Pretext). */
export interface FontMetrics {
  /** Baseline up to the top of the font's content area. */
  ascent: number
  /** Baseline down to the bottom of the font's content area. */
  descent: number
}

/** Where the rag shape starts and stops, in the text block's px coordinates (y down). The
 *  right side is always the edge (column width). */
export interface ShapeExtent {
  /** The text's left side. */
  left: number
  /** Top of the first line's box, raised by the top band. */
  top: number
  /** Where the top band ends: the first line's box top, for all the text (typed in or
   *  not). Defaults to the carving boxes' top. */
  bandBottom?: number
  /** The last line's baseline, plus the optical overshoot. */
  bottom: number
}

/** One line's box, in the text block's px coordinates (y down). */
export interface LineBox {
  lineIndex: number
  x: number
  y: number
  width: number
  height: number
  /** Effective corner radius, already clamped to fit the box. */
  radius: number
}

/**
 * Library-neutral 2D geometry handed from `shape2d/` (Paper.js) to `render3d/` (Three.js).
 * Each contour is a closed polygon. For the rag shape these are separate regions
 * (there are no holes); when revolving, each contour that touches the axis becomes a solid.
 */
export interface Outline2D {
  contours: Point2[][]
}

/** The canvas's colors, `#rrggbb`. View-only: they never affect the shape or material. */
export interface CanvasColors {
  background: string
  text: string
}

/**
 * How each line's box is drawn around the measured line. The boxes decide the rag shape
 * (and so the revolved solid); they never affect measurement or line height.
 */
export interface LineBoxStyle {
  /** Extra space between the measured line box and the box, in px. Negative shrinks. */
  padX: number
  padY: number
  /** Corner radius in px. */
  radius: number
}

/**
 * Shape and canvas parameters held by App (not measurement inputs, so not in Settings).
 * Together with the animatable Settings they are what the timeline animates.
 */
/** How the text reveals: lines stacking in from the bottom, or typed letter by letter. */
export type RevealStyle = 'stack' | 'type'
/** Which line reveals first. */
export type RevealOrder = 'bottom' | 'top'
/** How the text's lines align in the column. */
export type TextAlign = 'left' | 'center'

export interface SceneParams {
  /** Lines left-aligned (the rag on the right) or centered in the column. Each line's box
   *  still starts at the text's left side and reaches to where the line ends. */
  textAlign: TextAlign
  revealStyle: RevealStyle
  /** Which line reveals first, in either style. */
  revealOrder: RevealOrder
  /** Type reveal: 0 = letters in reading order, 100 = scattered within each line (%). */
  revealScatter: number
  /** Type reveal: the extra space a letter arrives with, closing up as it settles (% of the
   *  type size). */
  revealSpacing: number
  /** Stack-in reveal of the text, in % (100 = all in place): lines appear bottom up and
   *  slide into place. Only shown lines carve the shape, so 0 leaves it uncarved (a full
   *  cylinder). */
  reveal: number
  /** Time between lines (or, typed, letters) appearing, in % of one's settle time. */
  revealStagger: number
  /** Stack-in: how far left a line appears before sliding into place (% of the type size). */
  revealSlide: number
  /** How far the uncarved trophy reaches out to the frame's edges at the reveal's start, in
   *  % (100 = covering the whole frame). It eases back to its place as the text stacks in. */
  revealFill: number
  /** Reflect the text (and the 2D shape) across the edge. */
  mirror: boolean
  /** How far the shape's bottom extends below the last baseline (px). */
  overshoot: number
  /** Unused (the top is pinned to the frame's top margin). Kept so saved
   *  projects and the timeline still load. */
  topHeight: number
  /** Round the top band's bottom-left corner, with topRadius (px). */
  roundTop: boolean
  topRadius: number
  /** Taper of the top band, in % (0–90). */
  taper: number
  lineBox: LineBoxStyle
  /** Fillet the sharp corners where consecutive lines' boxes meet, with joinRadius (px). */
  smoothJoins: boolean
  joinRadius: number
  canvasColors: CanvasColors
  /** Show the banner (logo, headline, link) along the frame's top or bottom. */
  banner: boolean
  /** The banner's reveal, in % (100 = all in place): the bar grows up, then its items rise
   *  into place. */
  bannerReveal: number
}

/**
 * A twist node's settings (canvas page): flutes around the trophy, turning as they rise,
 * like fluted and gadrooned silver. They only cut in from the revolved silhouette, so the
 * trophy never grows past its rag.
 */
export interface TwistParams {
  /** How many flutes (lobes) around. */
  flutes: number
  /** How deep the grooves between them cut in, in % of the radius. */
  depth: number
  /** How far the flutes turn from the top to the bottom, in degrees (0 = straight). */
  twist: number
  /** The flutes' section, in %: 0 = smooth waves, 100 = round lobes meeting in crisp
   *  creases (scalloped). */
  sharpness: number
  /** Turns the whole pattern around the axis, in degrees. */
  rotate: number
  /** The band of the height the flutes cover, in % from the top (0) to the bottom (100). */
  from: number
  to: number
  /** How the flutes finish at the band's ends: fading out, or in rounded arches (each
   *  lobe, or groove, closing in a round top, bordered by a channel). */
  ends: TwistEnds
  /** How long the ends are (the fade, or the arches' height), in % of the height. */
  endSize: number
  /** Bends the twist, in %: 0 turns evenly; positive turns slowly at the top and faster
   *  toward the bottom (a swirl tightening downward), negative the other way. */
  curve: number
  /** The flutes' section: raised lobes with grooves between (sharpness = rounder lobes,
   *  crisper creases), or narrow rounded grooves cut into flat ribs (sharpness = narrower). */
  section: TwistSection
}

/**
 * An etch node's settings (canvas page): a strip of fine engraved lines around the trophy,
 * in bundles winding down it, crossing into a lattice. Drawn by the trophy's shader (no
 * geometry), at a fixed line width on the frame.
 */
export interface EtchParams {
  /** The strip, in % of the height from the top (0) to the bottom (100). */
  from: number
  to: number
  /** How the lines run: diagonal (winding down by the slant), vertical (straight down),
   *  horizontal (rings around), zigzag (chevrons) or wave (wavy); cross doubles them up
   *  (diagonal/zigzag/wave: mirrored, crossing; horizontal: plus vertical lines, a grid). */
  layout: EtchLayout
  /** Bundles of lines around the trophy (horizontal: rings of lines across the strip). */
  bundles: number
  /** Lines in each bundle. */
  lines: number
  /** The space between a bundle's lines, in % of a bundle's share of the way around. */
  gap: number
  /** Line thickness, in frame px (the sidebar's "thickness"). */
  width: number
  /** How far the lines wind around over the strip, in degrees (zigzag/wave: how far they
   *  swing). */
  slant: number
  /** Zigzag/wave: how many zigs or waves over the strip. */
  waves: number
  /** Lines both ways, crossing (a lattice); off = one way. */
  cross: boolean
  /** Cut: grooves in the surface, catching the light on one wall and shaded on the other
   *  (they move with the light). Bright / dark: lines inlaid in a light or dark tone. */
  style: EtchStyle
  /** How strongly the lines show, in %: cut, how steep the grooves' walls are. */
  strength: number
  /** Fades the lines in from the strip's top and bottom edges, in % of the strip. */
  fade: number
  /** How deep (or, inlaid, how strong) the lines are at the strip's top and bottom, in %
   *  (eased between): e.g. 100 → 0 for lines that gradually fade out toward the bottom. */
  depthTop: number
  depthBottom: number
}

export type EtchStyle = 'cut' | 'bright' | 'dark'

/**
 * A texture node's settings (canvas page): a rough finish over a strip of the trophy (all of
 * it by default), drawn by the trophy's shader as fine relief that catches the light.
 */
export interface TextureParams {
  /** Rough: cast, uneven noise. Hammered: overlapping dents, like beaten metal. Brushed:
   *  fine streaks running one way (around, at angle 0). */
  style: TextureStyle
  /** The features' size, in frame px (rough: the largest bumps; hammered: the dents;
   *  brushed: the streaks' width). */
  scale: number
  /** How strongly it shows, in % (how steep the relief is). */
  strength: number
  /** Brushed: the streaks' direction on the trophy, in degrees (0 = around, 90 = down). */
  angle: number
  /** Picks another texture of the same kind. */
  seed: number
  /** The strip, in % of the height from the top (0) to the bottom (100). */
  from: number
  to: number
  /** Fades the texture in from the strip's top and bottom edges, in % of the strip. */
  fade: number
  /** Its depth at the strip's top and bottom, in % (eased between). */
  depthTop: number
  depthBottom: number
}

export type TextureStyle = 'rough' | 'hammered' | 'brushed'
export type EtchLayout = 'diagonal' | 'vertical' | 'horizontal' | 'zigzag' | 'wave'

/**
 * A pattern node's settings (canvas page): ornament on a strip of the trophy from an image,
 * either generated in its style by Wave Function Collapse or the image itself, repeated.
 * Drawn by the trophy's shader as relief (or inlay) from a height map.
 */
export interface PatternParams {
  /** The source image: a URL or data URL (the node stores what was loaded). */
  image: string
  /** Repeat the image (cropped to its ornament, turned to run around, black-and-white at the
   *  threshold, folded), generate new ornament from its pieces (WFC), or use the image
   *  itself as is (its brightness the relief), repeated around. */
  mode: PatternMode
  /** The strip, in % of the height from the top (0) to the bottom (100). */
  from: number
  to: number
  /** How many times the ornament repeats around the trophy (at 100% scale). */
  repeats: number
  /** The ornament's size, in % (proportions kept): smaller repeats more around and stacks in
   *  rows across the strip; larger is cropped to the strip, centered. */
  scale: number
  /** Spins the pattern around the trophy (its axis), in degrees: slides it sideways. */
  spin: number
  /** Turns the ornament on the trophy, in degrees (in its rows and repeats, its proportions
   *  kept as the map's). */
  angle: number
  /** How the ornament is laid on: stretched over its strip (from/to), or following the
   *  surface, keeping its proportions everywhere and repeating in rows (smaller where the
   *  trophy narrows): for covering the whole shape without stretching. */
  mapping: PatternMapping
  /** Each motif's size in its place, in % (proportions kept): smaller leaves plain surface
   *  around each one (the same motifs, spaced out); larger crops into them. Unlike `scale`,
   *  it never changes how many there are. */
  shapeScale: number
  /** Generate: the cells across the strip (the image is read at this size, so more is finer
   *  and slower). */
  detail: number
  /** Generate: the cells around, per repeat. */
  length: number
  /** Generate: the neighborhood size learned from the image (2–4): larger keeps bigger
   *  shapes, but needs a richer image. */
  size: number
  /** Generate: also use the image's pieces mirrored, or every rotation and mirror. */
  symmetry: PatternSymmetry
  /** Mirror the map like designed ornament: across the strip's middle line, around (each
   *  repeat a mirrored pair, meeting seamlessly), both, or none. */
  fold: PatternFold
  /** Generate: which of the possible results (change it for another). */
  seed: number
  /** What counts as ornament (brighter than this, %). */
  threshold: number
  /** Swap ornament and ground (for dark ornament on a light image). */
  invert: boolean
  /** Rounds the relief's edges (px of the map). */
  softness: number
  /** Fades the ornament in from the strip's top and bottom edges, in % of the strip's
   *  height, so it sinks into the surface rather than stopping at a line. */
  fade: number
  /** The embossing's depth at the strip's top and at its bottom, in % (eased between): e.g.
   *  100 → 0 for ornament that gradually loses its relief toward the bottom. */
  depthTop: number
  depthBottom: number
  /** Raised relief, cut in, or inlaid bright or dark. */
  style: PatternStyle
  /** How strongly it shows: relief, how tall; inlay, how opaque (%). */
  strength: number
}

export type PatternMode = 'repeat' | 'generate' | 'image'
export type PatternMapping = 'strip' | 'surface'
export type PatternFold = 'none' | 'across' | 'around' | 'both'
export type PatternSymmetry = 'none' | 'mirror' | 'all'
export type PatternStyle = 'raised' | 'cut' | 'bright' | 'dark'

export type TwistEnds = 'fade' | 'round'
export type TwistSection = 'lobes' | 'grooves'

/** Every parameter the timeline can animate: the sidebar's controls, minus the text. */
export type AnimatedParams = Pick<
  Settings,
  'fontSize' | 'lineHeight' | 'columnWidth' | 'material'
> &
  SceneParams

/** A timeline keyframe button's state for one parameter at the playhead: not animated,
 *  animated (no keyframe here), or a keyframe right at the playhead. */
export type KeyframeState = 'static' | 'animated' | 'key'

/** A param's keyframe button: its state at the playhead, and what clicking it does. */
export interface KeyframeControl {
  state: KeyframeState
  onToggle: () => void
}
