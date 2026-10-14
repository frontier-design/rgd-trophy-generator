import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three'
import { disposeObject3D } from '../../src/render3d'

describe('disposeObject3D', () => {
  it('disposes geometries and materials of nested meshes', () => {
    const geometry = new BoxGeometry()
    const material = new MeshBasicMaterial()
    const geometrySpy = vi.spyOn(geometry, 'dispose')
    const materialSpy = vi.spyOn(material, 'dispose')
    const group = new Group()
    group.add(new Mesh(geometry, material))

    disposeObject3D(group)

    expect(geometrySpy).toHaveBeenCalledOnce()
    expect(materialSpy).toHaveBeenCalledOnce()
  })
})
