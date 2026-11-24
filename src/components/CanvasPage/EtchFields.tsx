import type { EtchLayout, EtchParams, EtchStyle } from '../../types'
import { RangeField } from '../ControlPanel/RangeField'
import { SelectField } from '../ControlPanel/SelectField'
import { ToggleField } from '../ControlPanel/ToggleField'

const STYLES: readonly EtchStyle[] = ['cut', 'bright', 'dark']
const LAYOUTS: readonly EtchLayout[] = ['diagonal', 'vertical', 'horizontal', 'zigzag', 'wave']

interface EtchFieldsProps {
  params: EtchParams
  set: (patch: Partial<EtchParams>) => void
}

/** An etch node's fields. */
export function EtchFields({ params, set }: EtchFieldsProps) {
  const { layout } = params
  const swings = layout === 'zigzag' || layout === 'wave'
  return (
    <>
      {/* How the lines run (see EtchParams.layout); cross doubles them up: mirrored and
          crossing, or for horizontal rings, a grid with vertical lines. */}
      <SelectField
        label="layout"
        value={layout}
        options={LAYOUTS}
        onChange={(next) => set({ layout: next })}
      />
      {/* The strip (from/to); bundles of lines around it, how many lines each and how far
          apart, how thick (thickness); how far they wind over the strip, both ways (a lattice) or one;
          cut into the surface (grooves that catch the light) or inlaid bright or dark; and
          how strongly they show (cut: how steep the grooves are). */}
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
      {/* The lines' depth (inlaid: strength) fading in from the strip's edges, and easing
          from the top to the bottom of the strip. */}
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
      <RangeField
        label="bundles"
        value={params.bundles}
        min={1}
        max={24}
        unit=""
        param="bundles"
        onChange={(bundles) => set({ bundles })}
      />
      <RangeField
        label="lines"
        value={params.lines}
        min={1}
        max={8}
        unit=""
        param="lines"
        onChange={(lines) => set({ lines })}
      />
      <RangeField
        label="gap"
        value={params.gap}
        min={0.5}
        max={15}
        step={0.1}
        digits={1}
        unit="%"
        disabled={params.lines < 2}
        param="gap"
        onChange={(gap) => set({ gap })}
      />
      {/* In px of the 1920 × 1080 frame (so thin lines look thinner on a zoomed-out canvas). */}
      <RangeField
        label="thickness"
        value={params.width}
        min={0.3}
        max={40}
        step={0.1}
        digits={1}
        param="width"
        onChange={(width) => set({ width })}
      />
      <RangeField
        label="slant"
        value={params.slant}
        min={-360}
        max={360}
        unit="°"
        disabled={layout === 'vertical' || layout === 'horizontal'}
        param="slant"
        onChange={(slant) => set({ slant })}
      />
      <RangeField
        label="waves"
        value={params.waves}
        min={0.5}
        max={16}
        step={0.5}
        digits={1}
        unit=""
        disabled={!swings}
        param="waves"
        onChange={(waves) => set({ waves })}
      />
      <ToggleField
        label="cross"
        checked={params.cross}
        disabled={layout === 'vertical'}
        onChange={(cross) => set({ cross })}
      />
      <SelectField
        label="style"
        value={params.style}
        options={STYLES}
        onChange={(style) => set({ style })}
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
    </>
  )
}
