import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from '../../src/App'
import { DEFAULT_SETTINGS, SettingsProvider } from '../../src/state'

vi.mock('../../src/render3d', () => import('../support/render3dStub'))

describe('RagEditor', () => {
  it('draws a box with a px width label for each line typed', async () => {
    const { container } = render(
      <SettingsProvider initialSettings={{ ...DEFAULT_SETTINGS, text: '' }}>
        <App />
      </SettingsProvider>,
    )
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'first line\nsecond' } })

    // First real measurement in a worker is slow (node-canvas loads system fonts).
    await waitFor(() => expect(container.querySelectorAll('.rag-line-box')).toHaveLength(2), {
      timeout: 5000,
    })
    const labels = [...container.querySelectorAll('.rag-label')].map((el) => el.textContent)
    expect(labels).toHaveLength(2)
    for (const label of labels) expect(label).toMatch(/^\d+\.\dpx$/)
  })
})
