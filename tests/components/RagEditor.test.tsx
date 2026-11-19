import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from '../support/ControlPanelScene'
import { DEFAULT_SETTINGS, SettingsProvider } from '../../src/state'

vi.mock('../../src/render3d', () => import('../support/render3dStub'))
vi.mock('../../src/timeline', () => import('../support/timelineStub'))

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

describe('RagEditor align', () => {
  it('centers the text and its mirror; each box still starts at the text’s left', async () => {
    const { container } = render(
      <SettingsProvider initialSettings={{ ...DEFAULT_SETTINGS, text: 'RGD\nBRANDING' }}>
        <App />
      </SettingsProvider>,
    )
    await waitFor(() => expect(container.querySelectorAll('.rag-line-box')).toHaveLength(2), {
      timeout: 5000,
    })
    const widths = () =>
      [...container.querySelectorAll<HTMLElement>('.rag-line-box')].map((box) =>
        Number(box.style.getPropertyValue('--box-w')),
      )
    const [shortLeft] = widths()
    fireEvent.change(screen.getByRole('combobox', { name: 'align' }), {
      target: { value: 'center' },
    })
    expect(container.querySelector('.rag-editor')).toHaveAttribute('data-align', 'center')
    // The shorter line starts further in, so its box reaches further (to where it ends).
    const [shortCentered] = widths()
    expect(shortCentered).toBeGreaterThan(shortLeft ?? Infinity)
    const label = container.querySelector<HTMLElement>('.rag-label')
    expect(parseFloat(label?.style.getPropertyValue('--line-start') ?? '0')).toBeGreaterThan(0)
  })
})

describe('RagEditor reveal', () => {
  it('stacks lines in from the bottom while revealing, and carves only those', async () => {
    const { container } = render(
      <SettingsProvider initialSettings={{ ...DEFAULT_SETTINGS, text: 'RGD\nBRANDING' }}>
        <App />
      </SettingsProvider>,
    )
    await waitFor(() => expect(container.querySelectorAll('.rag-line-box')).toHaveLength(2), {
      timeout: 5000,
    })
    expect(screen.queryByTestId('rag-reveal')).toBeNull()
    const lines = () => [...screen.getByTestId('rag-reveal').children] as HTMLElement[]
    const mirrorLines = () => [...screen.getByTestId('rag-mirror').children] as HTMLElement[]

    // 0%: nothing shown, nothing carved (a full cylinder).
    fireEvent.change(screen.getByRole('slider', { name: 'reveal' }), { target: { value: '0' } })
    expect(lines().map((line) => line.style.visibility)).toEqual(['hidden', 'hidden'])
    expect(container.querySelectorAll('.rag-line-box')).toHaveLength(0)
    expect(container.querySelector('.rag-editor')).toHaveAttribute('data-revealing', 'on')

    // Stagger 100%: one line's slide after another, 2 slides in all. At 75% the bottom
    // line is in place and the top one is halfway, still left of its place.
    fireEvent.change(screen.getByRole('slider', { name: 'stagger' }), { target: { value: '100' } })
    fireEvent.change(screen.getByRole('slider', { name: 'reveal' }), { target: { value: '75' } })
    const [top, bottom] = lines()
    expect(bottom?.style.transform).toBe('translateX(0px)')
    expect(top?.style.visibility).toBe('')
    expect(top?.style.transform).toMatch(/^translateX\(-\d/)
    // The mirror slides in from the right.
    expect(mirrorLines()[0]?.style.transform).toMatch(/^translateX\(\d/)
    expect(container.querySelectorAll('.rag-line-box')).toHaveLength(2)
  })

  it('types letters in one by one in the type style', async () => {
    const { container } = render(
      <SettingsProvider initialSettings={{ ...DEFAULT_SETTINGS, text: 'RGD\nBRANDING' }}>
        <App />
      </SettingsProvider>,
    )
    await waitFor(() => expect(container.querySelectorAll('.rag-line-box')).toHaveLength(2), {
      timeout: 5000,
    })
    // Spacing is the type reveal's own; slide is the stack-in's.
    expect(screen.getByRole('slider', { name: 'spacing' })).toBeDisabled()
    fireEvent.change(screen.getByRole('combobox', { name: 'reveal style' }), {
      target: { value: 'type' },
    })
    expect(screen.getByRole('slider', { name: 'spacing' })).toBeEnabled()
    expect(screen.getByRole('slider', { name: 'slide' })).toBeDisabled()
    fireEvent.change(screen.getByRole('slider', { name: 'spacing' }), { target: { value: '5' } })
    expect(screen.getByRole('slider', { name: 'spacing' })).toHaveValue('5')
    fireEvent.change(screen.getByRole('slider', { name: 'scatter' }), { target: { value: '0' } })
    // 11 letters, a fifth of a settle apart: 3 settle-units in all, so 20% is 0.6 units in,
    // when the first three letters have started (at 0, 0.2 and 0.4).
    fireEvent.change(screen.getByRole('slider', { name: 'reveal' }), { target: { value: '20' } })

    const lines = () => [...screen.getByTestId('rag-reveal').children] as HTMLElement[]
    const shown = (line: HTMLElement | undefined) =>
      [...(line?.querySelectorAll<HTMLElement>('.rag-letter') ?? [])].map(
        (letter) => letter.style.visibility !== 'hidden',
      )
    // Bottom line first by default: BRANDING's first three letters, nothing of RGD yet.
    expect(shown(lines()[1])).toEqual([true, true, true, false, false, false, false, false])
    expect(shown(lines()[0]).every((v) => !v)).toBe(true)

    // Top line first: RGD types in before BRANDING, in reading order.
    fireEvent.change(screen.getByRole('combobox', { name: 'line order' }), {
      target: { value: 'top' },
    })
    expect(shown(lines()[0])).toEqual([true, true, true])
    expect(shown(lines()[1]).every((v) => !v)).toBe(true)
    // Only the typed line carves.
    expect(container.querySelectorAll('.rag-line-box')).toHaveLength(1)
  })
})
