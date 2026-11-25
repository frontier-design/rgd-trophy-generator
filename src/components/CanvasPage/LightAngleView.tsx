import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { NodeView } from './NodeView'
import {
  angleAt,
  lampCube,
  lightPoint,
  lightWorld,
  squareBeam,
  TILT,
  type Face,
  type Point,
} from './lightView'

const VIEW = { width: 230, height: 150 }
/** The ground point under the cylinder's axis (its foot). */
const GROUND = { x: VIEW.width / 2, y: 100 }
const RADIUS = 20
const HEIGHT = 46
const ORBIT = 76
/** How far above the cylinder's middle a light straight overhead is drawn (px). */
const LIFT = 52
const LAMP = 6
const BEAM = 4

interface LightAngleViewProps {
  /** Degrees: 0 from the front, positive from the right (lightDirection). */
  angle: number
  /** Degrees above level: raises the light from the cylinder's middle. */
  height: number
  /** The angle's range (the horizontal slider's, and the drag's). */
  min: number
  max: number
  /** The height's range (the vertical slider's). */
  heightMin: number
  heightMax: number
  onChange: (angle: number) => void
  onHeightChange: (height: number) => void
}

const ellipse = (cx: number, cy: number, rx: number) => ({ cx, cy, rx, ry: rx * TILT })
const points = (list: Point[]) => list.map((p) => `${p.x},${p.y}`).join(' ')
const faces = (list: Face[], className: string) =>
  list
    .filter((face) => face.visible)
    .map((face, i) => <polygon key={i} className={className} points={points(face.points)} />)

/**
 * The lighting node's light angle in 3D (isometric): the cylinder (the trophy) on the ground,
 * the light a cube on its orbit (level with the cylinder's middle, raised by its height),
 * its square beam angling out from it and wrapping onto the cylinder, and a drop line to the ground; the viewer is in
 * front (the bottom). Drag the light (or use the arrow keys on it) to turn it, within
 * [min, max]. Behind the cylinder, it's drawn behind it.
 */
export function LightAngleView({
  angle,
  height,
  min,
  max,
  heightMin,
  heightMax,
  onChange,
  onHeightChange,
}: LightAngleViewProps) {
  const svg = useRef<SVGSVGElement>(null)
  const dragging = useRef<number | null>(null)
  const at = HEIGHT / 2
  const world = lightWorld(angle, height, ORBIT, LIFT, at)
  const { light, onGround, front } = lightPoint(angle, height, GROUND, ORBIT, LIFT, at)
  const top = GROUND.y - HEIGHT
  // The beam aims at the cylinder's face toward the light, halfway up, so its spot stays
  // there however high the light is (aimed at the axis, a high light's spot ran down the
  // whole side).
  const a = (angle * Math.PI) / 180
  const beam = squareBeam(
    world,
    { x: Math.sin(a) * RADIUS, y: at, z: Math.cos(a) * RADIUS },
    {
      half: BEAM,
      start: LAMP,
      radius: RADIUS,
      height: HEIGHT,
      spread: HEIGHT * 0.4,
      spreadAcross: RADIUS * 0.7,
    },
    GROUND,
  )

  const turnTo = (e: ReactPointerEvent) => {
    const matrix = svg.current?.getScreenCTM()
    if (!matrix) return
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse())
    // Read the pointer on the ground: as if the light were dropped to it.
    onChange(angleAt({ x: p.x, y: p.y + (onGround.y - light.y) }, GROUND, min, max, angle))
  }

  const ray = (
    <g className="light-view-ray">
      {faces(beam.sides, 'light-view-beam')}
      {front && <polygon className="light-view-spot" points={points(beam.footprint)} />}
    </g>
  )

  const lamp = (
    <g
      className="light-view-light"
      role="slider"
      tabIndex={0}
      aria-label="light angle handle"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={angle}
      data-handle
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.preventDefault()
        e.stopPropagation()
        try {
          e.currentTarget.setPointerCapture?.(e.pointerId)
        } catch {
          // Synthetic events need not have an active browser pointer.
        }
        dragging.current = e.pointerId
      }}
      onPointerMove={(e) => {
        if (dragging.current === e.pointerId) turnTo(e)
      }}
      onPointerUp={() => (dragging.current = null)}
      onPointerCancel={() => (dragging.current = null)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 10 : 1
        const delta =
          e.key === 'ArrowRight' || e.key === 'ArrowUp'
            ? step
            : e.key === 'ArrowLeft' || e.key === 'ArrowDown'
              ? -step
              : 0
        if (!delta) return
        e.preventDefault()
        onChange(Math.min(max, Math.max(min, angle + delta)))
      }}
    >
      <line className="light-view-drop" x1={light.x} y1={light.y} x2={onGround.x} y2={onGround.y} />
      <ellipse className="light-view-foot" {...ellipse(onGround.x, onGround.y, 3)} />
      <circle className="light-view-hit" cx={light.x} cy={light.y} r={14} />
      {faces(lampCube(world, LAMP, GROUND), 'light-view-cube')}
    </g>
  )

  return (
    <NodeView
      vertical={{
        label: 'light height',
        value: height,
        min: heightMin,
        max: heightMax,
        unit: '°',
        param: 'lightHeight',
        onChange: onHeightChange,
      }}
      horizontal={{
        label: 'light angle',
        value: angle,
        min,
        max,
        unit: '°',
        param: 'lightAngle',
        onChange,
      }}
    >
      <svg
        ref={svg}
        className="node-view-box"
        viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
        role="img"
        aria-label="Light angle in 3D"
      >
        {/* The ground's orbit. */}
        <ellipse className="light-view-orbit" {...ellipse(GROUND.x, GROUND.y, ORBIT)} />
        {!front && lamp}
        {!front && ray}
        {/* The cylinder: its body and its top, flat. */}
        <path
          className="light-view-cylinder"
          d={`M${GROUND.x - RADIUS} ${top} V${GROUND.y} A${RADIUS} ${RADIUS * TILT} 0 0 0 ${
            GROUND.x + RADIUS
          } ${GROUND.y} V${top}`}
        />
        <ellipse className="light-view-cylinder" {...ellipse(GROUND.x, top, RADIUS)} />
        {front && ray}
        {front && lamp}
      </svg>
    </NodeView>
  )
}
