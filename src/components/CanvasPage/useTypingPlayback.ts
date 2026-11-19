import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ModifierNode } from './graph'

const DEFAULT_SPEED = 8 // characters per second
interface Playback {
  text: string
  count: number
}

/** Session-only typing previews. The document and the text editor always retain the source. */
export function useTypingPlayback(nodes: readonly ModifierNode[]) {
  const [speeds, setSpeeds] = useState<Record<string, number>>({})
  const [playing, setPlaying] = useState<Record<string, Playback>>({})
  const setSpeed = useCallback((id: string, speed: number) => {
    if (Number.isFinite(speed))
      setSpeeds((current) => ({ ...current, [id]: Math.max(1, Math.min(60, speed)) }))
  }, [])
  const toggle = useCallback((id: string, text: string) => {
    setPlaying((current) => {
      const next = { ...current }
      if (next[id]) delete next[id]
      else if (text) next[id] = { text, count: 0 }
      return next
    })
  }, [])

  const stop = useCallback((id: string) => {
    setPlaying((current) => {
      if (!current[id]) return current
      const next = { ...current }
      delete next[id]
      return next
    })
  }, [])

  // Cancel on edits/deletion, including undo and document replacement.
  useEffect(() => {
    // Discard invalid sessions, rather than allowing undo to resurrect an old preview.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlaying((current) => {
      const next = { ...current }
      let changed = false
      for (const [id, playback] of Object.entries(current)) {
        const node = nodes.find((item) => item.id === id)
        if (!node || node.kind !== 'text' || node.params.text !== playback.text) {
          delete next[id]
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [nodes])

  const playingIds = Object.keys(playing).sort().join('\0')
  useEffect(() => {
    const timers = (playingIds ? playingIds.split('\0') : []).map((id) =>
      window.setInterval(
        () => {
          setPlaying((current) => {
            const playback = current[id]
            if (!playback) return current
            const next = { ...current }
            if (playback.count + 1 >= Array.from(playback.text).length) delete next[id]
            else next[id] = { ...playback, count: playback.count + 1 }
            return next
          })
        },
        1000 / (speeds[id] ?? DEFAULT_SPEED),
      ),
    )
    return () => timers.forEach(window.clearInterval)
  }, [playingIds, speeds])

  const previewNodes = useMemo(
    () =>
      nodes.map((node) => {
        const playback = playing[node.id]
        return node.kind === 'text' && playback && playback.text === node.params.text
          ? {
              ...node,
              params: { text: Array.from(playback.text).slice(0, playback.count).join('') },
            }
          : node
      }),
    [nodes, playing],
  )
  return { speeds, playing, setSpeed, toggle, stop, previewNodes, defaultSpeed: DEFAULT_SPEED }
}
