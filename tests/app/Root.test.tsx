import { fireEvent, render, screen } from '@testing-library/react'
import Root from '../../src/Root'

vi.mock('../../src/render3d', () => import('../support/render3dStub'))
vi.mock('../../src/timeline', () => import('../support/timelineStub'))

describe('canvas entry point', () => {
  afterEach(() => window.history.replaceState(null, '', '/'))

  it.each(['/', '/canvas', '/canvas/', '/nope'])(
    'opens the canvas at %s without a page picker',
    (path) => {
      window.history.replaceState(null, '', path)
      render(<Root />)
      expect(screen.getByRole('region', { name: 'Canvas' })).toHaveClass('infinite-canvas')
      expect(screen.queryByRole('combobox', { name: 'page' })).toBeNull()
      expect(screen.queryByRole('complementary', { name: 'Control panel' })).toBeNull()
      // Save and open sit in the hamburger menu.
      const menu = screen.getByRole('button', { name: 'menu' })
      expect(menu).toHaveAttribute('aria-expanded', 'false')
      fireEvent.click(menu)
      expect(screen.getByRole('menuitem', { name: 'save' })).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: 'open' })).toBeInTheDocument()
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(screen.queryByRole('menu')).toBeNull()
      expect(screen.queryByLabelText('Text')).toBeNull()
    },
  )

  it('zooms into node cards without enlarging artboard controls past full size', () => {
    render(<Root />)
    const canvas = screen.getByRole('region', { name: 'Canvas' })
    const world = canvas.querySelector<HTMLElement>('.infinite-canvas-world')!

    function zoomBy(factor: number) {
      fireEvent.wheel(canvas, { ctrlKey: true, deltaY: -Math.log(factor) / 0.01 })
    }

    function screenScale(property: string) {
      return (
        Number(world.style.getPropertyValue('--zoom')) * Number(world.style.getPropertyValue(property))
      )
    }

    zoomBy(0.125)
    for (const percent of [25, 50, 100, 200]) {
      zoomBy(2)
      expect(screen.getByLabelText('Zoom')).toHaveTextContent(`${percent}%`)
      expect(screenScale('--card-world-scale')).toBeCloseTo(percent / 50)
      expect(screenScale('--artboard-control-world-scale')).toBeCloseTo(Math.min(1, percent / 50))
    }
  })

  it('creates an editable scene from the default route', async () => {
    render(<Root />)
    fireEvent.contextMenu(screen.getByRole('region', { name: 'Canvas' }), {
      clientX: 200,
      clientY: 150,
    })
    fireEvent.click(screen.getByRole('menuitem', { name: 'insert scene' }))
    await screen.findByLabelText('scene 1')
    fireEvent.change(screen.getByRole('textbox', { name: 'Text' }), { target: { value: 'REVAMP' } })
    expect(screen.getByRole('textbox', { name: 'Text' })).toHaveValue('REVAMP')
    expect(screen.queryByRole('button', { name: 'play' })).toBeNull()
  })
})
