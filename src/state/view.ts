import type { CanvasColors, LineBoxStyle, SceneParams } from '../types'

/** Boxes padded past each measured line (so neighbors overlap) with rounded corners. */
export const DEFAULT_LINE_BOX_STYLE: LineBoxStyle = { padX: 15, padY: 15, radius: 24 }

/** The canvas's default colors: white background, near-black text. */
export const DEFAULT_CANVAS_COLORS: CanvasColors = { background: '#ffffff', text: '#111111' }

export const DEFAULT_SCENE_PARAMS: SceneParams = {
  revealStyle: 'stack',
  revealOrder: 'bottom',
  revealScatter: 50,
  revealSpacing: 12,
  reveal: 100,
  // The RGD reference: a line every ~0.15 s, each sliding ~0.6 em over ~0.75 s.
  revealStagger: 20,
  revealSlide: 60,
  revealFill: 0,
  mirror: true,
  overshoot: 3,
  topHeight: 0,
  roundTop: false,
  topRadius: 16,
  taper: 0,
  lineBox: DEFAULT_LINE_BOX_STYLE,
  smoothJoins: true,
  joinRadius: 16,
  canvasColors: DEFAULT_CANVAS_COLORS,
  banner: true,
  bannerReveal: 100,
}

/** The banner's text, as in RGD's artwork. */
export const DEFAULT_BANNER_TEXT = {
  headline: 'Call for Entries: November 16th',
  link: 'rgdbrandingawards.com',
}

/** The composition's fixed size in CSS px (16:9, 1080p), and its one margin (padding):
 *  around the trophy and text, between them and the banner, and around the banner's row. The artboard is laid out at this size and scaled to fit the window; video
 *  exports render it at a multiple (4K = 2×). */
export const ARTBOARD = { width: 1920, height: 1080, padding: 60 } as const
