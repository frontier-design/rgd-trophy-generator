import type { TwistEnds, TwistParams, TwistSection } from '../../types'
import { RangeField } from '../ControlPanel/RangeField'
import { SelectField } from '../ControlPanel/SelectField'

const SECTIONS: readonly TwistSection[] = ['lobes', 'grooves']
const ENDS: readonly TwistEnds[] = ['fade', 'round']

interface TwistFieldsProps {
  params: TwistParams
  set: (patch: Partial<TwistParams>) => void
}

/** A twist node's fields. */
export function TwistFields({ params, set }: TwistFieldsProps) {
  return (
    <>
      {/* The flutes: their section (raised lobes, or grooves cut into ribs), how many, how
        deep, how sharp; how far they turn down the trophy and how the turn bends; where
        they start around; the band of the height they cover and how they end there. */}
      <SelectField
        label="section"
        value={params.section}
        options={SECTIONS}
        onChange={(section) => set({ section })}
      />
      <RangeField
        label="flutes"
        value={params.flutes}
        min={3}
        max={48}
        unit=""
        onChange={(flutes) => set({ flutes })}
      />
      <RangeField
        label="depth"
        value={params.depth}
        min={0}
        max={40}
        step={0.5}
        digits={1}
        unit="%"
        onChange={(depth) => set({ depth })}
      />
      <RangeField
        label="twist"
        value={params.twist}
        min={-360}
        max={360}
        unit="°"
        onChange={(twist) => set({ twist })}
      />
      <RangeField
        label="curve"
        value={params.curve}
        min={-100}
        max={100}
        unit="%"
        disabled={params.twist === 0}
        onChange={(curve) => set({ curve })}
      />
      <RangeField
        label="sharpness"
        value={params.sharpness}
        min={0}
        max={100}
        unit="%"
        onChange={(sharpness) => set({ sharpness })}
      />
      <RangeField
        label="rotate"
        value={params.rotate}
        min={-180}
        max={180}
        unit="°"
        onChange={(rotate) => set({ rotate })}
      />
      <RangeField
        label="from"
        value={params.from}
        min={0}
        max={100}
        unit="%"
        onChange={(from) => set({ from })}
      />
      <RangeField
        label="to"
        value={params.to}
        min={0}
        max={100}
        unit="%"
        onChange={(to) => set({ to })}
      />
      <SelectField
        label="ends"
        value={params.ends}
        options={ENDS}
        onChange={(ends) => set({ ends })}
      />
      <RangeField
        label="end size"
        value={params.endSize}
        min={0}
        max={50}
        step={0.5}
        digits={1}
        unit="%"
        onChange={(endSize) => set({ endSize })}
      />
    </>
  )
}
