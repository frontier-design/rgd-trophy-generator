import { memo, useState } from 'react'
import { downloadBlob, maxImageScale } from '../../export'
import type { SceneExporter } from './CanvasScene'
import type { FrameRect, ImageExportOptions, SceneNode } from './sceneNode'

/** Frame sizes the width and height fields take. */
const FRAME_LIMITS = { min: 256, max: 8192 }
const SCALES = [1, 2, 3, 4, 5]

interface SceneToolsProps {
  node: Pick<SceneNode, 'id' | 'name' | 'x' | 'y' | 'frame' | 'imageExport'>
  /** A new frame size: the text and trophy are fitted to it. */
  onResize: (id: string, frame: FrameRect) => void
  onImageExportChange: (id: string, patch: Partial<ImageExportOptions>) => void
  /** The scene's image exporter, once its artboard is mounted. */
  exporter: (id: string) => SceneExporter | undefined
}

/**
 * Under a scene: its frame's width and height (bottom left; the background is always the
 * master's) and its PNG export (bottom right): scale (×2 by default), a transparent toggle
 * (dimmed while off) and export.
 */
export const SceneTools = memo(function SceneTools({
  node,
  onResize,
  onImageExportChange,
  exporter,
}: SceneToolsProps) {
  const { id, frame, imageExport } = node
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const maxScale = maxImageScale(frame.width, frame.height)
  const scale = Math.min(imageExport.scale, maxScale)
  const resize = (size: Partial<Pick<FrameRect, 'width' | 'height'>>) =>
    onResize(id, { x: node.x, y: node.y, ...frame, ...size })

  const exportImage = async () => {
    const run = exporter(id)
    if (!run) return
    setBusy(true)
    setError(null)
    try {
      const blob = await run({ ...imageExport, format: 'png', scale })
      const name = node.name.replace(/\s+/g, '-')
      downloadBlob(blob, `rgd-${name}-${frame.width * scale}x${frame.height * scale}.png`)
    } catch (e) {
      setError(`Couldn't export: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="scene-tools" data-no-pan>
      <div className="scene-tools-group" data-side="left">
        <FrameNumber
          label="width"
          short="W"
          value={frame.width}
          onChange={(width) => resize({ width })}
        />
        <FrameNumber
          label="height"
          short="H"
          value={frame.height}
          onChange={(height) => resize({ height })}
        />
      </div>
      <div className="scene-tools-group" data-side="right">
        {error && (
          <span className="scene-tools-error" role="alert">
            {error}
          </span>
        )}
        <select
          className="control-button scene-tools-select"
          aria-label="export scale"
          value={scale}
          onChange={(e) => onImageExportChange(id, { scale: Number(e.target.value) })}
        >
          {SCALES.filter((value) => value <= maxScale).map((value) => (
            <option key={value} value={value}>
              {value}×
            </option>
          ))}
        </select>
        <button
          type="button"
          className="control-button scene-tools-transparent"
          aria-pressed={imageExport.transparent}
          onClick={() => onImageExportChange(id, { transparent: !imageExport.transparent })}
        >
          transparent
        </button>
        <button
          type="button"
          className="control-button"
          disabled={busy}
          onClick={() => void exportImage()}
        >
          {busy ? 'exporting…' : 'export png'}
        </button>
      </div>
    </div>
  )
})

/** A frame side's whole-px field: applied once it's a number in range (typing 1080 doesn't
 *  apply 1, 10 and 108 on the way); leaving the field puts back the size in use. */
function FrameNumber({
  label,
  short,
  value,
  onChange,
}: {
  label: string
  short: string
  value: number
  onChange: (value: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <label className="scene-tools-field">
      <span aria-hidden="true">{short}</span>
      <input
        type="number"
        aria-label={label}
        inputMode="numeric"
        min={FRAME_LIMITS.min}
        max={FRAME_LIMITS.max}
        step={1}
        value={draft ?? String(value)}
        onChange={(e) => {
          setDraft(e.target.value)
          const n = Math.round(Number(e.target.value))
          if (
            e.target.value !== '' &&
            Number.isFinite(n) &&
            n >= FRAME_LIMITS.min &&
            n <= FRAME_LIMITS.max
          )
            onChange(n)
        }}
        onBlur={() => setDraft(null)}
      />
    </label>
  )
}
