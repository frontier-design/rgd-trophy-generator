import type { PanZoomView } from '../../hooks'
import {
  DEFAULT_BANNER_TEXT,
  DEFAULT_MATERIAL,
  DEFAULT_SCENE_PARAMS,
  DEFAULT_SETTINGS,
} from '../../state'
import { BLOB_PREFIX, loadBlob, pruneBlobs, readSaved, storeBlob } from '../../state/persist'
import {
  DEFAULT_ETCH,
  DEFAULT_PATTERN,
  SAMPLE_IMAGE,
  DEFAULT_TWIST,
  type ModifierNode,
  type NodeLink,
} from './graph'
import { DEFAULT_FRAME, DEFAULT_IMAGE_EXPORT, type SceneNode } from './sceneNode'

/** Everything on the canvas page, as autosaved and put in project files. */
export interface CanvasDocument {
  version: 1
  scenes: SceneNode[]
  /** Twist and etch nodes. */
  modifiers: ModifierNode[]
  links: NodeLink[]
  /** Nodes inserted so far of each kind (their names and ids continue from here). */
  inserted: { scene: number; twist: number; etch: number; pattern: number }
  /** Where the canvas was looking. */
  view: PanZoomView | null
}

export const EMPTY_CANVAS: CanvasDocument = {
  version: 1,
  scenes: [],
  modifiers: [],
  links: [],
  inserted: { scene: 0, twist: 0, etch: 0, pattern: 0 },
  view: null,
}

type Loose = Record<string, unknown>
const isObject = (value: unknown): value is Loose =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const asObject = (value: unknown): Loose => (isObject(value) ? value : {})
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

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
      material: { ...DEFAULT_MATERIAL, ...asObject(settings.material) },
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

/** A saved twist or etch node (saves from before etch have only twists, without a kind). */
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
      params: { ...DEFAULT_PATTERN, ...params, image: image ?? SAMPLE_IMAGE },
    } as ModifierNode
  }
  if (type === 'twist') {
    return { ...base, kind: 'twist', params: { ...DEFAULT_TWIST, ...params } } as ModifierNode
  }
  return null
}

/** The highest number ending an id (scene-3 → 3), 0 if none. */
function highestId(nodes: readonly { id: string }[], prefix: string): number {
  return Math.max(
    0,
    ...nodes
      .filter((node) => node.id.startsWith(prefix))
      .map((node) => Number(/(\d+)$/.exec(node.id)?.[1] ?? 0)),
  )
}

/** A saved canvas, checked and filled in with defaults; the empty canvas if it isn't one. */
export function parseCanvasDocument(value: unknown): CanvasDocument {
  if (!isObject(value)) return EMPTY_CANVAS
  const list = (key: string) => (Array.isArray(value[key]) ? (value[key] as unknown[]) : [])
  const scenes = list('scenes').flatMap((item) => parseScene(item) ?? [])
  const modifiers = [
    ...list('twists').flatMap((item) => parseModifier(item, 'twist') ?? []),
    ...list('modifiers').flatMap((item) => parseModifier(item) ?? []),
  ]
  const ids = new Set([...scenes, ...modifiers].map((node) => node.id))
  const links = list('links').flatMap((item) => {
    const link = asObject(item)
    return typeof link.from === 'string' &&
      typeof link.to === 'string' &&
      ids.has(link.from) &&
      ids.has(link.to)
      ? [{ from: link.from, to: link.to }]
      : []
  })
  const inserted = asObject(value.inserted)
  const view = asObject(value.view)
  return {
    version: 1,
    scenes,
    modifiers,
    links,
    // Never reuse an id: past every id's number.
    inserted: {
      scene: Math.max(
        isFiniteNumber(inserted.scene) ? inserted.scene : 0,
        highestId(scenes, 'scene'),
      ),
      twist: Math.max(
        isFiniteNumber(inserted.twist) ? inserted.twist : 0,
        highestId(modifiers, 'twist'),
      ),
      etch: Math.max(
        isFiniteNumber(inserted.etch) ? inserted.etch : 0,
        highestId(modifiers, 'etch'),
      ),
      pattern: Math.max(
        isFiniteNumber(inserted.pattern) ? inserted.pattern : 0,
        highestId(modifiers, 'pattern'),
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
