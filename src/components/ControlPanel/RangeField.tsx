import { useId, useState, type CSSProperties } from 'react'
import type { KeyframeControl } from '../../types'
import { KeyframeButton } from './KeyframeButton'
import { useFieldAnim } from './fieldAnim'

interface RangeFieldProps {
  label: string
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
  const anim = param && anims ? anims.get(param) : undefined
  const animatable = Boolean(param && anims)
  const [open, setOpen] = useState(false)
  // Share of the track up to the value: drives the solid line and the readout position.
  const fill = max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0
  return (
    <div
      className="control-field"
      data-disabled={disabled || undefined}
      data-animated={anim?.enabled || undefined}
    >
      <label className="control-label" htmlFor={id}>
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
      {animatable && param && anims && (
        <>
          <button
            type="button"
            className="field-anim-fold"
            aria-label={`${label} animation`}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            ›
          </button>
          {open && (
            <div className="field-anim" role="group" aria-label={`${label} animation`}>
              <label className="field-anim-toggle">
                <input
                  type="checkbox"
                  aria-label={`animate ${label}`}
                  checked={anim?.enabled ?? false}
                  onChange={(e) => anims.setEnabled(param, e.target.checked, value)}
                />
                Anim
              </label>
              {anim?.enabled && (
                <>
                  <label className="field-anim-line">
                    Line
                    <input
                      type="number"
                      aria-label={`${label} line`}
                      min={1}
                      step={1}
                      value={anim.line}
                      onChange={(e) => {
                        const line = Math.round(e.target.valueAsNumber)
                        if (Number.isFinite(line) && line >= 1) anims.setLine(param, line)
                      }}
                    />
                  </label>
                  {(['from', 'to'] as const).map((which) => (
                    <button
                      key={which}
                      type="button"
                      className="control-button field-anim-which"
                      aria-pressed={anim.editing === which}
                      onClick={() => anims.setEditing(param, which)}
                    >
                      {which}
                    </button>
                  ))}
                  <select
                    className="field-anim-easing"
                    aria-label={`${label} easing`}
                    value={anim.easing ?? anims.easings[0]?.value}
                    onChange={(e) => anims.setEasing(param, e.target.value)}
                  >
                    {anims.easings.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
