// Draws one video frame: the artboard's layers composited onto a 2D canvas. No React.
import { bannerReveal, type BannerLayout } from '../banner'

/** An image placed on the artboard, in artboard CSS px. */
export interface PlacedImage {
  image: CanvasImageSource
  x: number
  y: number
  width: number
  height: number
}

/** Lines of text on the artboard: each line at its baseline, from `x`. */
export interface TextLayer {
  lines: string[]
  /** Each line's baseline y, in artboard CSS px. */
  baselines: number[]
  /** Left edge ('left'), or right edge ('right') of every line. */
  x: number
  /** Per-line horizontal offsets from `x` (px), e.g. lines sliding in. */
  offsets?: number[]
  /** Per line, letters drawn one by one instead of the whole line (the type reveal). Each
   *  glyph's `x` is where it ends (the end of its advance) from the line's start, and it's
   *  drawn right-aligned there: the end of the text up to and including it already holds
   *  the kerning with the letter before, so each letter lands exactly where it sits in the
   *  whole, kerned line (its start, the width of the text before it, would miss that
   *  kerning, and the letters would jump when the whole line takes over). Null for a whole
   *  line. */
  glyphs?: Array<Array<{ char: string; x: number }> | null>
  align: 'left' | 'right'
  /** Per line, its letter spacing (CSS px; LineMeasure.tracking), 0 or absent for none. */
  letterSpacing?: number[]
  /** A canvas font string (measure/toCanvasFont). */
  font: string
  color: string
}

/** The banner, drawn over everything else (see components/Banner, which draws the same). */
export interface BannerLayer {
  layout: BannerLayout
  /** 0–1 (banner/bannerReveal), and the text's stagger (0–1) it moves with. */
  reveal: number
  stagger: number
  headline: string
  link: string
  /** A canvas font family name (no quotes). */
  fontFamily: string
  textColor: string
  background: string
  /** The loaded logo; drawn only once available. */
  logo: CanvasImageSource | null
}

/** Everything visible on the artboard, bottom to top: background, images, text, banner. */
export interface Composition {
  /** The artboard's size in CSS px. */
  width: number
  height: number
  /** The frame's color; null leaves it transparent (PNG export). */
  background: string | null
  images: PlacedImage[]
  text: TextLayer[]
  banner?: BannerLayer
}

/** Draw `composition` onto `ctx`, scaled by `scale` (output px per artboard px). */
export function drawComposition(
  ctx: CanvasRenderingContext2D,
  composition: Composition,
  scale: number,
): void {
  const { width, height, background, images, text, banner } = composition
  ctx.save()
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  if (background) {
    ctx.fillStyle = background
    ctx.fillRect(0, 0, width, height)
  } else {
    ctx.clearRect(0, 0, width, height)
  }
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  for (const { image, x, y, width: w, height: h } of images) ctx.drawImage(image, x, y, w, h)
  ctx.textBaseline = 'alphabetic'
  for (const layer of text) {
    ctx.font = layer.font
    ctx.fillStyle = layer.color
    ctx.textAlign = layer.align
    layer.lines.forEach((line, i) => {
      const baseline = layer.baselines[i]
      if (baseline === undefined) return
      const x = layer.x + (layer.offsets?.[i] ?? 0)
      const letters = layer.glyphs?.[i]
      if (letters) {
        // One letter at a time: the spacing is already in where each one ends.
        ctx.textAlign = 'right'
        for (const glyph of letters) ctx.fillText(glyph.char, x + glyph.x, baseline)
        ctx.textAlign = layer.align
      } else {
        const spacing = layer.letterSpacing?.[i] ?? 0
        setLetterSpacing(ctx, spacing)
        ctx.fillText(line, trackedX(x, layer.align, spacing), baseline)
        setLetterSpacing(ctx, 0)
      }
    })
  }
  if (banner) drawBanner(ctx, banner)
  ctx.restore()
}

/** The banner as components/Banner draws it: the bar, then the clipped items. */
function drawBanner(ctx: CanvasRenderingContext2D, banner: BannerLayer): void {
  const { layout, headline, link } = banner
  const { bar, logo } = layout
  const state = bannerReveal(banner.reveal, layout, banner.stagger)
  const shown = bar.height * state.background
  ctx.fillStyle = banner.background
  ctx.fillRect(bar.x, bar.y + bar.height - shown, bar.width, shown)

  ctx.save()
  ctx.beginPath()
  ctx.rect(bar.x, bar.y, bar.width, bar.height)
  ctx.clip()
  const [logoOffset, headlineOffset, linkOffset] = state.offsets
  if (banner.logo) {
    ctx.drawImage(banner.logo, logo.x, logo.y + logoOffset, logo.width, logo.height)
  }
  ctx.font = `${layout.fontWeight} ${layout.fontSize}px "${banner.fontFamily}"`
  ctx.fillStyle = banner.textColor
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.fillText(headline, layout.headline.x, layout.headline.baseline + headlineOffset)
  ctx.textAlign = 'right'
  ctx.fillText(link, layout.link.right, layout.link.baseline + linkOffset)
  ctx.restore()
}

/** Sets the canvas's letter spacing (CSS px), where the browser supports it. */
export function setLetterSpacing(ctx: CanvasRenderingContext2D, spacing: number): void {
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`
}

/** Where to draw a tracked line so its ink sits where it was measured: the canvas (like CSS)
 *  adds the spacing after the last letter too, which pushes right- or center-aligned text
 *  left (by all or half of it); the measured width leaves it out. */
export function trackedX(x: number, align: CanvasTextAlign, spacing: number): number {
  if (!spacing) return x
  if (align === 'right' || align === 'end') return x + spacing
  if (align === 'center') return x + spacing / 2
  return x
}
