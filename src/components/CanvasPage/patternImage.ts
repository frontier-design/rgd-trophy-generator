// Pattern node images in the DOM: a picked file → a stored image, and an image → grayscale
// pixels for pattern/.
import { gray, type Gray } from '../../pattern'

/** Stored images are at most this many px on their long side (they're saved with the canvas,
 *  in the browser's ~5 MB storage: WebP keeps a 2048 px image to a few hundred KB). */
const STORED_SIZE = 2048

/** An image file, scaled down to STORED_SIZE and re-encoded, as a data URL to store. */
export async function imageFileToUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const image = await loadImage(url)
    const scale = Math.min(1, STORED_SIZE / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height)
    // WebP where the browser encodes it (it falls back to PNG elsewhere).
    return canvas.toDataURL('image/webp', 0.92)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** An image (URL or data URL) as grayscale (luma) pixels; transparent counts as black. */
export async function imageToGray(url: string): Promise<Gray> {
  const image = await loadImage(url)
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('No 2D canvas')
  context.drawImage(image, 0, 0)
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
