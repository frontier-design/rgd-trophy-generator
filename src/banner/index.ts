// The banner (logo, headline, link): layout and reveal. Pure math only: no
// library imports (enforced by ESLint), so it's shared by the DOM banner and video export.
import { staggered } from '../rag'

/** Sizes from the reference (RGD's banner artwork, 2000 px wide), in its own px. */
const REFERENCE = {
  width: 2000,
  /** RGD_Logo.svg (120.67 × 40.66). */
  logo: { height: 43, aspect: 120.67 / 40.66 },
  /** PP Mori Medium: 40 px caps at 0.712 em. */
  fontSize: 56,
  fontWeight: 500,
  /** The baseline sits this far above the logo's bottom (in the artwork, 73 vs 77). */
  baselineAboveLogoBottom: 4,
}

export const BANNER_LOGO_URL = '/images/RGD_Logo.svg'
export const BANNER_FONT_WEIGHT = REFERENCE.fontWeight

export type BannerPosition = 'top' | 'bottom'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** The banner in frame px. y is from the frame's top. */
export interface BannerLayout {
  /** The bar: its background and the area its items rise in (the row and the margin either
   *  side of it, out to the frame's edge). */
  bar: Rect
  logo: Rect
  fontSize: number
  fontWeight: number
  headline: { x: number; baseline: number }
  link: { right: number; baseline: number }
  /** How much of the frame (from its banner edge) the banner takes, including the margin
   *  that keeps the composition clear of it: the trophy should end this far from the edge. */
  clearance: number
}

/** The banner's type size for a frame `frameWidth` wide (to measure its text with). */
export function bannerFontSize(frameWidth: number): number {
  return REFERENCE.fontSize * (frameWidth / REFERENCE.width)
}

export interface BannerLayoutOptions {
  frameWidth: number
  frameHeight: number
  /** The frame's margin: the row sits this far from the frame's edge, the link this far in
   *  from the right, and the composition this far from the row. */
  margin: number
  position: BannerPosition
  /** The headline's and link's measured widths at bannerFontSize (px). */
  headlineWidth: number
  linkWidth: number
}

/**
 * The banner as in RGD's artwork, on the frame's margin: one row (logo, headline, link)
 * `margin` from the frame's bottom (or top), the logo's black block flush with the frame's
 * left edge, the link ending `margin` in from the right, and the headline between them with
 * equal gaps either side. The composition keeps `margin` clear of the row, so
 * composition → row = row → frame edge. Sizes scale with the frame from the artwork.
 */
export function bannerLayout({
  frameWidth,
  frameHeight,
  margin,
  position,
  headlineWidth,
  linkWidth,
}: BannerLayoutOptions): BannerLayout {
  const k = frameWidth / REFERENCE.width
  const logoHeight = REFERENCE.logo.height * k
  const logoWidth = logoHeight * REFERENCE.logo.aspect
  // The row spans the logo (whose top lines up with the caps).
  const rowTop = position === 'bottom' ? frameHeight - margin - logoHeight : margin
  const rowBottom = rowTop + logoHeight
  const linkRight = frameWidth - margin
  // The headline sits between the logo and the link with equal gaps.
  const gap = Math.max(0, (linkRight - logoWidth - headlineWidth - linkWidth) / 2)
  const clearance = 2 * margin + logoHeight
  const baseline = rowBottom - REFERENCE.baselineAboveLogoBottom * k
  return {
    bar: {
      x: 0,
      y: position === 'bottom' ? frameHeight - clearance : 0,
      width: frameWidth,
      height: clearance,
    },
    logo: { x: 0, y: rowTop, width: logoWidth, height: logoHeight },
    fontSize: REFERENCE.fontSize * k,
    fontWeight: REFERENCE.fontWeight,
    headline: { x: logoWidth + gap, baseline },
    link: { right: linkRight, baseline },
    clearance,
  }
}

/** The banner's state partway through its reveal. */
export interface BannerRevealState {
  /** The background's revealed share, growing up from the bar's bottom (0–1). */
  background: number
  /** How far below its place each item still is (px): logo, headline, link. They rise
   *  from the bar's bottom, clipped to the bar, so they emerge from it. */
  offsets: [number, number, number]
}

/**
 * The banner's reveal at `progress` (0–1), with the text's timing and easing (rag/staggered):
 * the logo, headline and link appear left to right, `stagger` of a slide apart, each rising
 * into place from the bar's bottom (clipped to it) and settling with the same ease-out as
 * the text's lines. The bar grows in with the first. At 0 nothing shows; at 1 it's all in
 * place.
 */
export function bannerReveal(
  progress: number,
  layout: BannerLayout,
  stagger: number,
): BannerRevealState {
  const barBottom = layout.bar.y + layout.bar.height
  // Far enough to start fully below the bar: from the item's top down to the bar's bottom.
  const depths = [
    barBottom - layout.logo.y,
    barBottom - (layout.headline.baseline - layout.fontSize),
    barBottom - (layout.link.baseline - layout.fontSize),
  ]
  const items = staggered(3, progress, stagger)
  const offsets = items.map(({ settle }, i) =>
    settle >= 1 ? 0 : (depths[i] ?? 0) * (1 - settle),
  ) as [number, number, number]
  return { background: items[0]?.settle ?? 0, offsets }
}

/** The banner's reveal length in units of one item's settle time (to time keyframes). */
export function bannerRevealUnits(stagger: number): number {
  return 2 * Math.max(0, stagger) + 1
}
