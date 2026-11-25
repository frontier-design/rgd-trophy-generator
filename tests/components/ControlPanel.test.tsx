import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../support/ControlPanelScene'
import { MAX_STOPS, PALETTES } from '../../src/material'
import { DEFAULT_LINE_BOX_STYLE, DEFAULT_SETTINGS, SettingsProvider } from '../../src/state'

vi.mock('../../src/render3d', () => import('../support/render3dStub'))
vi.mock('../../src/timeline', () => import('../support/timelineStub'))

function renderApp() {
  return render(
    <SettingsProvider>
      <App />
    </SettingsProvider>,
  )
}

describe('ControlPanel', () => {
  it('debug button toggles the overlay', () => {
    const { container } = renderApp()
    const button = screen.getByRole('button', { name: 'debug' })
    const editor = container.querySelector('.rag-editor')

    expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(editor).toHaveAttribute('data-debug', 'on')

    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-pressed', 'false')
    expect(editor).toHaveAttribute('data-debug', 'off')
  })

  it('starts in 3D; the 2D sketch button flips to the flat view and back', () => {
    renderApp()
    const button = screen.getByRole('button', { name: '2D sketch' })
    expect(screen.getByTestId('three-view')).toBeInTheDocument()
    expect(button).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByTestId('three-view')).toBeNull()

    fireEvent.click(button)
    expect(screen.getByTestId('three-view')).toBeInTheDocument()
  })

  it('size slider sets the font size and scales line height', () => {
    const { container } = renderApp()
    // Half the default size.
    fireEvent.change(screen.getByRole('slider', { name: 'size' }), { target: { value: '26.5' } })

    // The size slider's own readout (line height reads the same: it's 1 × size).
    const sizeReadout = screen.getByRole('slider', { name: 'size' }).nextElementSibling
    expect(sizeReadout).toHaveTextContent('26.5px')
    const editor = container.querySelector<HTMLElement>('.rag-editor')
    expect(editor?.style.getPropertyValue('--rag-font-size')).toBe('26.5px')
    expect(parseFloat(editor?.style.getPropertyValue('--rag-line-height') ?? '')).toBeCloseTo(
      DEFAULT_SETTINGS.lineHeight / 2,
    )
  })

  it('edge slider moves the right edge (column width) and the edge guide is drawn', () => {
    const { container } = renderApp()
    fireEvent.change(screen.getByRole('slider', { name: 'edge' }), { target: { value: '800' } })

    expect(screen.getByText('800px')).toBeInTheDocument()
    const editor = container.querySelector<HTMLElement>('.rag-editor')
    expect(editor?.style.getPropertyValue('--rag-column-width')).toBe('800px')
    expect(container.querySelector('.rag-overlay .rag-edge')).toBeInTheDocument()
  })

  it('box sliders reshape the line boxes without touching measurement', () => {
    const { container } = renderApp()
    const editor = container.querySelector<HTMLElement>('.rag-editor')
    const lineHeight = editor?.style.getPropertyValue('--rag-line-height')
    const firstBox = () => container.querySelector<HTMLElement>('.rag-line-box')

    // Wait for measurement-independent geometry: boxes exist once lines are measured.
    return waitFor(() => expect(firstBox()).not.toBeNull(), { timeout: 5000 }).then(() => {
      const width = Number(firstBox()?.style.getPropertyValue('--box-w'))
      fireEvent.change(screen.getByRole('slider', { name: 'pad x' }), { target: { value: '12' } })
      fireEvent.change(screen.getByRole('slider', { name: 'pad y' }), { target: { value: '-6' } })
      fireEvent.change(screen.getByRole('slider', { name: 'radius' }), {
        target: { value: '100' },
      })

      const box = firstBox()
      expect(box?.style.getPropertyValue('--box-x')).toBe('-12')
      // From the default padding to 12px on each side.
      expect(Number(box?.style.getPropertyValue('--box-w'))).toBeCloseTo(
        width + 2 * (12 - DEFAULT_LINE_BOX_STYLE.padX),
      )
      // Radius is clamped to half the (shrunken) box height.
      const height = Number(box?.style.getPropertyValue('--box-h'))
      expect(Number(box?.style.getPropertyValue('--box-r'))).toBeCloseTo(height / 2)
      expect(editor?.style.getPropertyValue('--rag-line-height')).toBe(lineHeight)
    })
  })

  it('pad and radius sliders go up to 100', () => {
    renderApp()
    for (const name of ['pad x', 'pad y', 'radius', 'join radius']) {
      expect(screen.getByRole('slider', { name })).toHaveAttribute('max', '100')
    }
  })

  it('perspective button toggles and is off (orthographic) by default', () => {
    renderApp()
    const button = screen.getByRole('button', { name: 'perspective' })
    expect(button).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-pressed', 'true')
  })

  it('has no top height slider (the trophy’s top sits on the frame’s top margin)', () => {
    renderApp()
    expect(screen.queryByRole('slider', { name: 'top height' })).toBeNull()
    expect(screen.getByRole('switch', { name: 'round top' })).toBeInTheDocument()
  })

  it('material controls update the store', () => {
    renderApp()
    const palette = screen.getByRole('combobox', { name: 'palette' })
    expect(palette).toHaveValue('studio')
    fireEvent.change(palette, { target: { value: 'bronze' } })
    expect(palette).toHaveValue('bronze')

    for (const name of [
      'offset',
      'scale',
      'tilt',
      'wobble',
      'edge depth',
      'edge hue',
      'ledge',
      'grain',
    ]) {
      expect(screen.getByRole('slider', { name })).toBeInTheDocument()
    }
    fireEvent.change(screen.getByRole('slider', { name: 'grain' }), { target: { value: '0.8' } })
    expect(screen.getByRole('slider', { name: 'grain' })).toHaveValue('0.8')
  })

  it('has no background option', () => {
    renderApp()
    expect(screen.queryByRole('combobox', { name: 'background' })).toBeNull()
  })

  it('editing a preset color switches to a custom palette seeded from that preset', () => {
    renderApp()
    const palette = screen.getByRole('combobox', { name: 'palette' })
    fireEvent.change(palette, { target: { value: 'slate' } })

    fireEvent.input(screen.getByLabelText('color 2'), { target: { value: '#00ff00' } })

    expect(palette).toHaveValue('custom')
    const swatches = ['color 1', 'color 2', 'color 3', 'color 4'].map(
      (name) => (screen.getByLabelText(name) as HTMLInputElement).value,
    )
    expect(swatches).toEqual([PALETTES.slate[0], '#00ff00', PALETTES.slate[2], PALETTES.slate[3]])
  })

  it('adds and removes colors within the limits, and keeps custom colors across presets', () => {
    renderApp()
    // Start from a 6-color preset (studio, the default, already has the maximum 8).
    fireEvent.change(screen.getByRole('combobox', { name: 'palette' }), {
      target: { value: 'slate' },
    })
    const add = screen.getByRole('button', { name: '+ add color' })
    fireEvent.click(add) // 6 → 7 (switches to custom)
    expect(screen.getByRole('combobox', { name: 'palette' })).toHaveValue('custom')
    expect(screen.getAllByLabelText(/^color \d+$/)).toHaveLength(7)

    // Remove down to the minimum of 2; then remove is disabled.
    for (let i = 0; i < 5; i++) fireEvent.click(screen.getByLabelText('remove color 1'))
    expect(screen.getAllByLabelText(/^color \d+$/)).toHaveLength(2)
    expect(screen.getByLabelText('remove color 1')).toBeDisabled()

    // Browse a preset and come back: the custom colors are still there.
    const palette = screen.getByRole('combobox', { name: 'palette' })
    fireEvent.change(palette, { target: { value: 'silver' } })
    expect(screen.getAllByLabelText(/^color \d+$/)).toHaveLength(PALETTES.silver.length)
    fireEvent.change(palette, { target: { value: 'custom' } })
    expect(screen.getAllByLabelText(/^color \d+$/)).toHaveLength(2)
  })

  it('cannot add more than MAX_STOPS colors', () => {
    renderApp()
    const add = screen.getByRole('button', { name: '+ add color' })
    for (let i = 0; i < MAX_STOPS + 2; i++) fireEvent.click(add)
    expect(screen.getAllByLabelText(/^color \d+$/)).toHaveLength(MAX_STOPS)
    expect(add).toBeDisabled()
  })

  it('generate: one color makes a smooth custom palette and switches to linear blending', () => {
    renderApp()
    fireEvent.input(screen.getByLabelText('generate'), { target: { value: '#2255dd' } })

    expect(screen.getByRole('combobox', { name: 'palette' })).toHaveValue('custom')
    expect(screen.getAllByLabelText(/^color \d+$/)).toHaveLength(MAX_STOPS)
    expect(screen.getByLabelText('generate')).toHaveValue('#2255dd')
    expect(screen.getByRole('slider', { name: 'banding' })).toHaveValue('0')
  })

  it('overshoot extends the shape below the last baseline; baselines are drawn per line', async () => {
    const { container } = renderApp()
    const slider = screen.getByRole('slider', { name: 'overshoot' })
    expect(slider).toHaveValue('3')
    expect(slider).toHaveAttribute('max', '120')

    const editor = container.querySelector<HTMLElement>('.rag-editor')
    const guides = () => [...container.querySelectorAll<HTMLElement>('.rag-baseline')]
    // One baseline guide per line, once lines are measured (after the font is ready).
    await waitFor(() => expect(guides()).toHaveLength(4), { timeout: 5000 })
    const lastBaseline = Number(guides().at(-1)?.style.getPropertyValue('--baseline-y'))
    const bottom = () => parseFloat(editor?.style.getPropertyValue('--edge-bottom') ?? '')
    expect(bottom()).toBeCloseTo(lastBaseline + 3)

    fireEvent.change(slider, { target: { value: '12' } })
    expect(bottom()).toBeCloseTo(lastBaseline + 12)
  })

  it('line height slider sets the line height directly, in px', () => {
    const { container } = renderApp()
    const slider = screen.getByRole('slider', { name: 'line height' })
    expect(slider).toHaveValue(String(DEFAULT_SETTINGS.lineHeight))

    fireEvent.change(slider, { target: { value: '60' } })
    const editor = container.querySelector<HTMLElement>('.rag-editor')
    expect(editor?.style.getPropertyValue('--rag-line-height')).toBe('60px')
    // The type size is untouched.
    expect(editor?.style.getPropertyValue('--rag-font-size')).toBe(`${DEFAULT_SETTINGS.fontSize}px`)
  })

  it('groups the fields into named sections, open by default', () => {
    renderApp()
    const names = [
      'type',
      'shape',
      'top',
      'line boxes',
      'material',
      'lighting',
      'canvas',
      'banner',
      'view',
      'image',
    ]
    expect(screen.getAllByRole('heading').map((h) => h.textContent?.replace(/[+−]$/, ''))).toEqual(
      names,
    )
    for (const name of names) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-expanded', 'true')
    }
  })

  it('shows the banner at the bottom by default; it toggles, takes its text and moves', () => {
    const { container } = renderApp()
    const banner = () => screen.queryByTestId('banner')
    expect(banner()).toBeInTheDocument()
    expect(banner()).toHaveTextContent('Call for Entries: November 16th')
    expect(banner()).toHaveTextContent('rgdbrandingawards.com')
    expect(banner()?.querySelector('image')).toHaveAttribute('href', '/images/RGD_Logo.svg')
    expect(screen.getByRole('combobox', { name: 'position' })).toHaveValue('bottom')

    fireEvent.change(screen.getByRole('textbox', { name: 'headline' }), {
      target: { value: 'Winners: March 3rd' },
    })
    expect(banner()).toHaveTextContent('Winners: March 3rd')

    // At the bottom, it pushes the text up above it; at the top or hidden, it doesn't.
    const artboard = container.querySelector<HTMLElement>('.artboard')
    const padding = () =>
      parseFloat(artboard?.style.getPropertyValue('--artboard-padding-bottom') ?? '')
    const atBottom = padding()
    fireEvent.change(screen.getByRole('combobox', { name: 'position' }), {
      target: { value: 'top' },
    })
    const atTop = padding()
    expect(atBottom).toBeGreaterThan(atTop)

    fireEvent.click(screen.getByRole('switch', { name: 'banner' }))
    expect(banner()).toBeNull()
    expect(padding()).toBe(atTop)
  })

  it('reveals the banner: at 0% nothing shows', () => {
    renderApp()
    fireEvent.change(screen.getByRole('slider', { name: 'banner reveal' }), {
      target: { value: '0' },
    })
    const [background] = [...screen.getByTestId('banner').querySelectorAll('rect')].filter(
      (rect) => !rect.closest('clipPath'),
    )
    expect(background).toHaveAttribute('height', '0')
  })

  it('collapses and expands every section at once', () => {
    renderApp()
    const all = screen.getByRole('button', { name: 'collapse all' })
    fireEvent.click(all)
    expect(screen.getByRole('button', { name: 'type' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: 'image' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('slider', { name: 'size' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'expand all' }))
    expect(screen.getByRole('slider', { name: 'size' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'collapse all' })).toBeInTheDocument()
  })

  it('omits keyframes and video transport without a timeline', () => {
    renderApp()
    expect(screen.queryByRole('button', { name: 'keyframe size' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'export 4K MP4' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'play' })).toBeNull()
  })

  it('collapses and expands a section from its header', () => {
    renderApp()
    const header = screen.getByRole('button', { name: 'line boxes' })
    expect(screen.getByRole('slider', { name: 'pad x' })).toBeInTheDocument()

    fireEvent.click(header)
    expect(header).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('slider', { name: 'pad x' })).toBeNull()
    // Other sections stay open.
    expect(screen.getByRole('slider', { name: 'size' })).toBeInTheDocument()

    fireEvent.click(header)
    expect(screen.getByRole('slider', { name: 'pad x' })).toBeInTheDocument()
  })

  it('round top toggle enables the top radius slider', () => {
    renderApp()
    const toggle = screen.getByRole('switch', { name: 'round top' })
    const radius = screen.getByRole('slider', { name: 'top radius' })
    expect(toggle).not.toBeChecked()
    expect(radius).toBeDisabled()

    fireEvent.click(toggle)
    expect(toggle).toBeChecked()
    expect(radius).toBeEnabled()
    fireEvent.change(radius, { target: { value: '30' } })
    expect(radius).toHaveValue('30')
    // Large radii remain available; geometry caps the actual curve safely.
    expect(radius).toHaveAttribute('max', '400')
    fireEvent.change(radius, { target: { value: '350' } })
    expect(radius).toHaveValue('350')
  })

  it('has a taper slider in percent, 0 by default', () => {
    renderApp()
    const taper = screen.getByRole('slider', { name: 'taper' })
    expect(taper).toHaveValue('0')
    expect(taper).toHaveAttribute('max', '90')
    fireEvent.change(taper, { target: { value: '40' } })
    expect(screen.getByText('40%')).toBeInTheDocument()
  })

  it('background and text pickers recolor the canvas; there is no metallic slider', () => {
    const { container } = renderApp()
    const artboard = container.querySelector<HTMLElement>('.artboard')
    expect(artboard?.style.getPropertyValue('--color-artboard-bg')).toBe('#ffffff')
    expect(artboard?.style.getPropertyValue('--color-canvas-text')).toBe('#111111')

    fireEvent.input(screen.getByLabelText('background'), { target: { value: '#1c1c1c' } })
    fireEvent.input(screen.getByLabelText('text'), { target: { value: '#f5f0e8' } })
    expect(artboard?.style.getPropertyValue('--color-artboard-bg')).toBe('#1c1c1c')
    expect(artboard?.style.getPropertyValue('--color-canvas-text')).toBe('#f5f0e8')

    expect(screen.queryByRole('slider', { name: 'metallic' })).toBeNull()
  })

  it('mirror: on by default, a right-aligned copy of each measured line; toggles off', async () => {
    const { container } = renderApp()
    const artboard = container.querySelector('.artboard')
    expect(artboard).toHaveAttribute('data-mirror', 'on')

    const mirror = () => screen.queryByTestId('rag-mirror')
    // The copy is built from the measured lines (after the font is ready).
    await waitFor(() => expect(mirror()?.children).toHaveLength(4), { timeout: 5000 })
    expect([...mirror()!.children].map((line) => line.textContent)).toEqual([
      'RGD',
      'BRANDING',
      'AWARDS',
      '2027',
    ])

    fireEvent.click(screen.getByRole('switch', { name: 'mirror' }))
    expect(mirror()).toBeNull()
    expect(artboard).toHaveAttribute('data-mirror', 'off')
  })

  it('shading: lit by default; lighting sliders apply to lit, tilt and edge hue to painted', () => {
    renderApp()
    const shading = screen.getByRole('combobox', { name: 'shading' })
    const lightingSliders = [
      'light angle',
      'light height',
      'ambient',
      'softness',
      'highlight',
      'highlight size',
    ]
    const slider = (name: string) => screen.getByRole('slider', { name })

    expect(shading).toHaveValue('lit')
    for (const name of lightingSliders) expect(slider(name)).toBeEnabled()
    expect(slider('tilt')).toBeDisabled()
    expect(slider('edge hue')).toBeDisabled()

    fireEvent.change(shading, { target: { value: 'painted' } })
    for (const name of lightingSliders) expect(slider(name)).toBeDisabled()
    expect(slider('tilt')).toBeEnabled()
    expect(slider('edge hue')).toBeEnabled()
  })
})

describe('image export controls', () => {
  it('offers PNG (optionally transparent) or JPEG at ×1–×5', () => {
    render(
      <SettingsProvider>
        <App />
      </SettingsProvider>,
    )
    const section = screen.getByRole('region', { name: 'image' })
    const format = within(section).getByRole('combobox', { name: 'format' })
    expect(format).toHaveValue('png')
    const scale = within(section).getByRole('combobox', { name: 'scale' })
    expect([...scale.querySelectorAll('option')].map((o) => o.textContent)).toEqual([
      '×1',
      '×2',
      '×3',
      '×4',
      '×5',
    ])
    expect(within(section).getByText('3840 × 2160')).toBeInTheDocument()
    fireEvent.change(scale, { target: { value: '×4' } })
    expect(within(section).getByText('7680 × 4320')).toBeInTheDocument()
    // Transparency is PNG's.
    const transparent = within(section).getByRole('switch', { name: 'transparent' })
    expect(transparent).toBeEnabled()
    fireEvent.change(format, { target: { value: 'jpeg' } })
    expect(transparent).toBeDisabled()
    expect(within(section).getByRole('button', { name: 'export jpeg' })).toBeInTheDocument()
  })
})
