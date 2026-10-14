import { useId } from 'react'

interface ToggleFieldProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}

/** A labelled on/off switch (a checkbox with the switch role). */
export function ToggleField({ label, checked, onChange }: ToggleFieldProps) {
  const id = useId()
  return (
    <div className="control-field control-field--toggle">
      <label className="control-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="control-switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </div>
  )
}
