import { useId, useState } from 'react'

interface NumberFieldProps {
  label: string
  value: number
  min: number
  max: number
  /** Shown after the field (e.g. px). */
  unit?: string
  onChange: (value: number) => void
}

/**
 * A labelled whole-number input. What's typed is applied as soon as it's a number in range
 * (so typing 1080 doesn't apply 1, 10 and 108 on the way); leaving the field puts back the
 * value in use.
 */
export function NumberField({ label, value, min, max, unit = 'px', onChange }: NumberFieldProps) {
  const id = useId()
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <div className="control-field control-field--select">
      <label className="control-label" htmlFor={id}>
        {label}
      </label>
      <span className="control-number">
        <input
          id={id}
          type="number"
          className="control-text"
          inputMode="numeric"
          min={min}
          max={max}
          step={1}
          value={draft ?? String(value)}
          onChange={(e) => {
            setDraft(e.target.value)
            const n = Math.round(Number(e.target.value))
            if (e.target.value !== '' && Number.isFinite(n) && n >= min && n <= max) onChange(n)
          }}
          onBlur={() => setDraft(null)}
        />
        {unit}
      </span>
    </div>
  )
}
