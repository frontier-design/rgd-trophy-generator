import { useId } from 'react'

interface SeedColorFieldProps {
  /** `#rrggbb` */
  value: string
  onChange: (hex: string) => void
}

/** One color to generate a whole palette from (live while dragging in the picker). */
export function SeedColorField({ value, onChange }: SeedColorFieldProps) {
  const id = useId()
  return (
    <div className="control-field control-field--select">
      <label className="control-label" htmlFor={id}>
        generate
      </label>
      <div className="seed-color">
        <input
          id={id}
          type="color"
          className="color-stop-swatch"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="seed-color-hint">→ smooth palette</span>
      </div>
    </div>
  )
}
