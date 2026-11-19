import { parseCanvasDocument } from '../../src/components/CanvasPage/canvasDocument'
import { createModifier } from '../../src/components/CanvasPage/graph'
import { createSceneNode } from '../../src/components/CanvasPage/sceneNode'

it('loads a muted link and treats old links as active', () => {
  const node = createModifier('text', 'text-1', 'text', 0, 0)
  const scene = createSceneNode('scene-1', 'scene', 0, 0)
  const loaded = parseCanvasDocument({
    scenes: [scene],
    modifiers: [node],
    links: [
      { from: node.id, to: scene.id, muted: true },
      { from: node.id, to: scene.id },
    ],
  })
  expect(loaded.links).toEqual([
    { from: node.id, to: scene.id, muted: true },
    { from: node.id, to: scene.id },
  ])
})
