import type { LineBoxStyle } from '../../types'
import type { ShapeParams } from './graph'
import { NodeView } from './NodeView'

const VIEW = { width: 196, height: 128 }
/** The sample word's size in the view (px), and its width there (drawn to fit). */
const TYPE = { size: 34, width: 86 }
/** Scene px → view px: the scene's type is 53 px (the default size). */
const SCALE = TYPE.size / 53
/** The text's left side and baseline in the view. */
const TEXT = { x: 22, baseline: VIEW.height / 2 + TYPE.size * 0.36 }
/** The top radius slider's maximum (scene px). */
const TOP_RADIUS_MAX = 400
/** The line box's pads' range (scene px), as the pad x and pad y sliders. */
const PAD_RANGE = { min: -20, max: 100 }

/** A rounded rectangle's path (its corner radius clamped to fit). */
function roundedRect(x: number, y: number, width: number, height: number, radius: number) {
  const w = Math.max(0, width)
  const h = Math.max(0, height)
  const r = Math.max(0, Math.min(radius, w / 2, h / 2))
  return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${
    x + w - r
  } ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
}

/**
 * The shape node's line box, in 2D, as on a scene: the trophy's flat shape (gray) runs from
 * the text's left side to the edge (the right side), and the line box (padded by pad x and
 * pad y, rounded by radius) is carved out of it around a word of type, the rest white. The
 * trophy's corners above and below the box are rounded by the top radius (round top) and
 * the join radius (smooth joins). Pad y is the slider on its right, pad x the one under it.
 */
export function ShapeView({
  shape,
  onChange,
}: {
  shape: ShapeParams
  onChange: (patch: Partial<LineBoxStyle>) => void
}) {
  const { lineBox } = shape
  const capTop = TEXT.baseline - TYPE.size * 0.72
  const box = {
    x: TEXT.x - lineBox.padX * SCALE,
    y: capTop - lineBox.padY * SCALE,
    width: TYPE.width + 2 * lineBox.padX * SCALE,
    height: TYPE.size * 0.72 + 2 * lineBox.padY * SCALE,
  }
  const boxPath = roundedRect(box.x, box.y, box.width, box.height, lineBox.radius * SCALE)
  const below = box.y + box.height
  // The trophy's corners at the text's left side, above and below the box: each a quarter
  // circle cut off it (no larger than the room it has).
  const room = VIEW.width - TEXT.x
  // The top radius's range (0–400 px on a scene, TOP_RADIUS_MAX) spans the room above the
  // box, so the whole slider shows (at scale, even the default would fill it).
  const top = shape.roundTop
    ? (Math.min(Math.max(shape.topRadius, 0), TOP_RADIUS_MAX) / TOP_RADIUS_MAX) *
      Math.max(0, Math.min(box.y, room))
    : 0
  const join = shape.smoothJoins ? Math.min(shape.joinRadius * SCALE, VIEW.height - below, room) : 0
  const notches = [
    top > 0 && `M${TEXT.x} ${box.y - top}A${top} ${top} 0 0 0 ${TEXT.x + top} ${box.y}H${TEXT.x}Z`,
    join > 0 &&
      `M${TEXT.x} ${below + join}A${join} ${join} 0 0 1 ${TEXT.x + join} ${below}H${TEXT.x}Z`,
  ].filter(Boolean)
  return (
    <NodeView
      vertical={{
        label: 'pad y',
        value: lineBox.padY,
        ...PAD_RANGE,
        unit: 'px',
        param: 'lineBox.padY',
        onChange: (padY) => onChange({ padY }),
      }}
      horizontal={{
        label: 'pad x',
        value: lineBox.padX,
        ...PAD_RANGE,
        unit: 'px',
        param: 'lineBox.padX',
        onChange: (padX) => onChange({ padX }),
      }}
    >
      <svg
        className="node-view-box"
        viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
        role="img"
        aria-label="Line box"
      >
        {/* The trophy, from the text's left side to the edge, its corners cut round, and the
            line box carved out of it (white over it, so the part past its left side is white
            too). */}
        <path
          className="shape-view-solid"
          d={`M${TEXT.x} 0H${VIEW.width}V${VIEW.height}H${TEXT.x}Z`}
        />
        {notches.map((d) => (
          <path key={d as string} className="shape-view-cut" d={d as string} />
        ))}
        <path className="shape-view-box" d={boxPath} />
        <text
          className="shape-view-type"
          x={TEXT.x}
          y={TEXT.baseline}
          fontSize={TYPE.size}
          textLength={TYPE.width}
          lengthAdjust="spacingAndGlyphs"
        >
          TEXT
        </text>
      </svg>
    </NodeView>
  )
}
