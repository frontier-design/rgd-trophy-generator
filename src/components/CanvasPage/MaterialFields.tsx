import { generatePalette, PALETTE_NAMES, paletteColors } from '../../material'
import type { MaterialSettings, PaletteChoice } from '../../types'
import { SelectField } from '../ControlPanel/SelectField'
import { RangeField } from '../ControlPanel/RangeField'
import { ColorStops } from '../ControlPanel/ColorStops'
import { SeedColorField } from '../ControlPanel/SeedColorField'

const PALETTES: readonly PaletteChoice[] = [...PALETTE_NAMES, 'custom']

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
      <SelectField
        label="palette"
        value={params.palette}
        options={PALETTES}
        onChange={(palette) => set({ palette })}
      />
      <SeedColorField
        value={params.seedColor}
        onChange={(seedColor) =>
          set({
            seedColor,
            palette: 'custom',
            customColors: generatePalette(seedColor),
            banding: 0,
          })
        }
      />
      <ColorStops
        colors={paletteColors(params)}
        onChange={(customColors) => set({ palette: 'custom', customColors })}
      />
      <RangeField
        label="banding"
        value={params.banding}
        min={0}
        max={1}
        step={0.01}
        digits={2}
        onChange={(banding) => set({ banding })}
      />
      <RangeField
        label="offset"
        value={params.gradientOffset}
        min={-0.5}
        max={0.5}
        step={0.01}
        digits={2}
        onChange={(gradientOffset) => set({ gradientOffset })}
      />
      <RangeField
        label="scale"
        value={params.gradientScale}
        min={0.25}
        max={3}
        step={0.05}
        digits={2}
        onChange={(gradientScale) => set({ gradientScale })}
      />
      <RangeField
        label="tilt"
        value={params.tilt}
        min={-1}
        max={1}
        step={0.01}
        digits={2}
        onChange={(tilt) => set({ tilt })}
      />
      <RangeField
        label="wobble"
        value={params.wobble}
        min={0}
        max={5}
        step={0.01}
        digits={2}
        onChange={(wobble) => set({ wobble })}
      />
      <RangeField
        label="edge depth"
        value={params.edgeDepth}
        min={0}
        max={1}
        step={0.01}
        digits={2}
        onChange={(edgeDepth) => set({ edgeDepth })}
      />
      <RangeField
        label="edge hue"
        value={params.edgeHue}
        min={-90}
        max={90}
        onChange={(edgeHue) => set({ edgeHue })}
      />
      <RangeField
        label="ledge"
        value={params.ledgeShadow}
        min={0}
        max={1}
        step={0.01}
        digits={2}
        onChange={(ledgeShadow) => set({ ledgeShadow })}
      />
      <RangeField
        label="grain"
        value={params.grain}
        min={0}
        max={1}
        step={0.01}
        digits={2}
        onChange={(grain) => set({ grain })}
      />
      <RangeField
        label="grain size"
        value={params.grainSize}
        min={0.25}
        max={3}
        step={0.05}
        digits={2}
        onChange={(grainSize) => set({ grainSize })}
      />
    </>
  )
}
