import type { CanvasColors, LineBoxStyle } from '../types'

/** Boxes padded past each measured line (so neighbors overlap) with rounded corners. */
export const DEFAULT_LINE_BOX_STYLE: LineBoxStyle = { padX: 15, padY: 15, radius: 24 }

/** The canvas's default colors: white background, near-black text. */
export const DEFAULT_CANVAS_COLORS: CanvasColors = { background: '#ffffff', text: '#111111' }
