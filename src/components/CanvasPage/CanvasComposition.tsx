import { memo, useRef, type CSSProperties, type PointerEvent } from 'react'
import { downloadBlob } from '../../export'
import { useNodeDrag, useNodePosition } from './nodeDrag'
import { FRAME_EDGES, resizeFrame, type FrameEdge, type FrameRect } from './sceneNode'
import {
  IMAGE_CORNERS,
  resizeCompositionImage,
  type CompositionImageRect,
  type CompositionNode,
  type ImageCorner,
} from './compositionNode'

export interface CanvasCompositionProps {
  node: CompositionNode
  selected: boolean
  getZoom: () => number
  imageUrl?: string
  connected: boolean
  onSelect: (id: string, additive?: boolean, preserveGroup?: boolean) => void
  onMove: (id: string, x: number, y: number) => void
  onInputDown: (id: string, event: PointerEvent) => void
  onResize: (id: string, frame: FrameRect) => void
  onImageChange: (id: string, image: CompositionImageRect) => void
}

type Gesture = {
  pointer: number
  x: number
  y: number
  start: FrameRect
} & ({ kind: 'frame'; edge: FrameEdge } | { kind: 'image'; corner?: ImageCorner })

export const CanvasComposition = memo(function CanvasComposition({
  node,
  selected,
  getZoom,
  imageUrl,
  connected,
  onSelect,
  onMove,
  onInputDown,
  onResize,
  onImageChange,
}: CanvasCompositionProps) {
  const { id, frame, image } = node
  const position = useNodePosition(id, node)
  const drag = useNodeDrag(node, getZoom, onMove)
  const gesture = useRef<Gesture | null>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const exportImage = () => {
    const canvas = document.createElement('canvas')
    canvas.width = frame.width
    canvas.height = frame.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, frame.width, frame.height)
    if (imageUrl && imageRef.current?.complete && imageRef.current.naturalWidth)
      ctx.drawImage(imageRef.current, image.x, image.y, image.width, image.height)
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, `${node.name}.png`)
    }, 'image/png')
  }

  const begin = (event: PointerEvent<HTMLElement>, next: Gesture) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    gesture.current = next
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      /* synthetic pointer */
    }
  }
  const update = (event: PointerEvent<HTMLElement>) => {
    const current = gesture.current
    if (!current || current.pointer !== event.pointerId) return
    event.stopPropagation()
    const zoom = getZoom()
    if (!Number.isFinite(zoom) || zoom <= 0) return
    const dx = (event.clientX - current.x) / zoom
    const dy = (event.clientY - current.y) / zoom
    if (current.kind === 'frame')
      onResize(id, resizeFrame(current.start, current.edge, dx, dy, event.shiftKey))
    else
      onImageChange(
        id,
        current.corner
          ? resizeCompositionImage(current.start, current.corner, dx, dy)
          : { ...current.start, x: current.start.x + dx, y: current.start.y + dy },
      )
  }
  const end = (event: PointerEvent<HTMLElement>) => {
    if (gesture.current?.pointer === event.pointerId) {
      event.stopPropagation()
      gesture.current = null
    }
  }
  const events = {
    onPointerMove: update,
    onPointerUp: end,
    onPointerCancel: end,
    onLostPointerCapture: end,
  }

  return (
    <div
      className="canvas-scene"
      aria-label={node.name}
      data-composition-node
      data-scene-id={id}
      data-no-pan
      data-selected={selected || undefined}
      style={
        {
          left: node.x,
          top: node.y,
          transform:
            position === node
              ? undefined
              : `translate(${position.x - node.x}px, ${position.y - node.y}px)`,
          '--artboard-width': `${frame.width}px`,
          '--artboard-height': `${frame.height}px`,
          background: 'white',
        } as CSSProperties
      }
      {...drag}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        onSelect(id, event.shiftKey, true)
        if (!event.shiftKey) drag.onPointerDown(event)
      }}
    >
      <div className="canvas-scene-name">{node.name}</div>
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        {imageUrl && (
          <div
            data-composition-image
            style={{
              position: 'absolute',
              left: image.x,
              top: image.y,
              width: image.width,
              height: image.height,
              cursor: 'move',
              touchAction: 'none',
            }}
            onPointerDown={(event) => {
              if (event.button !== 0) return
              onSelect(id, event.shiftKey, true)
              if (event.shiftKey) {
                event.stopPropagation()
                return
              }
              begin(event, {
                kind: 'image',
                pointer: event.pointerId,
                x: event.clientX,
                y: event.clientY,
                start: { ...image },
              })
            }}
            {...events}
          >
            <img
              ref={imageRef}
              src={imageUrl}
              alt=""
              draggable={false}
              style={{ display: 'block', width: '100%', height: '100%', pointerEvents: 'none' }}
            />
            {selected &&
              IMAGE_CORNERS.map((corner) => (
                <span
                  key={corner}
                  data-handle
                  data-image-corner={corner}
                  role="slider"
                  aria-label={`resize image ${corner}`}
                  aria-valuenow={image.width}
                  style={{
                    position: 'absolute',
                    width: 10,
                    height: 10,
                    background: 'white',
                    border: '1px solid black',
                    boxSizing: 'border-box',
                    top: corner.startsWith('top') ? -5 : undefined,
                    bottom: corner.startsWith('bottom') ? -5 : undefined,
                    left: corner.endsWith('left') ? -5 : undefined,
                    right: corner.endsWith('right') ? -5 : undefined,
                    cursor:
                      corner === 'top-left' || corner === 'bottom-right'
                        ? 'nwse-resize'
                        : 'nesw-resize',
                    touchAction: 'none',
                  }}
                  onPointerDown={(event) =>
                    begin(event, {
                      kind: 'image',
                      corner,
                      pointer: event.pointerId,
                      x: event.clientX,
                      y: event.clientY,
                      start: { ...image },
                    })
                  }
                  {...events}
                />
              ))}
          </div>
        )}
      </div>
      {selected &&
        FRAME_EDGES.map((edge) => (
          <span
            key={edge}
            className="frame-handle"
            data-edge={edge}
            data-handle
            role="slider"
            aria-label={`resize ${edge}`}
            aria-valuenow={edge === 'left' || edge === 'right' ? frame.width : frame.height}
            onPointerDown={(event) =>
              begin(event, {
                kind: 'frame',
                edge,
                pointer: event.pointerId,
                x: event.clientX,
                y: event.clientY,
                start: { x: node.x, y: node.y, ...frame },
              })
            }
            {...events}
          />
        ))}
      {selected && (
        <button
          type="button"
          data-no-pan
          data-handle
          onPointerDown={(event) => event.stopPropagation()}
          onClick={exportImage}
          style={{ position: 'absolute', left: '100%', top: 0, marginLeft: 16 }}
        >
          Export PNG
        </button>
      )}
      <span
        className="node-port node-port-in"
        data-port="in"
        data-scene-id={id}
        data-connected={connected || undefined}
        aria-label={`${node.name} input`}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.preventDefault()
          event.stopPropagation()
          if (event.shiftKey) onSelect(id, true)
          else onInputDown(id, event)
        }}
      />
    </div>
  )
})
