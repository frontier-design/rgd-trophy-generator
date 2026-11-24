import { RangeField } from '../ControlPanel/RangeField'
import type { LightingParams } from './graph'
import { LightAngleView } from './LightAngleView'
import { NodeDivider } from './NodeView'

/** The light's angle and height ranges (degrees): the view's sliders and its drag. */
const LIGHT_ANGLE = { min: -180, max: 180 }
const LIGHT_HEIGHT = { min: 0, max: 90 }

interface LightingFieldsProps {
  params: LightingParams
  set: (patch: Partial<LightingParams>) => void
}

/** A lighting node's fields: the key light (its angle and height on the 3D view's sliders)
 *  and highlight (lit shading only; painted shading
 *  has no light), with the ranges the scene panel's lighting section had. */
export function LightingFields({ params, set }: LightingFieldsProps) {
  return (
    <>
      <LightAngleView
        angle={params.lightAngle}
        height={params.lightHeight}
        min={LIGHT_ANGLE.min}
        max={LIGHT_ANGLE.max}
        heightMin={LIGHT_HEIGHT.min}
        heightMax={LIGHT_HEIGHT.max}
        onChange={(lightAngle) => set({ lightAngle })}
        onHeightChange={(lightHeight) => set({ lightHeight })}
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
      <NodeDivider />
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
