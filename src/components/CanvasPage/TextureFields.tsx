import type { TextureParams, TextureStyle } from '../../types'
import { RangeField } from '../ControlPanel/RangeField'
import { SelectField } from '../ControlPanel/SelectField'

const STYLES: readonly TextureStyle[] = ['rough', 'hammered', 'brushed']

interface TextureFieldsProps {
  params: TextureParams
  set: (patch: Partial<TextureParams>) => void
}

/** A texture node's fields. */
export function TextureFields({ params, set }: TextureFieldsProps) {
  return (
    <>
      {/* Rough: cast, uneven noise. Hammered: overlapping dents. Brushed: fine streaks
          (their direction: angle). */}
      <SelectField
        label="style"
        value={params.style}
        options={STYLES}
        onChange={(style) => set({ style })}
      />
      {/* The features' size (frame px) and how steep their relief is. */}
      <RangeField
        label="scale"
        value={params.scale}
        min={1}
        max={80}
        step={0.5}
        digits={1}
        unit="px"
        param="scale"
        onChange={(scale) => set({ scale })}
      />
      <RangeField
        label="strength"
        value={params.strength}
        min={0}
        max={100}
        unit="%"
        param="strength"
        onChange={(strength) => set({ strength })}
      />
      <RangeField
        label="angle"
        value={params.angle}
        min={-90}
        max={90}
        unit="°"
        disabled={params.style !== 'brushed'}
        param="angle"
        onChange={(angle) => set({ angle })}
      />
      <div className="node-card-wide control-actions">
        <button
          type="button"
          className="control-button"
          onClick={() => set({ seed: Math.floor(Math.random() * 256) })}
        >
          new seed
        </button>
      </div>
      {/* Where it is (the whole trophy by default), fading in from the strip's edges and
          easing from the top depth to the bottom depth. */}
      <RangeField
        label="from"
        value={params.from}
        min={0}
        max={100}
        unit="%"
        param="from"
        onChange={(from) => set({ from })}
      />
      <RangeField
        label="to"
        value={params.to}
        min={0}
        max={100}
        unit="%"
        param="to"
        onChange={(to) => set({ to })}
      />
      <RangeField
        label="fade"
        value={params.fade}
        min={0}
        max={50}
        unit="%"
        param="fade"
        onChange={(fade) => set({ fade })}
      />
      <RangeField
        label="top depth"
        value={params.depthTop}
        min={0}
        max={100}
        unit="%"
        param="depthTop"
        onChange={(depthTop) => set({ depthTop })}
      />
      <RangeField
        label="bottom depth"
        value={params.depthBottom}
        min={0}
        max={100}
        unit="%"
        param="depthBottom"
        onChange={(depthBottom) => set({ depthBottom })}
      />
    </>
  )
}
