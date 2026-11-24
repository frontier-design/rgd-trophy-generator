import { useId, type ReactNode } from 'react'
import type { KeyframeControl } from '../../types'
import { KeyframeButton } from './KeyframeButton'

interface ToggleFieldProps {
  label: string
  /** Shown before the label's text. */
  icon?: ReactNode
  checked: boolean
  disabled?: boolean
  /** Timeline keyframe toggle for this param. */
  keyframe?: KeyframeControl
  onChange: (checked: boolean) => void
}

/** A labelled on/off switch (a checkbox with the switch role). */
export function ToggleField({
  label,
  icon,
  checked,
  disabled = false,
  keyframe,
  onChange,
}: ToggleFieldProps) {
  const id = useId()
  return (
    <div className="control-field control-field--toggle" data-disabled={disabled || undefined}>
      <label className="control-label" htmlFor={id} data-icon={icon ? '' : undefined}>
        {icon}
        {label}
      </label>
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="control-switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <KeyframeButton label={label} keyframe={keyframe} />
    </div>
  )
}
