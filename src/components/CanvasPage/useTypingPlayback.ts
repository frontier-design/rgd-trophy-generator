import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ModifierNode, TextNode } from './graph'
import { textAt, textDuration, textOf, typedParams } from './textLines'

interface Playback {
  /** The text being typed (an edit to it cancels the playback). */
  text: string
  /** When it started (ms, Date.now). */
  start: number
  /** What has been typed so far. */
  typed: string
}

const textNode = (nodes: readonly ModifierNode[], id: string) =>
  nodes.find((node): node is TextNode => node.id === id && node.kind === 'text')

/**
 * Session-only typing previews: each line types at its own speed, one line after another.
 * The document and the text editor always keep the whole text; linked scenes see the typed
 * part (`previewNodes`). `seek` pins a node at a time instead (a record node rendering the
 * typing frame by frame, on its own clock).
 */
export function useTypingPlayback(nodes: readonly ModifierNode[]) {
  const [playing, setPlaying] = useState<Record<string, Playback>>({})
  // Seeked text nodes (a record node's render): each shows what's typed at its time (s),
  // over any live playback, until seeked back to null.
  const [seeked, setSeeked] = useState<Readonly<Record<string, number>>>({})
  const seek = useCallback((id: string, seconds: number | null) => {
    setSeeked((current) => {
      if (seconds === null) {
        if (!(id in current)) return current
        const next = { ...current }
        delete next[id]
        return next
      }
      return current[id] === seconds ? current : { ...current, [id]: seconds }
    })
  }, [])
  const nodesRef = useRef(nodes)
  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])

  const toggle = useCallback((id: string) => {
    setPlaying((current) => {
      const next = { ...current }
      const node = textNode(nodesRef.current, id)
      const text = node ? textOf(node.params.lines) : ''
      if (next[id]) delete next[id]
      else if (text) next[id] = { text, start: Date.now(), typed: '' }
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

  // Cancel on edits/deletion, including undo and document replacement. (Speed and tracking
  // changes carry on: the typing follows the lines' speeds as they are now.)
  useEffect(() => {
    // Discard invalid sessions, rather than allowing undo to resurrect an old preview.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlaying((current) => {
      const next = { ...current }
      let changed = false
      for (const [id, playback] of Object.entries(current)) {
        const node = textNode(nodes, id)
        if (!node || textOf(node.params.lines) !== playback.text) {
          delete next[id]
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [nodes])

  // One frame loop while anything plays; state changes only when a character appears.
  const active = Object.keys(playing).length > 0
  useEffect(() => {
    if (!active) return
    let frame = requestAnimationFrame(function tick() {
      setPlaying((current) => {
        let next: Record<string, Playback> | null = null
        for (const [id, playback] of Object.entries(current)) {
          const node = textNode(nodesRef.current, id)
          // The whole animation (typing, and deleting with backspace on), then done.
          const elapsed = (Date.now() - playback.start) / 1000
          const typed =
            node && elapsed < textDuration(node.params) ? textAt(node.params, elapsed) : null
          if (typed === playback.typed) continue
          next ??= { ...current }
          if (typed === null) delete next[id]
          else next[id] = { ...playback, typed }
        }
        return next ?? current
      })
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [active])

  const previewNodes = useMemo(
    () =>
      nodes.map((node) => {
        const at = seeked[node.id]
        if (node.kind === 'text' && at !== undefined) {
          const typed = textAt(node.params, at)
          return typed === textOf(node.params.lines)
            ? node
            : { ...node, params: typedParams(node.params, typed) }
        }
        const playback = playing[node.id]
        return node.kind === 'text' && playback && playback.text === textOf(node.params.lines)
          ? { ...node, params: typedParams(node.params, playback.typed) }
          : node
      }),
    [nodes, playing, seeked],
  )
  return { playing, toggle, stop, seek, previewNodes }
}
