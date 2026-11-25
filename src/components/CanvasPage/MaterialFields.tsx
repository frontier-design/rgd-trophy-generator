import { PALETTE_NAMES, paletteColors, paletteGradient } from '../../material'
import type { MaterialSettings, PaletteChoice } from '../../types'
import { SelectField } from '../ControlPanel/SelectField'
import { RangeField } from '../ControlPanel/RangeField'

/**
 * The palette, picked from the presets: one box each (no editing). A custom palette (from an
 * older save) shows as one more box while it's in use, so it isn't lost by looking.
 */
function PaletteSwatches({
  params,
  set,
}: {
  params: MaterialSettings
  set: (patch: Partial<MaterialSettings>) => void
}) {
  const choices: PaletteChoice[] =
    params.palette === 'custom' ? [...PALETTE_NAMES, 'custom'] : [...PALETTE_NAMES]
  return (
    <div className="palette-swatches" role="radiogroup" aria-label="palette">
      <span className="control-label">palette</span>
      <div className="palette-swatches-list">
        {choices.map((name) => (
          <button
            key={name}
            type="button"
            role="radio"
            className="palette-swatch"
            aria-checked={params.palette === name}
            aria-label={name}
            title={name}
            style={{ background: paletteGradient(paletteColors({ ...params, palette: name })) }}
            onClick={() => set({ palette: name })}
          />
        ))}
      </div>
    </div>
  )
}

export function MaterialFields({
  params,
  set,
}: {
  params: MaterialSettings
  set: (patch: Partial<MaterialSettings>) => void
}) {
  return (
    <>
      <SelectField
        label="shading"
        value={params.shading}
        options={['painted', 'lit'] as const}
        onChange={(shading) => set({ shading })}
      />
      <PaletteSwatches params={params} set={set} />
      <RangeField
        label="banding"
        value={params.banding}
        min={0}
        max={1}
        step={0.01}
        digits={2}
        param="banding"
        onChange={(banding) => set({ banding })}
      />
      <RangeField
        label="offset"
        value={params.gradientOffset}
        min={-0.5}
        max={0.5}
        step={0.01}
        digits={2}
        param="gradientOffset"
        onChange={(gradientOffset) => set({ gradientOffset })}
      />
      <RangeField
        label="scale"
        value={params.gradientScale}
        min={0.25}
        max={3}
        step={0.05}
        digits={2}
        param="gradientScale"
        onChange={(gradientScale) => set({ gradientScale })}
      />
      <RangeField
        label="tilt"
        value={params.tilt}
        min={-1}
        max={1}
        step={0.01}
        digits={2}
        param="tilt"
        onChange={(tilt) => set({ tilt })}
      />
      <RangeField
        label="wobble"
        value={params.wobble}
        min={0}
        max={5}
        step={0.01}
        digits={2}
        param="wobble"
        onChange={(wobble) => set({ wobble })}
      />
      <RangeField
        label="edge depth"
        value={params.edgeDepth}
        min={0}
        max={1}
        step={0.01}
        digits={2}
        param="edgeDepth"
        onChange={(edgeDepth) => set({ edgeDepth })}
      />
      <RangeField
        label="edge hue"
        value={params.edgeHue}
        min={-90}
        max={90}
        param="edgeHue"
        onChange={(edgeHue) => set({ edgeHue })}
      />
      <RangeField
        label="ledge"
        value={params.ledgeShadow}
        min={0}
        max={1}
        step={0.01}
        digits={2}
        param="ledgeShadow"
        onChange={(ledgeShadow) => set({ ledgeShadow })}
      />
      <RangeField
        label="grain"
        value={params.grain}
        min={0}
        max={1}
        step={0.01}
        digits={2}
        param="grain"
        onChange={(grain) => set({ grain })}
      />
      <RangeField
        label="grain size"
        value={params.grainSize}
        min={0.25}
        max={3}
        step={0.05}
        digits={2}
        param="grainSize"
        onChange={(grainSize) => set({ grainSize })}
      />
    </>
  )
}
