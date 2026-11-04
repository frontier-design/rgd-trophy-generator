import { useId } from 'react'

interface TextFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
}

/** A labelled one-line text input. The label is the input's accessible name. */
export function TextField({ label, value, onChange }: TextFieldProps) {
  const id = useId()
  return (
    <div className="control-field control-field--select">
      <label className="control-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        className="control-text"
        value={value}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
