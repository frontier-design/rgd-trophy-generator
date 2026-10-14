import { MAX_STOPS, MIN_CUSTOM_COLORS } from '../../material'

interface ColorStopsProps {
  /** `#rrggbb` colors, top → bottom of the gradient. */
  colors: readonly string[]
  /** Called with the full new list on any edit, add or remove. */
  onChange: (colors: string[]) => void
}

/**
 * The palette's colors as an editable list (top of the gradient first): a native color
 * picker per stop, its hex value, and remove; plus add. Between MIN_CUSTOM_COLORS and
 * MAX_STOPS colors.
 */
export function ColorStops({ colors, onChange }: ColorStopsProps) {
  const set = (index: number, hex: string) =>
    onChange(colors.map((c, i) => (i === index ? hex : c)))
  const remove = (index: number) => onChange(colors.filter((_, i) => i !== index))
  // A new stop repeats the bottom color, so adding doesn't change the look until edited.
  const add = () => onChange([...colors, colors.at(-1) ?? '#888888'])

  return (
    <div className="color-stops" role="group" aria-label="colors">
      <span className="control-label">colors</span>
      <ol className="color-stops-list">
        {colors.map((hex, i) => (
          <li key={i} className="color-stop">
            <input
              type="color"
              className="color-stop-swatch"
              aria-label={`color ${i + 1}`}
              value={hex}
              onChange={(e) => set(i, e.target.value)}
            />
            <span className="color-stop-hex">{hex}</span>
            <button
              type="button"
              className="color-stop-remove"
              aria-label={`remove color ${i + 1}`}
              disabled={colors.length <= MIN_CUSTOM_COLORS}
              onClick={() => remove(i)}
            >
              ×
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="control-button color-stops-add"
        disabled={colors.length >= MAX_STOPS}
        onClick={add}
      >
        + add color
      </button>
    </div>
  )
}
