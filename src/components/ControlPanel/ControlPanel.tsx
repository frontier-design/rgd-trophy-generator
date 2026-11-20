import { useState, type ReactNode } from 'react'
import type { BannerPosition } from '../../banner'
import { generatePalette, PALETTE_NAMES, paletteColors } from '../../material'
import type { ParamPath } from '../../timeline'
import type {
  AnimatedParams,
  KeyframeControl,
  LineBoxStyle,
  MaterialSettings,
  PaletteChoice,
  RevealOrder,
  RevealStyle,
  Shading,
  TextAlign,
} from '../../types'
import { ColorField } from './ColorField'
import { ColorStops } from './ColorStops'
import { ControlSection } from './ControlSection'
import { NumberField } from './NumberField'
import { RangeField } from './RangeField'
import { SeedColorField } from './SeedColorField'
import { SelectField } from './SelectField'
import { TextField } from './TextField'
import { ToggleField } from './ToggleField'

const PALETTE_CHOICES: readonly PaletteChoice[] = [...PALETTE_NAMES, 'custom']
/** Lit: light through the palette as a gradient map. Painted: the palette along the height. */
const SHADINGS: readonly Shading[] = ['lit', 'painted']
/** Stack: lines stack in from the bottom. Type: letters type in one by one. */
const REVEAL_STYLES: readonly RevealStyle[] = ['stack', 'type']
/** Which line reveals first. */
const REVEAL_ORDERS: readonly RevealOrder[] = ['bottom', 'top']
const TEXT_ALIGNS: readonly TextAlign[] = ['left', 'center']
/** Line height slider range, as multiples of the type size. */
const LINE_HEIGHT_RANGE = { min: 0.7, max: 2.5 }
const FRAME_RATES = ['24', '30', '60'] as const
const BANNER_POSITIONS: readonly BannerPosition[] = ['top', 'bottom']
const IMAGE_FORMATS = ['png', 'jpeg'] as const
const IMAGE_SCALE_LABELS = ['×1', '×2', '×3', '×4', '×5'] as const

const SECTIONS = [
  'type',
  'shape',
  'top',
  'line boxes',
  'material',
  'lighting',
  'canvas',
  'banner',
  'frame',
  'view',
  'image',
  'timeline',
] as const
type SectionName = (typeof SECTIONS)[number]

/** Playback, sequence length and video export, for the timeline section. */
export interface TransportControls {
  playing: boolean
  /** Sequence length (s). */
  length: number
  onPlayToggle: () => void
  onRewind: () => void
  /** Playback loops. */
  loop: boolean
  onLoopChange: (loop: boolean) => void
  onLengthChange: (seconds: number) => void
  fps: number
  onFpsChange: (fps: number) => void
  /** 0–1 while exporting, else null. */
  exportProgress: number | null
  exportError: string | null
  onExport: () => void
  onCancelExport: () => void
  /** Preset: a full-frame cylinder the text sculpts as it stacks in, looping. */
  onSculptIntro: () => void
}

/** The frame's size (canvas scenes): presets or any width and height, and re-fitting the
 *  layout to it. */
export interface FrameControls {
  width: number
  height: number
  /** Named sizes, by label (`width × height`). */
  presets: ReadonlyArray<{ label: string; width: number; height: number }>
  onSizeChange: (width: number, height: number) => void
  /** Fit the text and trophy to the frame again (e.g. after editing the text). */
  onFit: () => void
}

/** Still image export: PNG (optionally transparent) or JPEG, at ×1–×5. */
export interface ImageExportControls {
  format: 'png' | 'jpeg'
  onFormatChange: (format: 'png' | 'jpeg') => void
  scale: number
  onScaleChange: (scale: number) => void
  /** The largest scale this frame can be rendered at. */
  maxScale: number
  transparent: boolean
  onTransparentChange: (transparent: boolean) => void
  /** The output's size at the chosen scale, e.g. "3840 × 2160". */
  size: string
  busy: boolean
  error: string | null
  onExport: () => void
}

/** Fields a panel can leave out (the canvas sets these once, on its master node). */
export type HideableField =
  | 'align'
  | 'mirror'
  | 'overshoot'
  | 'roundTop'
  | 'taper'
  | 'smoothJoins'
  | 'shading'
  | 'banding'
  | 'gradientScale'
  | 'tilt'
  | 'wobble'
  | 'edgeHue'
  | 'ledge'
  | 'grain'
  | 'grainSize'
  | 'background'
  | 'lighting'
  | 'view'

/** The banner's placement and text (not animated). */
export interface BannerControls {
  position: BannerPosition
  onPositionChange: (position: BannerPosition) => void
  headline: string
  onHeadlineChange: (headline: string) => void
  link: string
  onLinkChange: (link: string) => void
}

interface ControlPanelProps {
  /** Shown at the top of the panel, left of collapse/expand all (the page dropdown). */
  tools?: ReactNode
  /** Every animatable param (the sidebar's fields). */
  params: AnimatedParams
  onParamsChange: (patch: Partial<AnimatedParams>) => void
  /** Each param's timeline keyframe button; none without a timeline. */
  keyframe?: (path: ParamPath) => KeyframeControl
  transport?: TransportControls
  banner?: BannerControls
  /** Fields to leave out (set elsewhere, e.g. on the canvas's master node). */
  hidden?: ReadonlySet<HideableField>
  hideShapeMaterial?: boolean
  /** Show the reveal's fields (the text's and the banner's): they're for animating. */
  revealControls?: boolean
  /** The frame's size (canvas scenes). */
  frame?: FrameControls
  /** Still image export. */
  imageExport?: ImageExportControls
  debug: boolean
  onDebugChange: (debug: boolean) => void
  /** True = the 3D trophy; false = the 2D sketch. */
  revolve: boolean
  onRevolveChange: (revolve: boolean) => void
  perspective: boolean
  onPerspectiveChange: (perspective: boolean) => void
}

/** The sidebar: named, collapsible sections (type, shape, top, line boxes, material,
 *  lighting, canvas, banner, view, timeline), separated by solid rules. */
export function ControlPanel({
  tools,
  params,
  onParamsChange,
  keyframe,
  transport,
  banner,
  hidden,
  hideShapeMaterial = false,
  revealControls = true,
  frame,
  imageExport,
  debug,
  onDebugChange,
  revolve,
  onRevolveChange,
  perspective,
  onPerspectiveChange,
}: ControlPanelProps) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<SectionName>>(() => new Set())
  const allCollapsed = SECTIONS.every((name) => collapsed.has(name))
  const sectionProps = (name: SectionName) => ({
    title: name,
    open: !collapsed.has(name),
    onOpenChange: (open: boolean) =>
      setCollapsed((current) => {
        const next = new Set(current)
        if (open) next.delete(name)
        else next.add(name)
        return next
      }),
  })

  const shown = (field: HideableField) => !hidden?.has(field)
  const { material, lineBox, canvasColors } = params
  const lit = material.shading === 'lit'
  const setLineBox = (patch: Partial<LineBoxStyle>) =>
    onParamsChange({ lineBox: { ...lineBox, ...patch } })
  const setMaterial = (patch: Partial<MaterialSettings>) =>
    onParamsChange({ material: { ...material, ...patch } })
  const shownColors = paletteColors(material)
  // Keyframing a preset's color first switches to a custom palette seeded from the preset,
  // as editing it would.
  const colorKeyframe = (index: number): KeyframeControl | undefined => {
    const control = keyframe?.(`material.colors.c${index + 1}` as ParamPath)
    if (!control || material.palette === 'custom') return control
    return {
      ...control,
      onToggle: () => {
        setMaterial({ palette: 'custom', customColors: [...shownColors] })
        control.onToggle()
      },
    }
  }

  return (
    <aside className="control-panel" aria-label="Control panel">
      <div className="control-panel-tools">
        {tools}
        <button
          type="button"
          className="control-section-all"
          onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(SECTIONS))}
        >
          {allCollapsed ? 'expand all' : 'collapse all'}
        </button>
      </div>
      <ControlSection {...sectionProps('type')}>
        {/* Changing the size scales line height by the same factor. */}
        <RangeField
          label="size"
          value={params.fontSize}
          min={12}
          max={300}
          step={0.1}
          digits={1}
          keyframe={keyframe?.('type.size')}
          onChange={(fontSize) => {
            if (!(fontSize > 0)) return
            onParamsChange({
              fontSize,
              lineHeight: params.lineHeight * (fontSize / params.fontSize),
            })
          }}
        />
        {/* In px; the range follows the type size so it stays useful at any size. */}
        <RangeField
          label="line height"
          value={params.lineHeight}
          min={Math.round(params.fontSize * LINE_HEIGHT_RANGE.min)}
          max={Math.round(params.fontSize * LINE_HEIGHT_RANGE.max)}
          step={0.1}
          digits={1}
          keyframe={keyframe?.('type.leading')}
          onChange={(lineHeight) => onParamsChange({ lineHeight })}
        />
        {shown('align') && (
          <>
            {/* Left (the rag on the right) or centered lines; the mirror follows. */}
            <SelectField
              label="align"
              value={params.textAlign}
              options={TEXT_ALIGNS}
              keyframe={keyframe?.('type.align')}
              onChange={(textAlign) => onParamsChange({ textAlign })}
            />
          </>
        )}
        {revealControls && (
          <>
            {/* Reveals the text; only what has appeared carves the shape, so at 0% it's uncarved
                (a full cylinder). Stack: bottom line first, each sliding in from the left
                (stagger: time between lines, % of a slide; slide: how far left a line starts, %
                of the type size). Type: letter by letter at their places, top line first, each
                arriving with extra space that closes up (stagger: time between letters; spacing:
                that space; scatter: reading order → scattered order). */}
            <SelectField
              label="reveal style"
              value={params.revealStyle}
              options={REVEAL_STYLES}
              keyframe={keyframe?.('type.style')}
              onChange={(revealStyle) => onParamsChange({ revealStyle })}
            />
            {/* Which line reveals first: the bottom one (default) or the top one. */}
            <SelectField
              label="line order"
              value={params.revealOrder}
              options={REVEAL_ORDERS}
              keyframe={keyframe?.('type.order')}
              onChange={(revealOrder) => onParamsChange({ revealOrder })}
            />
            <RangeField
              label="reveal"
              value={params.reveal}
              min={0}
              max={100}
              step={0.1}
              unit="%"
              keyframe={keyframe?.('type.reveal')}
              onChange={(reveal) => onParamsChange({ reveal })}
            />
            <RangeField
              label="stagger"
              value={params.revealStagger}
              min={0}
              max={100}
              unit="%"
              keyframe={keyframe?.('type.stagger')}
              onChange={(revealStagger) => onParamsChange({ revealStagger })}
            />
            <RangeField
              label="slide"
              value={params.revealSlide}
              min={0}
              max={200}
              unit="%"
              disabled={params.revealStyle !== 'stack'}
              keyframe={keyframe?.('type.slide')}
              onChange={(revealSlide) => onParamsChange({ revealSlide })}
            />
            {/* At the reveal's start the uncarved trophy reaches this far out to the frame's
                edges (100% = covering it), easing back to its place as the text stacks in. */}
            <RangeField
              label="fill"
              value={params.revealFill}
              min={0}
              max={100}
              unit="%"
              keyframe={keyframe?.('type.fill')}
              onChange={(revealFill) => onParamsChange({ revealFill })}
            />
            <RangeField
              label="scatter"
              value={params.revealScatter}
              min={0}
              max={100}
              unit="%"
              disabled={params.revealStyle !== 'type'}
              keyframe={keyframe?.('type.scatter')}
              onChange={(revealScatter) => onParamsChange({ revealScatter })}
            />
            {/* Type: the extra space each letter arrives with, closing up as it settles. */}
            <RangeField
              label="spacing"
              value={params.revealSpacing}
              min={0}
              max={100}
              unit="%"
              disabled={params.revealStyle !== 'type'}
              keyframe={keyframe?.('type.spacing')}
              onChange={(revealSpacing) => onParamsChange({ revealSpacing })}
            />
          </>
        )}
      </ControlSection>
      <ControlSection {...sectionProps('shape')}>
        {/* The right edge is the column width: the revolve axis, and the width text wraps at. */}
        <RangeField
          label="edge"
          value={params.columnWidth}
          min={100}
          max={1200}
          keyframe={keyframe?.('shape.edge')}
          onChange={(columnWidth) => onParamsChange({ columnWidth })}
        />
        {shown('mirror') && (
          <>
            {/* Reflect the text across the edge: the trophy sits between two text blocks. */}
            <ToggleField
              label="mirror"
              checked={params.mirror}
              keyframe={keyframe?.('shape.mirror')}
              onChange={(mirror) => onParamsChange({ mirror })}
            />
          </>
        )}
        {shown('overshoot') && (
          <>
            {/* How far the shape's bottom extends below the last baseline (optical alignment). */}
            <RangeField
              label="overshoot"
              value={params.overshoot}
              min={0}
              max={20}
              step={0.5}
              digits={1}
              keyframe={keyframe?.('shape.overshoot')}
              onChange={(overshoot) => onParamsChange({ overshoot })}
            />
          </>
        )}
      </ControlSection>
      {!hideShapeMaterial && <ControlSection {...sectionProps('top')}>
        {shown('roundTop') && (
          <ToggleField
            label="round top"
            checked={params.roundTop}
            keyframe={keyframe?.('top.roundTop')}
            onChange={(roundTop) => onParamsChange({ roundTop })}
          />
        )}
        <RangeField
          label="top radius"
          value={params.topRadius}
          min={0}
          max={400}
          disabled={!params.roundTop}
          keyframe={keyframe?.('top.radius')}
          onChange={(topRadius) => onParamsChange({ topRadius })}
        />
        {shown('taper') && (
          <RangeField
            label="taper"
            value={params.taper}
            min={0}
            max={90}
            unit="%"
            keyframe={keyframe?.('top.taper')}
            onChange={(taper) => onParamsChange({ taper })}
          />
        )}
      </ControlSection>
      }
      {!hideShapeMaterial && <ControlSection {...sectionProps('line boxes')}>
        <RangeField
          label="pad x"
          value={lineBox.padX}
          min={-20}
          max={100}
          keyframe={keyframe?.('lineBoxes.padX')}
          onChange={(padX) => setLineBox({ padX })}
        />
        <RangeField
          label="pad y"
          value={lineBox.padY}
          min={-20}
          max={100}
          keyframe={keyframe?.('lineBoxes.padY')}
          onChange={(padY) => setLineBox({ padY })}
        />
        <RangeField
          label="radius"
          value={lineBox.radius}
          min={0}
          max={100}
          keyframe={keyframe?.('lineBoxes.radius')}
          onChange={(radius) => setLineBox({ radius })}
        />
        {/* Rounds the sharp corners where one line's box meets the next (e.g. RGD over
            BRANDING): on the trophy, a smooth fillet between the rims. */}
        {shown('smoothJoins') && (
          <ToggleField
            label="smooth joins"
            checked={params.smoothJoins}
            keyframe={keyframe?.('lineBoxes.smoothJoins')}
            onChange={(smoothJoins) => onParamsChange({ smoothJoins })}
          />
        )}
        <RangeField
          label="join radius"
          value={params.joinRadius}
          min={0}
          max={100}
          disabled={!params.smoothJoins}
          keyframe={keyframe?.('lineBoxes.joinRadius')}
          onChange={(joinRadius) => onParamsChange({ joinRadius })}
        />
      </ControlSection>
      }
      {!hideShapeMaterial && <ControlSection {...sectionProps('material')}>
        {shown('shading') && (
          <SelectField
            label="shading"
            value={material.shading}
            options={SHADINGS}
            keyframe={keyframe?.('material.shading')}
            onChange={(shading) => setMaterial({ shading })}
          />
        )}
        <SelectField
          label="palette"
          value={material.palette}
          options={PALETTE_CHOICES}
          keyframe={keyframe?.('material.palette')}
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
          colors={shownColors}
          keyframe={keyframe ? colorKeyframe : undefined}
          onChange={(customColors) => setMaterial({ palette: 'custom', customColors })}
        />
        {shown('banding') && (
          <RangeField
            label="banding"
            value={material.banding}
            min={0}
            max={1}
            step={0.01}
            digits={2}
            unit=""
            keyframe={keyframe?.('material.banding')}
            onChange={(banding) => setMaterial({ banding })}
          />
        )}
        <RangeField
          label="offset"
          value={material.gradientOffset}
          min={-0.5}
          max={0.5}
          step={0.01}
          digits={2}
          unit=""
          keyframe={keyframe?.('material.offset')}
          onChange={(gradientOffset) => setMaterial({ gradientOffset })}
        />
        {shown('gradientScale') && (
          <RangeField
            label="scale"
            value={material.gradientScale}
            min={0.25}
            max={3}
            step={0.05}
            digits={2}
            unit="×"
            keyframe={keyframe?.('material.scale')}
            onChange={(gradientScale) => setMaterial({ gradientScale })}
          />
        )}
        {shown('tilt') && (
          <RangeField
            label="tilt"
            value={material.tilt}
            min={-1}
            max={1}
            step={0.01}
            digits={2}
            unit=""
            disabled={lit}
            keyframe={keyframe?.('material.tilt')}
            onChange={(tilt) => setMaterial({ tilt })}
          />
        )}
        {shown('wobble') && (
          <RangeField
            label="wobble"
            value={material.wobble}
            min={0}
            max={5}
            step={0.01}
            digits={2}
            unit=""
            keyframe={keyframe?.('material.wobble')}
            onChange={(wobble) => setMaterial({ wobble })}
          />
        )}
        <RangeField
          label="edge depth"
          value={material.edgeDepth}
          min={0}
          max={1}
          step={0.01}
          digits={2}
          unit=""
          keyframe={keyframe?.('material.edgeDepth')}
          onChange={(edgeDepth) => setMaterial({ edgeDepth })}
        />
        {shown('edgeHue') && (
          <RangeField
            label="edge hue"
            value={material.edgeHue}
            min={-90}
            max={90}
            unit="°"
            disabled={lit}
            keyframe={keyframe?.('material.edgeHue')}
            onChange={(edgeHue) => setMaterial({ edgeHue })}
          />
        )}
        {shown('ledge') && (
          <RangeField
            label="ledge"
            value={material.ledgeShadow}
            min={0}
            max={1}
            step={0.01}
            digits={2}
            unit=""
            keyframe={keyframe?.('material.ledge')}
            onChange={(ledgeShadow) => setMaterial({ ledgeShadow })}
          />
        )}
        {shown('grain') && (
          <RangeField
            label="grain"
            value={material.grain}
            min={0}
            max={1}
            step={0.01}
            digits={2}
            unit=""
            keyframe={keyframe?.('material.grain')}
            onChange={(grain) => setMaterial({ grain })}
          />
        )}
        {shown('grainSize') && (
          <>
            {/* In frame px: 0.5 is one pixel of the 4K export (crisp); larger is softer, clumpier. */}
            <RangeField
              label="grain size"
              value={material.grainSize}
              min={0.25}
              max={3}
              step={0.05}
              digits={2}
              keyframe={keyframe?.('material.grainSize')}
              onChange={(grainSize) => setMaterial({ grainSize })}
            />
          </>
        )}
      </ControlSection>
      }
      {/* Lit mode's key light and highlight, like Illustrator's 3D shading options. */}
      {shown('lighting') && (
        <ControlSection {...sectionProps('lighting')}>
          <RangeField
            label="light angle"
            value={material.lightAngle}
            min={-180}
            max={180}
            unit="°"
            disabled={!lit}
            keyframe={keyframe?.('lighting.angle')}
            onChange={(lightAngle) => setMaterial({ lightAngle })}
          />
          <RangeField
            label="light height"
            value={material.lightHeight}
            min={0}
            max={90}
            unit="°"
            disabled={!lit}
            keyframe={keyframe?.('lighting.height')}
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
            keyframe={keyframe?.('lighting.ambient')}
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
            keyframe={keyframe?.('lighting.softness')}
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
            keyframe={keyframe?.('lighting.highlight')}
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
            keyframe={keyframe?.('lighting.highlightSize')}
            onChange={(highlightSize) => setMaterial({ highlightSize })}
          />
        </ControlSection>
      )}
      <ControlSection {...sectionProps('canvas')}>
        {shown('background') && (
          <ColorField
            label="background"
            value={canvasColors.background}
            keyframe={keyframe?.('canvas.background')}
            onChange={(background) =>
              onParamsChange({ canvasColors: { ...canvasColors, background } })
            }
          />
        )}
        <ColorField
          label="text"
          value={canvasColors.text}
          keyframe={keyframe?.('canvas.text')}
          onChange={(text) => onParamsChange({ canvasColors: { ...canvasColors, text } })}
        />
      </ControlSection>
      {banner && (
        <ControlSection {...sectionProps('banner')}>
          {/* The RGD logo, a headline and a link along the frame's top or bottom; its
              reveal grows the bar and raises the items in, like the text's. */}
          <ToggleField
            label="banner"
            checked={params.banner}
            keyframe={keyframe?.('banner.show')}
            onChange={(show) => onParamsChange({ banner: show })}
          />
          {revealControls && (
            <RangeField
              label="banner reveal"
              value={params.bannerReveal}
              min={0}
              max={100}
              step={0.1}
              unit="%"
              disabled={!params.banner}
              keyframe={keyframe?.('banner.reveal')}
              onChange={(bannerReveal) => onParamsChange({ bannerReveal })}
            />
          )}
          <SelectField
            label="position"
            value={banner.position}
            options={BANNER_POSITIONS}
            onChange={banner.onPositionChange}
          />
          <TextField label="headline" value={banner.headline} onChange={banner.onHeadlineChange} />
          <TextField label="link" value={banner.link} onChange={banner.onLinkChange} />
        </ControlSection>
      )}
      {frame && (
        <ControlSection {...sectionProps('frame')}>
          {/* The artboard's size: a preset or any width and height (changing it fits the
              text and trophy to it); fit again after editing the text. */}
          <SelectField
            label="size"
            value={
              frame.presets.find((p) => p.width === frame.width && p.height === frame.height)
                ?.label ?? 'custom'
            }
            options={[...frame.presets.map((p) => p.label), 'custom']}
            onChange={(label) => {
              const preset = frame.presets.find((p) => p.label === label)
              if (preset) frame.onSizeChange(preset.width, preset.height)
            }}
          />
          <NumberField
            label="width"
            value={frame.width}
            min={256}
            max={8192}
            onChange={(width) => frame.onSizeChange(width, frame.height)}
          />
          <NumberField
            label="height"
            value={frame.height}
            min={256}
            max={8192}
            onChange={(height) => frame.onSizeChange(frame.width, height)}
          />
          <div className="control-actions">
            <button type="button" className="control-button" onClick={frame.onFit}>
              fit to frame
            </button>
          </div>
        </ControlSection>
      )}
      {shown('view') && (
        <ControlSection {...sectionProps('view')}>
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
        </ControlSection>
      )}
      {imageExport && (
        <ControlSection {...sectionProps('image')}>
          {/* A still of the frame as it is: PNG (optionally with a transparent background) or
              JPEG, at 1–5× its size. */}
          <SelectField
            label="format"
            value={imageExport.format}
            options={IMAGE_FORMATS}
            onChange={imageExport.onFormatChange}
          />
          <SelectField
            label="scale"
            value={`×${imageExport.scale}` as (typeof IMAGE_SCALE_LABELS)[number]}
            options={IMAGE_SCALE_LABELS.filter((_, i) => i + 1 <= imageExport.maxScale)}
            onChange={(label) => imageExport.onScaleChange(Number(label.slice(1)))}
          />
          <ToggleField
            label="transparent"
            checked={imageExport.transparent && imageExport.format === 'png'}
            disabled={imageExport.format !== 'png'}
            onChange={imageExport.onTransparentChange}
          />
          <div className="control-actions">
            <button
              type="button"
              className="control-button"
              disabled={imageExport.busy}
              onClick={imageExport.onExport}
            >
              {imageExport.busy ? 'exporting…' : `export ${imageExport.format}`}
            </button>
            <output className="export-progress">{imageExport.size}</output>
          </div>
          {imageExport.error && (
            <p className="export-error" role="alert">
              {imageExport.error}
            </p>
          )}
        </ControlSection>
      )}
      {transport && (
        <ControlSection {...sectionProps('timeline')}>
          <div className="control-actions">
            <button
              type="button"
              className="control-button"
              aria-pressed={transport.playing}
              onClick={transport.onPlayToggle}
            >
              {transport.playing ? 'pause' : 'play'}
            </button>
            <button type="button" className="control-button" onClick={transport.onRewind}>
              to start
            </button>
          </div>
          <ToggleField label="loop" checked={transport.loop} onChange={transport.onLoopChange} />
          <RangeField
            label="length"
            value={transport.length}
            min={1}
            max={60}
            step={0.5}
            digits={1}
            unit="s"
            onChange={transport.onLengthChange}
          />
          <SelectField
            label="fps"
            value={String(transport.fps) as (typeof FRAME_RATES)[number]}
            options={FRAME_RATES}
            onChange={(fps) => transport.onFpsChange(Number(fps))}
          />
          {/* Presets set the composition up and keyframe it. */}
          <div className="control-actions">
            <button type="button" className="control-button" onClick={transport.onSculptIntro}>
              sculpt intro
            </button>
          </div>
          {/* Renders the timeline frame by frame at 3840 × 2160 and saves an MP4. */}
          <div className="control-actions">
            {transport.exportProgress === null ? (
              <button type="button" className="control-button" onClick={transport.onExport}>
                export 4K MP4
              </button>
            ) : (
              <>
                <button type="button" className="control-button" onClick={transport.onCancelExport}>
                  cancel
                </button>
                <output className="export-progress">
                  rendering {Math.round(transport.exportProgress * 100)}%
                </output>
              </>
            )}
          </div>
          {transport.exportError && (
            <p className="export-error" role="alert">
              {transport.exportError}
            </p>
          )}
        </ControlSection>
      )}
    </aside>
  )
}
