import { useId } from 'react'

interface SelectFieldProps<T extends string> {
  label: string
  value: T
  options: readonly T[]
  onChange: (value: T) => void
}

/** A labelled select. The label alone is the select's accessible name. */
export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: SelectFieldProps<T>) {
  const id = useId()
  return (
    <div className="control-field control-field--select">
      <label className="control-label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="control-select"
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  )
}
