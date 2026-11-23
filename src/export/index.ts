// Placeholders for export formats still to come (images and video are real: image.ts, video.ts). No React; each takes the stage's own output.
// `paper.*` types come from the global `paper` namespace declared in paper/dist/paper.d.ts.
import type { Object3D } from 'three'

export class NotImplementedError extends Error {
  constructor(feature: string) {
    super(`${feature} is not implemented yet`)
    this.name = 'NotImplementedError'
  }
}

/** TODO: `scope.project.exportSVG({ asString: true })`. */
export function exportSvg(_scope: paper.PaperScope): string {
  throw new NotImplementedError('SVG export')
}

/** TODO: GLTFExporter from 'three/examples/jsm/exporters/GLTFExporter.js' with `{ binary: true }`. */
export function exportGlb(_root: Object3D): Promise<ArrayBuffer> {
  return Promise.reject(new NotImplementedError('GLB export'))
}

export {
  drawComposition,
  setLetterSpacing,
  trackedX,
  type BannerLayer,
  type Composition,
  type PlacedImage,
  type TextLayer,
} from './composite'
export { IMAGE_SCALES, maxImageScale, renderImage, type ImageFormat } from './image'
export { downloadBlob, exportMp4, type Mp4ExportOptions } from './video'
