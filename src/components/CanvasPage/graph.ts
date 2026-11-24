import type { HeightMap, SolidPattern } from '../../render3d'
import { animatedParams, animates, type ParamAnims, type TextTiming } from './paramAnim'
import { ARTBOARD, DEFAULT_MATERIAL, DEFAULT_SETTINGS, DEFAULT_SCENE_PARAMS } from '../../state'
import { FULL_CROP } from '../../pattern'
import { lineTracking, linesFromText, textMask, textOf, type TextParams } from './textLines'
import type {
  EtchParams,
  PatternParams,
  TextureParams,
  TwistParams,
  MaterialSettings,
  AnimatedParams,
} from '../../types'

/** A node on the canvas that changes the scenes its output links to: where it sits. */
interface ModifierBase {
  id: string
  name: string
  /** Its top-left on the canvas (canvas px). */
  x: number
  y: number
  /** Folded to its header (its fields hidden). */
  collapsed?: boolean
  /** Its animated properties (sliders following a text line's typing, `paramAnim.ts`). */
  anims?: ParamAnims
}

/** Twist: flutes around the trophy (its settings are the sliders on the node). */
export interface TwistNode extends ModifierBase {
  kind: 'twist'
  params: TwistParams
}

/** Etch: a strip of engraved lines on the trophy. */
export interface EtchNode extends ModifierBase {
  kind: 'etch'
  params: EtchParams
}

/** Pattern: ornament on a strip, generated from an image (WFC) or the image repeated. */
export interface PatternNode extends ModifierBase {
  kind: 'pattern'
  params: PatternParams
}

/** Texture: a rough finish (noise, dents or streaks) over the trophy. */
export interface TextureNode extends ModifierBase {
  kind: 'texture'
  params: TextureParams
}

export type ShapeParams = Pick<
  AnimatedParams,
  'roundTop' | 'topRadius' | 'taper' | 'lineBox' | 'smoothJoins' | 'joinRadius' | 'overshoot'
>

export interface ShapeNode extends ModifierBase {
  kind: 'shape'
  params: ShapeParams
}

export interface MaterialNode extends ModifierBase {
  kind: 'material'
  params: MaterialSettings
}

/** The key light and highlight (lit shading), as on the scene panel's old lighting section. */
export type LightingParams = Pick<
  MaterialSettings,
  'lightAngle' | 'lightHeight' | 'ambient' | 'softness' | 'highlight' | 'highlightSize'
>
export const LIGHTING_KEYS = [
  'lightAngle',
  'lightHeight',
  'ambient',
  'softness',
  'highlight',
  'highlightSize',
] as const satisfies readonly (keyof LightingParams)[]

/** Lighting: overrides the lighting of the scenes it links to (the last linked one wins). */
export interface LightingNode extends ModifierBase {
  kind: 'lighting'
  params: LightingParams
}

/** A new lighting node: the default key light (side-on from the right, a little above). */
export const DEFAULT_LIGHTING: LightingParams = {
  lightAngle: DEFAULT_MATERIAL.lightAngle,
  lightHeight: DEFAULT_MATERIAL.lightHeight,
  ambient: DEFAULT_MATERIAL.ambient,
  softness: DEFAULT_MATERIAL.softness,
  highlight: DEFAULT_MATERIAL.highlight,
  highlightSize: DEFAULT_MATERIAL.highlightSize,
}

/** The material a scene draws with: a linked material node's in place of its own, then a
 *  linked lighting node's lighting, or else the scene's own (lighting stays per scene). */
export function sceneMaterial(
  own: MaterialSettings,
  linked: { material?: MaterialSettings; lighting?: LightingParams },
): MaterialSettings {
  if (!linked.material && !linked.lighting) return own
  const lighting = linked.lighting ?? own
  const material = { ...(linked.material ?? own) }
  for (const key of LIGHTING_KEYS) material[key] = lighting[key]
  return material
}

/** Text: the wording of the scenes it links to, line by line (each line with its own
 *  typing speed and tracking). */
export interface TextNode extends ModifierBase {
  kind: 'text'
  params: TextParams
}

export type ModifierNode =
  | TwistNode
  | EtchNode
  | PatternNode
  | TextureNode
  | MaterialNode
  | LightingNode
  | TextNode
  | ShapeNode
export type ModifierKind = ModifierNode['kind']
export const MODIFIER_KINDS: readonly ModifierKind[] = [
  'shape',
  'twist',
  'etch',
  'pattern',
  'texture',
  'material',
  'lighting',
  'text',
]

/** A link from a node's output to a scene's input. */
export interface NodeLink {
  from: string
  to: string
  muted?: boolean
}

/** A new twist (tuned to how twists get used): many shallow, straight lobes on a band in
 *  the lower body. */
export const DEFAULT_TWIST: TwistParams = {
  flutes: 32,
  depth: 1.5,
  twist: 0,
  sharpness: 50,
  rotate: 0,
  from: 55,
  to: 70,
  ends: 'fade',
  endSize: 0,
  curve: 0,
  section: 'lobes',
}

/** A new etch (tuned to how etches get used): rings of two bold cut lines, two bundles
 *  across a band in the lower body. */
export const DEFAULT_ETCH: EtchParams = {
  from: 55,
  to: 75,
  bundles: 2,
  lines: 2,
  gap: 4,
  width: 5.2,
  slant: 90,
  cross: true,
  style: 'cut',
  strength: 45,
  layout: 'horizontal',
  waves: 3,
  fade: 10,
  depthTop: 100,
  depthBottom: 100,
}

/** The pattern node's starting image (the scrollwork border it was designed with). */
export const SAMPLE_IMAGE = '/images/ornament-sample.png'

/** A new pattern (tuned to how patterns get used): the sample image repeated around a band
 *  in the lower body, following the surface, every other repeat mirrored (seamless), raised,
 *  with crisp band edges (no fade). */
export const DEFAULT_PATTERN: PatternParams = {
  image: SAMPLE_IMAGE,
  crop: FULL_CROP,
  mode: 'repeat',
  from: 60,
  to: 70,
  repeats: 3,
  scale: 100,
  angle: 0,
  spin: 0,
  mapping: 'surface',
  shapeScale: 100,
  detail: 16,
  length: 40,
  size: 3,
  symmetry: 'mirror',
  fold: 'around',
  seed: 1,
  threshold: 45,
  invert: false,
  softness: 1,
  fade: 0,
  depthTop: 100,
  depthBottom: 100,
  style: 'raised',
  strength: 60,
}

/** A new texture: a fine, cast-metal roughness over the whole trophy. */
export const DEFAULT_TEXTURE: TextureParams = {
  style: 'rough',
  scale: 6,
  strength: 40,
  angle: 0,
  seed: 1,
  from: 0,
  to: 100,
  fade: 0,
  depthTop: 100,
  depthBottom: 100,
}

export const DEFAULT_SHAPE: ShapeParams = {
  roundTop: true,
  topRadius: 200,
  taper: DEFAULT_SCENE_PARAMS.taper,
  lineBox: { ...DEFAULT_SCENE_PARAMS.lineBox },
  smoothJoins: DEFAULT_SCENE_PARAMS.smoothJoins,
  joinRadius: DEFAULT_SCENE_PARAMS.joinRadius,
  overshoot: DEFAULT_SCENE_PARAMS.overshoot,
}

/** Node cards' size at full scale (px): their width, and their header's height (the output
 *  port sits at its right end). */
export const NODE_CARD = { width: 260, header: 34 }

/** The kinds whose header shows a preview of what they draw. */
export const PREVIEW_KINDS: ReadonlySet<string> = new Set(['twist', 'etch', 'pattern'])
/** Cards are full size on screen down to this zoom; zoomed out further, they shrink with the
 *  canvas (so they don't cover the scenes). */
export const CARD_FULL_ZOOM = 0.5
/** Below this on-screen scale a card shows only its header (lighter, out of the way). */
export const CARD_COMPACT_SCALE = 0.4
/** Cards never get smaller than this on screen, so their names stay legible. */
export const CARD_MIN_SCALE = 0.3

/** A card's on-screen scale at a zoom: 1 down to CARD_FULL_ZOOM, then with the canvas (to
 *  CARD_MIN_SCALE). */
export function cardScale(zoom: number): number {
  return Math.min(1, Math.max(CARD_MIN_SCALE, zoom / CARD_FULL_ZOOM))
}

/** A new node of a kind, with its defaults. */
export function createModifier(
  kind: ModifierKind,
  id: string,
  name: string,
  x: number,
  y: number,
): ModifierNode {
  switch (kind) {
    case 'shape':
      return {
        kind,
        id,
        name,
        x,
        y,
        params: { ...DEFAULT_SHAPE, lineBox: { ...DEFAULT_SHAPE.lineBox } },
      }
    case 'twist':
      return { kind, id, name, x, y, params: DEFAULT_TWIST }
    case 'etch':
      return { kind, id, name, x, y, params: DEFAULT_ETCH }
    case 'pattern':
      return { kind, id, name, x, y, params: DEFAULT_PATTERN }
    case 'texture':
      return { kind, id, name, x, y, params: DEFAULT_TEXTURE }
    case 'text':
      return { kind, id, name, x, y, params: { lines: linesFromText(DEFAULT_SETTINGS.text) } }
    case 'lighting':
      return { kind, id, name, x, y, params: DEFAULT_LIGHTING }
    case 'material':
      return {
        kind,
        id,
        name,
        x,
        y,
        params: { ...DEFAULT_MATERIAL, customColors: [...DEFAULT_MATERIAL.customColors] },
      }
  }
}

/** Where a node's output port is (canvas px): its header's right end, at the card's scale. */
export function outputPort(node: { x: number; y: number }, zoom: number) {
  const size = cardScale(zoom) / zoom
  return { x: node.x + NODE_CARD.width * size, y: node.y + (NODE_CARD.header / 2) * size }
}

/** How far down a scene's left side its input port sits (a share of its height): above the
 *  middle, which is the left resize handle's. */
export const INPUT_PORT_AT = 0.25

/** Where a scene's input port is (canvas px): a quarter of the way down its left side. */
export function inputPort(scene: { x: number; y: number; frame?: { height: number } }) {
  return { x: scene.x, y: scene.y + (scene.frame?.height ?? ARTBOARD.height) * INPUT_PORT_AT }
}

/** A link's curve from an output to an input: leaving rightward, arriving from the left. */
export function linkPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  zoom: number,
): string {
  const handle = Math.max(60 / zoom, Math.abs(to.x - from.x) / 2)
  return `M ${from.x} ${from.y} C ${from.x + handle} ${from.y}, ${to.x - handle} ${to.y}, ${to.x} ${to.y}`
}

/**
 * Where a link dropped short is headed: the first of `targets` hit by the ray from the
 * outlet (`from`) through the drop point (`through`), going on past it. Null if the ray
 * misses them all (or the drop is on the outlet itself). Targets the outlet is over (a card
 * on top of a scene) are skipped.
 */
export function rayTarget(
  from: { x: number; y: number },
  through: { x: number; y: number },
  targets: readonly { id: string; x: number; y: number; width: number; height: number }[],
): string | null {
  const dx = through.x - from.x
  const dy = through.y - from.y
  if (Math.hypot(dx, dy) < 1e-6) return null
  let best: { id: string; t: number } | null = null
  for (const rect of targets) {
    // Not one the outlet sits over (a card on top of a scene): drop on its port instead.
    const inside =
      from.x >= rect.x &&
      from.x <= rect.x + rect.width &&
      from.y >= rect.y &&
      from.y <= rect.y + rect.height
    if (inside) continue
    // Slab test: the ray's parameter range inside the rect on each axis.
    let near = 0
    let far = Infinity
    for (const [origin, dir, min, max] of [
      [from.x, dx, rect.x, rect.x + rect.width],
      [from.y, dy, rect.y, rect.y + rect.height],
    ] as const) {
      if (Math.abs(dir) < 1e-12) {
        if (origin < min || origin > max) near = Infinity
        continue
      }
      const t1 = (min - origin) / dir
      const t2 = (max - origin) / dir
      near = Math.max(near, Math.min(t1, t2))
      far = Math.min(far, Math.max(t1, t2))
    }
    if (near <= far && (!best || near < best.t)) best = { id: rect.id, t: near }
  }
  return best?.id ?? null
}

/** `links` with from → to added (once). */
export function connect(links: readonly NodeLink[], from: string, to: string): NodeLink[] {
  if (links.some((link) => link.from === from && link.to === to)) return [...links]
  return [...links, { from, to }]
}

/** What's linked into a scene, by kind, in the order they were linked (patterns once their
 *  map is ready). */
export interface SceneModifiers {
  twists: TwistParams[]
  etches: EtchParams[]
  textures: TextureParams[]
  patterns: SolidPattern[]
  /** Anything linked at all (patterns still generating included). */
  linked: boolean
  material?: MaterialSettings
  shape?: ShapeParams
  /** A linked lighting node's (the last linked one wins). */
  lighting?: LightingParams
  /** The last linked text node wins. */
  text?: string
  /** Its lines' tracking (thousandths of an em), when any line is tracked. */
  lineTracking?: number[]
  /** Its type size (px) and line height (× size), where it sets them. */
  textType?: { fontSize?: number; leading?: number }
  /** The text node masks the trophy to its typing: characters typed of all of them. */
  mask?: { typed: number; total: number }
}

/** Each linked scene's modifiers; `maps` holds the pattern nodes' height maps by id. */
/** Where each scene's text animation is (its last linked text node's timed preview), for
 *  nodes' animated properties; a scene that's at rest has none. */
function sceneTimings(
  links: readonly NodeLink[],
  byId: ReadonlyMap<string, ModifierNode>,
): Map<string, TextTiming | null> {
  const out = new Map<string, TextTiming | null>()
  for (const link of links) {
    if (link.muted) continue
    const node = byId.get(link.from)
    if (node?.kind !== 'text') continue
    const progress = node.params.progress
    out.set(
      link.to,
      progress?.time !== undefined && progress.lines
        ? { time: progress.time, lines: progress.lines, deletes: progress.deletes }
        : null,
    )
  }
  return out
}

// Animated params, kept per node params, animations and time, so a scene at rest (or
// unchanged) keeps the same objects and doesn't re-render.
const animatedCache = new WeakMap<object, WeakMap<object, Map<string, object>>>()

/** A node's params as a scene sees them now (animated properties at their values). */
function sceneParams<T extends ModifierNode>(node: T, timing: TextTiming | null): T['params'] {
  const anims = node.anims
  if (!animates(anims)) return node.params
  const byAnims = animatedCache.get(node.params) ?? new WeakMap<object, Map<string, object>>()
  animatedCache.set(node.params, byAnims)
  const byTime = byAnims.get(anims!) ?? new Map<string, object>()
  byAnims.set(anims!, byTime)
  const key = timing
    ? [
        timing.time,
        ...[...timing.lines, ...(timing.deletes ?? [])].map((w) => `${w.start},${w.end}`),
      ].join('|')
    : ''
  const cached = byTime.get(key)
  if (cached) return cached as T['params']
  const value = animatedParams(node.params, anims, timing)
  // A few times per node at most (the time moves on): keep the latest.
  if (byTime.size > 8) byTime.clear()
  byTime.set(key, value)
  return value
}

export function modifiersByScene(
  links: readonly NodeLink[],
  nodes: readonly ModifierNode[],
  maps: ReadonlyMap<string, HeightMap> = new Map(),
): Map<string, SceneModifiers> {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const timings = sceneTimings(links, byId)
  const out = new Map<string, SceneModifiers>()
  for (const link of links) {
    if (link.muted) continue
    const found = byId.get(link.from)
    if (!found) continue
    const node = {
      ...found,
      params: sceneParams(found, timings.get(link.to) ?? null),
    } as ModifierNode
    const current: SceneModifiers = out.get(link.to) ?? {
      twists: [],
      etches: [],
      textures: [],
      patterns: [],
      linked: true,
    }
    if (node.kind === 'twist') current.twists = [...current.twists, node.params]
    else if (node.kind === 'etch') current.etches = [...current.etches, node.params]
    else if (node.kind === 'texture') current.textures = [...current.textures, node.params]
    else if (node.kind === 'shape') current.shape = node.params
    else if (node.kind === 'material') current.material = node.params
    else if (node.kind === 'lighting') current.lighting = node.params
    else if (node.kind === 'text') {
      current.text = textOf(node.params.lines)
      current.lineTracking = lineTracking(node.params.lines)
      current.mask = textMask(node.params) ?? undefined
      const { fontSize, leading } = node.params
      current.textType =
        fontSize !== undefined || leading !== undefined ? { fontSize, leading } : undefined
    } else {
      const map = maps.get(node.id)
      if (map) current.patterns = [...current.patterns, { map, params: node.params }]
    }
    out.set(link.to, current)
  }
  return out
}

/** A workspace-local resolver. Inputs must be updated immutably: params and height maps
 *  are compared by identity. Card presentation and unrelated nodes/maps are ignored. */
export function createSceneModifiersResolver() {
  type Input = { id: string; kind: ModifierKind; params: ModifierNode['params']; map?: HeightMap }
  let previous = new Map<string, SceneModifiers>()
  let previousInputs = new Map<string, Input[]>()

  return (
    links: readonly NodeLink[],
    nodes: readonly ModifierNode[],
    maps: ReadonlyMap<string, HeightMap> = new Map(),
  ): Map<string, SceneModifiers> => {
    const byId = new Map(nodes.map((node) => [node.id, node]))
    const timings = sceneTimings(links, byId)
    const inputs = new Map<string, Input[]>()
    const sceneLinks = new Map<string, NodeLink[]>()
    for (const link of links) {
      if (link.muted) continue
      const node = byId.get(link.from)
      if (!node) continue
      const entries = inputs.get(link.to) ?? []
      entries.push({
        id: node.id,
        kind: node.kind,
        params: sceneParams(node, timings.get(link.to) ?? null),
        map: node.kind === 'pattern' ? maps.get(node.id) : undefined,
      })
      inputs.set(link.to, entries)
      const groupedLinks = sceneLinks.get(link.to) ?? []
      groupedLinks.push(link)
      sceneLinks.set(link.to, groupedLinks)
    }
    const next = new Map<string, SceneModifiers>()
    for (const [scene, entries] of inputs) {
      const old = previousInputs.get(scene)
      const unchanged =
        old?.length === entries.length &&
        entries.every((entry, i) => {
          const prior = old[i]!
          return (
            entry.id === prior.id &&
            entry.kind === prior.kind &&
            entry.params === prior.params &&
            entry.map === prior.map
          )
        })
      const resolved = unchanged ? previous.get(scene) : undefined
      next.set(scene, resolved ?? modifiersByScene(sceneLinks.get(scene)!, nodes, maps).get(scene)!)
    }
    const priorEntries = [...previous]
    const same =
      next.size === previous.size &&
      [...next].every(([scene, value], i) => {
        const prior = priorEntries[i]
        return prior?.[0] === scene && prior[1] === value
      })
    previousInputs = inputs
    if (!same) previous = next
    return previous
  }
}
