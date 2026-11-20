import { bannerLayout, type BannerPosition } from '../../banner'
import type { BannerText } from '../../hooks'
import { ensureFontLoaded, measureFontMetrics, measureLines, toFontLoadQuery } from '../../measure'
import { fitToFrame } from '../../rag'
import { ARTBOARD, DEFAULT_BANNER_TEXT, DEFAULT_SCENE_PARAMS, DEFAULT_SETTINGS } from '../../state'
import type { AnimatedParams, FontMetrics, SceneParams, Settings } from '../../types'
import type { ShapeParams } from './graph'

/** A new scene's look, RGD's reference layout: the text and its mirror spanning the frame's
 *  margins, the widest line carving `carve` of the radius, the top band up to the top
 *  margin with its corner rounded (`topRadius`, capped by the band's geometry), no banner. */
const CANVAS_LAYOUT = { carve: 0.8, minTop: 120, topRadius: 200 }

/** What laying out a scene needs from its text: measured at the default settings. */
export interface SceneTextMeasure {
  /** The widest line (px). */
  widest: number
  lineCount: number
  metrics: FontMetrics
}

/** Measures the default text, once its font has loaded (never measure before). */
export async function measureDefaultText(): Promise<SceneTextMeasure> {
  const settings = DEFAULT_SETTINGS
  await ensureFontLoaded(toFontLoadQuery(settings), settings.text)
  const lines = measureLines(settings.text, settings, { prepare: { whiteSpace: 'pre-wrap' } })
  return {
    widest: Math.max(0, ...lines.map((line) => line.width)),
    lineCount: lines.length,
    metrics: measureFontMetrics(settings),
  }
}

/** A frame's size (CSS px; the artboard's, and the export's at ×1). */
export interface FrameSize {
  width: number
  height: number
}

/** The frame sizes offered by name. */
export const FRAME_PRESETS: ReadonlyArray<{ label: string; width: number; height: number }> = [
  { label: '16:9 · 1920 × 1080', width: 1920, height: 1080 },
  { label: '1:1 · 1080 × 1080', width: 1080, height: 1080 },
  { label: '4:5 · 1080 × 1350', width: 1080, height: 1350 },
  { label: '9:16 · 1080 × 1920', width: 1080, height: 1920 },
  { label: '4K · 3840 × 2160', width: 3840, height: 2160 },
]

export const DEFAULT_FRAME: FrameSize = { width: ARTBOARD.width, height: ARTBOARD.height }

/**
 * Fit a scene's layout to a frame (rag/fitToFrame): the type sized so the widest line carves
 * CANVAS_LAYOUT.carve of the radius, the mirrored blocks spanning its margins, the top band up
 * to its top margin, the trophy's bottom a margin above its bottom (or above a bottom
 * banner). The line boxes, corners and joins scale with the type, keeping their proportions.
 */
function fitLayout(
  settings: Settings,
  scene: SceneParams,
  measure: SceneTextMeasure,
  frame: FrameSize,
  bannerPosition: BannerPosition = 'bottom',
): { settings: Settings; scene: SceneParams } {
  if (measure.widest <= 0 || measure.lineCount === 0) return { settings, scene }
  const { lineBox, overshoot, joinRadius } = scene
  const bottomClearance =
    scene.banner && bannerPosition === 'bottom'
      ? bannerLayout({
          frameWidth: frame.width,
          frameHeight: frame.height,
          margin: ARTBOARD.padding,
          position: 'bottom',
          headlineWidth: 0,
          linkWidth: 0,
        }).clearance
      : ARTBOARD.padding
  const fit = fitToFrame({
    ...measure,
    fontSize: settings.fontSize,
    leading: settings.lineHeight / settings.fontSize,
    frame: { ...frame, padding: ARTBOARD.padding },
    bottomClearance,
    overshoot,
    padX: lineBox.padX,
    padY: lineBox.padY,
    scalePad: true,
    carve: CANVAS_LAYOUT.carve,
    minTop: CANVAS_LAYOUT.minTop,
  })
  return {
    settings: {
      ...settings,
      fontSize: fit.fontSize,
      lineHeight: fit.lineHeight,
      columnWidth: fit.columnWidth,
    },
    scene: {
      ...scene,
      mirror: true,
      topHeight: fit.topHeight,
      topRadius: scene.topRadius * fit.scale,
      lineBox: {
        padX: lineBox.padX * fit.scale,
        padY: lineBox.padY * fit.scale,
        radius: lineBox.radius * fit.scale,
      },
      joinRadius: joinRadius * fit.scale,
    },
  }
}

/**
 * A new scene's settings and params: the generator's defaults with no banner and a round
 * top, fitted to the frame (fitLayout) when the text's measure is known.
 */
export function canvasSceneDefaults(
  measure?: SceneTextMeasure,
  frame: FrameSize = DEFAULT_FRAME,
): {
  settings: Settings
  scene: SceneParams
} {
  const settings = DEFAULT_SETTINGS
  const scene: SceneParams = { ...DEFAULT_SCENE_PARAMS, banner: false }
  if (!measure) return { settings, scene }
  // The round top's radius is set at the default size and scales with the fit.
  const fitted = fitLayout(
    settings,
    { ...scene, roundTop: true, topRadius: CANVAS_LAYOUT.topRadius },
    measure,
    frame,
  )
  return { ...fitted, scene: { ...fitted.scene, topRadius: CANVAS_LAYOUT.topRadius } }
}

/** A scene in a frame of `frame`'s size, its text and trophy fitted to it (its text measured
 *  now: the font is loaded once scenes are on the canvas). */
export function fitSceneToFrame(node: SceneNode, frame: FrameSize = node.frame): SceneNode {
  const { settings } = node
  const lines = measureLines(settings.text, settings, { prepare: { whiteSpace: 'pre-wrap' } })
  const measure = {
    widest: Math.max(0, ...lines.map((line) => line.width)),
    lineCount: lines.length,
    metrics: measureFontMetrics(settings),
  }
  return {
    ...node,
    frame: { ...frame },
    ...fitLayout(node.settings, node.scene, measure, frame, node.bannerPosition),
  }
}

/** The frame's edges, each with a resize handle when the scene is selected. */
export const FRAME_EDGES = ['top', 'right', 'bottom', 'left'] as const
export type FrameEdge = (typeof FRAME_EDGES)[number]
/** Frame sizes the handles keep to (as the width / height fields). */
const FRAME_LIMITS = { min: 256, max: 8192 }

/** A frame's place and size on the canvas (canvas px). */
export interface FrameRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * The frame after dragging `edge` by (dx, dy) canvas px from `start`: the opposite edge stays
 * put, sizes are whole px within FRAME_LIMITS; `keepRatio` (Shift) scales the other side
 * with it (about the same top-left).
 */
export function resizeFrame(
  start: FrameRect,
  edge: FrameEdge,
  dx: number,
  dy: number,
  keepRatio = false,
): FrameRect {
  const clamp = (v: number) => Math.round(Math.min(Math.max(v, FRAME_LIMITS.min), FRAME_LIMITS.max))
  const horizontal = edge === 'left' || edge === 'right'
  let width = start.width
  let height = start.height
  if (edge === 'right') width = clamp(start.width + dx)
  if (edge === 'left') width = clamp(start.width - dx)
  if (edge === 'bottom') height = clamp(start.height + dy)
  if (edge === 'top') height = clamp(start.height - dy)
  if (keepRatio) {
    const ratio = start.width / start.height
    if (horizontal) height = clamp(width / ratio)
    else width = clamp(height * ratio)
  }
  return {
    x: edge === 'left' ? start.x + start.width - width : start.x,
    y: edge === 'top' ? start.y + start.height - height : start.y,
    width,
    height,
  }
}

/** A scene's still image export options. */
export interface ImageExportOptions {
  format: 'png' | 'jpeg'
  /** Output px per frame px (1–5). */
  scale: number
  /** Leave the background out (PNG only). */
  transparent: boolean
}

export const DEFAULT_IMAGE_EXPORT: ImageExportOptions = {
  format: 'png',
  scale: 2,
  transparent: false,
}

/** A scene placed on the canvas: its own trophy and text, and where it sits. (The banner
 *  fields are the generator's; canvas scenes keep the banner off for now.) */
export interface SceneNode {
  id: string
  /** Shown above it and atop its controls. */
  name: string
  /** Its top-left on the canvas (canvas px). */
  x: number
  y: number
  /** Its frame's size (CSS px; 1920 × 1080 by default). */
  frame: FrameSize
  /** How its image export is set up. */
  imageExport: ImageExportOptions
  settings: Settings
  scene: SceneParams
  bannerPosition: BannerPosition
  bannerText: BannerText
  /** View toggles, as in the generator: 3D (else the 2D sketch), the sweep when going
   *  back to 3D, perspective, the debug overlay. */
  revolve: boolean
  animateRevolve: boolean
  perspective: boolean
  debug: boolean
}

/** A new scene (canvasSceneDefaults; debug overlay off), its top-left at x, y. */
export function createSceneNode(
  id: string,
  name: string,
  x: number,
  y: number,
  measure?: SceneTextMeasure,
): SceneNode {
  return {
    id,
    name,
    x,
    y,
    frame: { ...DEFAULT_FRAME },
    imageExport: { ...DEFAULT_IMAGE_EXPORT },
    ...canvasSceneDefaults(measure),
    bannerPosition: 'bottom',
    bannerText: DEFAULT_BANNER_TEXT,
    revolve: true,
    animateRevolve: false,
    perspective: false,
    debug: false,
  }
}

/** A scene's params, as the control panel edits them. */
/** A scene with a linked shape node's profile in place of its saved fallback (which stays
 *  untouched, so disconnecting the node restores it). */
export function withShape<T extends Pick<SceneNode, 'scene'>>(node: T, shape?: ShapeParams): T {
  if (!shape) return node
  return { ...node, scene: { ...node.scene, ...shape, lineBox: { ...shape.lineBox } } }
}

export function sceneParams({ settings, scene }: SceneNode): AnimatedParams {
  const { fontSize, lineHeight, columnWidth, material } = settings
  return { fontSize, lineHeight, columnWidth, material, ...scene }
}

/** The scene with a control panel edit applied. */
export function withParams(node: SceneNode, patch: Partial<AnimatedParams>): SceneNode {
  const { fontSize, lineHeight, columnWidth, material, ...scene } = {
    ...sceneParams(node),
    ...patch,
  }
  return {
    ...node,
    settings: { ...node.settings, fontSize, lineHeight, columnWidth, material },
    scene,
  }
}
