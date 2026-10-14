import type { Material, Object3D, Texture } from 'three'

export function disposeObject3D(root: Object3D): void {
  root.traverse((obj) => {
    if ('geometry' in obj && isDisposable(obj.geometry)) obj.geometry.dispose()
    if ('material' in obj) {
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
      for (const material of materials) {
        if (isMaterial(material)) disposeMaterial(material)
      }
    }
  })
}

function disposeMaterial(material: Material): void {
  for (const value of Object.values(material)) {
    if (isTexture(value)) value.dispose()
  }
  material.dispose()
}

function isDisposable(value: unknown): value is { dispose(): void } {
  return typeof value === 'object' && value !== null && 'dispose' in value
}

function isMaterial(value: unknown): value is Material {
  return isDisposable(value) && (value as Partial<Material>).isMaterial === true
}

function isTexture(value: unknown): value is Texture {
  return isDisposable(value) && (value as Partial<Texture>).isTexture === true
}
