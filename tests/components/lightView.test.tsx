import { fireEvent, render, screen } from '@testing-library/react'
import { LightAngleView } from '../../src/components/CanvasPage/LightAngleView'
import {
  angleAt,
  lampCube,
  lightPoint,
  lightWorld,
  project,
  squareBeam,
  TILT,
} from '../../src/components/CanvasPage/lightView'

const ground = { x: 100, y: 80 }
const at = (angle: number, height = 0, mid = 0) => lightPoint(angle, height, ground, 40, 50, mid)

describe('light view geometry (isometric)', () => {
  it('puts a level light in front at 0°, right at +90°, behind at 180° on the foreshortened orbit', () => {
    expect(at(0).light.x).toBeCloseTo(100)
    expect(at(0).light.y).toBeCloseTo(80 + 40 * TILT)
    expect(at(0).front).toBe(true)
    expect(at(90).light.x).toBeCloseTo(140)
    expect(at(90).light.y).toBeCloseTo(80)
    expect(at(180).light.y).toBeCloseTo(80 - 40 * TILT)
    expect(at(180).front).toBe(false)
  })

  it('starts level with the cylinder’s middle and rises with its height', () => {
    const level = at(90, 0, 23)
    expect(level.light.y).toBeCloseTo(level.onGround.y - 23)
    const overhead = at(30, 90, 23)
    expect(overhead.onGround.x).toBeCloseTo(100)
    expect(overhead.light.y).toBeCloseTo(80 - 23 - 50)
  })

  it('reads the angle back from a point on the ground, clamped to the range', () => {
    for (const angle of [-150, -45, 0, 30, 120])
      expect(angleAt(at(angle).onGround, ground, -180, 180)).toBe(angle)
    expect(angleAt(at(120).onGround, ground, -90, 90)).toBe(90)
    expect(angleAt(at(-120).onGround, ground, -90, 90)).toBe(-90)
  })

  it('draws the lamp as a cube showing three faces: its top and two sides', () => {
    const cube = lampCube(lightWorld(30, 20, 40, 50, 23), 5, ground)
    expect(cube).toHaveLength(6)
    expect(cube.filter((face) => face.visible)).toHaveLength(3)
  })

  it('wraps the square beam’s end onto the cylinder', () => {
    const radius = 10
    const light = lightWorld(0, 0, 40, 50, 20)
    const beam = squareBeam(
      light,
      { x: 0, y: 20, z: 0 },
      { half: 4, start: 5, radius, height: 40, spread: 4 },
      ground,
    )
    expect(beam.sides).toHaveLength(4)
    // From the front, level: its top is seen, its bottom isn't.
    expect(beam.sides.filter((side) => side.visible).length).toBeGreaterThan(0)
    // Every footprint point lies on the cylinder's surface, so its outline curves: the
    // corners sit further back (higher on the view) than the middle of the edge between.
    const onSurface = (x: number, z: number) => Math.hypot(x, z)
    const front = project({ x: 0, y: 16, z: Math.sqrt(radius ** 2) }, ground)
    const corner = project({ x: 4, y: 16, z: Math.sqrt(radius ** 2 - 16) }, ground)
    expect(
      beam.footprint.some((p) => Math.abs(p.x - front.x) < 1e-6 && Math.abs(p.y - front.y) < 1e-6),
    ).toBe(true)
    expect(
      beam.footprint.some(
        (p) => Math.abs(p.x - corner.x) < 1e-6 && Math.abs(p.y - corner.y) < 1e-6,
      ),
    ).toBe(true)
    expect(corner.y).toBeLessThan(front.y)
    expect(onSurface(4, Math.sqrt(radius ** 2 - 16))).toBeCloseTo(radius)
  })

  it('angles the beam out from the lamp’s face: a wider spread covers more of the cylinder', () => {
    const light = lightWorld(0, 0, 40, 50, 20)
    const target = { x: 0, y: 20, z: 0 }
    const tall = (spread: number) => {
      const { footprint } = squareBeam(
        light,
        target,
        { half: 4, start: 5, radius: 10, height: 40, spread },
        ground,
      )
      const ys = footprint.map((p) => p.y)
      return Math.max(...ys) - Math.min(...ys)
    }
    expect(tall(20)).toBeGreaterThan(tall(4) * 2)
  })

  it('keeps a raised light’s beam on the cylinder: its side or its top, never through it', () => {
    const height = 40
    const radius = 10
    for (const lift of [30, 60, 90]) {
      const light = lightWorld(30, lift, 40, 50, 20)
      const { footprint } = squareBeam(
        light,
        { x: 0, y: 20, z: 0 },
        { half: 4, start: 5, radius, height, spread: 18, spreadAcross: 8 },
        { x: 0, y: 0 },
      )
      // Every footprint point is on the cylinder: between its top rim's highest and its
      // foot's lowest projected points (before, a raised light's lower rays went through).
      for (const p of footprint) {
        expect(p.y).toBeGreaterThanOrEqual(-height - radius * TILT - 1e-6)
        expect(p.y).toBeLessThanOrEqual(radius * TILT + 1e-6)
        expect(Math.abs(p.x)).toBeLessThanOrEqual(radius + 1e-6)
      }
    }
  })
})

it('turns the light with the arrow keys, and sets angle and height on its sliders', () => {
  const onChange = vi.fn()
  const onHeightChange = vi.fn()
  render(
    <LightAngleView
      angle={179}
      height={30}
      min={-180}
      max={180}
      heightMin={0}
      heightMax={90}
      onChange={onChange}
      onHeightChange={onHeightChange}
    />,
  )
  const handle = screen.getByRole('slider', { name: 'light angle handle' })
  fireEvent.keyDown(handle, { key: 'ArrowRight', shiftKey: true })
  expect(onChange).toHaveBeenLastCalledWith(180)
  fireEvent.keyDown(handle, { key: 'ArrowLeft' })
  expect(onChange).toHaveBeenLastCalledWith(178)
  fireEvent.change(screen.getByRole('slider', { name: 'light angle' }), {
    target: { value: '-45' },
  })
  expect(onChange).toHaveBeenLastCalledWith(-45)
  const height = screen.getByRole('slider', { name: 'light height' })
  expect(height).toHaveAttribute('max', '90')
  fireEvent.change(height, { target: { value: '60' } })
  expect(onHeightChange).toHaveBeenLastCalledWith(60)
})
