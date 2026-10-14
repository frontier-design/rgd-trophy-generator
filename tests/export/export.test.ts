import { exportGlb, NotImplementedError } from '../../src/export'
import { Group } from 'three'

describe('export placeholders', () => {
  it('rejects until implemented', async () => {
    await expect(exportGlb(new Group())).rejects.toBeInstanceOf(NotImplementedError)
  })
})
