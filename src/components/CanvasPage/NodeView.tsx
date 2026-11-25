import { useState, type CSSProperties, type ReactNode } from 'react'
import { FieldAnimButton, FieldAnimPanel } from '../ControlPanel/FieldAnimControls'

/** A slider on a node view's side or bottom. */
export interface ViewSliderProps {
  /** Its accessible name (it has no visible label). */
  label: string
  value: number
  min: number
  max: number
  step?: number
  /** After the value in its hover readout. */
  unit?: string
  /** The property it edits: on node cards a keyframe button beside it opens its animation
   *  (under the bottom slider). */
  param?: string
  onChange: (value: number) => void
}

/**
 * A node card's framed view (the lighting node's 3D light, the shape node's line box): the
 * view in a white box with a thin black outline, a vertical slider on its right (its start at
 * the bottom) and a horizontal one under it, each with a keyframe button (when it names its
 * property) that opens its animation under the bottom slider. Spans the card's fields, ruled
 * off below.
 */
export function NodeView({
  children,
  vertical,
  horizontal,
}: {
  children: ReactNode
  vertical: ViewSliderProps
  horizontal: ViewSliderProps
}) {
  // Which slider's animation is open (one at a time).
  const [open, setOpen] = useState<'vertical' | 'horizontal' | null>(null)
  const toggle = (which: 'vertical' | 'horizontal') => setOpen(open === which ? null : which)
  const shown = open === 'vertical' ? vertical : open === 'horizontal' ? horizontal : null
  return (
    <div className="node-view">
      {children}
      <div className="node-view-vertical">
        <ViewSlider {...vertical} />
      </div>
      <span className="node-view-key" data-for="vertical">
        <FieldAnimButton
          label={vertical.label}
          param={vertical.param}
          open={open === 'vertical'}
          onToggle={() => toggle('vertical')}
        />
      </span>
      <ViewSlider {...horizontal} />
      <span className="node-view-key" data-for="horizontal">
        <FieldAnimButton
          label={horizontal.label}
          param={horizontal.param}
          open={open === 'horizontal'}
          onToggle={() => toggle('horizontal')}
        />
      </span>
      {shown && <FieldAnimPanel label={shown.label} param={shown.param} value={shown.value} />}
    </div>
  )
}

/** A bare slider in the app's style (a solid line to the tick, dots after), with a shorter
 *  tick than the fields' and its value on hover. */
function ViewSlider({ label, value, min, max, step = 1, unit = '', onChange }: ViewSliderProps) {
  const fill = max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0
  return (
    <span className="range-wrap" style={{ '--fill': fill } as CSSProperties}>
      <input
        type="range"
        className="control-range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.valueAsNumber)}
      />
      <output className="control-value">
        {Math.round(value)}
        {unit}
      </output>
    </span>
  )
}

/** A rule between groups of a node card's fields. */
export function NodeDivider() {
  return <hr className="node-card-divider" />
}
