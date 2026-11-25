import { RangeField } from '../ControlPanel/RangeField'
import { ToggleField } from '../ControlPanel/ToggleField'
import { RadiusIcon } from '../icons'
import type { ShapeParams } from './graph'
import { NodeDivider } from './NodeView'
import { ShapeView } from './ShapeView'

export function ShapeFields({
  params,
  set,
}: {
  params: ShapeParams
  set: (patch: Partial<ShapeParams>) => void
}) {
  const box = (patch: Partial<ShapeParams['lineBox']>) =>
    set({ lineBox: { ...params.lineBox, ...patch } })
  return (
    <>
      {/* The line box on top: pad y and pad x on the view's sliders, then its radius. */}
      <ShapeView shape={params} onChange={box} />
      <RangeField
        label="radius"
        icon={<RadiusIcon />}
        value={params.lineBox.radius}
        min={0}
        max={100}
        param="lineBox.radius"
        onChange={(radius) => box({ radius })}
      />
      <NodeDivider />
      <ToggleField
        label="round top"
        checked={params.roundTop}
        onChange={(roundTop) => set({ roundTop })}
      />
      <RangeField
        label="top radius"
        value={params.topRadius}
        min={0}
        max={400}
        disabled={!params.roundTop}
        param="topRadius"
        onChange={(topRadius) => set({ topRadius })}
      />
      <RangeField
        label="taper"
        value={params.taper}
        min={0}
        max={90}
        unit="%"
        param="taper"
        onChange={(taper) => set({ taper })}
      />
      <NodeDivider />
      <ToggleField
        label="smooth joins"
        checked={params.smoothJoins}
        onChange={(smoothJoins) => set({ smoothJoins })}
      />
      <RangeField
        label="join radius"
        value={params.joinRadius}
        min={0}
        max={100}
        disabled={!params.smoothJoins}
        param="joinRadius"
        onChange={(joinRadius) => set({ joinRadius })}
      />
      <RangeField
        label="overshoot"
        value={params.overshoot}
        min={0}
        max={120}
        step={0.5}
        digits={1}
        param="overshoot"
        onChange={(overshoot) => set({ overshoot })}
      />
    </>
  )
}
