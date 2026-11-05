import {
  BufferGeometry,
  Group,
  MathUtils,
  Mesh,
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  Shape,
  ShapeGeometry,
  WebGLRenderer,
  Vector3,
  type Vector2,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { ledgeOcclusion } from '../material'
import type { EtchParams, MaterialSettings, Outline2D, TextureParams, TwistParams } from '../types'
import { disposeObject3D } from './dispose'
import { buildLathe, surfaceAtHeight, surfaceCoordinates } from './lathe'
import { outlineToLatheProfiles, subdivideProfile, withCrispCorners } from './revolve'
import { etchShape } from './etch'
import { textureShape } from './texture'
import type { SolidPattern } from './pattern'
import { createTrophyMaterial } from './trophyMaterial'
import { MAX_TWISTS, STEPS_PER_FLUTE, twistDeform, twistShape, type RadialScale } from './twist'

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
  /** Twist nodes shaping the solid (flutes turning up it), applied together (the first
   *  MAX_TWISTS); none = the plain revolve. Rebuilds only when they change. */
  setTwists(twists: readonly TwistParams[]): void
  /** Etch nodes' engraved strips (the first MAX_ETCHES), drawn by the material (no
   *  rebuild). */
  setEtches(etches: readonly EtchParams[]): void
  /** Texture nodes' rough finishes (the first MAX_TEXTURES), drawn by the material (no
   *  rebuild). */
  setTextures(textures: readonly TextureParams[]): void
  /** Pattern nodes' ornament (the first MAX_PATTERNS): their height maps, uploaded once
   *  each, and their placement. */
  setPatterns(patterns: readonly SolidPattern[]): void
  /** Resize renderer and camera to the canvas's CSS size. */
  resize(width: number, height: number): void
  /** Render now, so updates made in this commit show in this frame alongside the DOM text.
   *  (Other changes are drawn on the next animation frame; a still scene isn't redrawn.) */
  render(): void
  /** Drawing-buffer pixels per CSS px (the device ratio × the artboard's display scale). */
  setPixelRatio(ratio: number): void
  /**
   * Render the current frame at `pixelRatio` and return the canvas, for video export. Draw
   * it right away (same task): the WebGL drawing buffer isn't kept. The ratio stays until
   * the next setPixelRatio.
   */
  snapshot(pixelRatio: number): HTMLCanvasElement
  /** Stop the loop and dispose geometries, materials and the renderer. */
  dispose(): void
}

/** Steps around the axis: about one per RADIAL_STEP px of the widest rim, within limits,
 *  so wide trophies stay smooth at the silhouette and small ones stay cheap. */
const RADIAL_STEP = 6
const SEGMENT_LIMITS = { min: 96, max: 384 }
/** Most steps around the axis with twist nodes' flutes (STEPS_PER_FLUTE each). */
const FLUTED_SEGMENT_MAX = 960
/** A fluted solid changed after its first build is built as a draft (`scale` of its steps
 *  around; per-pixel normals keep it shading right), and at full quality once changes
 *  pause for `settle` ms. */
const DRAFT = { settle: 220, scale: 0.4 }
const FULL_TURN = Math.PI * 2
/** Start angle where the profile lies in the screen plane, left of the axis: exactly where
 *  the 2D shape is drawn. The lathe (like LatheGeometry) places a point at (r·sin φ, y, r·cos φ). */
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
  /** Each point's surface coordinate (lathe.ts surfaceCoordinates). */
  surface: number[]
}

/**
 * A Three.js scene that revolves a 2D outline "in place".
 *
 * Both cameras show the z = 0 plane at 1 world unit per CSS px: the perspective camera by
 * sitting at the matching distance, the orthographic one by a frustum the canvas's size.
 * A view offset shifts the projection so the solid appears at its anchor on the page,
 * rather than in the middle of the canvas. At the start of the sweep the solid is the flat
 * outline (and, mirrored, its reflection), exactly where the 2D shape is drawn. The view is
 * fixed (front on); the workspace around the artboard handles panning and zooming.
 */
export function createThreeScene(canvas: HTMLCanvasElement): ThreeScene {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setPixelRatio(window.devicePixelRatio)

  const scene = new Scene()
  const perspective = new PerspectiveCamera(FOV, 1, 1, 10_000)
  const orthographic = new OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 1, 10_000)
  let camera: PerspectiveCamera | OrthographicCamera = orthographic
  // A fixed front view: the workspace (pan/zoom around the artboard) takes the mouse, so
  // the camera only ever looks at the solid's center from straight ahead.
  const target = new Vector3(0, 0, 0)

  // No lights: the trophy material shades itself (see trophyMaterial.ts).
  const material = createTrophyMaterial()
  material.setPixelRatio(renderer.getPixelRatio())
  const solid = new Mesh(new BufferGeometry(), material.surface)
  // Flat caps close the cut faces while the sweep is partial: two for a one-sided sweep,
  // four for a mirrored one. They share one geometry (capBase), or with twist nodes, each
  // gets a copy narrowed to the flutes at its angle.
  let capBase = new BufferGeometry()
  const caps = Array.from({ length: 4 }, () => new Mesh(capBase, material.cap))
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
  let twists: readonly TwistParams[] = []
  let patterns: readonly SolidPattern[] = []
  /** Hand the patterns to the material, with where each strip's top is in surface
   *  coordinates (for patterns that follow the surface; it changes with the outline). */
  const applyPatterns = () => {
    const { min, max } = bounds()
    const main = prepared.reduce<PreparedProfile | null>(
      (longest, p) => (!longest || p.points.length > longest.points.length ? p : longest),
      null,
    )
    material.setPatterns(patterns, (from) =>
      main ? surfaceAtHeight(main.points, main.surface, max - from * (max - min)) : 0,
    )
  }
  let deform: RadialScale | null = null
  /** Steps around the axis for the plain revolve (twist nodes may need more). */
  let baseSegments = SEGMENT_LIMITS.min
  /** Share of the steps around being built (DRAFT.scale for a draft, else 1). */
  let draftScale = 1
  /** A fluted solid has been built (its first build is never a draft). */
  let built = false
  let settleTimer: ReturnType<typeof setTimeout> | undefined
  /** Rebuild the finished solid after a change: a fluted solid's changes are drafts until
   *  they pause, then rebuilt at full quality. */
  const rebuild = () => {
    if (sweep) return
    // Every change to a fluted solid after its first build is a draft first (edits respond at
    // once), upgraded once they pause.
    const dragging = deform !== null && built
    if (deform) built = true
    clearTimeout(settleTimer)
    draftScale = dragging ? DRAFT.scale : 1
    buildSweep(1)
    if (dragging) {
      settleTimer = setTimeout(() => {
        if (disposed || sweep) return
        draftScale = 1
        buildSweep(1)
        requestRender()
      }, DRAFT.settle)
    }
  }

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
    // Restore the 1 unit = 1 px distance.
    camera.position.sub(target).setLength(distance).add(target)
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
    camera.position.set(0, 0, 1)
    camera.zoom = 1
    fitCameras()
    camera.lookAt(target)
    updateViewOffset()
  }

  const setGeometry = (mesh: Mesh, geometry: BufferGeometry) => {
    if (mesh.geometry !== capBase) mesh.geometry.dispose()
    mesh.geometry = geometry
  }

  /** The twist nodes' deformation over the current solid's height, and the steps around
   *  the axis their flutes need. */
  const updateDeform = () => {
    const { min, max } = bounds()
    // The shader takes MAX_TWISTS; the mesh uses the same ones, so the two always agree.
    const used = twists.slice(0, MAX_TWISTS)
    const shapes = used.map(twistShape)
    deform = twistDeform(shapes, max, max - min)
    material.setTwists(shapes, max, max - min)
    const flutes = used.reduce((sum, twist) => sum + Math.max(1, Math.round(twist.flutes)), 0)
    segments = deform
      ? MathUtils.clamp(flutes * STEPS_PER_FLUTE, baseSegments, FLUTED_SEGMENT_MAX)
      : baseSegments
  }

  /** The cap at the lathe's angle `phi`: the flat shape, narrowed to the flutes there. */
  const capAt = (phi: number) => {
    if (!deform) return capBase
    const geometry = capBase.clone()
    const position = geometry.getAttribute('position')
    for (let i = 0; i < position.count; i++) {
      position.setX(i, position.getX(i) * deform(phi, position.getY(i)))
    }
    return geometry
  }

  /** One lathe per profile over [phiStart, phiStart + phiLength], with the ledge shadow. */
  const lathe = (phiStart: number, phiLength: number) =>
    prepared.map(({ points, ledge, surface }) => {
      const steps = Math.max(4, Math.ceil(segments * draftScale * (phiLength / FULL_TURN)))
      return buildLathe(points, ledge, steps, phiStart, phiLength, deform, surface)
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
      if (angle !== undefined) {
        cap.rotation.y = angle - Math.PI / 2
        setGeometry(cap, capAt(angle))
      }
    })
  }

  // Rendered on demand, not every frame: a still trophy costs nothing between changes (each
  // scene is a full-frame canvas with a heavy shader). Changes made in a React commit are
  // drawn by its render() call; others (resizes, observers) ask for the next frame here.
  // Only the sweep animates, with a loop that stops when it's done.
  let frame = 0
  const draw = () => {
    if (!disposed) renderer.render(scene, camera)
  }
  const requestRender = () => {
    if (frame || disposed) return
    frame = requestAnimationFrame(() => {
      frame = 0
      draw()
    })
  }
  const startSweep = () =>
    renderer.setAnimationLoop(() => {
      if (sweep) {
        const t = Math.min(1, (performance.now() - sweep.start) / sweep.duration)
        buildSweep(easeInOutCubic(t))
        if (t === 1) {
          sweep = null
          renderer.setAnimationLoop(null)
        }
      }
      draw()
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
      baseSegments = MathUtils.clamp(
        Math.ceil((2 * Math.PI * maxRadius) / RADIAL_STEP),
        SEGMENT_LIMITS.min,
        SEGMENT_LIMITS.max,
      )
      prepared = profiles.map((profile) => {
        const points = subdivideProfile(withCrispCorners(profile), MAX_SEGMENT_LENGTH)
        return { points, ledge: ledgeOcclusion(points, reach), surface: surfaceCoordinates(points) }
      })
      const previousCap = capBase
      capBase = profiles.length
        ? new ShapeGeometry(profiles.map((p) => new Shape(p)))
        : new BufferGeometry()
      for (const cap of caps) {
        if (cap.geometry !== previousCap) cap.geometry.dispose()
        cap.geometry = capBase
      }
      previousCap.dispose()
      updateDeform()
      applyPatterns()
      // Put the solid's vertical center at the origin (where the camera looks).
      const { min, max } = bounds()
      group.position.y = -(min + max) / 2
      material.setSolidOrigin(group.position)
      rebuild()
      updateViewOffset()
      requestRender()
    },
    setLook(look) {
      material.setLook(look)
      requestRender()
    },
    setAnchor(left, top) {
      anchor = { left, top }
      updateViewOffset()
      requestRender()
    },
    setProjection(projection) {
      const next = projection === 'orthographic' ? orthographic : perspective
      if (next === camera) return
      camera = next
      resetView()
      requestRender()
    },
    setMirror(on) {
      mirror = on
    },
    setPatterns(next) {
      patterns = next
      applyPatterns()
      requestRender()
    },
    setEtches(next) {
      material.setEtches(next.map(etchShape))
      requestRender()
    },
    setTextures(next) {
      material.setTextures(next.map(textureShape))
      requestRender()
    },
    setTwists(next) {
      if (JSON.stringify(next) === JSON.stringify(twists)) return
      twists = next.map((twist) => ({ ...twist }))
      updateDeform()
      rebuild()
      requestRender()
    },
    playRevolve(durationMs = 1600) {
      sweep = { start: performance.now(), duration: durationMs }
      resetView()
      startSweep()
    },
    render() {
      if (frame) cancelAnimationFrame(frame)
      frame = 0
      draw()
    },
    setPixelRatio(ratio) {
      if (ratio > 0 && ratio !== renderer.getPixelRatio()) {
        // (Resizing the drawing buffer clears it: draw again.)
        renderer.setPixelRatio(ratio)
        requestRender()
      }
      material.setPixelRatio(renderer.getPixelRatio())
    },
    snapshot(pixelRatio) {
      // Exports never use a draft.
      if (draftScale !== 1) {
        clearTimeout(settleTimer)
        draftScale = 1
        if (!sweep) buildSweep(1)
      }
      this.setPixelRatio(pixelRatio)
      renderer.render(scene, camera)
      return canvas
    },
    resize(width, height) {
      if (width === 0 || height === 0) return
      size = { width, height }
      renderer.setSize(width, height, false)
      fitCameras()
      updateViewOffset()
      requestRender()
    },
    dispose() {
      if (disposed) return
      disposed = true
      clearTimeout(settleTimer)
      if (frame) cancelAnimationFrame(frame)
      renderer.setAnimationLoop(null)
      disposeObject3D(scene)
      material.dispose()
      capBase.dispose()
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
