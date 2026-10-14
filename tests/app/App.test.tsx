import { render, screen } from '@testing-library/react'
import App from '../../src/App'
import { SettingsProvider } from '../../src/state'

vi.mock('../../src/render3d', () => import('../support/render3dStub'))

describe('App', () => {
  it('renders the editable text block', () => {
    render(
      <SettingsProvider>
        <App />
      </SettingsProvider>,
    )
    expect(screen.getByLabelText('Text')).toBeInTheDocument()
  })
})
