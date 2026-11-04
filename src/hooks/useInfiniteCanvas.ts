import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { observeSize } from '../components/observeSize'
import { zoomAt, type PanZoomView } from './usePanZoom'

/** Zoom limits for the infinite canvas. */
const ZOOM_RANGE = { min: 0.1, max: 8 }

/** Controls the mouse doesn't pan from. */
const INTERACTIVE = 'textarea, input, select, button, a, [data-no-pan]'
/** Elements that scroll themselves: the wheel scrolls them rather than the canvas. */
const OWN_WHEEL = '[data-own-wheel]'

export interface InfiniteCanvas {
  /** Where the canvas's origin is in the element (px) and its zoom. */
  view: PanZoomView
  /** The element's size (px). */
  size: { width: number; height: number }
  /** Back to the start: origin centered, 100%. */
  reset: () => void
}

/**
 * An endless canvas, Figma-style: dragging (or middle-dragging, anywhere) pans, the wheel or
 * a two-finger scroll moves around, and a trackpad pinch or ⌘/Ctrl + wheel zooms about the
 * cursor. Starts with the origin centered at 100%. Elements marked `data-no-pan` don't start
 * a pan (middle-drag still does); over `data-own-wheel` ones the wheel scrolls them.
 */
export function useInfiniteCanvas(
  elementRef: RefObject<HTMLElement | null>,
  /** Where to start (a saved view); by default the origin centered at 100%. */
  initialView: PanZoomView | null = null,
): InfiniteCanvas {
  const [view, setView] = useState<PanZoomView>(() => initialView ?? { x: 0, y: 0, zoom: 1 })
  const [size, setSize] = useState({ width: 0, height: 0 })
  const sizeRef = useRef(size)
  const centered = useRef(initialView !== null)

  const reset = useCallback(() => {
    const { width, height } = sizeRef.current
    setView({ x: width / 2, y: height / 2, zoom: 1 })
  }, [])

  useEffect(() => {
    const element = elementRef.current
    if (!element) return
    const stopObserving = observeSize(element, (width, height) => {
      sizeRef.current = { width, height }
      setSize({ width, height })
      // Center the origin the first time the canvas has a size.
      if (!centered.current && width > 0 && height > 0) {
        centered.current = true
        reset()
      }
    })

    const onWheel = (e: WheelEvent) => {
      // Over a panel that scrolls itself, the wheel scrolls it (a pinch there does nothing).
      if ((e.target as Element | null)?.closest(OWN_WHEEL)) {
        if (e.ctrlKey || e.metaKey) e.preventDefault()
        return
      }
      e.preventDefault()
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1
      if (e.ctrlKey || e.metaKey) {
        // A pinch arrives as ctrl + wheel with small deltas.
        const rect = element.getBoundingClientRect()
        const point = { x: e.clientX - rect.left, y: e.clientY - rect.top }
        const factor = Math.exp(-e.deltaY * unit * (e.ctrlKey ? 0.01 : 0.0015))
        setView((current) => zoomAt(current, factor, point, ZOOM_RANGE))
      } else {
        setView((current) => ({
          ...current,
          x: current.x - e.deltaX * unit,
          y: current.y - e.deltaY * unit,
        }))
      }
    }

    let pan: { id: number; x: number; y: number } | null = null
    const onPointerDown = (e: PointerEvent) => {
      const onControl = (e.target as Element | null)?.closest(INTERACTIVE)
      if (!(e.button === 1 || (e.button === 0 && !onControl))) return
      e.preventDefault()
      pan = { id: e.pointerId, x: e.clientX, y: e.clientY }
      element.setPointerCapture?.(e.pointerId)
      element.dataset.panning = 'on'
    }
    const onPointerMove = (e: PointerEvent) => {
      if (!pan || e.pointerId !== pan.id) return
      const dx = e.clientX - pan.x
      const dy = e.clientY - pan.y
      pan = { ...pan, x: e.clientX, y: e.clientY }
      setView((current) => ({ ...current, x: current.x + dx, y: current.y + dy }))
    }
    const onPointerUp = (e: PointerEvent) => {
      if (!pan || e.pointerId !== pan.id) return
      pan = null
      delete element.dataset.panning
    }

    element.addEventListener('wheel', onWheel, { passive: false })
    element.addEventListener('pointerdown', onPointerDown)
    element.addEventListener('pointermove', onPointerMove)
    element.addEventListener('pointerup', onPointerUp)
    element.addEventListener('pointercancel', onPointerUp)
    return () => {
      stopObserving()
      element.removeEventListener('wheel', onWheel)
      element.removeEventListener('pointerdown', onPointerDown)
      element.removeEventListener('pointermove', onPointerMove)
      element.removeEventListener('pointerup', onPointerUp)
      element.removeEventListener('pointercancel', onPointerUp)
    }
  }, [elementRef, reset])

  return { view, size, reset }
}
