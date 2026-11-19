import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'

export interface ModifierRangeOverlayProps {
  /** Trophy height bounds in the overlay's containing artboard coordinates, in CSS pixels. */
  top: number
  height: number
  /** Modifier percentages, measured from the top of the solid. Handles retain their identity
   * even when crossed: the renderer sorts the two values when applying the band. */
  from: number
  to: number
  /** Optional source name used to distinguish handles belonging to linked modifiers. */
  label?: string
  /** One-based modifier slot used to stagger percentage tags horizontally. */
  index?: number
  /** Only selected modifiers display editable endpoints. */
  showHandles?: boolean
  onChange: (patch: { from?: number; to?: number }) => void
  /** Activate the modifier without discarding the current selection. */
  onSelect?: () => void
  onGestureBoundary?: () => void
}

const clamp = (value: number) => Math.max(0, Math.min(100, value))

/** Mount inside a positioned artboard; its bounds must correspond to the rendered solid,
 * not the artboard's full height. The overlay itself does not intercept scene gestures. */
export function ModifierRangeOverlay({
  top,
  height,
  from,
  to,
  label,
  index,
  showHandles = true,
  onChange,
  onSelect,
  onGestureBoundary,
}: ModifierRangeOverlayProps) {
  const track = useRef<HTMLDivElement>(null)
  const drag = useRef<{ pointer: number; key: 'from' | 'to' } | null>(null)
  const enabled = Number.isFinite(height) && height > 0

  function update(key: 'from' | 'to', clientY: number) {
    const rect = track.current?.getBoundingClientRect()
    if (!rect || rect.height <= 0) return
    onChange({ [key]: Math.round(clamp(((clientY - rect.top) / rect.height) * 100)) })
  }

  function down(event: PointerEvent<HTMLButtonElement>) {
    if (!enabled || event.button !== 0) return
    const key = event.currentTarget.dataset.rangeKey as 'from' | 'to'
    event.stopPropagation()
    event.preventDefault()
    onSelect?.()
    onGestureBoundary?.()
    drag.current = { pointer: event.pointerId, key }
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId)
    } catch {
      /* synthetic pointer */
    }
    update(key, event.clientY)
  }

  function move(event: PointerEvent<HTMLButtonElement>) {
    if (drag.current?.pointer !== event.pointerId) return
    event.stopPropagation()
    update(drag.current.key, event.clientY)
  }

  function end(event: PointerEvent<HTMLButtonElement>) {
    if (drag.current?.pointer !== event.pointerId) return
    event.stopPropagation()
    drag.current = null
    onGestureBoundary?.()
  }

  function keyDown(key: 'from' | 'to', value: number, event: KeyboardEvent<HTMLButtonElement>) {
    let next: number
    switch (event.key) {
      case 'ArrowUp':
      case 'ArrowLeft':
        next = value - 1
        break
      case 'ArrowDown':
      case 'ArrowRight':
        next = value + 1
        break
      case 'PageUp':
        next = value - 10
        break
      case 'PageDown':
        next = value + 10
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = 100
        break
      default:
        return
    }
    event.preventDefault()
    event.stopPropagation()
    onChange({ [key]: clamp(next) })
  }

  const handleStyle: CSSProperties = {
    position: 'absolute',
    left: 0,
    width: '100%',
    height: 18,
    marginTop: -9,
    pointerEvents: 'auto',
    cursor: 'ns-resize',
    touchAction: 'none',
    border: 0,
    background: 'transparent',
    padding: 0,
  }
  const slot = Math.max(1, index ?? 1)
  const tagOffset = label ? (slot - 1) * 288 : 0
  const tagStyle: CSSProperties = {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    zIndex: 2,
    whiteSpace: 'nowrap',
    maxWidth: 136,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    border: '1px solid white',
    borderRadius: 3,
    background: '#222',
    color: 'white',
    fontSize: 11,
    padding: '3px 6px',
  }
  return (
    <div
      ref={track}
      aria-label="Modifier range"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top,
        height: Math.max(0, height),
        pointerEvents: 'none',
      }}
    >
      {enabled && (
        <div
          data-handle
          aria-label={label ? `select ${label} range` : 'select modifier range'}
          onPointerDown={(event) => {
            if (event.button !== 0) return
            event.preventDefault()
            event.stopPropagation()
            onSelect?.()
          }}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: `${Math.min(clamp(from), clamp(to))}%`,
            height: `${Math.abs(clamp(to) - clamp(from))}%`,
            pointerEvents: 'auto',
            cursor: 'pointer',
          }}
        />
      )}
      {showHandles &&
        (['from', 'to'] as const).map((key) => {
          const value = clamp(key === 'from' ? from : to)
          return (
            <button
              key={key}
              type="button"
              data-handle
              data-range-key={key}
              role="slider"
              aria-label={label ? `${label} ${key}` : `Modifier ${key}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={value}
              aria-orientation="vertical"
              disabled={!enabled}
              style={{ ...handleStyle, top: `${value}%` }}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
              onLostPointerCapture={end}
              onKeyDown={(event) => keyDown(key, value, event)}
              onClick={(event) => event.stopPropagation()}
            >
              <span
                data-range-line={key}
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: '50%',
                  zIndex: 1,
                  borderTop: '1px solid white',
                  boxShadow: '0 1px 1px #0008',
                }}
              />
              <span
                style={{
                  ...tagStyle,
                  right: tagOffset + (key === 'from' ? (label ? 144 : 68) : 0),
                }}
              >
                {label ? `${label} ` : ''}
                {key} {Math.round(value)}%
              </span>
            </button>
          )
        })}
    </div>
  )
}
