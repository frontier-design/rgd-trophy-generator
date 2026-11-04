// jsdom can't run Theatre.js Studio. Tests that render the whole App replace timeline/ with
// this stub (a static timeline: nothing animated, values are what was last set):
//   vi.mock('../../src/timeline', () => import('../support/timelineStub'))
import type { DockRect, Timeline } from '../../src/timeline'
import { leafAt, type TimelineValues } from '../../src/timeline/params'

export * from '../../src/timeline/params'

export const exportTimelineState = () => null

export function getTimeline(defaults: TimelineValues): Timeline {
  let values: TimelineValues = structuredClone(defaults)
  return {
    ready: Promise.resolve(),
    values: () => values,
    onValues: () => () => {},
    set(changes) {
      values = structuredClone(values)
      for (const [path, value] of changes) {
        const keys = path.split('.')
        const last = keys.pop() as string
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const parent = keys.reduce((node: any, key) => node[key], values)
        parent[last] = value
      }
    },
    keyframeState: () => 'static',
    toggleKeyframe: (path) => void leafAt(values, path),
    setKeyframes: () => {},
    setStatic(changes) {
      this.set(changes)
    },
    onKeyframes: () => () => {},
    position: 0,
    seek: () => {},
    onPosition: () => () => {},
    length: 10,
    setLength: () => {},
    onLength: () => () => {},
    playing: false,
    play: () => {},
    pause: () => {},
    onPlaying: () => () => {},
    dock: (_rect: DockRect) => {},
    setStudioVisible: () => {},
  }
}
