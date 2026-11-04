import { useId } from 'react'
import type { KeyframeControl } from '../../types'
import { KeyframeButton } from './KeyframeButton'

interface ColorFieldProps {
  label: string
  /** `#rrggbb` */
  value: string
  /** Timeline keyframe toggle for this param. */
  keyframe?: KeyframeControl
  onChange: (hex: string) => void
}

/** A labelled color picker with its hex value. The label is the picker's accessible name. */
export function ColorField({ label, value, keyframe, onChange }: ColorFieldProps) {
  const id = useId()
  return (
    <div className="control-field control-field--select">
      <label className="control-label" htmlFor={id}>
        {label}
      </label>
      <div className="seed-color">
        <input
          id={id}
          type="color"
          className="color-stop-swatch"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="color-stop-hex">{value}</span>
      </div>
      <KeyframeButton label={label} keyframe={keyframe} />
    </div>
  )
}
