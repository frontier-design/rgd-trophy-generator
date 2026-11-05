import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { BANNER_FONT_WEIGHT, bannerFontSize, bannerLayout, type BannerLayout } from '../banner'
import type { BannerPosition } from '../banner'
import { relativePosition } from '../components/observeAnchor'
import { measurePrefixWidths, measureTextWidth } from '../measure'
import {
  fillExtent,
  lineBaseline,
  alignOffsets,
  lineBoxes,
  revealedBoxes,
  revealFill,
  shapeExtent,
  stackReveal,
  typeReveal,
  type LineReveal,
} from '../rag'
import { ARTBOARD } from '../state'
import type {
  FontMetrics,
  LineBox,
  LineMeasure,
  SceneParams,
  Settings,
  ShapeExtent,
} from '../types'
import { useRagMeasure } from './useRagMeasure'

/** How far a trophy filled out to the frame reaches past its edges (px), so no antialiased
 *  sliver of background shows along them. */
const FILL_BLEED = 1

/** The banner's headline and link. */
export interface BannerText {
  headline: string
  link: string
}

/** What a scene shows, as the composition's layers need it (SceneArtboard draws it). */
export interface SceneModel {
  lines: LineMeasure[]
  /** Where each line starts in the column (px, by line index): 0, or centered. */
  lineStarts: number[]
  metrics: FontMetrics
  fontReady: boolean
  /** Where the banner's parts go, in artboard px. */
  banner: BannerLayout
  /** How far from the frame's bottom the trophy ends (px). */
  bottomClearance: number
  /** The text block's bottom padding that puts the trophy's bottom there (px). */
  bottomInset: number
  /** While the text reveals: each line's state; null once it's all in. */
  reveals: LineReveal[] | null
  /** Typing: each line's kerned prefix widths (where each letter ends). */
  prefixWidths: number[][] | null
  /** The boxes that carve: only what has appeared, each moved with its line. */
  carvingBoxes: LineBox[]
  /** Where the shape fills, from all the text (shown or not). */
  extent: ShapeExtent | null
  /** The extent, grown out toward the frame's edges by the reveal fill. */
  shapeBounds: ShapeExtent | null
  topCornerRadius: number
  /** Each line's baseline, below the text's top (px). */
  baselines: number[]
}

/** A scene's text editor (the shape's origin) and artboard, as SceneArtboard attaches them. */
export interface SceneRefs {
  editorRef: RefObject<HTMLDivElement | null>
  artboardRef: RefObject<HTMLDivElement | null>
}

/**
 * One scene's composition, from its inputs: measured lines (Pretext) → line boxes, with the
 * text's reveal → the shape's extent (and reveal fill) → the banner's layout, on the frame
 * (1920 × 1080 unless given). Shared by the generator and the canvas page's scenes. `refs` are the
 * elements SceneArtboard draws it in (where the text sits in the frame).
 */
export function useSceneModel(
  settings: Settings,
  scene: SceneParams,
  bannerPosition: BannerPosition,
  bannerText: BannerText,
  { editorRef, artboardRef }: SceneRefs,
  /** The artboard's size (CSS px): the generator's 1920 × 1080, or a canvas scene's own. */
  frame: { width: number; height: number } = ARTBOARD,
): SceneModel {
  const { lines, metrics, fontReady } = useRagMeasure(settings)

  const { fontFamily, fontSize, fontWeight, lineHeight, columnWidth } = settings
  const { lineBox, topHeight, overshoot } = scene
  const { reveal, revealStagger, revealSlide, revealStyle, revealScatter, revealSpacing } = scene
  const { revealOrder } = scene
  // The banner on the frame's margin, its headline spaced evenly between logo and link (so
  // its text is measured, once the font is ready).
  const bannerWidths = useMemo(() => {
    if (!fontReady) return { headline: 0, link: 0 }
    const font = {
      fontFamily,
      fontSize: bannerFontSize(frame.width),
      fontWeight: BANNER_FONT_WEIGHT,
    }
    return {
      headline: measureTextWidth(bannerText.headline, font),
      link: measureTextWidth(bannerText.link, font),
    }
  }, [fontReady, fontFamily, bannerText, frame.width])
  const banner = useMemo(
    () =>
      bannerLayout({
        frameWidth: frame.width,
        frameHeight: frame.height,
        margin: ARTBOARD.padding,
        position: bannerPosition,
        headlineWidth: bannerWidths.headline,
        linkWidth: bannerWidths.link,
      }),
    [bannerPosition, bannerWidths, frame.width, frame.height],
  )
  // How far from the frame's bottom the trophy ends: the margin, or clear of a bottom banner
  // by the margin (so trophy → banner = banner → frame edge).
  const bottomClearance =
    scene.banner && bannerPosition === 'bottom' ? banner.clearance : ARTBOARD.padding
  // Centered, each line starts in from the column's left; its box still starts at the text's
  // left side and reaches to where the line ends.
  const lineStarts = useMemo(
    () => alignOffsets(lines, columnWidth, scene.textAlign),
    [lines, columnWidth, scene.textAlign],
  )
  // The boxes decide the rag shape (shape2d/) and so the revolved solid.
  const boxes = useMemo(
    () => lineBoxes(lines, { lineHeight, ...lineBox, offsets: lineStarts }),
    [lines, lineHeight, lineBox, lineStarts],
  )
  // While the text reveals (reveal < 100%), only what has appeared carves: stacking in, each
  // line moved with its line as it slides into place; typed, each line as far as its
  // letters reach. Typing places letters one by one, so it measures where each one goes.
  const typing = revealStyle === 'type' && reveal < 100
  const prefixWidths = useMemo(
    () =>
      typing && fontReady
        ? lines.map((line) =>
            measurePrefixWidths(line.text.trimEnd(), { fontFamily, fontSize, fontWeight }),
          )
        : null,
    [typing, fontReady, lines, fontFamily, fontSize, fontWeight],
  )
  const reveals = useMemo<LineReveal[] | null>(() => {
    if (reveal >= 100) return null
    const options = { stagger: revealStagger / 100, from: revealOrder }
    if (revealStyle === 'type') {
      if (!prefixWidths) return null
      return typeReveal(
        lines.map((line, i) => ({
          text: line.text.trimEnd(),
          prefixWidths: prefixWidths[i] ?? [0],
        })),
        reveal / 100,
        {
          ...options,
          spacing: (revealSpacing / 100) * fontSize,
          scatter: revealScatter / 100,
        },
      )
    }
    return stackReveal(lines.length, reveal / 100, {
      ...options,
      slide: (revealSlide / 100) * fontSize,
    })
  }, [
    lines,
    reveal,
    revealStyle,
    revealOrder,
    revealStagger,
    revealSlide,
    revealScatter,
    revealSpacing,
    prefixWidths,
    fontSize,
  ])
  // The top band's rounded corner sits on the first line's box, so while the text stacks in
  // it grows in with that line as it slides into place, rather than appearing at full size
  // the moment the line pops in.
  const topCornerRadius =
    (scene.roundTop ? scene.topRadius : 0) * (reveals ? (reveals[0]?.settle ?? 0) : 1)
  const carvingBoxes = useMemo(
    () =>
      reveals
        ? revealedBoxes(lines, reveals, { lineHeight, ...lineBox, offsets: lineStarts })
        : boxes,
    [reveals, lines, lineHeight, lineBox, lineStarts, boxes],
  )
  // Where the shape fills: from the text's left side, top band down to the last baseline.
  // From all the text, shown or not, so the shape's bounds hold still while it stacks in.
  const extent = useMemo(
    () => shapeExtent(boxes, lines, { lineHeight, topHeight, overshoot, metrics }),
    [boxes, lines, lineHeight, topHeight, overshoot, metrics],
  )
  // The text block's top-left in the frame, so the frame's edges are known in the shape's
  // coordinates. Re-read after every commit (a layout change can move the text).
  const [anchor, setAnchor] = useState({ x: 0, y: 0 })
  const anchorRef = useRef(anchor)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- every commit; sets only on a move
  useLayoutEffect(() => {
    const editor = editorRef.current
    const artboard = artboardRef.current
    if (!editor || !artboard) return
    const next = relativePosition(editor, artboard)
    const prev = anchorRef.current
    if (Math.abs(next.x - prev.x) < 0.01 && Math.abs(next.y - prev.y) < 0.01) return
    anchorRef.current = next
    setAnchor(next)
  })
  // With fill on, the uncarved trophy starts out covering the frame and eases back to its
  // extent as the text stacks in; the boxes carve it the same either way.
  const fill = (scene.revealFill / 100) * revealFill(reveal / 100)
  const shapeBounds = useMemo(
    () =>
      extent && fill > 0
        ? fillExtent(
            extent,
            {
              left: -anchor.x - FILL_BLEED,
              top: -anchor.y - FILL_BLEED,
              right: frame.width - anchor.x + FILL_BLEED,
              bottom: frame.height - anchor.y + FILL_BLEED,
            },
            columnWidth,
            fill,
          )
        : extent,
    [extent, fill, anchor, columnWidth, frame.width, frame.height],
  )
  // The text block's bottom padding that puts the trophy's bottom (the last baseline plus
  // the overshoot, not the text box's bottom, which includes the descenders) exactly
  // `bottomClearance` from the frame's bottom, the same margin as the sides.
  const rows = Math.max(1, lines.length + (settings.text.endsWith('\n') ? 1 : 0))
  const bottomInset = extent
    ? Math.max(0, bottomClearance + extent.bottom - rows * lineHeight)
    : bottomClearance
  // Each line's baseline, for the debug guides.
  const baselines = useMemo(
    () => lines.map((line) => lineBaseline(line.index, lineHeight, metrics)),
    [lines, lineHeight, metrics],
  )

  return {
    lines,
    lineStarts,
    metrics,
    fontReady,
    banner,
    bottomClearance,
    bottomInset,
    reveals,
    prefixWidths,
    carvingBoxes,
    extent,
    shapeBounds,
    topCornerRadius,
    baselines,
  }
}
