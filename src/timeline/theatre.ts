import { getProject, onChange, types, val, type ISheetObject } from '@theatre/core'
import { prism } from '@theatre/dataverse'
import studioModule, { type IScrub, type IStudio } from '@theatre/studio'
import { PALETTE_NAMES } from '../material'
import type { KeyframeState } from '../types'
import {
  COLOR_KEYS,
  leafAt,
  PARAM_PATHS,
  type ParamPath,
  type TimelineLeaf,
  type TimelineValues,
} from './params'
import {
  deleteKeyframes,
  linearTweens,
  makeStatic,
  placePanel,
  sequenceProp,
  unpinSidePanels,
} from './studioPrivate'

// @theatre/studio is a CommonJS bundle: depending on the bundler's interop, its default
// import is the studio itself or the module object holding it under `default`.
const studio: IStudio = (studioModule as unknown as { default?: IStudio }).default ?? studioModule

const PROJECT_ID = 'RGD Generator'
const SHEET_ID = 'Trophy'
const OBJECT_KEY = 'trophy'
/** Sidebar edits within this long of each other become one undo step (ms). */
const EDIT_COMMIT_DELAY = 400

/** The playhead's area of the timeline, as a window rect (for docking the sequence editor). */
export interface DockRect {
  left: number
  top: number
  right: number
  bottom: number
}

/**
 * The animation timeline: a Theatre.js sheet with one object whose props are every
 * animatable parameter, plus Studio's sequence editor as the keyframe UI. The app stays the
 * source of its own state: it pushes sidebar edits in with `set` and applies the values
 * `onValues` reports (the playhead's values while scrubbing or playing).
 */
export interface Timeline {
  /** Resolves once Theatre has loaded the saved project (values may change then). */
  readonly ready: Promise<void>
  /** The props' values at the playhead. */
  values(): TimelineValues
  onValues(fn: (values: TimelineValues) => void): () => void
  /** Push edited props. Animated props get a keyframe at the playhead (Theatre's rule). */
  set(changes: ReadonlyArray<readonly [ParamPath, TimelineLeaf]>): void
  keyframeState(path: ParamPath): KeyframeState
  /** Add a keyframe at the playhead with the current value (animating the prop if it
   *  isn't yet), or remove the one that's there. */
  toggleKeyframe(path: ParamPath): void
  /** Replace a prop's keyframes with these [seconds, value] pairs (animating it), with
   *  linear tweens between them. Set the length first: the playhead can't go past it. */
  setKeyframes(path: ParamPath, keyframes: ReadonlyArray<readonly [number, TimelineLeaf]>): void
  /** Make props static with these values, dropping any keyframes. */
  setStatic(changes: ReadonlyArray<readonly [ParamPath, TimelineLeaf]>): void
  /** Called whenever any prop's keyframes change (added, moved, deleted). */
  onKeyframes(fn: () => void): () => void
  readonly position: number
  /** Move the playhead (seconds). Values update synchronously (`values()`). */
  seek(seconds: number): void
  onPosition(fn: (seconds: number) => void): () => void
  readonly length: number
  setLength(seconds: number): void
  onLength(fn: (seconds: number) => void): () => void
  readonly playing: boolean
  /** Play from the playhead; with `loop`, round and round until paused. */
  play(loop?: boolean): void
  pause(): void
  onPlaying(fn: (playing: boolean) => void): () => void
  /** Dock Studio's sequence editor over this window rect. */
  dock(rect: DockRect): void
  /** Show or hide Studio's overlay (its toolbar and timeline), e.g. on another page. */
  setStudioVisible(visible: boolean): void
}

let timeline: Timeline | null = null

/**
 * The timeline's project state (keyframes, static values, length) as Theatre saves it, for
 * project files; null when the timeline hasn't been loaded this session (Theatre keeps its
 * own copy in the browser's storage either way).
 */
export function exportTimelineState(): Record<string, unknown> | null {
  if (!timeline) return null
  try {
    return studio.createContentOfSaveFile(PROJECT_ID)
  } catch {
    return null
  }
}

/** The app's timeline, created on first use (Theatre objects must be created once). */
export function getTimeline(defaults: TimelineValues): Timeline {
  timeline ??= createTimeline(defaults)
  return timeline
}

function createTimeline(defaults: TimelineValues): Timeline {
  studio.initialize()
  unpinSidePanels()
  const project = getProject(PROJECT_ID)
  const sheet = project.sheet(SHEET_ID)
  const sequence = sheet.sequence
  const object = sheet.object(OBJECT_KEY, theatreProps(defaults), {
    reconfigure: true,
  }) as unknown as ISheetObject
  // The sequence editor shows the selected object's tracks; keep ours selected.
  studio.setSelection([object])
  studio.onSelectionChange((selection) => {
    if (selection.length === 0) studio.setSelection([object])
  })

  const pointerAt = (path: ParamPath) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pointers are untyped proxies
    path.split('.').reduce((pointer: any, key) => pointer[key], object.props)

  // Sidebar edits go through one scrub until they pause, so a slider drag is one undo step.
  // A scrub replays all its edits on every capture, so keep them all.
  let scrub: IScrub | null = null
  const pending = new Map<ParamPath, TimelineLeaf>()
  let commitTimer: ReturnType<typeof setTimeout> | undefined
  const commit = () => {
    clearTimeout(commitTimer)
    scrub?.commit()
    scrub = null
    pending.clear()
  }

  const keyframesOf = (path: ParamPath) => sequence.__experimental_getKeyframes(pointerAt(path))

  return {
    ready: project.ready,
    values: () => object.value as unknown as TimelineValues,
    onValues: (fn) => object.onValuesChange((values) => fn(values as unknown as TimelineValues)),
    set(changes) {
      if (changes.length === 0) return
      for (const [path, value] of changes) pending.set(path, value)
      scrub ??= studio.scrub()
      scrub.capture(({ set }) => {
        for (const [path, value] of pending) set(pointerAt(path), value)
      })
      clearTimeout(commitTimer)
      commitTimer = setTimeout(commit, EDIT_COMMIT_DELAY)
    },
    keyframeState(path) {
      const keyframes = keyframesOf(path)
      if (keyframes.length === 0) return 'static'
      // Keyframes sit on the sequence's grid (1/subUnitsPerUnit s).
      const tolerance = 0.5 / val(sequence.pointer.subUnitsPerUnit)
      const at = sequence.position
      return keyframes.some((k) => Math.abs(k.position - at) < tolerance) ? 'key' : 'animated'
    },
    toggleKeyframe(path) {
      commit()
      const pointer = pointerAt(path)
      const state = this.keyframeState(path)
      if (state === 'key') {
        studio.transaction(({ unset }) => unset(pointer))
        return
      }
      const value = leafAt(this.values(), path)
      if (state === 'static' && !sequenceProp(object.address, path.split('.'))) return
      studio.transaction(({ set }) => set(pointer, value))
    },
    setKeyframes(path, keyframes) {
      commit()
      const pointer = pointerAt(path)
      const playhead = sequence.position
      deleteKeyframes(object.address, path.split('.'))
      if (keyframes.length > 0 && sequenceProp(object.address, path.split('.'))) {
        for (const [seconds, value] of keyframes) {
          sequence.position = seconds
          studio.transaction(({ set }) => set(pointer, value))
        }
        linearTweens(object.address, path.split('.'))
      }
      sequence.position = playhead
    },
    setStatic(changes) {
      commit()
      for (const [path, value] of changes) makeStatic(object.address, path.split('.'), value)
      // Now none are animated: setting them sets their static values.
      studio.transaction(({ set }) => {
        for (const [path, value] of changes) set(pointerAt(path), value)
      })
    },
    onKeyframes: (fn) =>
      onChange(
        prism(() => PARAM_PATHS.map(keyframesOf)),
        () => fn(),
      ),
    get position() {
      return sequence.position
    },
    seek(seconds) {
      sequence.position = seconds
    },
    onPosition: (fn) => onChange(sequence.pointer.position, fn),
    get length() {
      return val(sequence.pointer.length)
    },
    setLength(seconds) {
      studio.transaction(({ set }) => set(sequence.pointer.length, seconds))
    },
    onLength: (fn) => onChange(sequence.pointer.length, fn),
    get playing() {
      return val(sequence.pointer.playing)
    },
    play(loop = false) {
      commit()
      // From the start if the playhead is at the end.
      if (sequence.position >= val(sequence.pointer.length)) sequence.position = 0
      void sequence.play({ iterationCount: loop ? Infinity : 1 })
    },
    pause() {
      sequence.pause()
    },
    onPlaying: (fn) => onChange(sequence.pointer.playing, fn),
    dock({ left, top, right, bottom }) {
      const { innerWidth: width, innerHeight: height } = window
      if (!width || !height) return
      placePanel('sequenceEditor', {
        edges: {
          left: { from: 'screenLeft', distance: left / width },
          right: { from: 'screenRight', distance: (width - right) / width },
          top: { from: 'screenTop', distance: top / height },
          bottom: { from: 'screenBottom', distance: (height - bottom) / height },
        },
      })
    },
    setStudioVisible(visible) {
      if (visible) studio.ui.restore()
      else studio.ui.hide()
    },
  }
}

/** The Theatre object's props, with the app's defaults and the sidebar's ranges. */
function theatreProps(d: TimelineValues) {
  const num = (value: number, range: [number, number]) => types.number(value, { range })
  const m = d.material
  const l = d.lighting
  return {
    type: types.compound({
      size: num(d.type.size, [12, 300]),
      leading: num(d.type.leading, [0.7, 2.5]),
      reveal: num(d.type.reveal, [0, 100]),
      stagger: num(d.type.stagger, [0, 100]),
      slide: num(d.type.slide, [0, 200]),
      fill: num(d.type.fill, [0, 100]),
      style: types.stringLiteral(d.type.style, { stack: 'Stack', type: 'Type' }),
      order: types.stringLiteral(d.type.order, { bottom: 'Bottom first', top: 'Top first' }),
      align: types.stringLiteral(d.type.align, { left: 'Left', center: 'Center' }),
      scatter: num(d.type.scatter, [0, 100]),
      spacing: num(d.type.spacing, [0, 100]),
    }),
    shape: types.compound({
      edge: num(d.shape.edge, [100, 1200]),
      mirror: types.boolean(d.shape.mirror),
      overshoot: num(d.shape.overshoot, [0, 120]),
    }),
    top: types.compound({
      height: num(d.top.height, [0, 1000]),
      roundTop: types.boolean(d.top.roundTop),
      radius: num(d.top.radius, [0, 200]),
      taper: num(d.top.taper, [0, 90]),
    }),
    lineBoxes: types.compound({
      padX: num(d.lineBoxes.padX, [-20, 100]),
      padY: num(d.lineBoxes.padY, [-20, 100]),
      radius: num(d.lineBoxes.radius, [0, 100]),
      smoothJoins: types.boolean(d.lineBoxes.smoothJoins),
      joinRadius: num(d.lineBoxes.joinRadius, [0, 100]),
    }),
    material: types.compound({
      shading: types.stringLiteral(m.shading, { lit: 'Lit', painted: 'Painted' }),
      palette: types.stringLiteral(
        m.palette,
        Object.fromEntries([...PALETTE_NAMES, 'custom'].map((name) => [name, name])),
      ),
      colors: types.compound(
        Object.fromEntries(COLOR_KEYS.map((key) => [key, types.rgba(m.colors[key])])),
      ),
      banding: num(m.banding, [0, 1]),
      offset: num(m.offset, [-0.5, 0.5]),
      scale: num(m.scale, [0.25, 3]),
      tilt: num(m.tilt, [-1, 1]),
      wobble: num(m.wobble, [0, 5]),
      edgeDepth: num(m.edgeDepth, [0, 1]),
      edgeHue: num(m.edgeHue, [-90, 90]),
      ledge: num(m.ledge, [0, 1]),
      grain: num(m.grain, [0, 1]),
      grainSize: num(m.grainSize, [0.25, 3]),
    }),
    lighting: types.compound({
      angle: num(l.angle, [-360, 360]),
      height: num(l.height, [0, 90]),
      ambient: num(l.ambient, [0, 1]),
      softness: num(l.softness, [0, 1]),
      highlight: num(l.highlight, [0, 1.5]),
      highlightSize: num(l.highlightSize, [0, 1]),
    }),
    canvas: types.compound({
      background: types.rgba(d.canvas.background),
      text: types.rgba(d.canvas.text),
    }),
    banner: types.compound({
      show: types.boolean(d.banner.show),
      reveal: num(d.banner.reveal, [0, 100]),
    }),
  }
}
