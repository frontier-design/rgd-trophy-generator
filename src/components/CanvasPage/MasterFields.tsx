import type { Shading, TextAlign } from '../../types'
import { ColorField } from '../ControlPanel/ColorField'
import { RangeField } from '../ControlPanel/RangeField'
import { SelectField } from '../ControlPanel/SelectField'
import { ToggleField } from '../ControlPanel/ToggleField'
import type { MasterParams } from './master'

const TEXT_ALIGNS: readonly TextAlign[] = ['left', 'center']
const SHADINGS: readonly Shading[] = ['lit', 'painted']

interface MasterFieldsProps {
  params: MasterParams
  set: (patch: Partial<MasterParams>) => void
}

/** A group's heading inside the card (spans both columns). */
function Group({ title }: { title: string }) {
  return <div className="node-card-group">{title}</div>
}

/** The master node's fields: the settings shared by every scene (same ranges as the scene
 *  panel's fields they replace). */
export function MasterFields({ params, set }: MasterFieldsProps) {
  const lit = params.shading === 'lit'
  return (
    <>
      <Group title="shape" />
      <SelectField
        label="align"
        value={params.textAlign}
        options={TEXT_ALIGNS}
        onChange={(textAlign) => set({ textAlign })}
      />
      <ToggleField label="mirror" checked={params.mirror} onChange={(mirror) => set({ mirror })} />
      <Group title="material" />
      <SelectField
        label="shading"
        value={params.shading}
        options={SHADINGS}
        onChange={(shading) => set({ shading })}
      />
      <RangeField
        label="banding"
        value={params.banding}
        min={0}
        max={1}
        step={0.01}
        digits={2}
        unit=""
        onChange={(banding) => set({ banding })}
      />
      <RangeField
        label="scale"
        value={params.gradientScale}
        min={0.25}
        max={3}
        step={0.05}
        digits={2}
        unit="×"
        onChange={(gradientScale) => set({ gradientScale })}
      />
      <RangeField
        label="tilt"
        value={params.tilt}
        min={-1}
        max={1}
        step={0.01}
        digits={2}
        unit=""
        disabled={lit}
        onChange={(tilt) => set({ tilt })}
      />
      <RangeField
        label="wobble"
        value={params.wobble}
        min={0}
        max={5}
        step={0.01}
        digits={2}
        unit=""
        onChange={(wobble) => set({ wobble })}
      />
      <RangeField
        label="edge hue"
        value={params.edgeHue}
        min={-90}
        max={90}
        unit="°"
        disabled={lit}
        onChange={(edgeHue) => set({ edgeHue })}
      />
      <RangeField
        label="ledge"
        value={params.ledgeShadow}
        min={0}
        max={1}
        step={0.01}
        digits={2}
        unit=""
        onChange={(ledgeShadow) => set({ ledgeShadow })}
      />
      <RangeField
        label="grain"
        value={params.grain}
        min={0}
        max={1}
        step={0.01}
        digits={2}
        unit=""
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
      <Group title="canvas" />
      <ColorField
        label="background"
        value={params.background}
        onChange={(background) => set({ background })}
      />
      <Group title="view" />
      <div className="control-actions">
        <button
          type="button"
          className="control-button"
          aria-pressed={!params.revolve}
          onClick={() => set({ revolve: !params.revolve })}
        >
          2D sketch
        </button>
        <button
          type="button"
          className="control-button"
          aria-pressed={params.perspective}
          onClick={() => set({ perspective: !params.perspective })}
        >
          perspective
        </button>
        <button
          type="button"
          className="control-button"
          aria-pressed={params.debug}
          onClick={() => set({ debug: !params.debug })}
        >
          debug
        </button>
      </div>
    </>
  )
}
