import { useEffect, useRef, type RefObject } from 'react'
import { createThreeScene, type Projection, type ThreeScene } from '../../render3d'
import type { MaterialSettings, Outline2D } from '../../types'
import { observeAnchor, relativePosition } from '../observeAnchor'
import { observeSize } from '../observeSize'

interface ThreeCanvasProps {
  outline: Outline2D
  /** x of the revolve axis, in the outline's px coordinates. */
  axisX: number
  /** Element whose top-left corner is the outline's origin (the solid is drawn there). */
  anchorRef: RefObject<HTMLElement | null>
  /** 'orthographic' (default) shows the solid exactly from the front, no perspective. */
  projection?: Projection
  /** The trophy material's look. */
  look: MaterialSettings
  /** Mirrored layout: the sweep starts from both flat halves. */
  mirror: boolean
  /** Play the revolve sweep when mounting (switching from the 2D sketch), rather than
   *  showing the finished solid straight away (initial load). Read once, on mount. */
  animateIn: boolean
}

/**
 * Transparent Three.js canvas filling its positioned container (the artboard) that
 * revolves the outline in place: the solid is pinned to `anchorRef`'s position, so it
 * grows out of the 2D shape. Plays the revolve sweep when it mounts if `animateIn`. All
 * scene logic lives in render3d/.
 *
 * A fresh <canvas> is created per mount: dispose() force-loses the WebGL context, and a
 * canvas whose context was lost cannot be reused by StrictMode's second mount.
 */
export function ThreeCanvas({
  outline,
  axisX,
  anchorRef,
  projection = 'orthographic',
  look,
  mirror,
  animateIn,
}: ThreeCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<ThreeScene | null>(null)
  const animateOnMount = useRef(animateIn)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const canvas = document.createElement('canvas')
    host.appendChild(canvas)
    const scene = createThreeScene(canvas)
    sceneRef.current = scene

    const stopObservingHost = observeSize(host, (w, h) => scene.resize(w, h))
    // Keep the solid on top of the 2D shape when the page lays out, resizes or scrolls.
    const anchor = anchorRef.current
    const stopObservingAnchor = anchor
      ? observeAnchor(anchor, host, (x, y) => scene.setAnchor(x, y))
      : () => {}
    // (The [mirror] effect below runs in this same commit, before the first frame, so a
    // sweep already starts from both halves.)
    if (animateOnMount.current) scene.playRevolve()

    return () => {
      stopObservingAnchor()
      stopObservingHost()
      scene.dispose()
      sceneRef.current = null
      canvas.remove()
    }
  }, [anchorRef])

  // Declared after the mount effect so it runs after the scene exists.
  useEffect(() => {
    const host = hostRef.current
    const scene = sceneRef.current
    if (!host || !scene) return
    scene.setOutline(outline, { axisX })
    const anchor = anchorRef.current
    if (anchor) {
      const { x, y } = relativePosition(anchor, host)
      scene.setAnchor(x, y)
    }
  }, [outline, axisX, anchorRef])

  useEffect(() => {
    sceneRef.current?.setProjection(projection)
  }, [projection])

  useEffect(() => {
    sceneRef.current?.setLook(look)
  }, [look])

  useEffect(() => {
    sceneRef.current?.setMirror(mirror)
  }, [mirror])

  return <div ref={hostRef} className="three-view" aria-label="3D view" data-testid="three-view" />
}
