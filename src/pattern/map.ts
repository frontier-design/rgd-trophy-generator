// A pattern node's height map: its image (cropped, turned to run around the trophy) either
// repeated as is or used as the sample for Wave Function Collapse. Pure; runs in a worker.
import type { CropRect, PatternParams } from '../types'
import { isFullCrop } from './crop'
import { autocrop, binarize, blur, contrast, cropRegion, gray, landscape, resize, type Gray } from './grid'
import { wfcOverlapping } from './wfc'

/** What's below this brightness (0–255) is the image's empty margin, cropped off. */
const MARGIN = 24
/** Repeat: the map's height at most (px across the strip). */
const REPEAT_HEIGHT = 512
/** Repeat: the map's widest (px, before folding doubles it; textures stay within limits). */
const REPEAT_MAX_WIDTH = 4096
/** Generate: map px per WFC cell (the cells are smoothed into relief). */
const CELL_PX = 6
/** Generate: neighborhoods past this many make WFC too slow (lower detail or size). */
const MAX_PATTERNS = 600

export type PatternMapParams = Pick<
  PatternParams,
  | 'mode'
  | 'detail'
  | 'length'
  | 'size'
  | 'symmetry'
  | 'fold'
  | 'seed'
  | 'threshold'
  | 'invert'
  | 'softness'
  | 'crop'
>

export interface PatternMapResult {
  /** The height map (255 = ornament, 0 = ground), seamless around; null if it failed. */
  map: Gray | null
  /** Why not, or what was made. */
  message: string
}

const SYMMETRY = { none: 1, mirror: 2, all: 8 } as const

/**
 * Mirror a map like designed ornament: `across` reflects its top half onto its bottom
 * (symmetric about the strip's middle line), `around` follows it with its mirror image (each
 * repeat a symmetric pair, so repeats meet seamlessly), `both` does both.
 */
export function fold(g: Gray, how: PatternParams['fold']): Gray {
  let out = g
  if (how === 'across' || how === 'both') {
    out = gray(g.width, g.height)
    for (let y = 0; y < g.height; y++) {
      const from = y < g.height / 2 ? y : g.height - 1 - y
      out.data.set(g.data.subarray(from * g.width, (from + 1) * g.width), y * g.width)
    }
  }
  if (how === 'around' || how === 'both') {
    const src = out
    out = gray(src.width * 2, src.height)
    for (let y = 0; y < src.height; y++) {
      for (let x = 0; x < src.width; x++) {
        const v = src.data[y * src.width + x] ?? 0
        out.data[y * out.width + x] = v
        out.data[y * out.width + out.width - 1 - x] = v
      }
    }
  }
  return out
}

/** The image prepared for repeat and generate: margins cropped (when the whole image is
 *  selected: a crop the user chose is kept as it is), its long side running around. */
export function prepareSample(image: Gray, { trimMargins = true }: { trimMargins?: boolean } = {}): Gray {
  return landscape(trimMargins ? autocrop(image, MARGIN) : image)
}

/** Image mode: the map's longest side at most this (px; the texture's size). */
const IMAGE_MAX_SIDE = 2048

/**
 * A pattern node's height map from its image. Image: the image itself, as is (its
 * brightness is the height: no cropping, turning, contrast or folding), only scaled to fit
 * a texture, inverted and softened if asked. Repeat: the image prepared (prepareSample),
 * pushed toward black and white at the threshold, folded. Generate: Wave Function Collapse
 * from it.
 */
export function buildPatternMap(image: Gray, params: PatternMapParams): PatternMapResult {
  const threshold = (params.threshold / 100) * 255
  const softness = Math.max(0, params.softness)
  // The selected region feeds the pattern. A user's crop is used exactly: automatic margin
  // trimming only applies when the whole image is selected, so it can't shrink their choice.
  const crop: CropRect | undefined = params.crop
  const source = cropRegion(image, crop)
  if (params.mode === 'image') {
    const fit = Math.min(1, IMAGE_MAX_SIDE / Math.max(source.width, source.height))
    const sized = resize(source, source.width * fit, source.height * fit, true)
    const height = params.invert
      ? gray(
          sized.width,
          sized.height,
          sized.data.map((v) => 255 - v),
        )
      : sized
    const map = blur(height, softness, true)
    return { map, message: `${map.width} × ${map.height}, as is` }
  }
  const sample = prepareSample(source, { trimMargins: isFullCrop(crop) })
  if (params.mode === 'repeat') {
    // As sharp as the image allows (never upscaled), at most REPEAT_HEIGHT across the strip
    // and REPEAT_MAX_WIDTH around (before folding).
    const height = Math.min(
      REPEAT_HEIGHT,
      sample.height,
      Math.round((REPEAT_MAX_WIDTH * sample.height) / sample.width),
    )
    const width = Math.max(1, Math.round((sample.width / sample.height) * height))
    const sized = fold(resize(sample, width, height), params.fold)
    const map = blur(contrast(sized, threshold, 48, params.invert), softness, true)
    return { map, message: `${map.width} × ${map.height}` }
  }
  // Generate: read the image at `detail` cells across, as ornament (1) and ground (0).
  const rows = Math.max(4, Math.round(params.detail))
  const across = Math.max(4, Math.round((sample.width / sample.height) * rows))
  const small = resize(sample, across, rows)
  const cells = binarize(small, threshold, params.invert)
  const result = wfcOverlapping(cells, across, rows, {
    n: Math.min(Math.max(Math.round(params.size), 2), 4),
    symmetry: SYMMETRY[params.symmetry],
    width: Math.max(4, Math.round(params.length)),
    height: rows,
    periodicX: true,
    seed: Math.round(params.seed),
    maxPatterns: MAX_PATTERNS,
  })
  if (!result) {
    return {
      map: null,
      message: "couldn't generate: try another seed, a smaller size or more symmetry",
    }
  }
  const grid = fold(
    gray(
      Math.max(4, Math.round(params.length)),
      rows,
      result.data.map((v) => v * 255),
    ),
    params.fold,
  )
  const map = blur(resize(grid, grid.width * CELL_PX, rows * CELL_PX, true), softness, true)
  return { map, message: `${result.patterns} pieces, seed ${result.seed}` }
}
