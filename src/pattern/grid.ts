// Grayscale grids for the pattern node: cropping, orienting, resizing, contrast and blur, on
// plain arrays (no DOM, no libraries), so pattern maps can be built in a worker and tested.

/** A grayscale image: `width × height` values 0–255, row by row. */
export interface Gray {
  data: Uint8Array
  width: number
  height: number
}

export function gray(width: number, height: number, data = new Uint8Array(width * height)): Gray {
  return { data, width, height }
}

/** The part of `g` holding anything brighter than `threshold` (the ornament without its empty
 *  margins); `g` itself if it's all dark. */
export function autocrop(g: Gray, threshold: number): Gray {
  let left = g.width
  let right = -1
  let top = g.height
  let bottom = -1
  for (let y = 0; y < g.height; y++) {
    for (let x = 0; x < g.width; x++) {
      if ((g.data[y * g.width + x] ?? 0) > threshold) {
        left = Math.min(left, x)
        right = Math.max(right, x)
        top = Math.min(top, y)
        bottom = Math.max(bottom, y)
      }
    }
  }
  if (right < left || bottom < top) return g
  const out = gray(right - left + 1, bottom - top + 1)
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      out.data[y * out.width + x] = g.data[(y + top) * g.width + x + left] ?? 0
    }
  }
  return out
}

/** `g` turned a quarter turn if it's taller than wide, so its long side runs around the
 *  trophy (a vertical border becomes a band). */
export function landscape(g: Gray): Gray {
  if (g.height <= g.width) return g
  // A quarter turn counterclockwise: (x, y) → (y, width − 1 − x).
  const out = gray(g.height, g.width)
  for (let y = 0; y < g.height; y++) {
    for (let x = 0; x < g.width; x++) {
      out.data[(g.width - 1 - x) * out.width + y] = g.data[y * g.width + x] ?? 0
    }
  }
  return out
}

/** `g` resampled to `width × height`: each output pixel averages the input pixels under it
 *  (downscaling), or interpolates between them (upscaling); `wrapX` treats it as repeating
 *  across, so a seamless band stays seamless. */
export function resize(g: Gray, width: number, height: number, wrapX = false): Gray {
  const out = gray(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)))
  const sx = g.width / out.width
  const sy = g.height / out.height
  const at = (x: number, y: number) => {
    const xi = wrapX ? ((x % g.width) + g.width) % g.width : Math.min(Math.max(x, 0), g.width - 1)
    const yi = Math.min(Math.max(y, 0), g.height - 1)
    return g.data[yi * g.width + xi] ?? 0
  }
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      let value: number
      if (sx >= 1 && sy >= 1) {
        // Box average of the footprint.
        const x0 = Math.floor(x * sx)
        const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx))
        const y0 = Math.floor(y * sy)
        const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy))
        let sum = 0
        for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) sum += at(xx, yy)
        value = sum / ((x1 - x0) * (y1 - y0))
      } else {
        // Bilinear, pixel centers aligned.
        const fx = (x + 0.5) * sx - 0.5
        const fy = (y + 0.5) * sy - 0.5
        const ix = Math.floor(fx)
        const iy = Math.floor(fy)
        const tx = fx - ix
        const ty = fy - iy
        const top = at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx
        const bottom = at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx
        value = top * (1 - ty) + bottom * ty
      }
      out.data[y * out.width + x] = Math.round(value)
    }
  }
  return out
}

/** Push `g` toward black and white around `threshold` (0–255), `soft` wide (0–255): the
 *  ornament full height, the ground flat. `invert` swaps them. */
export function contrast(g: Gray, threshold: number, soft: number, invert: boolean): Gray {
  const out = gray(g.width, g.height)
  const half = Math.max(soft / 2, 0.5)
  for (let i = 0; i < g.data.length; i++) {
    const t = Math.min(Math.max(((g.data[i] ?? 0) - threshold + half) / (2 * half), 0), 1)
    const v = t * t * (3 - 2 * t)
    out.data[i] = Math.round((invert ? 1 - v : v) * 255)
  }
  return out
}

/** 1 where `g` is brighter than `threshold`, else 0 (`invert` swaps them). */
export function binarize(g: Gray, threshold: number, invert: boolean): Uint8Array {
  const out = new Uint8Array(g.data.length)
  for (let i = 0; i < g.data.length; i++) out[i] = (g.data[i] ?? 0) > threshold !== invert ? 1 : 0
  return out
}

/** A soft blur (three box passes ≈ Gaussian) of `radius` px; `wrapX` repeats across. */
export function blur(g: Gray, radius: number, wrapX = false): Gray {
  const r = Math.floor(radius)
  if (r < 1) return g
  let data = Float32Array.from(g.data)
  const { width, height } = g
  const pass = (src: Float32Array, horizontal: boolean) => {
    const dst = new Float32Array(src.length)
    const length = horizontal ? width : height
    const lines = horizontal ? height : width
    for (let line = 0; line < lines; line++) {
      const index = (k: number) => {
        const i =
          horizontal && wrapX ? ((k % width) + width) % width : Math.min(Math.max(k, 0), length - 1)
        return horizontal ? line * width + i : i * width + line
      }
      let sum = 0
      for (let k = -r; k <= r; k++) sum += src[index(k)] ?? 0
      for (let k = 0; k < length; k++) {
        dst[index(k)] = sum / (2 * r + 1)
        sum += (src[index(k + r + 1)] ?? 0) - (src[index(k - r)] ?? 0)
      }
    }
    return dst
  }
  for (let i = 0; i < 3; i++) data = pass(pass(data, true), false)
  return gray(
    width,
    height,
    Uint8Array.from(data, (v) => Math.round(v)),
  )
}
