// Pure math for the texture node: its fields in the units the trophy's shader uses
// (trophyMaterial.ts, surfaceTextureAt, which draws it).
import type { TextureParams, TextureStyle } from '../types'
import { modifierRange } from './modifierRange'

/** At most this many texture nodes on one solid (the shader's uniform array size). */
export const MAX_TEXTURES = 4

/** The styles as the shader's codes. */
export const TEXTURE_STYLES: Record<TextureStyle, number> = { rough: 0, hammered: 1, brushed: 2 }

/** Texture features never get smaller than this (frame px). */
const MIN_SCALE = 0.5

/** One texture node in the units the shader uses. */
export interface TextureShape {
  /** TEXTURE_STYLES code. */
  style: number
  /** Feature size, frame px. */
  scale: number
  /** 0…1. */
  strength: number
  /** Brushed: the streaks' direction, radians (0 = around). */
  angle: number
  /** Which texture (0–255): the shader shifts the noise by whole cells per seed. */
  seed: number
  /** The strip, as shares of the height from the top (from ≤ to). */
  from: number
  to: number
  /** Share of the strip each edge fades over (0–0.5). */
  fade: number
  /** Depth at the strip's top and bottom (0–1, eased between). */
  depthTop: number
  depthBottom: number
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

/** A texture node's fields as TextureShape. */
export function textureShape(params: TextureParams): TextureShape {
  return {
    style: TEXTURE_STYLES[params.style] ?? 0,
    scale: Math.max(MIN_SCALE, params.scale),
    strength: clamp(params.strength / 100, 0, 1),
    angle: (params.angle * Math.PI) / 180,
    // Few enough to keep float precision in the shader (shifted by up to a few thousand cells).
    seed: ((Math.round(params.seed) % 256) + 256) % 256,
    ...modifierRange(params.from, params.to),
    fade: clamp(params.fade / 100, 0, 0.5),
    depthTop: clamp(params.depthTop / 100, 0, 1),
    depthBottom: clamp(params.depthBottom / 100, 0, 1),
  }
}
