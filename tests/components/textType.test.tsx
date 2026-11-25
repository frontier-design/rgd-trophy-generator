import { fireEvent, render, screen, within } from '@testing-library/react'
import { CanvasPage } from '../../src/components/CanvasPage'
import { parseTextParams, withTextType } from '../../src/components/CanvasPage/textLines'

vi.mock('../../src/render3d', () => import('../support/render3dStub'))

describe('a text node’s type', () => {
  it('overrides a scene’s size and line height only where it sets them', () => {
    const scene = { fontSize: 100, lineHeight: 120 }
    expect(withTextType(scene, undefined)).toBe(scene)
    expect(withTextType(scene, { fontSize: 50 })).toEqual({ fontSize: 50, lineHeight: 60 })
    expect(withTextType(scene, { leading: 1 })).toEqual({ fontSize: 100, lineHeight: 100 })
    expect(withTextType(scene, { fontSize: 40, leading: 1.5 })).toEqual({
      fontSize: 40,
      lineHeight: 60,
    })
  })

  it('loads size and leading, clamped; absent stays absent', () => {
    expect(parseTextParams({ lines: [], fontSize: 9999, leading: 1.2 }, '')).toMatchObject({
      fontSize: 300,
      leading: 1.2,
    })
    const plain = parseTextParams({ lines: [] }, '')
    expect('fontSize' in plain || 'leading' in plain).toBe(false)
  })

  it('sizes its linked scenes from the text node', async () => {
    render(<CanvasPage tools={null} />)
    const canvas = screen.getByRole('region', { name: 'Canvas' })
    fireEvent.contextMenu(canvas, { clientX: 200, clientY: 150 })
    fireEvent.click(screen.getByRole('menuitem', { name: 'insert scene' }))
    const scene = await screen.findByLabelText('scene 1')
    fireEvent.contextMenu(canvas, { clientX: 40, clientY: 40 })
    fireEvent.click(screen.getByRole('menuitem', { name: 'insert text' }))
    const text = screen.getByRole('group', { name: 'text 1' })
    fireEvent.pointerDown(within(text).getByLabelText('text 1 output'), { button: 0, pointerId: 1 })
    fireEvent.pointerUp(within(scene).getByLabelText('scene 1 input'), { pointerId: 1 })

    const editor = () => scene.querySelector<HTMLElement>('.rag-editor')!
    const fitted = editor().style.getPropertyValue('--rag-font-size')
    // Until it's set, the slider shows the scene's own (fitted) size.
    const size = within(text).getByRole('slider', { name: 'size' })
    expect(Number((size as HTMLInputElement).value)).toBeCloseTo(parseFloat(fitted), 1)
    fireEvent.change(size, { target: { value: '80' } })
    expect(editor().style.getPropertyValue('--rag-font-size')).toBe('80px')
    fireEvent.change(within(text).getByRole('slider', { name: 'line height' }), {
      target: { value: '1.5' },
    })
    expect(editor().style.getPropertyValue('--rag-line-height')).toBe('120px')
  })
})
