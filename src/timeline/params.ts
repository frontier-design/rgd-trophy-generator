// Pure mapping between the app's parameters and the timeline's (Theatre.js) prop values.
// No libraries, so it's easy to unit test; theatre.ts builds the Theatre object from it.
import type {
  AnimatedParams,
  PaletteChoice,
  RevealOrder,
  RevealStyle,
  Shading,
  TextAlign,
} from '../types'

/** Theatre's color value: channels 0–1. */
export interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

/** The palette's color stops as timeline props (top → bottom). A palette uses its first
 *  `customColors.length` of them. */
export const COLOR_KEYS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'] as const
export type ColorKey = (typeof COLOR_KEYS)[number]

/** The timeline's props, grouped like the sidebar's sections. */
export interface TimelineValues {
  /** Leading is line height as a multiple of the size, so animating the size scales line
   *  height with it (like the sidebar's size slider). */
  type: {
    size: number
    leading: number
    reveal: number
    stagger: number
    slide: number
    fill: number
    style: RevealStyle
    order: RevealOrder
    align: TextAlign
    scatter: number
    spacing: number
  }
  shape: { edge: number; mirror: boolean; overshoot: number }
  top: { height: number; roundTop: boolean; radius: number; taper: number }
  lineBoxes: {
    padX: number
    padY: number
    radius: number
    smoothJoins: boolean
    joinRadius: number
  }
  material: {
    shading: Shading
    palette: PaletteChoice
    colors: Record<ColorKey, Rgba>
    banding: number
    offset: number
    scale: number
    tilt: number
    wobble: number
    edgeDepth: number
    edgeHue: number
    ledge: number
    grain: number
    grainSize: number
  }
  lighting: {
    angle: number
    height: number
    ambient: number
    softness: number
    highlight: number
    highlightSize: number
  }
  canvas: { background: Rgba; text: Rgba }
  banner: { show: boolean; reveal: number }
}

/** Every animatable prop, as a dot path into TimelineValues. */
export const PARAM_PATHS = [
  'type.size',
  'type.leading',
  'type.reveal',
  'type.stagger',
  'type.slide',
  'type.fill',
  'type.style',
  'type.order',
  'type.align',
  'type.scatter',
  'type.spacing',
  'shape.edge',
  'shape.mirror',
  'shape.overshoot',
  'top.height',
  'top.roundTop',
  'top.radius',
  'top.taper',
  'lineBoxes.padX',
  'lineBoxes.padY',
  'lineBoxes.radius',
  'lineBoxes.smoothJoins',
  'lineBoxes.joinRadius',
  'material.shading',
  'material.palette',
  ...COLOR_KEYS.map((key) => `material.colors.${key}` as const),
  'material.banding',
  'material.offset',
  'material.scale',
  'material.tilt',
  'material.wobble',
  'material.edgeDepth',
  'material.edgeHue',
  'material.ledge',
  'material.grain',
  'material.grainSize',
  'lighting.angle',
  'lighting.height',
  'lighting.ambient',
  'lighting.softness',
  'lighting.highlight',
  'lighting.highlightSize',
  'canvas.background',
  'canvas.text',
  'banner.show',
  'banner.reveal',
] as const
export type ParamPath = (typeof PARAM_PATHS)[number]

export type TimelineLeaf = number | boolean | string | Rgba

/** `#rrggbb` → Rgba (opaque). */
export function hexToRgba(hex: string): Rgba {
  const n = Number.parseInt(hex.slice(1, 7), 16)
  if (Number.isNaN(n)) return { r: 0, g: 0, b: 0, a: 1 }
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a: 1 }
}

/** Rgba → `#rrggbb` (alpha dropped; the canvas and palettes are opaque). */
export function rgbaToHex({ r, g, b }: Rgba): string {
  const byte = (c: number) =>
    Math.round(Math.min(1, Math.max(0, c)) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${byte(r)}${byte(g)}${byte(b)}`
}

/** The app's parameters as timeline values. */
export function toTimelineValues(p: AnimatedParams): TimelineValues {
  const m = p.material
  const last = m.customColors.length - 1
  const colors = Object.fromEntries(
    COLOR_KEYS.map((key, i) => [key, hexToRgba(m.customColors[Math.min(i, last)] ?? '#888888')]),
  ) as Record<ColorKey, Rgba>
  return {
    type: {
      size: p.fontSize,
      leading: p.lineHeight / p.fontSize,
      reveal: p.reveal,
      stagger: p.revealStagger,
      slide: p.revealSlide,
      fill: p.revealFill,
      style: p.revealStyle,
      order: p.revealOrder,
      align: p.textAlign,
      scatter: p.revealScatter,
      spacing: p.revealSpacing,
    },
    shape: { edge: p.columnWidth, mirror: p.mirror, overshoot: p.overshoot },
    top: {
      height: p.topHeight,
      roundTop: p.roundTop,
      radius: p.topRadius,
      taper: p.taper,
    },
    lineBoxes: {
      padX: p.lineBox.padX,
      padY: p.lineBox.padY,
      radius: p.lineBox.radius,
      smoothJoins: p.smoothJoins,
      joinRadius: p.joinRadius,
    },
    material: {
      shading: m.shading,
      palette: m.palette,
      colors,
      banding: m.banding,
      offset: m.gradientOffset,
      scale: m.gradientScale,
      tilt: m.tilt,
      wobble: m.wobble,
      edgeDepth: m.edgeDepth,
      edgeHue: m.edgeHue,
      ledge: m.ledgeShadow,
      grain: m.grain,
      grainSize: m.grainSize,
    },
    lighting: {
      angle: m.lightAngle,
      height: m.lightHeight,
      ambient: m.ambient,
      softness: m.softness,
      highlight: m.highlight,
      highlightSize: m.highlightSize,
    },
    canvas: {
      background: hexToRgba(p.canvasColors.background),
      text: hexToRgba(p.canvasColors.text),
    },
    banner: { show: p.banner, reveal: p.bannerReveal },
  }
}

/**
 * Timeline values back to the app's parameters. What the timeline doesn't hold comes from
 * `current`: the seed color, and how many palette colors there are (the timeline always
 * holds MAX_STOPS; adding or removing a color is a sidebar edit).
 */
export function fromTimelineValues(v: TimelineValues, current: AnimatedParams): AnimatedParams {
  const count = current.material.customColors.length
  return {
    fontSize: v.type.size,
    lineHeight: v.type.leading * v.type.size,
    reveal: v.type.reveal,
    revealStagger: v.type.stagger,
    revealSlide: v.type.slide,
    revealFill: v.type.fill,
    revealStyle: v.type.style,
    revealOrder: v.type.order,
    textAlign: v.type.align,
    revealScatter: v.type.scatter,
    revealSpacing: v.type.spacing,
    columnWidth: v.shape.edge,
    mirror: v.shape.mirror,
    overshoot: v.shape.overshoot,
    topHeight: v.top.height,
    roundTop: v.top.roundTop,
    topRadius: v.top.radius,
    taper: v.top.taper,
    lineBox: { padX: v.lineBoxes.padX, padY: v.lineBoxes.padY, radius: v.lineBoxes.radius },
    smoothJoins: v.lineBoxes.smoothJoins,
    joinRadius: v.lineBoxes.joinRadius,
    material: {
      ...current.material,
      shading: v.material.shading,
      palette: v.material.palette,
      customColors: COLOR_KEYS.slice(0, count).map((key) => rgbaToHex(v.material.colors[key])),
      banding: v.material.banding,
      gradientOffset: v.material.offset,
      gradientScale: v.material.scale,
      tilt: v.material.tilt,
      wobble: v.material.wobble,
      edgeDepth: v.material.edgeDepth,
      edgeHue: v.material.edgeHue,
      ledgeShadow: v.material.ledge,
      grain: v.material.grain,
      grainSize: v.material.grainSize,
      lightAngle: v.lighting.angle,
      lightHeight: v.lighting.height,
      ambient: v.lighting.ambient,
      softness: v.lighting.softness,
      highlight: v.lighting.highlight,
      highlightSize: v.lighting.highlightSize,
    },
    canvasColors: {
      background: rgbaToHex(v.canvas.background),
      text: rgbaToHex(v.canvas.text),
    },
    banner: v.banner.show,
    bannerReveal: v.banner.reveal,
  }
}

/** The value at `path`. */
export function leafAt(values: TimelineValues, path: ParamPath): TimelineLeaf {
  let node: unknown = values
  for (const key of path.split('.')) node = (node as Record<string, unknown>)[key]
  return node as TimelineLeaf
}

const isRgba = (v: TimelineLeaf): v is Rgba => typeof v === 'object'

function sameLeaf(a: TimelineLeaf, b: TimelineLeaf): boolean {
  if (isRgba(a) && isRgba(b)) {
    return Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b)) < 1e-6
  }
  return a === b
}

/** The props whose values differ between `a` and `b`, with their values in `b`. */
export function changedLeaves(
  a: TimelineValues,
  b: TimelineValues,
): Array<[ParamPath, TimelineLeaf]> {
  return PARAM_PATHS.filter((path) => !sameLeaf(leafAt(a, path), leafAt(b, path))).map((path) => [
    path,
    leafAt(b, path),
  ])
}
