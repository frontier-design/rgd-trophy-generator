import { DEFAULT_MATERIAL, DEFAULT_SCENE_PARAMS } from '../../state'
import type { Shading, TextAlign } from '../../types'
import type { SceneNode } from './sceneNode'

/**
 * The master node's settings: the ones every scene shares (they were left the same across
 * scenes in practice), so they're set once, on the master node, and applied to every scene
 * on the canvas. Scenes keep their own copy (withMaster writes these into them), so
 * everything downstream reads a scene as before.
 */
export interface MasterParams {
  // type / shape / top / line boxes
  textAlign: TextAlign
  mirror: boolean
  overshoot: number
  roundTop: boolean
  taper: number
  smoothJoins: boolean
  // material
  shading: Shading
  banding: number
  gradientScale: number
  tilt: number
  wobble: number
  edgeHue: number
  ledgeShadow: number
  grain: number
  grainSize: number
  // canvas
  background: string
  // view
  /** True = the 3D trophy; false = the 2D sketch. */
  revolve: boolean
  perspective: boolean
  debug: boolean
}

/** The master node: one per canvas, linked to nothing (it applies to every scene). */
export interface MasterNode {
  id: typeof MASTER_ID
  name: string
  x: number
  y: number
  collapsed?: boolean
  params: MasterParams
}

export const MASTER_ID = 'master'

export const DEFAULT_MASTER_PARAMS: MasterParams = {
  textAlign: DEFAULT_SCENE_PARAMS.textAlign,
  mirror: DEFAULT_SCENE_PARAMS.mirror,
  overshoot: DEFAULT_SCENE_PARAMS.overshoot,
  // New canvas scenes start with a round top (canvasSceneDefaults).
  roundTop: true,
  taper: DEFAULT_SCENE_PARAMS.taper,
  smoothJoins: DEFAULT_SCENE_PARAMS.smoothJoins,
  shading: DEFAULT_MATERIAL.shading,
  banding: DEFAULT_MATERIAL.banding,
  gradientScale: DEFAULT_MATERIAL.gradientScale,
  tilt: DEFAULT_MATERIAL.tilt,
  wobble: DEFAULT_MATERIAL.wobble,
  edgeHue: DEFAULT_MATERIAL.edgeHue,
  ledgeShadow: DEFAULT_MATERIAL.ledgeShadow,
  grain: DEFAULT_MATERIAL.grain,
  grainSize: DEFAULT_MATERIAL.grainSize,
  background: DEFAULT_SCENE_PARAMS.canvasColors.background,
  revolve: true,
  perspective: false,
  debug: false,
}

export function createMasterNode(
  x = 0,
  y = 0,
  params: MasterParams = DEFAULT_MASTER_PARAMS,
): MasterNode {
  return { id: MASTER_ID, name: 'master', x, y, params: { ...params } }
}

/** A scene's values for the master's settings (to start a master from an existing canvas). */
export function masterFromScene({ scene, settings, revolve, perspective, debug }: SceneNode) {
  const { material } = settings
  return {
    textAlign: scene.textAlign,
    mirror: scene.mirror,
    overshoot: scene.overshoot,
    roundTop: scene.roundTop,
    taper: scene.taper,
    smoothJoins: scene.smoothJoins,
    shading: material.shading,
    banding: material.banding,
    gradientScale: material.gradientScale,
    tilt: material.tilt,
    wobble: material.wobble,
    edgeHue: material.edgeHue,
    ledgeShadow: material.ledgeShadow,
    grain: material.grain,
    grainSize: material.grainSize,
    background: scene.canvasColors.background,
    revolve,
    perspective,
    debug,
  } satisfies MasterParams
}

const sameParams = (a: MasterParams, b: MasterParams) =>
  (Object.keys(a) as (keyof MasterParams)[]).every((key) => a[key] === b[key])

/** The scene with the master's settings applied; the same object if it already has them
 *  (so memoized scenes don't re-render). Switching to 3D plays the sweep, as the button
 *  did on a scene. */
export function withMaster(node: SceneNode, master: MasterParams): SceneNode {
  if (sameParams(masterFromScene(node), master)) return node
  const { scene, settings } = node
  return {
    ...node,
    revolve: master.revolve,
    animateRevolve: master.revolve !== node.revolve ? master.revolve : node.animateRevolve,
    perspective: master.perspective,
    debug: master.debug,
    settings: {
      ...settings,
      material: {
        ...settings.material,
        shading: master.shading,
        banding: master.banding,
        gradientScale: master.gradientScale,
        tilt: master.tilt,
        wobble: master.wobble,
        edgeHue: master.edgeHue,
        ledgeShadow: master.ledgeShadow,
        grain: master.grain,
        grainSize: master.grainSize,
      },
    },
    scene: {
      ...scene,
      textAlign: master.textAlign,
      mirror: master.mirror,
      overshoot: master.overshoot,
      roundTop: master.roundTop,
      taper: master.taper,
      smoothJoins: master.smoothJoins,
      canvasColors: { ...scene.canvasColors, background: master.background },
    },
  }
}
