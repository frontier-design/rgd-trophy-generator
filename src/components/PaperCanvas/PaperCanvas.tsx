import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import { gradientRamp, gradientSpan, litFrontRamp, materialStops } from '../../material'
import { createPaperScene, type PaperScene } from '../../shape2d'
import type { LineBox, MaterialSettings, Outline2D, ShapeExtent } from '../../types'
import { observeAnchor, relativePosition } from '../observeAnchor'
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
  /** Receives the scene once created, and null on unmount (for video export). Should be
   *  referentially stable. */
  onScene?: (scene: PaperScene | null) => void
  /** Draw the shape (false while the 3D view covers it: it's still built for its outline). */
  visible?: boolean
}

/**
 * Paper.js canvas filling its positioned container (the artboard), so the shape can
 * extend past the text block (padding, the top band). Drawing is anchored to
 * `anchorRef`'s top-left, so shape coordinates are the text block's. All drawing lives
 * in shape2d/.
 *
 * A fresh <canvas> is created in the effect and removed in cleanup, so StrictMode's
 * mount → unmount → mount gets a clean element and a new PaperScope each time.
 *
 * Layout effects, so the shape (and the outline handed to the 3D view) is redrawn in the
 * same commit as the text, before the browser paints: animated text and shape stay in step.
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
  onScene,
  visible = true,
}: PaperCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<PaperScene | null>(null)
  const originRef = useRef({ x: NaN, y: NaN })

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return

    const canvas = document.createElement('canvas')
    host.appendChild(canvas)
    const scene = createPaperScene(canvas)
    sceneRef.current = scene
    const stopObservingSize = observeSize(host, (w, h) => scene.resize(w, h))
    onScene?.(scene)

    return () => {
      onScene?.(null)
      stopObservingSize()
      scene.dispose()
      sceneRef.current = null
      canvas.remove()
    }
  }, [onScene])

  // A passive effect: the anchor (the text editor, rendered after this canvas) only has its
  // ref attached once the layout effects above have run.
  useEffect(() => {
    const host = hostRef.current
    const anchor = anchorRef.current
    const scene = sceneRef.current
    if (!host || !anchor || !scene) return
    return observeAnchor(anchor, host, (x, y) => scene.setOrigin(x, y))
  }, [anchorRef, onScene])

  // Declared before the drawing effect, so a hidden shape is never painted first.
  useLayoutEffect(() => {
    sceneRef.current?.setVisible(visible)
  }, [visible])

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
  useLayoutEffect(() => {
    const outline = sceneRef.current?.showRag(
      { boxes, edgeX, extent, topCornerRadius, taper, joinRadius, mirror },
      style,
    )
    if (outline) onOutline?.(outline)
  }, [boxes, edgeX, extent, topCornerRadius, taper, joinRadius, mirror, style, onOutline])

  // After every commit, follow the anchor: a layout change (e.g. a bottom banner's padding)
  // can move the text without resizing anything the observers watch.
  useLayoutEffect(() => {
    const host = hostRef.current
    const anchor = anchorRef.current
    const scene = sceneRef.current
    if (!host || !anchor || !scene) return
    const { x, y } = relativePosition(anchor, host)
    if (x === originRef.current.x && y === originRef.current.y) return
    originRef.current = { x, y }
    scene.setOrigin(x, y)
  })

  return <div ref={hostRef} className="paper-canvas" aria-hidden="true" />
}
