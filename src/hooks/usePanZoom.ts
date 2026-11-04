import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { observeSize } from '../components/observeSize'

/** Where the frame is shown in the workspace: its top-left (px) and scale. */
export interface PanZoomView {
  x: number
  y: number
  zoom: number
}

interface Size {
  width: number
  height: number
}

/** Zoom limits, as multiples of the fitted zoom. */
const ZOOM_RANGE = { min: 0.1, max: 8 }

/** The frame centered in the workspace at the largest zoom that fits, `padding` clear. */
export function fitView(workspace: Size, frame: Size, padding: number): PanZoomView {
  const zoom = Math.max(
    0.01,
    Math.min(
      (workspace.width - 2 * padding) / frame.width,
      (workspace.height - 2 * padding) / frame.height,
    ),
  )
  return {
    zoom,
    x: (workspace.width - frame.width * zoom) / 2,
    y: (workspace.height - frame.height * zoom) / 2,
  }
}

/** `view` zoomed by `factor` about `point` (workspace px): that point stays put. */
export function zoomAt(
  view: PanZoomView,
  factor: number,
  point: { x: number; y: number },
  limits: { min: number; max: number },
): PanZoomView {
  const zoom = Math.min(limits.max, Math.max(limits.min, view.zoom * factor))
  const k = zoom / view.zoom
  return { zoom, x: point.x - (point.x - view.x) * k, y: point.y - (point.y - view.y) * k }
}

/** Controls the mouse doesn't pan from. */
const INTERACTIVE = 'textarea, input, select, button, a, [data-no-pan]'

export interface PanZoom {
  view: PanZoomView
  /** The zoom that fits the frame (for limits and the readout's reference). */
  fitZoom: number
  /** Re-fit the frame (and keep fitting it as the workspace resizes). */
  fit: () => void
}

/**
 * An After Effects–style workspace around a fixed-size frame: the wheel (or a trackpad
 * pinch) zooms about the cursor, dragging anywhere but a control (or with the middle
 * button, anywhere) pans, and a double-click on the empty workspace fits the frame again.
 * Starts fitted, `padding` clear, and stays fitted as the workspace resizes until the
 * user pans or zooms.
 */
export function usePanZoom(
  workspaceRef: RefObject<HTMLElement | null>,
  frame: Size,
  padding: number,
): PanZoom {
  const [view, setView] = useState<PanZoomView>({ x: 0, y: 0, zoom: 1 })
  const [fitZoom, setFitZoom] = useState(1)
  const fitted = useRef(true)
  const size = useRef<Size>({ width: 0, height: 0 })
  const { width, height } = frame

  const refit = useCallback(() => {
    if (size.current.width <= 0 || size.current.height <= 0) return
    const next = fitView(size.current, { width, height }, padding)
    setFitZoom(next.zoom)
    if (fitted.current) setView(next)
  }, [width, height, padding])

  const fit = useCallback(() => {
    fitted.current = true
    refit()
  }, [refit])

  useEffect(() => {
    const workspace = workspaceRef.current
    if (!workspace) return
    const stopObserving = observeSize(workspace, (w, h) => {
      size.current = { width: w, height: h }
      refit()
    })

    const local = (e: { clientX: number; clientY: number }) => {
      const rect = workspace.getBoundingClientRect()
      return { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      fitted.current = false
      // Pixels per line/page for non-pixel wheels; pinches arrive with ctrlKey and small
      // deltas, so they zoom faster per unit.
      const delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1)
      const factor = Math.exp(-delta * (e.ctrlKey ? 0.01 : 0.0015))
      const point = local(e)
      setView((current) => {
        const fitScale = fitView(size.current, { width, height }, padding).zoom
        return zoomAt(current, factor, point, {
          min: fitScale * ZOOM_RANGE.min,
          max: fitScale * ZOOM_RANGE.max,
        })
      })
    }

    let pan: { id: number; x: number; y: number } | null = null
    const onPointerDown = (e: PointerEvent) => {
      const onControl = (e.target as Element | null)?.closest(INTERACTIVE)
      if (!(e.button === 1 || (e.button === 0 && !onControl))) return
      e.preventDefault()
      fitted.current = false
      pan = { id: e.pointerId, x: e.clientX, y: e.clientY }
      workspace.setPointerCapture(e.pointerId)
      workspace.dataset.panning = 'on'
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
      delete workspace.dataset.panning
    }
    const onDoubleClick = (e: MouseEvent) => {
      if (e.target === workspace) fit()
    }

    workspace.addEventListener('wheel', onWheel, { passive: false })
    workspace.addEventListener('pointerdown', onPointerDown)
    workspace.addEventListener('pointermove', onPointerMove)
    workspace.addEventListener('pointerup', onPointerUp)
    workspace.addEventListener('pointercancel', onPointerUp)
    workspace.addEventListener('dblclick', onDoubleClick)
    return () => {
      stopObserving()
      workspace.removeEventListener('wheel', onWheel)
      workspace.removeEventListener('pointerdown', onPointerDown)
      workspace.removeEventListener('pointermove', onPointerMove)
      workspace.removeEventListener('pointerup', onPointerUp)
      workspace.removeEventListener('pointercancel', onPointerUp)
      workspace.removeEventListener('dblclick', onDoubleClick)
    }
  }, [workspaceRef, refit, fit, width, height, padding])

  return { view, fitZoom, fit }
}
