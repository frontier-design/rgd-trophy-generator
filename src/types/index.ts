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
