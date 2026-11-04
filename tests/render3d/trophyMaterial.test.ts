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

describe('trophy shader source', () => {
  // jsdom can't compile GLSL; this catches the mistake that has bitten before: a name GLSL
  // ES 3.0 reserves (WebGL 2) used for a variable or parameter, which fails the whole shader.
  const RESERVED = [
    'layout',
    'sample',
    'input',
    'output',
    'filter',
    'common',
    'partition',
    'active',
    'superp',
    'half',
    'fixed',
    'long',
    'short',
    'double',
    'sizeof',
    'cast',
    'namespace',
    'using',
    'packed',
    'resource',
    'noperspective',
    'patch',
    'subroutine',
    'centroid',
    'smooth',
    'flat',
    'invariant',
    'precise',
    'buffer',
    'shared',
    'coherent',
    'volatile',
    'restrict',
    'readonly',
    'writeonly',
    'atomic_uint',
    'texture',
    'union',
    'enum',
    'typedef',
    'template',
    'this',
    'goto',
    'inline',
    'noinline',
    'public',
    'static',
    'extern',
    'external',
    'interface',
    'unsigned',
    'class',
    'struct',
    'sign',
  ]
  const TYPES = '(?:float|int|uint|bool|vec[234]|ivec[234]|mat[234]|sampler2D)'

  it('never declares a variable or parameter with a reserved (or built-in) name', () => {
    const material = createTrophyMaterial()
    for (const source of [material.surface.fragmentShader, material.surface.vertexShader]) {
      const declared = [...source.matchAll(new RegExp(`\\b${TYPES}\\s+([A-Za-z_]\\w*)`, 'g'))]
      const names = declared.map((m) => m[1])
      expect(names.filter((name) => RESERVED.includes(name ?? ''))).toEqual([])
    }
  })
})

describe('trophy shaders’ varyings', () => {
  it('are declared once in each shader, the same in both', () => {
    const material = createTrophyMaterial()
    const varyings = (source: string) =>
      [...source.matchAll(/\bvarying\s+\w+\s+(\w+)\s*;/g)].map((m) => m[1] ?? '')
    const vertex = varyings(material.surface.vertexShader)
    const fragment = varyings(material.surface.fragmentShader)
    expect(new Set(vertex).size).toBe(vertex.length)
    expect(new Set(fragment).size).toBe(fragment.length)
    expect([...fragment].sort()).toEqual([...vertex].sort())
  })
})
