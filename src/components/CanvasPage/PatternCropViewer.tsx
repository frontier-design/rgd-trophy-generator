import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import {
  CROP_HANDLES,
  clampCrop,
  isFullCrop,
  moveCrop,
  resizeCrop,
  type CropHandle,
} from '../../pattern'
import type { CropRect } from '../../types'

/** The viewer fits the image at 1× and zooms in to 8× (never beyond). */
const MIN_ZOOM = 1
const MAX_ZOOM = 8
const ZOOM_STEP = 1.25

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

interface Viewer {
  zoom: number
  /** Pan in fractions of the fitted image (0 at fit; negative moves the image left/up). */
  pan: { x: number; y: number }
}

const FIT: Viewer = { zoom: MIN_ZOOM, pan: { x: 0, y: 0 } }

/** Pan stays bounded so the image always covers the viewport. */
function clampPan(pan: { x: number; y: number }, zoom: number): { x: number; y: number } {
  const least = 1 - zoom
  return { x: clamp(pan.x, least, 0), y: clamp(pan.y, least, 0) }
}

/** Zoom to `zoom`, keeping the viewport's centre in place. */
function zoomedTo(view: Viewer, zoom: number): Viewer {
  const next = clamp(zoom, MIN_ZOOM, MAX_ZOOM)
  if (next === view.zoom) return view
  const ratio = next / view.zoom
  return {
    zoom: next,
    pan: clampPan(
      { x: 0.5 - (0.5 - view.pan.x) * ratio, y: 0.5 - (0.5 - view.pan.y) * ratio },
      next,
    ),
  }
}

type DragMode = 'move' | 'resize' | 'pan'

interface Drag {
  mode: DragMode
  handle?: CropHandle
  startX: number
  startY: number
  /** The stage's on-screen size when the drag began (zoom included). */
  width: number
  height: number
  crop: CropRect
  pan: { x: number; y: number }
  zoom: number
}

interface PatternCropViewerProps {
  /** The imported source (URL or data URL). */
  image: string
  /** The selected region, normalized image coordinates. */
  crop: CropRect
  /** A crop edit (moving or resizing). Not called for viewer zoom/pan. */
  onChange: (crop: CropRect) => void
}

/**
 * A bounded viewer for a pattern's source image: the full image with a reversible rectangular
 * crop, freely resizable from its corners and edges and draggable inside it. Zoom (fit to 8×),
 * fit reset and panning inspect the source without touching the crop; the viewer isolates its
 * pointer and wheel gestures from the workspace canvas. Only crop edits call `onChange`, so
 * zooming and panning never rebuild the pattern map.
 */
export function PatternCropViewer({ image, crop, onChange }: PatternCropViewerProps) {
  const [view, setView] = useState<Viewer>(FIT)
  const [natural, setNatural] = useState({ width: 1, height: 1 })
  const [dragging, setDragging] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })

  const selected = clampCrop(crop)
  const ratio = natural.width > 0 && natural.height > 0 ? natural.width / natural.height : 1

  const beginDrag = useCallback(
    (e: ReactPointerEvent, mode: DragMode, handle?: CropHandle) => {
      if (e.button !== 0 && e.button !== 1) return
      e.preventDefault()
      e.stopPropagation()
      const stage = stageRef.current
      if (!stage) return
      const rect = stage.getBoundingClientRect()
      drag.current = {
        mode,
        handle,
        startX: e.clientX,
        startY: e.clientY,
        width: Math.max(1, rect.width),
        height: Math.max(1, rect.height),
        crop: selected,
        pan: view.pan,
        zoom: view.zoom,
      }
      setDragging(true)
    },
    [selected, view],
  )

  // Dragging runs on the window so the pointer can leave the viewer, and keeps its gestures
  // out of the canvas's pan, selection and node drags.
  useEffect(() => {
    if (!dragging) return
    const onMove = (e: PointerEvent) => {
      const current = drag.current
      if (!current) return
      const dx = (e.clientX - current.startX) / current.width
      const dy = (e.clientY - current.startY) / current.height
      if (current.mode === 'pan') {
        // Pan is in fitted-image fractions; the stage is zoomed, so scale the pointer delta.
        setView((value) => ({
          ...value,
          pan: clampPan(
            {
              x: current.pan.x + dx * current.zoom,
              y: current.pan.y + dy * current.zoom,
            },
            value.zoom,
          ),
        }))
      } else if (current.mode === 'resize' && current.handle) {
        onChangeRef.current(resizeCrop(current.crop, current.handle, dx, dy))
      } else {
        onChangeRef.current(moveCrop(current.crop, dx, dy))
      }
    }
    const onUp = () => {
      drag.current = null
      setDragging(false)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [dragging])

  const zoomTo = (zoom: number) => setView((value) => zoomedTo(value, zoom))

  const onWheel = (e: ReactWheelEvent) => {
    // Isolated from the workspace: this zooms the viewer, never the canvas.
    e.preventDefault()
    e.stopPropagation()
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1
    setView((value) => zoomedTo(value, value.zoom * Math.exp(-e.deltaY * unit * 0.0015)))
  }

  return (
    <div
      className="pattern-crop-viewer"
      role="group"
      aria-label="Pattern crop viewer"
      data-no-pan
      data-own-wheel
      data-crop-viewer
      data-zoomed={view.zoom > 1 || undefined}
      onWheel={onWheel}
    >
      <div className="pattern-crop-viewport" style={{ aspectRatio: `${ratio}` }}>
        <div
          ref={stageRef}
          className="pattern-crop-stage"
          style={{
            transform: `translate(${view.pan.x * 100}%, ${view.pan.y * 100}%) scale(${view.zoom})`,
          }}
          onPointerDown={(e) => {
            // The image around the crop (or a middle/alt drag) pans while zoomed.
            beginDrag(e, 'pan')
          }}
        >
          <img
            className="pattern-crop-image"
            src={image}
            alt=""
            draggable={false}
            onLoad={(e) => {
              const element = e.currentTarget
              if (element.naturalWidth > 0 && element.naturalHeight > 0) {
                setNatural({ width: element.naturalWidth, height: element.naturalHeight })
              }
            }}
          />
          {/* The crop box, in image coordinates (so zoom scales it with the image). */}
          <div
            className="pattern-crop-box"
            role="group"
            aria-label="Crop region"
            data-crop-box
            style={{
              left: `${selected.x * 100}%`,
              top: `${selected.y * 100}%`,
              width: `${selected.width * 100}%`,
              height: `${selected.height * 100}%`,
            }}
            onPointerDown={(e) => {
              // A full crop can't move: a drag on it inspects (pans) instead.
              const panInstead = e.altKey || e.button === 1 || isFullCrop(selected)
              beginDrag(e, panInstead ? 'pan' : 'move')
            }}
          >
            {CROP_HANDLES.map((handle) => (
              <span
                key={handle}
                className="pattern-crop-handle"
                data-handle={handle}
                role="button"
                tabIndex={-1}
                aria-label={`crop handle ${handle}`}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  beginDrag(e, 'resize', handle)
                }}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="pattern-crop-controls">
        <button
          type="button"
          className="control-button"
          aria-label="zoom out"
          disabled={view.zoom <= MIN_ZOOM}
          onClick={() => zoomTo(view.zoom / ZOOM_STEP)}
        >
          −
        </button>
        <input
          type="range"
          className="control-range pattern-crop-zoom"
          aria-label="zoom"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.1}
          value={view.zoom}
          onChange={(e) => zoomTo(Number(e.target.value))}
        />
        <button
          type="button"
          className="control-button"
          aria-label="zoom in"
          disabled={view.zoom >= MAX_ZOOM}
          onClick={() => zoomTo(view.zoom * ZOOM_STEP)}
        >
          +
        </button>
        <button
          type="button"
          className="control-button"
          aria-label="fit"
          disabled={view.zoom === MIN_ZOOM && view.pan.x === 0 && view.pan.y === 0}
          onClick={() => setView(FIT)}
        >
          fit
        </button>
        <output className="pattern-crop-zoom-value" aria-label="viewer zoom">
          {Math.round(view.zoom * 100)}%
        </output>
      </div>
    </div>
  )
}
