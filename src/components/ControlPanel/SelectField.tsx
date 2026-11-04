import { useId } from 'react'
import type { KeyframeControl } from '../../types'
import { KeyframeButton } from './KeyframeButton'

interface SelectFieldProps<T extends string> {
  label: string
  value: T
  options: readonly T[]
  disabled?: boolean
  /** Timeline keyframe toggle for this param. */
  keyframe?: KeyframeControl
  onChange: (value: T) => void
}

/** A labelled select. The label alone is the select's accessible name. */
export function SelectField<T extends string>({
  label,
  value,
  options,
  disabled = false,
  keyframe,
  onChange,
}: SelectFieldProps<T>) {
  const id = useId()
  return (
    <div className="control-field control-field--select" data-disabled={disabled || undefined}>
      <label className="control-label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="control-select"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <KeyframeButton label={label} keyframe={keyframe} />
    </div>
  )
}
