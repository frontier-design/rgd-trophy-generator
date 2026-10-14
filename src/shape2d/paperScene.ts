import paper from 'paper'
import { tiltedGradientLine, type GradientRampStop } from '../material'
import type { LineBox, Outline2D, ShapeExtent } from '../types'
import { ragShapeFromBoxes } from './boxShape'
import { pathToOutline } from './ragPath'

export interface RagStyle {
  /** The trophy material's gradient (material/gradientRamp) over its span, laid along the
   *  tilted band direction, so the 2D shape hands off seamlessly to the 3D sweep. */
  gradient: GradientRampStop[]
  /** Band coordinates the ramp covers (material/gradientSpan). */
  span: [number, number]
  /** Band slope (MaterialSettings.tilt). */
  tilt: number
  /** Lit mode: the gradient runs across the trophy's front instead, from its left
   *  silhouette (text's left side) to its right one (the reflection across the edge), as
   *  material/litFrontRamp lays it out. `span` and `tilt` are then unused. */
  across?: boolean
}

export interface RagShapeInput {
  /** The line boxes that carve the shape. */
  boxes: LineBox[]
  /** The right edge (revolve axis), in the same px coordinates. */
  edgeX: number
  /** The region the shape fills (rag/shapeExtent); null = nothing to draw. */
  extent: ShapeExtent | null
  /** Rounds the top band's bottom-left corner; 0 = square. */
  topCornerRadius: number
  /** 0–1: narrows the top band's top (the trophy's top circle). */
  taper: number
  /** Fillet radius for the corners where consecutive lines' boxes meet; 0 = sharp. */
  joinRadius: number
  /** Also draw the shape reflected across the edge (the full trophy silhouette). */
  mirror: boolean
}

export interface PaperScene {
  /** The dedicated scope for this canvas. Never use Paper's global scope. */
  readonly scope: paper.PaperScope
  /** Draw the rag shape filled with the style's gradient and return its outline. */
  showRag(input: RagShapeInput, style: RagStyle): Outline2D
  /** Resize the view to the canvas's CSS size. */
  resize(width: number, height: number): void
  /** Where the shape's origin (0, 0) is on the canvas, in CSS px. */
  setOrigin(x: number, y: number): void
  /** Remove the scope, its project, view and event handlers. Safe to call twice. */
  dispose(): void
}

/** Create a Paper.js scene bound to `canvas`, using its own PaperScope. */
export function createPaperScene(canvas: HTMLCanvasElement): PaperScene {
  const scope = new paper.PaperScope()
  scope.setup(canvas)
  let disposed = false

  return {
    scope,
    showRag({ boxes, edgeX, extent, topCornerRadius, taper, joinRadius, mirror }, style) {
      scope.activate()
      scope.project.activeLayer.removeChildren()
      const shape = extent
        ? ragShapeFromBoxes(scope, boxes, { edgeX, extent, topCornerRadius, taper, joinRadius })
        : null
      if (!shape) return { contours: [] }
      const gradient = new scope.Gradient()
      gradient.stops = style.gradient.map(
        ({ offset, color }) => new scope.GradientStop(new scope.Color(...color), offset),
      )
      // Painted: bands measured from the shape's top and the revolve axis, like the shader.
      // Lit: across the front, from the left silhouette to the mirrored right one.
      const { top, height } = shape.bounds
      const left = extent?.left ?? 0
      const { from, to } = style.across
        ? { from: { x: left, y: top }, to: { x: 2 * edgeX - left, y: top } }
        : tiltedGradientLine({ top, height }, edgeX, style.tilt, style.span)
      const fill = () => new scope.Color(gradient, [from.x, from.y], [to.x, to.y])
      shape.fillColor = fill()
      scope.project.activeLayer.addChild(shape)
      if (mirror) {
        // The reflection across the edge (the revolve axis): the trophy's other half. The
        // gradient is set again, untransformed, so it stays the same plane as the 3D bands.
        const reflection = shape.clone({ insert: false })
        reflection.scale(-1, 1, new scope.Point(edgeX, 0))
        reflection.fillColor = fill()
        scope.project.activeLayer.addChild(reflection)
      }
      // The 3D stage revolves the original half only.
      return pathToOutline(shape)
    },
    resize(width, height) {
      scope.view.viewSize = new scope.Size(width, height)
    },
    setOrigin(x, y) {
      scope.view.matrix = new scope.Matrix(1, 0, 0, 1, x, y)
      scope.view.requestUpdate()
    },
    dispose() {
      if (disposed) return
      disposed = true
      // PaperScope#remove() clears every project (each removing its view and DOM/window
      // listeners) and tool, then unregisters the scope from PaperScope's internal
      // registry (otherwise every remount leaks a scope). It exists at runtime
      // (paper/dist/paper-core.js) but is missing from paper.d.ts, hence the cast.
      ;(scope as paper.PaperScope & { remove(): void }).remove()
    },
  }
}
