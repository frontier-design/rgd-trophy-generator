import { useId, useState, type CSSProperties, type ReactNode } from 'react'
import type { KeyframeControl } from '../../types'
import { KeyframeButton } from './KeyframeButton'
import { FieldAnimButton, FieldAnimPanel } from './FieldAnimControls'
import { useFieldAnim } from './fieldAnim'

interface RangeFieldProps {
  label: string
  /** Shown before the label's text. */
  icon?: ReactNode
  value: number
  min: number
  max: number
  step?: number
  /** Decimal places in the readout. */
  digits?: number
  unit?: string
  disabled?: boolean
  /** Timeline keyframe toggle for this param. */
  keyframe?: KeyframeControl
  /** The property it edits (`flutes`, `lineBox.padX`): on node cards it can then animate
   *  over a text line's typing (a chevron unfolds the animation's controls). */
  param?: string
  onChange: (value: number) => void
}

/**
 * A labelled slider: a solid line up to the value, a tick for the handle, dots after it.
 * The value readout appears above the tick while hovering or dragging. The label alone is
 * the slider's accessible name.
 */
export function RangeField({
  label,
  icon,
  value,
  min,
  max,
  step = 1,
  digits = 0,
  unit = 'px',
  disabled = false,
  keyframe,
  param,
  onChange,
}: RangeFieldProps) {
  const id = useId()
  const anims = useFieldAnim()
  const animated = Boolean(param && anims && anims.keyframes(param).length)
  const animatable = Boolean(param && anims)
  const [open, setOpen] = useState(false)
  // Share of the track up to the value: drives the solid line and the readout position.
  const fill = max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0
  return (
    <div
      className="control-field"
      data-disabled={disabled || undefined}
      data-animated={animated || undefined}
    >
      <label className="control-label" htmlFor={id} data-icon={icon ? '' : undefined}>
        {icon}
        {label}
      </label>
      <div className="range-wrap" style={{ '--fill': fill } as CSSProperties}>
        <input
          id={id}
          type="range"
          className="control-range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.valueAsNumber)}
        />
        <output className="control-value" htmlFor={id}>
          {value.toFixed(digits)}
          {unit}
        </output>
      </div>
      <KeyframeButton label={label} keyframe={keyframe} />
      {animatable && (
        <>
          <FieldAnimButton
            label={label}
            param={param}
            open={open}
            onToggle={() => setOpen(!open)}
          />
          {open && <FieldAnimPanel label={label} param={param} value={value} />}
        </>
      )}
    </div>
  )
}
