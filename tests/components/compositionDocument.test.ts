import { parseCanvasDocument } from '../../src/components/CanvasPage/canvasDocument'
import { createModifier } from '../../src/components/CanvasPage/graph'
import { createSceneNode } from '../../src/components/CanvasPage/sceneNode'
import {
  copySelection,
  pasteSelection,
  replaceSelection,
} from '../../src/components/CanvasPage/selection'

it('persists composition geometry and only permits scene image inputs', () => {
  const scene = createSceneNode('scene-1', 'scene', 0, 0)
  const modifier = createModifier('text', 'text-1', 'text', 0, 0)
  const composition = {
    id: 'composition-1',
    name: 'composition',
    x: 1,
    y: 2,
    frame: { width: 800, height: 600 },
    image: { x: -5, y: 10, width: 400, height: 300 },
  }
  const doc = parseCanvasDocument({
    scenes: [scene],
    modifiers: [modifier],
    compositions: [composition],
    links: [
      { from: scene.id, to: composition.id },
      { from: modifier.id, to: composition.id },
      { from: composition.id, to: scene.id },
    ],
  })
  expect(doc.compositions).toEqual([composition])
  expect(doc.links).toEqual([{ from: scene.id, to: composition.id }])
  const copy = copySelection(
    replaceSelection([scene.id, composition.id]),
    doc.scenes,
    doc.modifiers,
    doc.links,
    doc.compositions,
  )
  const pasted = pasteSelection(copy, doc.inserted, { offset: { x: 10, y: 20 } })
  expect(pasted.compositions[0]?.image).toEqual(composition.image)
  expect(pasted.links).toEqual([{ from: pasted.scenes[0]!.id, to: pasted.compositions[0]!.id }])
})
