import type { PanZoomView } from '../../hooks'
import type { CompositionNode } from './compositionNode'
import { migratePalette } from '../../material'
import {
  DEFAULT_BANNER_TEXT,
  DEFAULT_MATERIAL,
  DEFAULT_SCENE_PARAMS,
  DEFAULT_SETTINGS,
} from '../../state'
import { BLOB_PREFIX, loadBlob, pruneBlobs, readSaved, storeBlob } from '../../state/persist'
import {
  DEFAULT_ETCH,
  DEFAULT_TEXTURE,
  DEFAULT_PATTERN,
  SAMPLE_IMAGE,
  DEFAULT_TWIST,
  DEFAULT_LIGHTING,
  LIGHTING_KEYS,
  type ModifierNode,
  type NodeLink,
} from './graph'
import {
  createMasterNode,
  DEFAULT_MASTER_PARAMS,
  masterFromScene,
  withMaster,
  type MasterNode,
  type MasterParams,
} from './master'
import { DEFAULT_FRAME, DEFAULT_IMAGE_EXPORT, type SceneNode } from './sceneNode'
import type { ClusterNode } from './cluster'

/** Everything on the canvas page, as autosaved and put in project files. */
export interface CanvasDocument {
  version: 1
  scenes: SceneNode[]
  compositions: CompositionNode[]
  /** Twist and etch nodes. */
  modifiers: ModifierNode[]
  links: NodeLink[]
  /** The settings every scene shares (applied to all of them). */
  master: MasterNode
  /** Modifier nodes grouped under one output (⌘G). */
  clusters: ClusterNode[]
  /** Nodes inserted so far of each kind (their names and ids continue from here). */
  inserted: {
    scene: number
    composition: number
    twist: number
    etch: number
    pattern: number
    texture: number
    material: number
    lighting: number
    text: number
    cluster: number
  }
  /** Where the canvas was looking. */
  view: PanZoomView | null
}

export const EMPTY_CANVAS: CanvasDocument = {
  version: 1,
  scenes: [],
  compositions: [],
  modifiers: [],
  links: [],
  master: createMasterNode(),
  clusters: [],
  inserted: {
    scene: 0,
    composition: 0,
    twist: 0,
    etch: 0,
    pattern: 0,
    texture: 0,
    material: 0,
    lighting: 0,
    text: 0,
    cluster: 0,
  },
  view: null,
}

type Loose = Record<string, unknown>
const isObject = (value: unknown): value is Loose =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const asObject = (value: unknown): Loose => (isObject(value) ? value : {})
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)
// Counters are non-negative integers, with room for an increment.
const isCounter = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value < Number.MAX_SAFE_INTEGER

/** A saved frame size (the default for saves from before frames could change). */
function parseFrame(value: unknown): SceneNode['frame'] {
  const frame = asObject(value)
  const side = (v: unknown, fallback: number) =>
    isFiniteNumber(v) && v >= 64 && v <= 16384 ? Math.round(v) : fallback
  return {
    width: side(frame.width, DEFAULT_FRAME.width),
    height: side(frame.height, DEFAULT_FRAME.height),
  }
}

function parseImageExport(value: unknown): SceneNode['imageExport'] {
  const options = asObject(value)
  return {
    format: options.format === 'jpeg' ? 'jpeg' : 'png',
    scale:
      isFiniteNumber(options.scale) && options.scale >= 1 && options.scale <= 5
        ? Math.round(options.scale)
        : DEFAULT_IMAGE_EXPORT.scale,
    transparent: options.transparent === true,
  }
}

function parseScene(value: unknown): SceneNode | null {
  if (!isObject(value) || typeof value.id !== 'string') return null
  const settings = asObject(value.settings)
  const scene = asObject(value.scene)
  return {
    id: value.id,
    name: typeof value.name === 'string' ? value.name : value.id,
    x: isFiniteNumber(value.x) ? value.x : 0,
    y: isFiniteNumber(value.y) ? value.y : 0,
    // Saved values over today's defaults, so saves from before a new setting still load.
    settings: {
      ...DEFAULT_SETTINGS,
      ...settings,
      // (A preset that was removed loads as a custom palette of its colors.)
      material: migratePalette({ ...DEFAULT_MATERIAL, ...asObject(settings.material) }),
    } as SceneNode['settings'],
    scene: {
      ...DEFAULT_SCENE_PARAMS,
      ...scene,
      lineBox: { ...DEFAULT_SCENE_PARAMS.lineBox, ...asObject(scene.lineBox) },
      canvasColors: { ...DEFAULT_SCENE_PARAMS.canvasColors, ...asObject(scene.canvasColors) },
    } as SceneNode['scene'],
    bannerPosition: value.bannerPosition === 'top' ? 'top' : 'bottom',
    bannerText: {
      ...DEFAULT_BANNER_TEXT,
      ...(asObject(value.bannerText) as Partial<SceneNode['bannerText']>),
    },
    frame: parseFrame(value.frame),
    imageExport: parseImageExport(value.imageExport),
    revolve: value.revolve !== false,
    // Never replay the sweep on load.
    animateRevolve: false,
    perspective: value.perspective === true,
    debug: value.debug === true,
  }
}

/** A saved modifier node (saves from before etch have only twists, without a kind). */
function parseModifier(value: unknown, kind: unknown = undefined): ModifierNode | null {
  if (!isObject(value) || typeof value.id !== 'string') return null
  const base = {
    id: value.id,
    name: typeof value.name === 'string' ? value.name : value.id,
    x: isFiniteNumber(value.x) ? value.x : 0,
    y: isFiniteNumber(value.y) ? value.y : 0,
    ...(value.collapsed === true ? { collapsed: true } : {}),
  }
  const params = asObject(value.params)
  const type = value.kind ?? kind
  if (type === 'etch') {
    return {
      ...base,
      kind: 'etch',
      params: { ...DEFAULT_ETCH, ...params } as ModifierNode['params'],
    } as ModifierNode
  }
  if (type === 'pattern') {
    // Its image is stored apart from the document (storeCanvasDocument): load it back.
    const image = typeof params.image === 'string' ? loadBlob(params.image) : null
    return {
      ...base,
      kind: 'pattern',
      params: { ...DEFAULT_PATTERN, ...params, image: image ?? SAMPLE_IMAGE, mode: 'repeat', style: 'raised' },
    } as ModifierNode
  }
  if (type === 'texture') {
    return {
      ...base,
      kind: 'texture',
      params: { ...DEFAULT_TEXTURE, ...params },
    } as ModifierNode
  }
  if (type === 'text') {
    return {
      ...base,
      kind: 'text',
      params: { text: typeof params.text === 'string' ? params.text : DEFAULT_SETTINGS.text },
    }
  }
  if (type === 'lighting') {
    // Saved numbers over the defaults (anything else is dropped).
    const lighting = { ...DEFAULT_LIGHTING }
    for (const key of LIGHTING_KEYS) if (isFiniteNumber(params[key])) lighting[key] = params[key]
    return { ...base, kind: 'lighting', params: lighting }
  }
  if (type === 'material') {
    return { ...base, kind: 'material', params: migratePalette({ ...DEFAULT_MATERIAL, ...params }) }
  }
  if (type === 'twist') {
    return { ...base, kind: 'twist', params: { ...DEFAULT_TWIST, ...params } } as ModifierNode
  }
  return null
}

/** Where a master node goes on a canvas that had none: left of the scenes' top-left. */
const MASTER_OFFSET = 320

/**
 * The saved master node, its params over the defaults. A canvas saved before there was one
 * starts it from its first scene's values (they were the same in every scene in practice), so
 * nothing changes when it's applied.
 */
function parseMaster(value: unknown, scenes: readonly SceneNode[]): MasterNode {
  if (isObject(value) && isObject(value.params)) {
    const params = { ...DEFAULT_MASTER_PARAMS }
    for (const key of Object.keys(params) as (keyof MasterParams)[]) {
      const saved = value.params[key]
      if (typeof saved === typeof params[key]) (params as Record<string, unknown>)[key] = saved
    }
    return {
      ...createMasterNode(
        isFiniteNumber(value.x) ? value.x : 0,
        isFiniteNumber(value.y) ? value.y : 0,
        params,
      ),
      ...(value.collapsed === true ? { collapsed: true } : {}),
    }
  }
  const first = scenes[0]
  if (!first) return createMasterNode()
  return createMasterNode(
    Math.min(...scenes.map((scene) => scene.x)) - MASTER_OFFSET,
    Math.min(...scenes.map((scene) => scene.y)),
    masterFromScene(first),
  )
}

/** The highest number ending an id (scene-3 → 3), 0 if none. */
function highestId(nodes: readonly { id: string }[], prefix: string): number {
  return Math.max(
    0,
    ...nodes
      .filter((node) => node.id.startsWith(prefix))
      .map((node) => Number(/(\d+)$/.exec(node.id)?.[1] ?? 0))
      .filter(isCounter),
  )
}

/** A saved canvas, checked and filled in with defaults; the empty canvas if it isn't one. */
export function parseCanvasDocument(value: unknown): CanvasDocument {
  if (!isObject(value)) return EMPTY_CANVAS
  const list = (key: string) => (Array.isArray(value[key]) ? (value[key] as unknown[]) : [])
  const parsed = list('scenes').flatMap((item) => parseScene(item) ?? [])
  const master = parseMaster(value.master, parsed)
  const scenes = parsed.map((scene) => withMaster(scene, master.params))
  const modifiers = [
    ...list('twists').flatMap((item) => parseModifier(item, 'twist') ?? []),
    ...list('modifiers').flatMap((item) => parseModifier(item) ?? []),
  ]
  const compositions: CompositionNode[] = list('compositions').flatMap((item) => {
    if (!isObject(item) || typeof item.id !== 'string') return []
    const frame = parseFrame(item.frame)
    const image = asObject(item.image)
    return [
      {
        id: item.id,
        name: typeof item.name === 'string' ? item.name : item.id,
        x: isFiniteNumber(item.x) ? item.x : 0,
        y: isFiniteNumber(item.y) ? item.y : 0,
        frame,
        image: {
          x: isFiniteNumber(image.x) ? image.x : 0,
          y: isFiniteNumber(image.y) ? image.y : 0,
          width: isFiniteNumber(image.width) && image.width > 0 ? image.width : frame.width,
          height: isFiniteNumber(image.height) && image.height > 0 ? image.height : frame.height,
        },
      },
    ]
  })
  const sceneIds = new Set(scenes.map((node) => node.id))
  const compositionIds = new Set(compositions.map((node) => node.id))
  const modifierIds = new Set(modifiers.map((node) => node.id))
  // Clusters: existing modifier members, each in one cluster only; empty ones dropped.
  const clustered = new Set<string>()
  const clusters: ClusterNode[] = list('clusters').flatMap((item) => {
    if (!isObject(item) || typeof item.id !== 'string' || !Array.isArray(item.members)) return []
    const members = item.members.filter(
      (id): id is string => typeof id === 'string' && modifierIds.has(id) && !clustered.has(id),
    )
    members.forEach((id) => clustered.add(id))
    if (!members.length) return []
    return [{ id: item.id, name: typeof item.name === 'string' ? item.name : item.id, members }]
  })
  const clusterIds = new Set(clusters.map((node) => node.id))
  const links = list('links').flatMap((item) => {
    const link = asObject(item)
    return typeof link.from === 'string' &&
      typeof link.to === 'string' &&
      (((modifierIds.has(link.from) || clusterIds.has(link.from)) && sceneIds.has(link.to)) ||
        (sceneIds.has(link.from) && compositionIds.has(link.to)))
      ? [{ from: link.from, to: link.to, ...(link.muted === true ? { muted: true } : {}) }]
      : []
  })
  const inserted = asObject(value.inserted)
  const view = asObject(value.view)
  return {
    version: 1,
    scenes,
    compositions,
    modifiers,
    links,
    master,
    clusters,
    // Never reuse an id: past every id's number.
    inserted: {
      scene: Math.max(isCounter(inserted.scene) ? inserted.scene : 0, highestId(scenes, 'scene')),
      composition: Math.max(
        isCounter(inserted.composition) ? inserted.composition : 0,
        highestId(compositions, 'composition'),
      ),
      twist: Math.max(
        isCounter(inserted.twist) ? inserted.twist : 0,
        highestId(modifiers, 'twist'),
      ),
      etch: Math.max(isCounter(inserted.etch) ? inserted.etch : 0, highestId(modifiers, 'etch')),
      pattern: Math.max(
        isCounter(inserted.pattern) ? inserted.pattern : 0,
        highestId(modifiers, 'pattern'),
      ),
      material: Math.max(
        isCounter(inserted.material) ? inserted.material : 0,
        highestId(modifiers, 'material'),
      ),
      lighting: Math.max(
        isCounter(inserted.lighting) ? inserted.lighting : 0,
        highestId(modifiers, 'lighting'),
      ),
      cluster: Math.max(
        isCounter(inserted.cluster) ? inserted.cluster : 0,
        highestId(clusters, 'cluster'),
      ),
      text: Math.max(isCounter(inserted.text) ? inserted.text : 0, highestId(modifiers, 'text')),
      texture: Math.max(
        isCounter(inserted.texture) ? inserted.texture : 0,
        highestId(modifiers, 'texture'),
      ),
    },
    view:
      isFiniteNumber(view.x) && isFiniteNumber(view.y) && isFiniteNumber(view.zoom) && view.zoom > 0
        ? { x: view.x, y: view.y, zoom: view.zoom }
        : null,
  }
}

/** The autosaved canvas (empty if none). */
export function loadCanvasDocument(): CanvasDocument {
  return parseCanvasDocument(readSaved('canvas'))
}

/**
 * The canvas as it's autosaved: pattern images (data URLs of up to hundreds of KB) are stored
 * once each, apart (state/persist storeBlob), and referred to, so the document itself stays
 * small and every autosave (a pan, a slider) writes a few KB rather than every image again.
 * Images no longer used are removed.
 */
export function storeCanvasDocument(doc: CanvasDocument): CanvasDocument {
  const refs = new Set<string>()
  const modifiers = doc.modifiers.map((node) => {
    if (node.kind !== 'pattern' || !node.params.image.startsWith('data:')) return node
    const image = storeBlob(node.params.image)
    if (image.startsWith(BLOB_PREFIX)) refs.add(image)
    return { ...node, params: { ...node.params, image } }
  })
  pruneBlobs(refs)
  return { ...doc, modifiers }
}
