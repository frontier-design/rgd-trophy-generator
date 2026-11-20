import { useEffect, useRef, useState } from 'react'
import { imageToGray } from '../components/CanvasPage/patternImage'
import { buildPatternMap, type Gray, type PatternMapParams } from '../pattern'
import type { PatternJob, PatternJobResult } from '../pattern/worker'
import type { PatternParams } from '../types'

/** A pattern node's map as it's being made. */
export interface PatternStatus {
  /** The height map (the last good one while a new one is made); null until there is one. */
  map: Gray | null
  /** What was made, or why it couldn't be. */
  message: string
  busy: boolean
}

/** Changes settle this long (ms) before a map is rebuilt, so slider drags rebuild once. */
const DEBOUNCE = 150

/** The fields that change the map (the rest only change how it's laid on the trophy). */
function mapParams(p: PatternParams): PatternMapParams {
  const { mode, detail, length, size, symmetry, fold, seed, threshold, invert, softness, crop } =
    p
  return {
    mode,
    detail,
    length,
    size,
    symmetry,
    fold,
    seed,
    threshold,
    invert,
    softness,
    // The crop is part of the map: changing it rebuilds (viewer zoom/pan never do).
    crop,
  }
}

let jobCounter = 0

/** A short id per distinct image (stored images are long data URLs: comparing ids instead
 *  keeps this hook cheap on every render, e.g. while panning). */
const imageIds = new Map<string, number>()
function imageId(image: string): number {
  let id = imageIds.get(image)
  if (id === undefined) {
    id = imageIds.size + 1
    imageIds.set(image, id)
  }
  return id
}

/**
 * Each pattern node's height map, rebuilt when its image or map fields change: the image is
 * loaded (once per image), then the map is built in a worker (WFC can take a
 * moment), or right here where workers aren't available. A newer job supersedes an older one.
 */
export function usePatternMaps(
  nodes: ReadonlyArray<{ id: string; params: PatternParams }>,
): ReadonlyMap<string, PatternStatus> {
  const [statuses, setStatuses] = useState<ReadonlyMap<string, PatternStatus>>(() => new Map())
  const nodesRef = useRef(nodes)
  const latest = useRef(new Map<string, { key: string; job: number }>())
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const samples = useRef(new Map<string, Promise<Gray>>())
  const worker = useRef<Worker | null | undefined>(undefined)
  const waiting = useRef(new Map<number, (result: PatternJobResult) => void>())

  useEffect(() => {
    nodesRef.current = nodes
  })

  const signature = nodes
    .map(
      (node) =>
        `${node.id}:${imageId(node.params.image)}:${JSON.stringify(mapParams(node.params))}`,
    )
    .join('|')

  useEffect(() => {
    const update = (id: string, patch: Partial<PatternStatus>) =>
      setStatuses((current) => {
        const next = new Map(current)
        const previous = next.get(id) ?? { map: null, message: '', busy: false }
        next.set(id, { ...previous, ...patch })
        return next
      })

    const sampleOf = (image: string) => {
      let sample = samples.current.get(image)
      if (!sample) {
        sample = imageToGray(image)
        samples.current.set(image, sample)
        // A failed load can be retried (e.g. the same file picked again).
        sample.catch(() => samples.current.delete(image))
      }
      return sample
    }

    const build = (sample: Gray, params: PatternMapParams): Promise<PatternJobResult> => {
      const id = ++jobCounter
      if (worker.current === undefined) {
        worker.current =
          typeof Worker === 'undefined'
            ? null
            : new Worker(new URL('../pattern/worker.ts', import.meta.url), { type: 'module' })
        if (worker.current) {
          worker.current.onmessage = (e: MessageEvent<PatternJobResult>) => {
            waiting.current.get(e.data.id)?.(e.data)
            waiting.current.delete(e.data.id)
          }
        }
      }
      const current = worker.current
      if (!current) {
        // No workers here: build it on a later tick.
        return new Promise((resolve) =>
          setTimeout(() => resolve({ id, ...buildPatternMap(sample, params) }), 0),
        )
      }
      return new Promise((resolve) => {
        waiting.current.set(id, resolve)
        const job: PatternJob = { id, sample: { ...sample, data: sample.data.slice() }, params }
        current.postMessage(job, [job.sample.data.buffer])
      })
    }

    const ids = new Set<string>()
    for (const node of nodesRef.current) {
      ids.add(node.id)
      const params = mapParams(node.params)
      const key = `${imageId(node.params.image)}:${JSON.stringify(params)}`
      if (latest.current.get(node.id)?.key === key) continue
      const job = ++jobCounter
      latest.current.set(node.id, { key, job })
      update(node.id, { busy: true, message: 'generating…' })
      clearTimeout(timers.current.get(node.id))
      const image = node.params.image
      timers.current.set(
        node.id,
        setTimeout(async () => {
          const isLatest = () => latest.current.get(node.id)?.job === job
          try {
            const result = await build(await sampleOf(image), params)
            if (!isLatest()) return
            update(node.id, {
              busy: false,
              message: result.message,
              // A failure keeps the last good map on the trophy.
              ...(result.map ? { map: result.map } : {}),
            })
          } catch {
            if (isLatest()) update(node.id, { busy: false, message: "couldn't load the image" })
          }
        }, DEBOUNCE),
      )
    }
    // Forget nodes that are gone.
    for (const id of [...latest.current.keys()]) {
      if (ids.has(id)) continue
      latest.current.delete(id)
      clearTimeout(timers.current.get(id))
      setStatuses((current) => {
        if (!current.has(id)) return current
        const next = new Map(current)
        next.delete(id)
        return next
      })
    }
  }, [signature])

  // Stop the worker with the page (and forget pending jobs, so a remount, like StrictMode's,
  // schedules them again).
  useEffect(() => {
    const pending = timers.current
    const jobs = latest.current
    return () => {
      for (const timer of pending.values()) clearTimeout(timer)
      pending.clear()
      jobs.clear()
      worker.current?.terminate()
      worker.current = undefined
    }
  }, [])

  return statuses
}
