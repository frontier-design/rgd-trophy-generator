// Builds pattern maps off the main thread (WFC can take a moment): one job per message,
// answered with the same id. Used by hooks/usePatternMaps.
import type { Gray } from './grid'
import { buildPatternMap, type PatternMapParams } from './map'

export interface PatternJob {
  id: number
  sample: Gray
  params: PatternMapParams
}

export interface PatternJobResult {
  id: number
  map: Gray | null
  message: string
}

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<PatternJob>) => void) | null
  postMessage(message: PatternJobResult, transfer?: Transferable[]): void
}

scope.onmessage = (e) => {
  const { id, sample, params } = e.data
  const { map, message } = buildPatternMap(sample, params)
  scope.postMessage({ id, map, message }, map ? [map.data.buffer] : [])
}
