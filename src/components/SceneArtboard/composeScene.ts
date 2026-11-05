import { BANNER_LOGO_URL, type BannerLayout } from '../../banner'
import type { Composition, PlacedImage, TextLayer } from '../../export'
import type { BannerText } from '../../hooks/useSceneModel'
import { toCanvasFont } from '../../measure'
import { alignOffsets, type LineReveal } from '../../rag'
import type { ThreeScene } from '../../render3d'
import type { PaperScene } from '../../shape2d'
import type { LineMeasure, SceneParams, Settings } from '../../types'
import { relativePosition } from '../observeAnchor'

let logo: HTMLImageElement | null = null
let logoLoaded = false

/** The banner's logo for drawing into images: loading starts on the first call, and it's
 *  null until it has loaded. */
export function bannerLogo(): HTMLImageElement | null {
  if (!logo) {
    logo = new Image()
    logo.onload = () => {
      logoLoaded = true
    }
    logo.src = BANNER_LOGO_URL
  }
  return logoLoaded ? logo : null
}

/** What a scene's artboard shows right now, for drawing it as one image. */
export interface SceneLayers {
  /** The text editor (the shape's origin) and the artboard it sits in. */
  editor: HTMLElement
  artboard: HTMLElement
  /** The artboard's size (CSS px). */
  frame: { width: number; height: number }
  lines: LineMeasure[]
  reveals: LineReveal[] | null
  prefixWidths: number[][] | null
  baselines: number[]
  settings: Settings
  scene: SceneParams
  /** True = the 3D trophy; false = the 2D sketch. */
  revolve: boolean
  banner: BannerLayout
  bannerText: BannerText
  /** The loaded banner logo (drawn once available). */
  logo: CanvasImageSource | null
  three: ThreeScene | null
  paper: PaperScene | null
  /** Output px per artboard px (the 3D view renders at it). */
  scale: number
  /** Leave the background out (a transparent image). */
  transparent?: boolean
}

/**
 * A scene's artboard as layers, ready for drawComposition (the debug overlay left out): the
 * 3D view (rendered now at `scale`; draw it in the same task, WebGL doesn't keep its buffer)
 * or the 2D shape, the text and its mirror at the same baselines, and the banner. While the
 * text reveals, only what has appeared, where it is.
 */
export function composeScene(l: SceneLayers): Composition {
  const { lines, reveals, prefixWidths, baselines, settings, scene } = l
  // While revealing: only lines that have appeared, at their slide offsets; typed, only
  // the letters that have appeared, each at its place plus the spacing still closing.
  const shown = lines.map((line) => (!reveals || reveals[line.index]?.shown ? line.text : ''))
  const offsets = lines.map((line) => reveals?.[line.index]?.offset ?? 0)
  // Centered, each line starts in from the column's sides (the mirror's too).
  const starts = alignOffsets(lines, settings.columnWidth, scene.textAlign)
  const lineStart = (i: number) => starts[lines[i]?.index ?? i] ?? 0
  const glyphs = lines.map((line) => {
    const letters = reveals?.[line.index]?.letters
    const widths = prefixWidths?.[line.index]
    if (!letters || !widths) return null
    return Array.from(line.text.trimEnd()).flatMap((char, i) =>
      // Where the letter ends: the width of the text up to and including it (kerned).
      letters.shown[i] ? [{ char, x: (widths[i + 1] ?? 0) + (letters.offsets[i] ?? 0) }] : [],
    )
  })
  const extents = lines.map((line) => reveals?.[line.index]?.extent ?? 0)
  const anchor = relativePosition(l.editor, l.artboard)
  const images: PlacedImage[] = []
  if (l.revolve) {
    const canvas = l.three?.snapshot(l.scale)
    if (canvas)
      images.push({ image: canvas, x: 0, y: 0, width: l.frame.width, height: l.frame.height })
  } else {
    const snapshot = l.paper?.snapshot(l.scale)
    if (snapshot) images.push(snapshot)
  }
  const font = toCanvasFont(settings)
  const color = scene.canvasColors.text
  const lineBaselines = baselines.map((y) => anchor.y + y)
  const text: TextLayer[] = [
    {
      lines: shown,
      baselines: lineBaselines,
      x: anchor.x,
      offsets: offsets.map((offset, i) => offset + lineStart(i)),
      glyphs,
      align: 'left',
      font,
      color,
    },
  ]
  // The mirror: right-aligned (or centered) in the column's reflection across the edge.
  if (scene.mirror) {
    text.push({
      lines: shown.map((line) => line.trimEnd()),
      baselines: lineBaselines,
      x: anchor.x + 2 * settings.columnWidth,
      // Typed, the letters end at the column's reflected edge: they start `extent` in.
      offsets: offsets.map(
        (offset, i) => (glyphs[i] ? -(extents[i] ?? 0) : -offset) - lineStart(i),
      ),
      glyphs,
      align: 'right',
      font,
      color,
    })
  }
  return {
    width: l.frame.width,
    height: l.frame.height,
    background: l.transparent ? null : scene.canvasColors.background,
    images,
    text,
    banner: scene.banner
      ? {
          layout: l.banner,
          reveal: scene.bannerReveal / 100,
          stagger: scene.revealStagger / 100,
          ...l.bannerText,
          fontFamily: settings.fontFamily,
          textColor: scene.canvasColors.text,
          // Its bar is the frame's background: transparent too, on a transparent image.
          background: l.transparent ? 'rgba(0, 0, 0, 0)' : scene.canvasColors.background,
          logo: l.logo,
        }
      : undefined,
  }
}
