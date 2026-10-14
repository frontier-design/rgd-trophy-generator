import {
  BufferAttribute,
  BufferGeometry,
  Group,
  LatheGeometry,
  MathUtils,
  Mesh,
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  Shape,
  ShapeGeometry,
  WebGLRenderer,
  type Vector2,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { ledgeOcclusion } from '../material'
import type { MaterialSettings, Outline2D } from '../types'
import { disposeObject3D } from './dispose'
import { outlineToLatheProfiles, subdivideProfile, withCrispCorners } from './revolve'
import { createTrophyMaterial } from './trophyMaterial'

export interface RevolveSettings {
  /** x of the vertical axis to revolve around, in the outline's px coordinates. */
  axisX: number
}

/** 'orthographic' shows the solid exactly from the front, with no perspective. */
export type Projection = 'orthographic' | 'perspective'

export interface ThreeScene {
  /** Revolve `outline` around `axisX`. Updates live; doesn't restart the sweep. */
  setOutline(outline: Outline2D, revolve: RevolveSettings): void
  /**
   * Where the outline's origin (its 0,0) is on the canvas, in CSS px. The solid is drawn
   * so that its z = 0 plane lines up pixel for pixel with the 2D outline there.
   */
  setAnchor(left: number, top: number): void
  /** Apply the trophy material's look (palette, gradient, shading). */
  setLook(look: MaterialSettings): void
  /** Switch camera projection. Resets to the front view. */
  setProjection(projection: Projection): void
  /** Reset to the front view and animate the sweep from the flat shape to the solid. */
  playRevolve(durationMs?: number): void
  /** Mirrored layout: the sweep starts from both flat halves (the 2D shape and its mirror)
   *  and sweeps them together, so switching from the 2D sketch stays seamless. */
  setMirror(mirror: boolean): void
  /** Resize renderer and camera to the canvas's CSS size. */
  resize(width: number, height: number): void
  /** Stop the loop and dispose controls, geometries, materials and the renderer. */
  dispose(): void
}

/** Steps around the axis: about one per RADIAL_STEP px of the widest rim, within limits,
 *  so wide trophies stay smooth at the silhouette and small ones stay cheap. */
const RADIAL_STEP = 6
const SEGMENT_LIMITS = { min: 96, max: 384 }
const FULL_TURN = Math.PI * 2
/** Start angle where the profile lies in the screen plane, left of the axis: exactly where
 *  the 2D shape is drawn. LatheGeometry places a point at (r·sin φ, y, r·cos φ). */
const PHI_START = -Math.PI / 2
/** Perspective field of view: enough to read as 3D without much distortion. */
const FOV = 15

/** Longest profile segment, so the ledge shadow can fade smoothly down long walls (px). */
const MAX_SEGMENT_LENGTH = 6

/** How far below a ledge its shadow reaches, as a share of the solid's height (px clamp). */
const LEDGE_REACH = { share: 0.15, min: 6, max: 80 }

/** A lathe profile ready to sweep, with its per-point ledge shadow. */
interface PreparedProfile {
  points: Vector2[]
  ledge: number[]
}

/**
 * A Three.js scene that revolves a 2D outline "in place".
 *
 * Both cameras show the z = 0 plane at 1 world unit per CSS px: the perspective camera by
 * sitting at the matching distance, the orthographic one by a frustum the canvas's size.
 * A view offset shifts the projection so the solid appears at its anchor on the page,
 * rather than in the middle of the canvas. At the start of the sweep the solid is the flat
 * outline (and, mirrored, its reflection), exactly where the 2D shape is drawn. Orbiting pivots around the solid while it
 * stays anchored.
 */
export function createThreeScene(canvas: HTMLCanvasElement): ThreeScene {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setPixelRatio(window.devicePixelRatio)

  const scene = new Scene()
  const perspective = new PerspectiveCamera(FOV, 1, 1, 10_000)
  const orthographic = new OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 1, 10_000)
  let camera: PerspectiveCamera | OrthographicCamera = orthographic
  const controls = new OrbitControls<PerspectiveCamera | OrthographicCamera>(camera, canvas)
  controls.enableDamping = true
  controls.enablePan = false

  // No lights: the trophy material shades itself (see trophyMaterial.ts).
  const material = createTrophyMaterial()
  const solid = new Mesh(new BufferGeometry(), material.surface)
  // Flat caps close the cut faces while the sweep is partial: two for a one-sided sweep,
  // four for a mirrored one. They share one geometry.
  const caps = Array.from({ length: 4 }, () => new Mesh(new BufferGeometry(), material.cap))
  const group = new Group()
  group.add(solid, ...caps)
  scene.add(group)

  let profiles: Vector2[][] = []
  let prepared: PreparedProfile[] = []
  let segments = SEGMENT_LIMITS.min
  let axisX = 0
  let anchor = { left: 0, top: 0 }
  let size = { width: 1, height: 1 }
  let sweep: { start: number; duration: number } | null = null
  let mirror = false
  let disposed = false

  /** Distance at which the perspective camera shows 1 world unit per CSS px at z = 0. */
  const pixelDistance = () => size.height / 2 / Math.tan(MathUtils.degToRad(FOV) / 2)

  const bounds = () => {
    const ys = profiles.flat().map((p) => p.y)
    return ys.length ? { min: Math.min(...ys), max: Math.max(...ys) } : { min: 0, max: 0 }
  }

  /** Fit both cameras to the canvas: 1 unit = 1 px at z = 0, clipping planes around it. */
  const fitCameras = () => {
    const distance = pixelDistance()
    perspective.aspect = size.width / size.height
    orthographic.left = -size.width / 2
    orthographic.right = size.width / 2
    orthographic.top = size.height / 2
    orthographic.bottom = -size.height / 2
    for (const cam of [perspective, orthographic]) {
      cam.near = distance / 20
      cam.far = distance * 20
    }
    // Keep the orbit angle; restore the 1 unit = 1 px distance.
    camera.position.sub(controls.target).setLength(distance).add(controls.target)
  }

  /** Shift the projection so the solid's center lands on its page position. */
  const updateViewOffset = () => {
    const { min, max } = bounds()
    const centerX = anchor.left + axisX
    const centerY = anchor.top - (min + max) / 2
    const { width, height } = size
    for (const cam of [perspective, orthographic]) {
      cam.setViewOffset(width, height, width / 2 - centerX, height / 2 - centerY, width, height)
    }
  }

  const resetView = () => {
    controls.target.set(0, 0, 0)
    camera.position.set(0, 0, 1)
    camera.zoom = 1
    fitCameras()
    updateViewOffset()
    controls.update()
  }

  const setGeometry = (mesh: Mesh, geometry: BufferGeometry) => {
    mesh.geometry.dispose()
    mesh.geometry = geometry
  }

  /** One lathe per profile over [phiStart, phiStart + phiLength], with the ledge shadow. */
  const lathe = (phiStart: number, phiLength: number) =>
    prepared.map(({ points, ledge }) => {
      const steps = Math.max(4, Math.ceil(segments * (phiLength / FULL_TURN)))
      const geometry = new LatheGeometry(points, steps, phiStart, phiLength)
      // LatheGeometry lays out vertices meridian by meridian: (steps + 1) × points.
      const values = new Float32Array((steps + 1) * points.length)
      for (let i = 0; i <= steps; i++) values.set(ledge, i * points.length)
      geometry.setAttribute('aLedge', new BufferAttribute(values, 1))
      return geometry
    })

  /** Build the solid at sweep progress 0–1 (1 = the full solid). */
  const buildSweep = (progress: number) => {
    let geometries: BufferGeometry[]
    let capAngles: number[]
    if (progress >= 1) {
      geometries = lathe(PHI_START, FULL_TURN)
      capAngles = []
    } else if (mirror) {
      // Both flat halves (the 2D shape at −90° and its mirror at +90°) sweep forward and
      // back by s until they meet at the front and back (s = 90°).
      const s = Math.max(1e-3, (progress * Math.PI) / 2)
      geometries = [...lathe(-Math.PI / 2 - s, 2 * s), ...lathe(Math.PI / 2 - s, 2 * s)]
      capAngles = [-Math.PI / 2 - s, -Math.PI / 2 + s, Math.PI / 2 - s, Math.PI / 2 + s]
    } else {
      const length = Math.max(1e-3, progress * FULL_TURN)
      geometries = lathe(PHI_START, length)
      capAngles = [PHI_START, PHI_START + length]
    }
    const merged = geometries.length > 1 ? mergeGeometries(geometries) : geometries[0]
    if (geometries.length > 1) geometries.forEach((g) => g.dispose())
    setGeometry(solid, merged ?? new BufferGeometry())
    // A ShapeGeometry lies in the XY plane (x = radius); rotating it by φ − π/2 about Y
    // puts it on the lathe's meridian at angle φ.
    caps.forEach((cap, i) => {
      const angle = capAngles[i]
      cap.visible = angle !== undefined
      if (angle !== undefined) cap.rotation.y = angle - Math.PI / 2
    })
  }

  renderer.setAnimationLoop(() => {
    if (sweep) {
      const t = Math.min(1, (performance.now() - sweep.start) / sweep.duration)
      buildSweep(easeInOutCubic(t))
      if (t === 1) sweep = null
    }
    controls.update()
    renderer.render(scene, camera)
  })

  resetView()

  return {
    setOutline(outline, revolve) {
      axisX = revolve.axisX
      profiles = outlineToLatheProfiles(outline, axisX)
      const { min: bottom, max: top } = bounds()
      material.setHeightRange(bottom, top)
      const reach = MathUtils.clamp(
        (top - bottom) * LEDGE_REACH.share,
        LEDGE_REACH.min,
        LEDGE_REACH.max,
      )
      const maxRadius = Math.max(0, ...profiles.flat().map((p) => p.x))
      segments = MathUtils.clamp(
        Math.ceil((2 * Math.PI * maxRadius) / RADIAL_STEP),
        SEGMENT_LIMITS.min,
        SEGMENT_LIMITS.max,
      )
      prepared = profiles.map((profile) => {
        const points = subdivideProfile(withCrispCorners(profile), MAX_SEGMENT_LENGTH)
        return { points, ledge: ledgeOcclusion(points, reach) }
      })
      const [firstCap, ...otherCaps] = caps
      if (firstCap) {
        setGeometry(
          firstCap,
          profiles.length
            ? new ShapeGeometry(profiles.map((p) => new Shape(p)))
            : new BufferGeometry(),
        )
        for (const cap of otherCaps) cap.geometry = firstCap.geometry
      }
      // Put the solid's vertical center at the origin (the orbit pivot).
      const { min, max } = bounds()
      group.position.y = -(min + max) / 2
      material.setSolidOrigin(group.position)
      if (!sweep) buildSweep(1)
      updateViewOffset()
    },
    setLook(look) {
      material.setLook(look)
    },
    setAnchor(left, top) {
      anchor = { left, top }
      updateViewOffset()
    },
    setProjection(projection) {
      const next = projection === 'orthographic' ? orthographic : perspective
      if (next === camera) return
      camera = next
      controls.object = camera
      resetView()
    },
    setMirror(on) {
      mirror = on
    },
    playRevolve(durationMs = 1600) {
      sweep = { start: performance.now(), duration: durationMs }
      resetView()
    },
    resize(width, height) {
      if (width === 0 || height === 0) return
      size = { width, height }
      renderer.setSize(width, height, false)
      fitCameras()
      updateViewOffset()
    },
    dispose() {
      if (disposed) return
      disposed = true
      renderer.setAnimationLoop(null)
      controls.dispose()
      disposeObject3D(scene)
      renderer.dispose()
      // Release the WebGL context now rather than waiting for GC; browsers cap live
      // contexts, and StrictMode/HMR remounts would otherwise accumulate them.
      renderer.forceContextLoss()
    },
  }
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}
