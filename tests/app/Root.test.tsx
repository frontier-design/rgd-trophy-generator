import { fireEvent, render, screen } from '@testing-library/react'
import { pageFromPath, pathFor } from '../../src/hooks'
import Root from '../../src/Root'
import { SettingsProvider } from '../../src/state'

vi.mock('../../src/render3d', () => import('../support/render3dStub'))
vi.mock('../../src/timeline', () => import('../support/timelineStub'))

const renderRoot = () =>
  render(
    <SettingsProvider>
      <Root />
    </SettingsProvider>,
  )

describe('pages', () => {
  afterEach(() => window.history.replaceState(null, '', '/'))

  it('maps pages to URLs and back', () => {
    expect(pathFor('generator')).toBe('/')
    expect(pathFor('canvas')).toBe('/canvas')
    expect(pageFromPath('/canvas')).toBe('canvas')
    expect(pageFromPath('/canvas/')).toBe('canvas')
    expect(pageFromPath('/')).toBe('generator')
    expect(pageFromPath('/nope')).toBe('generator')
  })

  it('switches to the canvas from the dropdown, changing the URL', () => {
    renderRoot()
    expect(screen.getByLabelText('Text')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('combobox', { name: 'page' }), {
      target: { value: 'canvas' },
    })
    expect(window.location.pathname).toBe('/canvas')
    // The canvas: a grid to pan around, no sidebar.
    expect(screen.getByRole('region', { name: 'Canvas' })).toHaveClass('infinite-canvas')
    expect(screen.queryByRole('complementary', { name: 'Control panel' })).toBeNull()
    expect(screen.getByRole('combobox', { name: 'page' })).toHaveValue('canvas')
  })

  it('opens on the canvas from its URL, and back goes to the generator', () => {
    window.history.pushState(null, '', '/canvas')
    renderRoot()
    expect(screen.getByRole('region', { name: 'Canvas' })).toHaveClass('infinite-canvas')

    window.history.pushState(null, '', '/')
    fireEvent.popState(window)
    expect(screen.getByLabelText('Text')).toBeInTheDocument()
  })
})
