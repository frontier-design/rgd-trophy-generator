import { fireEvent, render, screen, within } from '@testing-library/react'
import { CanvasPage } from '../../src/components/CanvasPage'
import { parseCanvasDocument } from '../../src/components/CanvasPage/canvasDocument'
import {
  DEFAULT_SHAPE,
  createModifier,
  modifiersByScene,
} from '../../src/components/CanvasPage/graph'
import { createMasterNode, withMaster } from '../../src/components/CanvasPage/master'
import { createSceneNode, withShape } from '../../src/components/CanvasPage/sceneNode'

vi.mock('../../src/render3d', () => import('../support/render3dStub'))

const canvas = () => screen.getByRole('region', { name: 'Canvas' })

const insert = (name: string, x = 100, y = 100) => {
  fireEvent.contextMenu(canvas(), { clientX: x, clientY: y })
  fireEvent.click(screen.getByRole('menuitem', { name }))
}

function savedCanvas() {
  const scene = withMaster(createSceneNode('scene-1', 'scene 1', 300, 120), {
    ...createMasterNode().params,
    roundTop: false,
    overshoot: 3,
  })
  scene.scene.topRadius = 77
  scene.scene.roundTop = false
  window.localStorage.setItem(
    'rgd-generator:canvas',
    JSON.stringify({
      version: 1,
      scenes: [scene],
      modifiers: [],
      links: [],
      master: createMasterNode(0, 0, {
        ...createMasterNode().params,
        roundTop: false,
      }),
      inserted: { scene: 1 },
    }),
  )
}

function linkShapeToScene(shape: HTMLElement, scene: HTMLElement, pointerId = 1) {
  fireEvent.pointerDown(within(shape).getByLabelText('shape 1 output'), {
    button: 0,
    pointerId,
  })
  fireEvent.pointerUp(within(scene).getByLabelText('scene 1 input'), { pointerId })
}

function topRadiusOf(scene: HTMLElement) {
  return scene.querySelector('.artboard')?.getAttribute('data-top-radius')
}

describe('shape nodes', () => {
  it('resolves the last linked shape and ignores muted links', () => {
    const first = createModifier('shape', 'shape-1', 'shape 1', 0, 0)
    const second = createModifier('shape', 'shape-2', 'shape 2', 0, 0)
    if (first.kind !== 'shape' || second.kind !== 'shape') throw new Error('not a shape')
    first.params = { ...first.params, topRadius: 120 }
    second.params = { ...second.params, topRadius: 320, lineBox: { padX: 4, padY: 5, radius: 6 } }
    const resolved = modifiersByScene(
      [
        { from: first.id, to: 'scene-1' },
        { from: second.id, to: 'scene-1' },
      ],
      [first, second],
    )
    expect(resolved.get('scene-1')?.shape).toBe(second.params)
    expect(
      modifiersByScene([{ from: second.id, to: 'scene-1', muted: true }], [first, second]).get(
        'scene-1',
      ),
    ).toBeUndefined()
  })

  it('lets a connected shape override a master-applied fallback without rewriting it', () => {
    const fallback = withMaster(createSceneNode('scene-1', 'scene 1', 0, 0), {
      ...createMasterNode().params,
      taper: 40,
      overshoot: 9,
      roundTop: true,
    })
    const before = structuredClone(fallback.scene)
    const override = { ...DEFAULT_SHAPE, topRadius: 333, taper: 4, overshoot: 1 }
    const overridden = withShape(fallback, override)
    expect(overridden.scene.topRadius).toBe(333)
    expect(overridden.scene.taper).toBe(4)
    expect(overridden.scene.overshoot).toBe(1)
    expect(fallback.scene).toEqual(before)
    expect(withShape(fallback, undefined)).toBe(fallback)
  })

  it('round-trips shape settings and ignores malformed saved fields', () => {
    const shape = createModifier('shape', 'shape-2', 'shape 2', 10, 20)
    if (shape.kind !== 'shape') throw new Error('not a shape')
    shape.params = {
      ...shape.params,
      roundTop: false,
      topRadius: 284,
      taper: 33,
      lineBox: { padX: 4, padY: 8, radius: 12 },
      smoothJoins: false,
      joinRadius: 7,
      overshoot: 6.5,
    }
    const doc = parseCanvasDocument({ modifiers: [shape], inserted: { shape: 2 } })
    expect(doc.modifiers[0]).toMatchObject({ id: 'shape-2', kind: 'shape' })
    expect((doc.modifiers[0] as typeof shape).params).toEqual(shape.params)
    expect(doc.inserted.shape).toBe(2)

    const malformed = parseCanvasDocument({
      modifiers: [
        {
          id: 'shape-3',
          kind: 'shape',
          params: {
            roundTop: 'yes',
            topRadius: Number.NaN,
            lineBox: { padX: Number.POSITIVE_INFINITY, padY: 11, radius: 'bad' },
          },
        },
      ],
    })
    const params = (malformed.modifiers[0] as typeof shape).params
    expect(params.roundTop).toBe(DEFAULT_SHAPE.roundTop)
    expect(params.topRadius).toBe(DEFAULT_SHAPE.topRadius)
    expect(params.lineBox).toEqual({ ...DEFAULT_SHAPE.lineBox, padY: 11 })
  })

  it('edits a linked scene profile and restores the saved fallback on mute or disconnect', async () => {
    savedCanvas()
    render(<CanvasPage tools={null} />)
    const scene = await screen.findByLabelText('scene 1')
    expect(topRadiusOf(scene)).toBe('77')
    // Shape and material are set by nodes, not a scene inspector (scenes have none).
    fireEvent.pointerDown(scene)
    expect(screen.queryByRole('complementary', { name: 'Control panel' })).toBeNull()

    insert('insert shape')
    const shape = await screen.findByRole('group', { name: 'shape 1' })
    expect(within(shape).getByRole('slider', { name: 'top radius' })).toHaveAttribute(
      'max',
      '400',
    )
    for (const name of ['round top', 'taper', 'pad x', 'pad y', 'radius', 'smooth joins', 'join radius', 'overshoot'])
      expect(within(shape).getByRole(name === 'round top' || name === 'smooth joins' ? 'switch' : 'slider', { name })).toBeInTheDocument()

    linkShapeToScene(shape, scene)
    fireEvent.change(within(shape).getByRole('slider', { name: 'top radius' }), {
      target: { value: '321' },
    })
    expect(topRadiusOf(scene)).toBe('321')

    // Muting the link brings the saved fallback back; unmuting restores the override.
    fireEvent.pointerDown(shape, { button: 0, metaKey: true })
    fireEvent.click(shape, { metaKey: true })
    expect(topRadiusOf(scene)).toBe('77')
    fireEvent.click(shape, { metaKey: true })
    expect(topRadiusOf(scene)).toBe('321')

    // Disconnecting the input also restores it, and the shape node keeps its own value.
    fireEvent.pointerDown(scene)
    fireEvent.contextMenu(scene)
    fireEvent.click(screen.getByRole('menuitem', { name: 'disconnect inputs' }))
    expect(topRadiusOf(scene)).toBe('77')
    expect(within(shape).getByRole('slider', { name: 'top radius' })).toHaveValue('321')
  })
})
