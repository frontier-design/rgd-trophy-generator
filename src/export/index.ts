// Placeholders for export formats. No React; each takes the stage's own output.
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

/** TODO: `canvas.toBlob(...)` wrapped in a Promise. For WebGL, render right before reading. */
export function exportPng(_canvas: HTMLCanvasElement): Promise<Blob> {
  return Promise.reject(new NotImplementedError('PNG export'))
}

/** TODO: GLTFExporter from 'three/examples/jsm/exporters/GLTFExporter.js' with `{ binary: true }`. */
export function exportGlb(_root: Object3D): Promise<ArrayBuffer> {
  return Promise.reject(new NotImplementedError('GLB export'))
}
