import { useEffect, useRef } from 'react'
import type { PatternStatus } from '../../hooks'
import type { Gray } from '../../pattern'
import type {
  PatternFold,
  PatternMapping,
  PatternMode,
  PatternParams,
  PatternStyle,
  PatternSymmetry,
} from '../../types'
import { RangeField } from '../ControlPanel/RangeField'
import { SelectField } from '../ControlPanel/SelectField'
import { ToggleField } from '../ControlPanel/ToggleField'
import { imageFileToUrl } from './patternImage'

const MODES: readonly PatternMode[] = ['repeat', 'generate', 'image']
const MAPPINGS: readonly PatternMapping[] = ['strip', 'surface']
const SYMMETRIES: readonly PatternSymmetry[] = ['none', 'mirror', 'all']
const FOLDS: readonly PatternFold[] = ['none', 'across', 'around', 'both']
const STYLES: readonly PatternStyle[] = ['raised', 'cut', 'bright', 'dark']

interface PatternFieldsProps {
  params: PatternParams
  set: (patch: Partial<PatternParams>) => void
  /** The map being made from them. */
  status?: PatternStatus
}

/** A pattern node's fields: its image, how the map is made from it (with a preview), and
 *  how it's laid on the trophy. */
export function PatternFields({ params, set, status }: PatternFieldsProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const generate = params.mode === 'generate'
  // Image mode uses the image as is: no threshold, no folding.
  const asIs = params.mode === 'image'
  return (
    <>
      <div className="node-card-wide">
        <MapPreview map={status?.map ?? null} />
        <p className="node-card-status" role="status" data-busy={status?.busy ? 'on' : undefined}>
          {status?.message || 'loading…'}
        </p>
        <div className="control-actions">
          <button type="button" className="control-button" onClick={() => fileRef.current?.click()}>
            load image
          </button>
          <button
            type="button"
            className="control-button"
            disabled={!generate}
            onClick={() => set({ seed: Math.floor(Math.random() * 100000) })}
          >
            new seed
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          aria-label="Pattern image"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) set({ image: await imageFileToUrl(file) })
          }}
        />
      </div>
      {/* Generate: new ornament from the image's pieces (Wave Function Collapse), read at
          'detail' cells across the strip, 'length' cells around each repeat, learning
          'size' × 'size' neighborhoods (with their mirror images, or every rotation too),
          folded into symmetric motifs. Repeat: the image's ornament around the strip (fold
          around mirrors every other repeat, so they meet seamlessly). Image: the image
          itself, as is (its brightness the relief), repeated around. */}
      <SelectField
        label="mode"
        value={params.mode}
        options={MODES}
        onChange={(mode) => set({ mode })}
      />
      {/* Strip: the ornament stretched over its strip (from/to). Surface: following the
          trophy's surface, keeping its proportions everywhere, repeating in rows (smaller
          where the trophy narrows), so it can cover the whole shape (from 0 to 100). */}
      <SelectField
        label="mapping"
        value={params.mapping}
        options={MAPPINGS}
        onChange={(mapping) => set({ mapping })}
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
      {/* Fades the ornament in from the strip's edges, so it sinks into the surface. */}
      <RangeField
        label="fade"
        value={params.fade}
        min={0}
        max={50}
        unit="%"
        onChange={(fade) => set({ fade })}
      />
      {/* The embossing's depth at the strip's top and bottom (eased between): lower one to
          have the ornament gradually lose its relief toward that end. */}
      <RangeField
        label="top depth"
        value={params.depthTop}
        min={0}
        max={100}
        unit="%"
        onChange={(depthTop) => set({ depthTop })}
      />
      <RangeField
        label="bottom depth"
        value={params.depthBottom}
        min={0}
        max={100}
        unit="%"
        onChange={(depthBottom) => set({ depthBottom })}
      />
      <RangeField
        label="repeats"
        value={params.repeats}
        min={1}
        max={24}
        unit=""
        onChange={(repeats) => set({ repeats })}
      />
      {/* The ornament's size (proportions kept): smaller repeats more and stacks in rows,
          larger crops it to the strip. */}
      <RangeField
        label="scale"
        value={params.scale}
        min={25}
        max={400}
        unit="%"
        onChange={(scale) => set({ scale })}
      />
      {/* Spins the pattern around the trophy (slides it sideways around the axis). */}
      <RangeField
        label="spin"
        value={params.spin}
        min={-180}
        max={180}
        unit="°"
        onChange={(spin) => set({ spin })}
      />
      {/* Turns the ornament on the trophy (in its rows and repeats). */}
      <RangeField
        label="angle"
        value={params.angle}
        min={-180}
        max={180}
        unit="°"
        onChange={(angle) => set({ angle })}
      />
      {/* Each motif's size where it sits (the same number of them): smaller spaces them out
          on plain surface, larger crops into them. */}
      <RangeField
        label="shape scale"
        value={params.shapeScale}
        min={10}
        max={200}
        unit="%"
        onChange={(shapeScale) => set({ shapeScale })}
      />
      <RangeField
        label="detail"
        value={params.detail}
        min={6}
        max={40}
        unit=""
        disabled={!generate}
        onChange={(detail) => set({ detail })}
      />
      <RangeField
        label="length"
        value={params.length}
        min={8}
        max={120}
        unit=""
        disabled={!generate}
        onChange={(length) => set({ length })}
      />
      <RangeField
        label="size"
        value={params.size}
        min={2}
        max={4}
        unit=""
        disabled={!generate}
        onChange={(size) => set({ size })}
      />
      <SelectField
        label="symmetry"
        value={params.symmetry}
        options={SYMMETRIES}
        disabled={!generate}
        onChange={(symmetry) => set({ symmetry })}
      />
      <SelectField
        label="fold"
        value={params.fold}
        options={FOLDS}
        disabled={asIs}
        onChange={(fold) => set({ fold })}
      />
      <RangeField
        label="threshold"
        value={params.threshold}
        min={1}
        max={99}
        unit="%"
        disabled={asIs}
        onChange={(threshold) => set({ threshold })}
      />
      <ToggleField label="invert" checked={params.invert} onChange={(invert) => set({ invert })} />
      <RangeField
        label="softness"
        value={params.softness}
        min={0}
        max={12}
        unit=""
        onChange={(softness) => set({ softness })}
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
        onChange={(strength) => set({ strength })}
      />
    </>
  )
}

/** The height map, drawn small (white = ornament). */
function MapPreview({ map }: { map: Gray | null }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context || !map) return
    canvas.width = map.width
    canvas.height = map.height
    const image = context.createImageData(map.width, map.height)
    for (let i = 0; i < map.data.length; i++) {
      const v = map.data[i] ?? 0
      image.data[4 * i] = v
      image.data[4 * i + 1] = v
      image.data[4 * i + 2] = v
      image.data[4 * i + 3] = 255
    }
    context.putImageData(image, 0, 0)
  }, [map])
  return <canvas ref={ref} className="pattern-preview" aria-label="Pattern preview" hidden={!map} />
}
