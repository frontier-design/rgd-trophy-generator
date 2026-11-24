import { RangeField } from '../ControlPanel/RangeField'
import type { LightingParams } from './graph'

interface LightingFieldsProps {
  params: LightingParams
  set: (patch: Partial<LightingParams>) => void
}

/** A lighting node's fields: the key light and highlight (lit shading only; painted shading
 *  has no light), with the ranges the scene panel's lighting section had. */
export function LightingFields({ params, set }: LightingFieldsProps) {
  return (
    <>
      <RangeField
        label="light angle"
        value={params.lightAngle}
        min={-180}
        max={180}
        unit="°"
        param="lightAngle"
        onChange={(lightAngle) => set({ lightAngle })}
      />
      <RangeField
        label="light height"
        value={params.lightHeight}
        min={0}
        max={90}
        unit="°"
        param="lightHeight"
        onChange={(lightHeight) => set({ lightHeight })}
      />
      <RangeField
        label="ambient"
        value={params.ambient}
        min={0}
        max={1}
        step={0.01}
        digits={2}
        unit=""
        param="ambient"
        onChange={(ambient) => set({ ambient })}
      />
      <RangeField
        label="softness"
        value={params.softness}
        min={0}
        max={1}
        step={0.01}
        digits={2}
        unit=""
        param="softness"
        onChange={(softness) => set({ softness })}
      />
      <RangeField
        label="highlight"
        value={params.highlight}
        min={0}
        max={1.5}
        step={0.01}
        digits={2}
        unit=""
        param="highlight"
        onChange={(highlight) => set({ highlight })}
      />
      <RangeField
        label="highlight size"
        value={params.highlightSize}
        min={0}
        max={1}
        step={0.01}
        digits={2}
        unit=""
        param="highlightSize"
        onChange={(highlightSize) => set({ highlightSize })}
      />
    </>
  )
}
