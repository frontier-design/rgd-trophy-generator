import { Vector3 } from 'three'
import { createTrophyMaterial } from '../../src/render3d'
import { hexToRgb, lightDirection, MAX_STOPS, paletteStops } from '../../src/material'
import { DEFAULT_MATERIAL } from '../../src/state'

describe('createTrophyMaterial', () => {
  it('drives the uniforms from the material settings', () => {
    const material = createTrophyMaterial()
    material.setLook({ ...DEFAULT_MATERIAL, palette: 'plum', wobble: 0.25, grain: 0.5 })
    const u = material.surface.uniforms

    const stops = paletteStops('plum')
    expect(u.uStopCount!.value).toBe(stops.length)
    const colors = u.uStopColors!.value as Vector3[]
    expect(colors).toHaveLength(MAX_STOPS)
    expect(colors[0]!.toArray()).toEqual([...stops[0]!.color])
    expect(u.uWobble!.value).toBe(0.25)
    expect(u.uGrain!.value).toBe(0.5)
    expect(u.uTilt!.value).toBe(DEFAULT_MATERIAL.tilt)
    expect(u.uEdgeHue!.value).toBe(DEFAULT_MATERIAL.edgeHue)
    expect(u.uBanding!.value).toBe(DEFAULT_MATERIAL.banding)
  })

  it('caps share every uniform but draw the plain gradient', () => {
    const material = createTrophyMaterial()
    material.setHeightRange(-20, 80)
    material.setLook({ ...DEFAULT_MATERIAL, edgeDepth: 0.9 })
    expect(material.cap.uniforms.uEdgeDepth).toBe(material.surface.uniforms.uEdgeDepth)
    expect(material.cap.uniforms.uHeightRange!.value.toArray()).toEqual([-20, 80])
    expect(material.surface.uniforms.uFlat!.value).toBe(0)
    expect(material.cap.uniforms.uFlat!.value).toBe(1)
  })

  it('uses custom colors when the palette is custom', () => {
    const material = createTrophyMaterial()
    const customColors = ['#ff0000', '#00ff00']
    material.setLook({ ...DEFAULT_MATERIAL, palette: 'custom', customColors })
    const u = material.surface.uniforms
    expect(u.uStopCount!.value).toBe(2)
    const colors = u.uStopColors!.value as Vector3[]
    expect(colors[1]!.toArray()).toEqual([...hexToRgb('#00ff00')])
  })

  it('lit vs painted shading, and the key light from its angle and height', () => {
    const material = createTrophyMaterial()
    const u = material.surface.uniforms
    material.setLook(DEFAULT_MATERIAL)
    expect(u.uShading!.value).toBe(1)
    const light = lightDirection(DEFAULT_MATERIAL.lightAngle, DEFAULT_MATERIAL.lightHeight)
    expect((u.uLightDir!.value as Vector3).toArray()).toEqual([light.x, light.y, light.z])
    material.setLook({ ...DEFAULT_MATERIAL, shading: 'painted' })
    expect(u.uShading!.value).toBe(0)
  })
})
