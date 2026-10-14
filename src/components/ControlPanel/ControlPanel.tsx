import { generatePalette, PALETTE_NAMES, paletteColors } from '../../material'
import { useSettings } from '../../state'
import type {
  CanvasColors,
  LineBoxStyle,
  MaterialSettings,
  PaletteChoice,
  Shading,
} from '../../types'
import { ColorField } from './ColorField'
import { ColorStops } from './ColorStops'
import { RangeField } from './RangeField'
import { SeedColorField } from './SeedColorField'
import { ToggleField } from './ToggleField'
import { SelectField } from './SelectField'

const PALETTE_CHOICES: readonly PaletteChoice[] = [...PALETTE_NAMES, 'custom']
/** Lit: light through the palette as a gradient map. Painted: the palette along the height. */
const SHADINGS: readonly Shading[] = ['lit', 'painted']
/** Line height slider range, as multiples of the type size. */
const LINE_HEIGHT_RANGE = { min: 0.7, max: 2.5 }

interface ControlPanelProps {
  lineBox: LineBoxStyle
  onLineBoxChange: (lineBox: LineBoxStyle) => void
  topHeight: number
  onTopHeightChange: (topHeight: number) => void
  overshoot: number
  onOvershootChange: (overshoot: number) => void
  roundTop: boolean
  onRoundTopChange: (roundTop: boolean) => void
  topRadius: number
  onTopRadiusChange: (topRadius: number) => void
  /** In % (0–90). */
  taper: number
  onTaperChange: (taper: number) => void
  smoothJoins: boolean
  onSmoothJoinsChange: (smoothJoins: boolean) => void
  joinRadius: number
  onJoinRadiusChange: (joinRadius: number) => void
  canvasColors: CanvasColors
  onCanvasColorsChange: (colors: CanvasColors) => void
  debug: boolean
  onDebugChange: (debug: boolean) => void
  /** True = the 3D trophy; false = the 2D sketch. */
  revolve: boolean
  onRevolveChange: (revolve: boolean) => void
  mirror: boolean
  onMirrorChange: (mirror: boolean) => void
  perspective: boolean
  onPerspectiveChange: (perspective: boolean) => void
}

/** The sidebar: shape controls, the trophy material, then view toggles, stacked. */
export function ControlPanel({
  lineBox,
  onLineBoxChange,
  topHeight,
  onTopHeightChange,
  overshoot,
  onOvershootChange,
  roundTop,
  onRoundTopChange,
  topRadius,
  onTopRadiusChange,
  taper,
  onTaperChange,
  smoothJoins,
  onSmoothJoinsChange,
  joinRadius,
  onJoinRadiusChange,
  canvasColors,
  onCanvasColorsChange,
  debug,
  onDebugChange,
  revolve,
  onRevolveChange,
  mirror,
  onMirrorChange,
  perspective,
  onPerspectiveChange,
}: ControlPanelProps) {
  const { settings, dispatch } = useSettings()
  const setLineBox = (patch: Partial<LineBoxStyle>) => onLineBoxChange({ ...lineBox, ...patch })
  const { material } = settings
  const lit = material.shading === 'lit'
  const setMaterial = (patch: Partial<MaterialSettings>) =>
    dispatch({ type: 'updateMaterial', patch })

  return (
    <aside className="control-panel" aria-label="Control panel">
      <RangeField
        label="size"
        value={settings.fontSize}
        min={12}
        max={120}
        step={0.1}
        digits={1}
        onChange={(fontSize) => dispatch({ type: 'setFontSize', fontSize })}
      />
      {/* In px; the range follows the type size so it stays useful at any size. (Changing
          the size still scales line height proportionally.) */}
      <RangeField
        label="line height"
        value={settings.lineHeight}
        min={Math.round(settings.fontSize * LINE_HEIGHT_RANGE.min)}
        max={Math.round(settings.fontSize * LINE_HEIGHT_RANGE.max)}
        step={0.1}
        digits={1}
        onChange={(lineHeight) => dispatch({ type: 'update', patch: { lineHeight } })}
      />
      {/* The right edge is the column width: the revolve axis, and the width text wraps at. */}
      <RangeField
        label="edge"
        value={settings.columnWidth}
        min={100}
        max={1200}
        onChange={(columnWidth) => dispatch({ type: 'update', patch: { columnWidth } })}
      />
      {/* Reflect the text across the edge: the trophy sits between two text blocks. */}
      <ToggleField label="mirror" checked={mirror} onChange={onMirrorChange} />
      <RangeField label="top" value={topHeight} min={0} max={300} onChange={onTopHeightChange} />
      {/* Rounds the top band's bottom-left corner: the top section's bottom rim on the
          trophy. Needs a top band (top > 0). */}
      <ToggleField label="round top" checked={roundTop} onChange={onRoundTopChange} />
      <RangeField
        label="top radius"
        value={topRadius}
        min={0}
        max={100}
        disabled={!roundTop}
        onChange={onTopRadiusChange}
      />
      {/* Narrows the top band toward its top: on the trophy, the top circle thins out. */}
      <RangeField label="taper" value={taper} min={0} max={90} unit="%" onChange={onTaperChange} />
      {/* How far the shape's bottom extends below the last baseline (optical alignment). */}
      <RangeField
        label="overshoot"
        value={overshoot}
        min={0}
        max={20}
        step={0.5}
        digits={1}
        onChange={onOvershootChange}
      />
      <RangeField
        label="pad x"
        value={lineBox.padX}
        min={-20}
        max={100}
        onChange={(padX) => setLineBox({ padX })}
      />
      <RangeField
        label="pad y"
        value={lineBox.padY}
        min={-20}
        max={100}
        onChange={(padY) => setLineBox({ padY })}
      />
      <RangeField
        label="radius"
        value={lineBox.radius}
        min={0}
        max={100}
        onChange={(radius) => setLineBox({ radius })}
      />
      {/* Rounds the sharp corners where one line's box meets the next (e.g. RGD over
          BRANDING): on the trophy, a smooth fillet between the rims. */}
      <ToggleField label="smooth joins" checked={smoothJoins} onChange={onSmoothJoinsChange} />
      <RangeField
        label="join radius"
        value={joinRadius}
        min={0}
        max={100}
        disabled={!smoothJoins}
        onChange={onJoinRadiusChange}
      />
      <hr className="control-divider" />
      <SelectField
        label="shading"
        value={material.shading}
        options={SHADINGS}
        onChange={(shading) => setMaterial({ shading })}
      />
      <SelectField
        label="palette"
        value={material.palette}
        options={PALETTE_CHOICES}
        onChange={(palette) => setMaterial({ palette })}
      />
      {/* Pick one color and generate a perceptually even palette around it. Generated
          ramps are dense, so blending switches to linear (banding 0) for seamless
          transitions; raise banding to bring soft bands back. */}
      <SeedColorField
        value={material.seedColor}
        onChange={(seedColor) =>
          setMaterial({
            palette: 'custom',
            customColors: generatePalette(seedColor),
            seedColor,
            banding: 0,
          })
        }
      />
      {/* Shows the current palette's colors. Editing a preset's colors switches to
          'custom', starting from that preset. */}
      <ColorStops
        colors={paletteColors(material)}
        onChange={(customColors) => setMaterial({ palette: 'custom', customColors })}
      />
      <RangeField
        label="banding"
        value={material.banding}
        min={0}
        max={1}
        step={0.01}
        digits={2}
        unit=""
        onChange={(banding) => setMaterial({ banding })}
      />
      <RangeField
        label="offset"
        value={material.gradientOffset}
        min={-0.5}
        max={0.5}
        step={0.01}
        digits={2}
        unit=""
        onChange={(gradientOffset) => setMaterial({ gradientOffset })}
      />
      <RangeField
        label="scale"
        value={material.gradientScale}
        min={0.25}
        max={3}
        step={0.05}
        digits={2}
        unit="×"
        onChange={(gradientScale) => setMaterial({ gradientScale })}
      />
      <RangeField
        label="tilt"
        value={material.tilt}
        min={-1}
        max={1}
        step={0.01}
        digits={2}
        unit=""
        disabled={lit}
        onChange={(tilt) => setMaterial({ tilt })}
      />
      <RangeField
        label="wobble"
        value={material.wobble}
        min={0}
        max={1}
        step={0.01}
        digits={2}
        unit=""
        onChange={(wobble) => setMaterial({ wobble })}
      />
      <RangeField
        label="edge depth"
        value={material.edgeDepth}
        min={0}
        max={1}
        step={0.01}
        digits={2}
        unit=""
        onChange={(edgeDepth) => setMaterial({ edgeDepth })}
      />
      <RangeField
        label="edge hue"
        value={material.edgeHue}
        min={-90}
        max={90}
        unit="°"
        disabled={lit}
        onChange={(edgeHue) => setMaterial({ edgeHue })}
      />
      <RangeField
        label="ledge"
        value={material.ledgeShadow}
        min={0}
        max={1}
        step={0.01}
        digits={2}
        unit=""
        onChange={(ledgeShadow) => setMaterial({ ledgeShadow })}
      />
      <RangeField
        label="grain"
        value={material.grain}
        min={0}
        max={1}
        step={0.01}
        digits={2}
        unit=""
        onChange={(grain) => setMaterial({ grain })}
      />
      {/* Lit mode's key light and highlight, like Illustrator's 3D shading options. */}
      <RangeField
        label="light angle"
        value={material.lightAngle}
        min={-180}
        max={180}
        unit="°"
        disabled={!lit}
        onChange={(lightAngle) => setMaterial({ lightAngle })}
      />
      <RangeField
        label="light height"
        value={material.lightHeight}
        min={0}
        max={90}
        unit="°"
        disabled={!lit}
        onChange={(lightHeight) => setMaterial({ lightHeight })}
      />
      <RangeField
        label="ambient"
        value={material.ambient}
        min={0}
        max={1}
        step={0.01}
        digits={2}
        unit=""
        disabled={!lit}
        onChange={(ambient) => setMaterial({ ambient })}
      />
      <RangeField
        label="softness"
        value={material.softness}
        min={0}
        max={1}
        step={0.01}
        digits={2}
        unit=""
        disabled={!lit}
        onChange={(softness) => setMaterial({ softness })}
      />
      <RangeField
        label="highlight"
        value={material.highlight}
        min={0}
        max={1.5}
        step={0.01}
        digits={2}
        unit=""
        disabled={!lit}
        onChange={(highlight) => setMaterial({ highlight })}
      />
      <RangeField
        label="highlight size"
        value={material.highlightSize}
        min={0}
        max={1}
        step={0.01}
        digits={2}
        unit=""
        disabled={!lit}
        onChange={(highlightSize) => setMaterial({ highlightSize })}
      />
      <hr className="control-divider" />
      <ColorField
        label="background"
        value={canvasColors.background}
        onChange={(background) => onCanvasColorsChange({ ...canvasColors, background })}
      />
      <ColorField
        label="text"
        value={canvasColors.text}
        onChange={(text) => onCanvasColorsChange({ ...canvasColors, text })}
      />
      <hr className="control-divider" />
      <div className="control-actions">
        {/* The view starts in 3D; this flips to the flat 2D sketch (and back, with the sweep). */}
        <button
          type="button"
          className="control-button"
          aria-pressed={!revolve}
          onClick={() => onRevolveChange(!revolve)}
        >
          2D sketch
        </button>
        <button
          type="button"
          className="control-button"
          aria-pressed={perspective}
          onClick={() => onPerspectiveChange(!perspective)}
        >
          perspective
        </button>
        <button
          type="button"
          className="control-button"
          aria-pressed={debug}
          onClick={() => onDebugChange(!debug)}
        >
          debug
        </button>
      </div>
    </aside>
  )
}
