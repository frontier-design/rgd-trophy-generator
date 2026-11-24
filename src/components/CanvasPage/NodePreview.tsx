import { useLayoutEffect, useRef } from 'react'
import { ditherTone } from './dither'
import type { Gray } from '../../pattern'
import { etchPreview } from '../../render3d/etch'
import { twistPreview } from '../../render3d/twist'
import type { EtchParams, TwistParams } from '../../types'

/** The preview's size (CSS px, one dither dot each): half the card's width, the header's
 *  full height (less its rule), full bleed at its right end. */
const SIZE = { width: 130, height: 33 }

/**
 * A node's preview, at its card header's right end: `coverage` (0…1 a pixel)
 * dithered to black dots, one per CSS px, drawn crisp (`image-rendering: pixelated`).
 * Redrawn only when `input` changes; `coverage` must be a module-level function.
 */
function Preview<T>({
  input,
  coverage,
}: {
  input: T
  coverage: (input: T, width: number, height: number) => Float32Array | null
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useLayoutEffect(() => {
    const element = canvas.current
    const context = element?.getContext('2d')
    if (!element || !context) return
    const { width, height } = SIZE
    element.width = width
    element.height = height
    const values = coverage(input, width, height)
    if (!values) return
    const dots = ditherTone(values, width)
    const image = context.createImageData(width, height)
    for (let i = 0; i < dots.length; i++) {
      image.data[i * 4] = 17
      image.data[i * 4 + 1] = 17
      image.data[i * 4 + 2] = 17
      image.data[i * 4 + 3] = dots[i]! ? 255 : 0
    }
    context.putImageData(image, 0, 0)
  }, [input, coverage])
  return <canvas ref={canvas} className="node-preview" aria-hidden="true" />
}

/** A twist's flutes: its band unrolled (`twistPreview`), darker where they cut. */
export function TwistPreview({ params }: { params: TwistParams }) {
  return <Preview input={params} coverage={twistSquare} />
}

/** Six flutes across, so each reads at its size. */
const twistSquare = (params: TwistParams, width: number, height: number) =>
  twistPreview(params, width, height, 6)

/** An etch's lines: its strip unrolled (`etchPreview`). */
export function EtchPreview({ params }: { params: EtchParams }) {
  return <Preview input={params} coverage={etchPreview} />
}

/** A pattern's height map as it is (ornament light on dark), at the preview's height and
 *  repeated along it, as it repeats around the trophy. Empty until the map is made. */
export function PatternPreview({ map }: { map: Gray | null }) {
  return <Preview input={map} coverage={patternCoverage} />
}

function patternCoverage(map: Gray | null, width: number, height: number): Float32Array | null {
  if (!map || map.width <= 0 || map.height <= 0) return null
  const tile = Math.max(1, Math.round((map.width * height) / map.height))
  const out = new Float32Array(width * height)
  for (let y = 0; y < height; y++) {
    const my = Math.min(map.height - 1, Math.floor(((y + 0.5) / height) * map.height))
    for (let x = 0; x < width; x++) {
      const mx = Math.min(map.width - 1, Math.floor((((x % tile) + 0.5) / tile) * map.width))
      out[y * width + x] = 1 - (map.data[my * map.width + mx] ?? 0) / 255
    }
  }
  return out
}
