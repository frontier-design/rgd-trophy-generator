import { useState } from 'react'
import { downloadBlob, maxImageScale } from '../../export'
import { ControlSection } from '../ControlPanel/ControlSection'
import { ColorField } from '../ControlPanel/ColorField'
import { NumberField } from '../ControlPanel/NumberField'
import { RangeField } from '../ControlPanel/RangeField'
import { SelectField } from '../ControlPanel/SelectField'
import { TextField } from '../ControlPanel/TextField'
import { ToggleField } from '../ControlPanel/ToggleField'
import type { SceneExporter } from './CanvasScene'
import type { ImageExportOptions } from './sceneNode'
import { REPEAT_TILE_HEIGHT, type RepeatNode } from './repeatNode'

interface RepeatControlsProps {
  node: RepeatNode
  onUpdate: (id: string, update: (node: RepeatNode) => RepeatNode) => void
  exporter: (id: string) => SceneExporter | undefined
}

const FORMATS = ['png', 'jpeg'] as const
const SECTIONS = ['type', 'repeat', 'frame', 'image'] as const
type Section = (typeof SECTIONS)[number]
const SCALE_LABELS = ['×1', '×2', '×3', '×4', '×5'] as const

/** A selected repeat artboard's controls: typography, grid, frame, background and export. */
export function RepeatControls({ node, onUpdate, exporter }: RepeatControlsProps) {
  const update = (change: (node: RepeatNode) => RepeatNode) => onUpdate(node.id, change)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<ReadonlySet<Section>>(() => new Set())
  const allCollapsed = collapsed.size === SECTIONS.length
  const section = (title: Section) => ({
    title,
    open: !collapsed.has(title),
    onOpenChange: (open: boolean) =>
      setCollapsed((current) => {
        const next = new Set(current)
        if (open) next.delete(title)
        else next.add(title)
        return next
      }),
  })
  const maxScale = maxImageScale(node.frame.width, node.frame.height)
  const scale = Math.min(node.imageExport.scale, maxScale)
  const setExport = (patch: Partial<ImageExportOptions>) =>
    update((current) => ({
      ...current,
      imageExport: { ...current.imageExport, ...patch },
    }))
  const exportImage = async () => {
    const run = exporter(node.id)
    if (!run) return
    setBusy(true)
    setError(null)
    try {
      const blob = await run({ ...node.imageExport, scale })
      const ext = node.imageExport.format === 'png' ? 'png' : 'jpg'
      downloadBlob(
        blob,
        `rgd-${node.name.replace(/\s+/g, '-')}-${node.frame.width * scale}x${node.frame.height * scale}.${ext}`,
      )
    } catch (e) {
      setError(`Couldn't export: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside className="control-panel repeat-controls" aria-label="Control panel">
      <div className="control-panel-tools">
        <span className="scene-controls-name">{node.name}</span>
        <button
          type="button"
          className="control-section-all"
          onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(SECTIONS))}
        >
          {allCollapsed ? 'expand all' : 'collapse all'}
        </button>
      </div>
      <ControlSection {...section('type')}>
        <TextField
          label="font"
          value={node.typography.fontFamily}
          onChange={(fontFamily) => update((current) => ({ ...current, typography: { ...current.typography, fontFamily } }))}
        />
        <RangeField
          label="size"
          value={node.typography.fontSize}
          min={8}
          max={300}
          onChange={(fontSize) => update((current) => ({ ...current, typography: { ...current.typography, fontSize } }))}
        />
        <RangeField
          label="line height"
          value={node.typography.lineHeight}
          min={8}
          max={300}
          onChange={(lineHeight) => update((current) => ({ ...current, typography: { ...current.typography, lineHeight } }))}
        />
      </ControlSection>
      <ControlSection {...section('repeat')}>
        {/* The tile's width is the text column's: trophies repeat axis to axis by it. */}
        <RangeField
          label="tile width"
          value={node.typography.columnWidth}
          min={100}
          max={3000}
          unit="px"
          onChange={(columnWidth) => update((current) => ({ ...current, typography: { ...current.typography, columnWidth } }))}
        />
        <RangeField
          label="tile height"
          value={node.layout.tileHeight}
          min={REPEAT_TILE_HEIGHT.min}
          max={4000}
          unit="px"
          onChange={(tileHeight) => update((current) => ({ ...current, layout: { ...current.layout, tileHeight } }))}
        />
        <RangeField
          label="tile scale"
          value={node.layout.scale}
          min={0.1}
          max={4}
          step={0.01}
          digits={2}
          unit="×"
          onChange={(scale) => update((current) => ({ ...current, layout: { ...current.layout, scale } }))}
        />
        <RangeField
          label="spacing x"
          value={node.layout.spacingX}
          min={-500}
          max={800}
          onChange={(spacingX) => update((current) => ({ ...current, layout: { ...current.layout, spacingX } }))}
        />
        <RangeField
          label="spacing y"
          value={node.layout.spacingY}
          min={-500}
          max={800}
          onChange={(spacingY) => update((current) => ({ ...current, layout: { ...current.layout, spacingY } }))}
        />
        <RangeField
          label="offset x"
          value={node.layout.offsetX}
          min={-4000}
          max={4000}
          onChange={(offsetX) => update((current) => ({ ...current, layout: { ...current.layout, offsetX } }))}
        />
        <RangeField
          label="offset y"
          value={node.layout.offsetY}
          min={-4000}
          max={4000}
          onChange={(offsetY) => update((current) => ({ ...current, layout: { ...current.layout, offsetY } }))}
        />
      </ControlSection>
      <ControlSection {...section('frame')}>
        <NumberField
          label="width"
          value={node.frame.width}
          min={256}
          max={8192}
          onChange={(width) => update((current) => ({ ...current, frame: { ...current.frame, width } }))}
        />
        <NumberField
          label="height"
          value={node.frame.height}
          min={256}
          max={8192}
          onChange={(height) => update((current) => ({ ...current, frame: { ...current.frame, height } }))}
        />
        <ColorField
          label="background"
          value={node.background}
          onChange={(background) => update((current) => ({ ...current, background }))}
        />
      </ControlSection>
      <ControlSection {...section('image')}>
        <SelectField
          label="format"
          value={node.imageExport.format}
          options={FORMATS}
          onChange={(format) => setExport({ format })}
        />
        <SelectField
          label="export scale"
          value={`×${scale}` as (typeof SCALE_LABELS)[number]}
          options={SCALE_LABELS.filter((_, index) => index + 1 <= maxScale)}
          onChange={(label) => setExport({ scale: Number(label.slice(1)) })}
        />
        <ToggleField
          label="transparent"
          checked={node.imageExport.transparent && node.imageExport.format === 'png'}
          disabled={node.imageExport.format !== 'png'}
          onChange={(transparent) => setExport({ transparent })}
        />
        <div className="control-actions">
          <button type="button" className="control-button" disabled={busy} onClick={() => void exportImage()}>
            {busy ? 'exporting…' : `export ${node.imageExport.format}`}
          </button>
          <output className="export-progress">
            {node.frame.width * scale} × {node.frame.height * scale}
          </output>
        </div>
        {error && (
          <p className="export-error" role="alert">
            {error}
          </p>
        )}
      </ControlSection>
    </aside>
  )
}
