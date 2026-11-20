import { RangeField } from '../ControlPanel/RangeField'
import { ToggleField } from '../ControlPanel/ToggleField'
import type { ShapeParams } from './graph'

export function ShapeFields({ params, set }: { params: ShapeParams; set: (patch: Partial<ShapeParams>) => void }) {
  const box = (patch: Partial<ShapeParams['lineBox']>) => set({ lineBox: { ...params.lineBox, ...patch } })
  return <>
    <ToggleField label="round top" checked={params.roundTop} onChange={(roundTop) => set({ roundTop })} />
    <RangeField label="top radius" value={params.topRadius} min={0} max={400} disabled={!params.roundTop} onChange={(topRadius) => set({ topRadius })} />
    <RangeField label="taper" value={params.taper} min={0} max={90} unit="%" onChange={(taper) => set({ taper })} />
    <RangeField label="pad x" value={params.lineBox.padX} min={-20} max={100} onChange={(padX) => box({ padX })} />
    <RangeField label="pad y" value={params.lineBox.padY} min={-20} max={100} onChange={(padY) => box({ padY })} />
    <RangeField label="radius" value={params.lineBox.radius} min={0} max={100} onChange={(radius) => box({ radius })} />
    <ToggleField label="smooth joins" checked={params.smoothJoins} onChange={(smoothJoins) => set({ smoothJoins })} />
    <RangeField label="join radius" value={params.joinRadius} min={0} max={100} disabled={!params.smoothJoins} onChange={(joinRadius) => set({ joinRadius })} />
    <RangeField label="overshoot" value={params.overshoot} min={0} max={20} step={0.5} digits={1} onChange={(overshoot) => set({ overshoot })} />
  </>
}
