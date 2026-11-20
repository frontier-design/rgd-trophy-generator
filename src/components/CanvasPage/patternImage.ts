// Pattern node images in the DOM: a picked file → a stored image, and an image → grayscale
// pixels for pattern/.
import { gray, type Gray } from '../../pattern'

/** Imported images keep at most this many px on their long side (the source is stored in
 *  IndexedDB, which holds far more than localStorage: WebP keeps it to a manageable size).
 *  Never upscaled; proportions always kept. */
export const STORED_IMAGE_MAX_SIDE = 5000

/** Pattern maps work below the stored source's resolution (px on the long side): decoding
 *  and building height maps stays bounded, whatever was imported. */
export const PATTERN_WORKING_MAX_SIDE = 2048

/** An image's stored size: scaled down to `maxSide` on its long side (never upscaled),
 *  proportions kept and at least 1 px each way. */
export function fittedSize(
  width: number,
  height: number,
  maxSide = STORED_IMAGE_MAX_SIDE,
): { width: number; height: number } {
  const longest = Math.max(width, height)
  const scale = longest > 0 ? Math.min(1, maxSide / longest) : 1
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/** An image file, scaled down to STORED_IMAGE_MAX_SIDE and re-encoded, as a data URL to store. */
export async function imageFileToUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const image = await loadImage(url)
    const { width, height } = fittedSize(image.naturalWidth, image.naturalHeight)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height)
    // WebP where the browser encodes it (it falls back to PNG elsewhere).
    return canvas.toDataURL('image/webp', 0.92)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * An image (URL or data URL) as grayscale (luma) pixels; transparent counts as black. Decodes
 * at most PATTERN_WORKING_MAX_SIDE on the long side (proportions kept, never upscaled), so a
 * large stored source doesn't cost a full-resolution decode and height-map build.
 */
export async function imageToGray(url: string): Promise<Gray> {
  const image = await loadImage(url)
  const { width, height } = fittedSize(
    image.naturalWidth,
    image.naturalHeight,
    PATTERN_WORKING_MAX_SIDE,
  )
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('No 2D canvas')
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data
  const out = gray(canvas.width, canvas.height)
  for (let i = 0; i < out.data.length; i++) {
    const a = (rgba[4 * i + 3] ?? 255) / 255
    const luma =
      0.299 * (rgba[4 * i] ?? 0) + 0.587 * (rgba[4 * i + 1] ?? 0) + 0.114 * (rgba[4 * i + 2] ?? 0)
    out.data[i] = Math.round(luma * a)
  }
  return out
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("Couldn't load the image"))
    image.src = url
  })
}
