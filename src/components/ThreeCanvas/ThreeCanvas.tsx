import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import {
  createThreeScene,
  type Projection,
  type SolidPattern,
  type ThreeScene,
} from '../../render3d'
import type { EtchParams, MaterialSettings, Outline2D, TwistParams } from '../../types'
import { observeAnchor, relativePosition } from '../observeAnchor'
import { observeSize } from '../observeSize'

const NO_TWISTS: readonly TwistParams[] = []
const NO_ETCHES: readonly EtchParams[] = []
const NO_PATTERNS: readonly SolidPattern[] = []

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
  /** Drawing-buffer px per CSS px (device ratio × the artboard's display scale). */
  pixelRatio: number
  /** Twist nodes shaping the solid (canvas page); none by default. */
  twists?: readonly TwistParams[]
  /** Etch nodes' engraved strips (canvas page); none by default. */
  etches?: readonly EtchParams[]
  /** Pattern nodes' ornament (canvas page): height maps and placement; none by default. */
  patterns?: readonly SolidPattern[]
  /** Receives the scene once created, and null on unmount (for video export). Should be
   *  referentially stable. */
  onScene?: (scene: ThreeScene | null) => void
}

/**
 * Transparent Three.js canvas filling its positioned container (the artboard) that
 * revolves the outline in place: the solid is pinned to `anchorRef`'s position, so it
 * grows out of the 2D shape. Plays the revolve sweep when it mounts if `animateIn`. All
 * scene logic lives in render3d/.
 *
 * A fresh <canvas> is created per mount: dispose() force-loses the WebGL context, and a
 * canvas whose context was lost cannot be reused by StrictMode's second mount.
 *
 * Layout effects throughout, so the solid updates and renders in the same commit as the
 * text, before the browser paints: animated text and solid stay in step.
 */
export function ThreeCanvas({
  outline,
  axisX,
  anchorRef,
  projection = 'orthographic',
  look,
  mirror,
  animateIn,
  pixelRatio,
  twists = NO_TWISTS,
  etches = NO_ETCHES,
  patterns = NO_PATTERNS,
  onScene,
}: ThreeCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<ThreeScene | null>(null)
  const animateOnMount = useRef(animateIn)

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return

    const canvas = document.createElement('canvas')
    host.appendChild(canvas)
    const scene = createThreeScene(canvas)
    sceneRef.current = scene

    const stopObservingHost = observeSize(host, (w, h) => scene.resize(w, h))
    // (The [mirror] effect below runs in this same commit, before the first frame, so a
    // sweep already starts from both halves.)
    if (animateOnMount.current) scene.playRevolve()
    onScene?.(scene)

    return () => {
      onScene?.(null)
      stopObservingHost()
      scene.dispose()
      sceneRef.current = null
      canvas.remove()
    }
  }, [onScene])

  // Keep the solid on top of the 2D shape when the page lays out, resizes or scrolls. A
  // passive effect: the anchor (the text editor, rendered after this canvas) only has its
  // ref attached once the layout effects above have run.
  useEffect(() => {
    const host = hostRef.current
    const anchor = anchorRef.current
    const scene = sceneRef.current
    if (!host || !anchor || !scene) return
    return observeAnchor(anchor, host, (x, y) => scene.setAnchor(x, y))
  }, [anchorRef, onScene])

  // Declared after the mount effect so it runs after the scene exists.
  useLayoutEffect(() => {
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

  useLayoutEffect(() => {
    sceneRef.current?.setProjection(projection)
  }, [projection])

  useLayoutEffect(() => {
    sceneRef.current?.setLook(look)
  }, [look])

  useLayoutEffect(() => {
    sceneRef.current?.setMirror(mirror)
  }, [mirror])

  useLayoutEffect(() => {
    sceneRef.current?.setPixelRatio(pixelRatio)
  }, [pixelRatio])

  // (The scene skips twists equal to the last ones, so a new array each render is cheap.)
  useLayoutEffect(() => {
    sceneRef.current?.setTwists(twists)
  }, [twists])

  useLayoutEffect(() => {
    sceneRef.current?.setEtches(etches)
  }, [etches])

  useLayoutEffect(() => {
    sceneRef.current?.setPatterns(patterns)
  }, [patterns])

  // Last: render this commit's updates now, before the browser paints, so the solid shows
  // in the same frame as the text (otherwise it'd only be drawn on the next animation frame). The
  // anchor is re-read first: a layout change (e.g. a bottom banner's padding) can move the
  // text without resizing anything the observers watch.
  useLayoutEffect(() => {
    const host = hostRef.current
    const anchor = anchorRef.current
    const scene = sceneRef.current
    if (!scene) return
    if (host && anchor) {
      const { x, y } = relativePosition(anchor, host)
      scene.setAnchor(x, y)
    }
    scene.render()
  })

  return <div ref={hostRef} className="three-view" aria-label="3D view" data-testid="three-view" />
}
