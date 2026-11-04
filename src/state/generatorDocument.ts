import type { BannerPosition } from '../banner'
import { readSaved } from './persist'
import { DEFAULT_SETTINGS } from './settings'
import { DEFAULT_BANNER_TEXT } from './view'

/**
 * The generator's own state, as autosaved and put in project files: what the timeline
 * doesn't hold (its params and keyframes are saved by Theatre itself).
 */
export interface GeneratorDocument {
  version: 1
  text: string
  bannerPosition: BannerPosition
  bannerText: { headline: string; link: string }
  /** View toggles: the debug overlay, 3D (else the 2D sketch), perspective. */
  debug: boolean
  revolve: boolean
  perspective: boolean
  /** Export frame rate, and whether playback loops. */
  fps: number
  loop: boolean
  /** Still image export: format, scale (1–5), transparent background (PNG). */
  imageFormat: 'png' | 'jpeg'
  imageScale: number
  imageTransparent: boolean
}

export const DEFAULT_GENERATOR: GeneratorDocument = {
  version: 1,
  text: DEFAULT_SETTINGS.text,
  bannerPosition: 'bottom',
  bannerText: DEFAULT_BANNER_TEXT,
  debug: true,
  revolve: true,
  perspective: false,
  fps: 30,
  loop: true,
  imageFormat: 'png',
  imageScale: 2,
  imageTransparent: false,
}

/** A saved generator, checked and filled in with defaults. */
export function parseGeneratorDocument(value: unknown): GeneratorDocument {
  if (typeof value !== 'object' || value === null) return DEFAULT_GENERATOR
  const v = value as Partial<Record<keyof GeneratorDocument, unknown>>
  const bool = (key: 'debug' | 'revolve' | 'perspective' | 'loop' | 'imageTransparent') =>
    typeof v[key] === 'boolean' ? (v[key] as boolean) : DEFAULT_GENERATOR[key]
  const banner = (typeof v.bannerText === 'object' && v.bannerText) || {}
  const { headline, link } = banner as Partial<GeneratorDocument['bannerText']>
  return {
    version: 1,
    text: typeof v.text === 'string' ? v.text : DEFAULT_GENERATOR.text,
    bannerPosition: v.bannerPosition === 'top' ? 'top' : 'bottom',
    bannerText: {
      headline: typeof headline === 'string' ? headline : DEFAULT_BANNER_TEXT.headline,
      link: typeof link === 'string' ? link : DEFAULT_BANNER_TEXT.link,
    },
    debug: bool('debug'),
    revolve: bool('revolve'),
    perspective: bool('perspective'),
    fps: v.fps === 24 || v.fps === 30 || v.fps === 60 ? v.fps : DEFAULT_GENERATOR.fps,
    loop: bool('loop'),
    imageFormat: v.imageFormat === 'jpeg' ? 'jpeg' : 'png',
    imageScale:
      typeof v.imageScale === 'number' && v.imageScale >= 1 && v.imageScale <= 5
        ? Math.round(v.imageScale)
        : DEFAULT_GENERATOR.imageScale,
    imageTransparent: bool('imageTransparent'),
  }
}

/** The autosaved generator (defaults if none). */
export function loadGeneratorDocument(): GeneratorDocument {
  return parseGeneratorDocument(readSaved('generator'))
}
