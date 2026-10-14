import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { gradientRamp, gradientSpan, litFrontRamp, materialStops } from '../../material'
import { createPaperScene, type PaperScene } from '../../shape2d'
import type { LineBox, MaterialSettings, Outline2D, ShapeExtent } from '../../types'
import { observeAnchor } from '../observeAnchor'
import { observeSize } from '../observeSize'

interface PaperCanvasProps {
  /** Element whose top-left corner is the shape's origin (the text block). */
  anchorRef: RefObject<HTMLElement | null>
  /** Line boxes that carve the shape, in the anchor's CSS px coordinates. */
  boxes: LineBox[]
  /** The right edge the shape extends to. */
  edgeX: number
  /** The region the shape fills: text's left side, top band, last baseline. */
  extent: ShapeExtent | null
  /** Rounds the top band's bottom-left corner (the top section's rim); 0 = square. */
  topCornerRadius: number
  /** 0–1: narrows the top band's top (the trophy's top circle). */
  taper: number
  /** Fillet radius for the corners where consecutive lines' boxes meet; 0 = sharp. */
  joinRadius: number
  /** Also draw the shape reflected across the edge. */
  mirror: boolean
  /** The trophy material: the shape is filled with its gradient. */
  look: MaterialSettings
  /** Receives the drawn shape's outline (for the 3D stage). Should be referentially stable. */
  onOutline?: (outline: Outline2D) => void
}

/**
 * Paper.js canvas filling its positioned container (the artboard), so the shape can
 * extend past the text block (padding, the top band). Drawing is anchored to
 * `anchorRef`'s top-left, so shape coordinates are the text block's. All drawing lives
 * in shape2d/.
 *
 * A fresh <canvas> is created in the effect and removed in cleanup, so StrictMode's
 * mount → unmount → mount gets a clean element and a new PaperScope each time.
 */
export function PaperCanvas({
  anchorRef,
  boxes,
  edgeX,
  extent,
  topCornerRadius,
  taper,
  joinRadius,
  mirror,
  look,
  onOutline,
}: PaperCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<PaperScene | null>(null)

  useEffect(() => {
    const host = hostRef.current
    const anchor = anchorRef.current
    if (!host || !anchor) return

    const canvas = document.createElement('canvas')
    host.appendChild(canvas)
    const scene = createPaperScene(canvas)
    sceneRef.current = scene
    const stopObservingSize = observeSize(host, (w, h) => scene.resize(w, h))
    const stopObservingAnchor = observeAnchor(anchor, host, (x, y) => scene.setOrigin(x, y))

    return () => {
      stopObservingAnchor()
      stopObservingSize()
      scene.dispose()
      sceneRef.current = null
      canvas.remove()
    }
  }, [anchorRef])

  // The 3D material's look, flat. Painted: the same height bands the sweep starts from (a
  // seamless handoff). Lit: the front of the lit trophy, from silhouette to silhouette.
  const {
    shading,
    palette,
    customColors,
    gradientOffset,
    gradientScale,
    tilt,
    banding,
    lightAngle,
    lightHeight,
    ambient,
    softness,
    highlight,
    highlightSize,
    edgeDepth,
  } = look
  const style = useMemo(() => {
    const stops = materialStops({ palette, customColors })
    if (shading === 'lit') {
      const lighting = { lightAngle, lightHeight, ambient, softness, highlight, highlightSize }
      return {
        gradient: litFrontRamp(stops, {
          ...lighting,
          edgeDepth,
          gradientOffset,
          gradientScale,
          banding,
        }),
        span: [0, 1] as [number, number],
        tilt: 0,
        across: true,
      }
    }
    return {
      gradient: gradientRamp(stops, { gradientOffset, gradientScale, banding }),
      span: gradientSpan({ gradientOffset, gradientScale }),
      tilt,
    }
  }, [
    shading,
    palette,
    customColors,
    gradientOffset,
    gradientScale,
    tilt,
    banding,
    lightAngle,
    lightHeight,
    ambient,
    softness,
    highlight,
    highlightSize,
    edgeDepth,
  ])

  // Declared after the mount effect so it runs after the scene exists.
  useEffect(() => {
    const outline = sceneRef.current?.showRag(
      { boxes, edgeX, extent, topCornerRadius, taper, joinRadius, mirror },
      style,
    )
    if (outline) onOutline?.(outline)
  }, [boxes, edgeX, extent, topCornerRadius, taper, joinRadius, mirror, style, onOutline])

  return <div ref={hostRef} className="paper-canvas" aria-hidden="true" />
}
