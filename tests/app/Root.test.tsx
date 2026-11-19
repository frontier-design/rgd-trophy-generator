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
      expect(screen.getByRole('button', { name: 'save' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'open' })).toBeInTheDocument()
      expect(screen.queryByLabelText('Text')).toBeNull()
    },
  )

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
