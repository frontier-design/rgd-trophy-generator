import { useEffect, useRef } from 'react'
import type { DockRect } from '../../timeline'
import { observeSize } from '../observeSize'

interface TimelineSlotProps {
  /** Called with the slot's window rect whenever it may have moved or resized. Should be
   *  referentially stable. */
  onDock?: (rect: DockRect) => void
}

/**
 * The strip below the canvas where the timeline lives. Theatre.js Studio draws its
 * sequence editor (keyframes, playhead, curves) as an overlay; this reserves the space and
 * docks the editor onto it.
 */
export function TimelineSlot({ onDock }: TimelineSlotProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const slot = ref.current
    if (!slot || !onDock) return
    const dock = () => {
      const { left, top, right, bottom } = slot.getBoundingClientRect()
      if (right > left && bottom > top) onDock({ left, top, right, bottom })
    }
    const stopObserving = observeSize(slot, dock)
    window.addEventListener('resize', dock)
    dock()
    return () => {
      stopObserving()
      window.removeEventListener('resize', dock)
    }
  }, [onDock])

  return (
    <section ref={ref} className="timeline-slot" aria-label="Timeline">
      {/* Shown until something is animated (Studio only draws the editor then). */}
      <span className="timeline-slot-hint">
        Timeline: click a ◇ next to a parameter to animate it
      </span>
    </section>
  )
}
