import { useEffect, useRef, useState, type RefObject } from 'react'
import { normalizeRect, rectanglesIntersect } from './selection'
import type { FrameRect } from './sceneNode'

const EXCLUDED =
  '[data-scene-node], [data-composition-node], [data-repeat-node], [data-canvas-node], [data-scene-controls], [data-no-pan], .context-menu, input, textarea, button, select, a'

type Props = {
  canvasRef: RefObject<HTMLElement | null>
  onSelect: (ids: string[]) => void
  onClear: () => void
}

/** Mount inside the positioned canvas, outside its transformed content. */
export function SelectionMarquee({ canvasRef, onSelect, onClear }: Props) {
  const callbacks = useRef({ onSelect, onClear })
  const [rect, setRect] = useState<FrameRect | null>(null)
  useEffect(() => {
    callbacks.current = { onSelect, onClear }
  }, [onSelect, onClear])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let gesture: {
      id: number
      shift: boolean
      x: number
      y: number
      lastX: number
      lastY: number
      moved: boolean
    } | null = null
    let frame: number | null = null
    const cancel = () => {
      const previous = gesture
      gesture = null
      if (frame !== null) cancelAnimationFrame(frame)
      frame = null
      setRect(null)
      if (previous?.shift) {
        try {
          canvas.releasePointerCapture(previous.id)
        } catch {
          /* Pointer may already be released. */
        }
      }
    }
    const down = (event: PointerEvent) => {
      if (
        gesture ||
        event.button !== 0 ||
        !(event.target instanceof Element) ||
        event.target.closest(EXCLUDED)
      )
        return
      gesture = {
        id: event.pointerId,
        shift: event.shiftKey,
        x: event.clientX,
        y: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        moved: false,
      }
      if (!gesture.shift) return
      event.preventDefault()
      event.stopPropagation()
      try {
        canvas.setPointerCapture(event.pointerId)
      } catch {
        /* Capture can fail for synthetic events. */
      }
      const bounds = canvas.getBoundingClientRect()
      setRect({
        x: event.clientX - bounds.left + canvas.scrollLeft,
        y: event.clientY - bounds.top + canvas.scrollTop,
        width: 0,
        height: 0,
      })
    }
    const move = (event: PointerEvent) => {
      if (!gesture || event.pointerId !== gesture.id) return
      gesture.lastX = event.clientX
      gesture.lastY = event.clientY
      if (Math.hypot(gesture.lastX - gesture.x, gesture.lastY - gesture.y) > 3) gesture.moved = true
      if (!gesture.shift || frame !== null) return
      frame = requestAnimationFrame(() => {
        frame = null
        if (!gesture) return
        const bounds = canvas.getBoundingClientRect()
        setRect(
          normalizeRect({
            x: gesture.x - bounds.left + canvas.scrollLeft,
            y: gesture.y - bounds.top + canvas.scrollTop,
            width: gesture.lastX - gesture.x,
            height: gesture.lastY - gesture.y,
          }),
        )
      })
    }
    const up = (event: PointerEvent) => {
      if (!gesture || event.pointerId !== gesture.id) return
      const current = gesture
      if (current.shift) {
        const area = normalizeRect({
          x: current.x,
          y: current.y,
          width: current.lastX - current.x,
          height: current.lastY - current.y,
        })
        const ids = new Set<string>()
        canvas
          .querySelectorAll<HTMLElement>(
            '[data-scene-node], [data-composition-node], [data-repeat-node], [data-canvas-node]',
          )
          .forEach((wrapper) => {
            const id = wrapper.dataset.sceneId ?? wrapper.dataset.nodeId
            const target = wrapper.hasAttribute('data-canvas-node')
              ? wrapper.querySelector<HTMLElement>('.node-card')
              : wrapper
            if (!id || !target) return
            const bounds = target.getBoundingClientRect()
            if (
              rectanglesIntersect(area, {
                x: bounds.left,
                y: bounds.top,
                width: bounds.width,
                height: bounds.height,
              })
            )
              ids.add(id)
          })
        cancel()
        callbacks.current.onSelect([...ids])
      } else {
        // Some pointerup events omit coordinates; movement samples remain authoritative.
        cancel()
        if (!current.moved) callbacks.current.onClear()
      }
    }
    const pointerCancel = (event: PointerEvent) => {
      if (gesture?.id === event.pointerId) cancel()
    }
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && gesture) cancel()
    }
    canvas.addEventListener('pointerdown', down, true)
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', pointerCancel, true)
    canvas.addEventListener('lostpointercapture', pointerCancel, true)
    window.addEventListener('blur', cancel)
    window.addEventListener('keydown', keydown, true)
    return () => {
      cancel()
      canvas.removeEventListener('pointerdown', down, true)
      window.removeEventListener('pointermove', move, true)
      window.removeEventListener('pointerup', up, true)
      window.removeEventListener('pointercancel', pointerCancel, true)
      canvas.removeEventListener('lostpointercapture', pointerCancel, true)
      window.removeEventListener('blur', cancel)
      window.removeEventListener('keydown', keydown, true)
    }
  }, [canvasRef])

  return (
    rect && (
      <div
        aria-label="Selection rectangle"
        style={{
          position: 'absolute',
          pointerEvents: 'none',
          left: rect.x,
          top: rect.y,
          width: rect.width,
          height: rect.height,
          border: '1px solid #4a90e2',
          background: 'rgba(74, 144, 226, 0.15)',
          zIndex: 1000,
        }}
      />
    )
  )
}
