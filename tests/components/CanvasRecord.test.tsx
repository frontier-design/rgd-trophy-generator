import { fireEvent, render, screen, within } from '@testing-library/react'
import { CanvasPage } from '../../src/components/CanvasPage'
import {
  linesFromText,
  textAt,
  typedText,
  typingDuration,
} from '../../src/components/CanvasPage/textLines'
import { DEFAULT_SETTINGS } from '../../src/state'

vi.mock('../../src/render3d', () => import('../support/render3dStub'))

it("takes a scene's frame and export scale, and times the render by its text node's typing", async () => {
  render(<CanvasPage tools={null} />)
  const canvas = screen.getByRole('region', { name: 'Canvas' })
  const insert = (name: string) => {
    fireEvent.contextMenu(canvas, { clientX: 100, clientY: 100 })
    fireEvent.click(screen.getByRole('menuitem', { name }))
  }
  const link = (from: HTMLElement, fromLabel: string, to: HTMLElement, pointerId: number) => {
    fireEvent.pointerDown(within(from).getByLabelText(fromLabel), { button: 0, pointerId })
    fireEvent.pointerUp(to, { pointerId })
  }
  insert('insert scene')
  const scene = await screen.findByLabelText('scene 1')
  insert('insert record')
  const record = screen.getByLabelText('record 1')
  expect(within(record).getByText('Link a scene to record')).toBeInTheDocument()
  // Unlinked, there's nothing to render.
  fireEvent.click(within(record).getByRole('button', { name: 'render' }))
  expect(within(record).getByText(/Link a scene into this node/)).toBeInTheDocument()

  // Only a scene links in: a twist doesn't.
  insert('insert twist')
  const input = within(record).getByLabelText('record 1 input')
  link(screen.getByRole('group', { name: 'twist 1' }), 'twist 1 output', input, 1)
  expect(input).not.toHaveAttribute('data-connected')
  link(scene, 'scene 1 output', input, 2)
  expect(input).toHaveAttribute('data-connected')

  // The scene's 16:9 frame at its default export scale (×2), the artboard a quarter-size
  // preview of it; no text node: just the holds (0.5 s in, 1 s out).
  expect(record.style.getPropertyValue('--artboard-width')).toBe('480px')
  expect(record.style.getPropertyValue('--artboard-height')).toBe('270px')
  const summary = within(record).getByLabelText('recording')
  expect(summary).toHaveTextContent('45 frames · 1.50 s · 3840 × 2160 (×2)')
  expect(within(record).getByText(/No text node is linked/)).toBeInTheDocument()

  // A text node linked into the scene: its lines join the timeline, one row each, between
  // the holds.
  insert('insert text')
  const text = screen.getByRole('group', { name: 'text 1' })
  link(text, 'text 1 output', within(scene).getByLabelText('scene 1 input'), 3)
  const labels = () =>
    [...record.querySelectorAll('.record-row-label')].map((label) => label.textContent)
  const lines = linesFromText(DEFAULT_SETTINGS.text)
  expect(labels()).toEqual(['hold in', ...lines.map((line) => line.text), 'hold out'])
  fireEvent.change(within(record).getByLabelText('frame rate'), { target: { value: '60' } })
  const seconds = 0.5 + typingDuration(lines) + 1
  expect(summary).toHaveTextContent(`${Math.ceil(seconds * 60 - 1e-9)} frames`)

  // Backspace on the text node adds the pause and the deleting.
  fireEvent.click(within(text).getByRole('switch', { name: 'backspace' }))
  expect(labels().slice(-3)).toEqual(['pause', 'delete', 'hold out'])

  // A line's hold (in its formatting, under tracking): a hatched bar after its typing, and
  // the video longer by it.
  fireEvent.click(within(text).getByRole('button', { name: 'line 1 formatting' }))
  fireEvent.click(within(text).getByRole('checkbox', { name: 'line 1 hold' }))
  expect(within(text).getByRole('slider', { name: 'line 1 hold time' })).toHaveValue('0.5')
  const holdBar = record.querySelector('.record-clip[data-kind="line-hold"]')
  expect(holdBar).toHaveTextContent('0.50s')
  expect(
    within(record).getByRole('slider', { name: `${lines[0]!.text} hold length` }),
  ).toBeInTheDocument()
  fireEvent.click(within(text).getByRole('checkbox', { name: 'line 1 hold' }))
  expect(record.querySelector('.record-clip[data-kind="line-hold"]')).toBeNull()
})

it('scrubs the scene through the animation, and retimes a line by dragging its bar', async () => {
  // jsdom has no layout: the tracks are 100 px wide from x = 0.
  const rect = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('record-track') || this.classList.contains('record-ruler')
        ? ({ left: 0, top: 0, width: 100, height: 20, right: 100, bottom: 20 } as DOMRect)
        : ({ left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 } as DOMRect)
    })
  try {
    render(<CanvasPage tools={null} />)
    const canvas = screen.getByRole('region', { name: 'Canvas' })
    const insert = (name: string) => {
      fireEvent.contextMenu(canvas, { clientX: 100, clientY: 100 })
      fireEvent.click(screen.getByRole('menuitem', { name }))
    }
    const link = (from: HTMLElement, label: string, to: HTMLElement, pointerId: number) => {
      fireEvent.pointerDown(within(from).getByLabelText(label), { button: 0, pointerId })
      fireEvent.pointerUp(to, { pointerId })
    }
    insert('insert scene')
    const scene = await screen.findByLabelText('scene 1')
    insert('insert record')
    const record = screen.getByLabelText('record 1')
    insert('insert text')
    const text = screen.getByRole('group', { name: 'text 1' })
    link(text, 'text 1 output', within(scene).getByLabelText('scene 1 input'), 1)
    link(scene, 'scene 1 output', within(record).getByLabelText('record 1 input'), 2)

    const lines = linesFromText(DEFAULT_SETTINGS.text)
    const duration = 0.5 + typingDuration(lines) + 1
    const ruler = within(record).getByRole('slider', { name: 'playhead' })
    const sceneText = () => within(scene).getByRole('textbox')
    const scrubTo = (share: number) => {
      fireEvent.pointerDown(ruler, { button: 0, pointerId: 5, clientX: share * 100 })
      fireEvent.pointerUp(ruler, { pointerId: 5, clientX: share * 100 })
    }
    // Within the hold in: nothing typed yet.
    scrubTo(0.05)
    expect(sceneText()).toHaveValue('')
    // Partway: what's typed then.
    scrubTo(0.5)
    const at = 0.5 * duration - 0.5
    expect(sceneText()).toHaveValue(typedText(lines, at))
    expect(within(record).getByLabelText('time')).toHaveTextContent(
      `${(0.5 * duration).toFixed(2)} / ${duration.toFixed(2)} s`,
    )
    // In the hold out: the whole text. Deselecting the record node lets the scene go.
    scrubTo(0.99)
    expect(sceneText()).toHaveValue(DEFAULT_SETTINGS.text)
    scrubTo(0.3)
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 6, clientX: 5, clientY: 5 })
    fireEvent.pointerUp(canvas, { pointerId: 6, clientX: 5, clientY: 5 })
    fireEvent.click(canvas)
    expect(sceneText()).toHaveValue(DEFAULT_SETTINGS.text)

    // Dragging the first line's bar end out by 10% of the timeline makes it type slower:
    // its new length over its characters.
    const handle = within(record).getByRole('slider', { name: `${lines[0]!.text} length` })
    const length = Array.from(lines[0]!.text).length / lines[0]!.speed
    fireEvent.pointerDown(handle, { button: 0, pointerId: 7, clientX: 50 })
    fireEvent.pointerMove(handle, { pointerId: 7, clientX: 60 })
    fireEvent.pointerUp(handle, { pointerId: 7, clientX: 60 })
    const speed = Array.from(lines[0]!.text).length / (length + 0.1 * duration)
    expect(within(text).getByRole('slider', { name: 'line 1 speed' })).toHaveValue(
      String(Math.round(speed / 0.25) * 0.25),
    )
  } finally {
    rect.mockRestore()
  }
})

const recorded = vi.hoisted(() => ({
  frames: [] as string[],
  clips: [] as (number | undefined)[],
  finished: 0,
}))
vi.mock('../../src/export/recorder', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/export/recorder')>()
  return {
    ...actual,
    createFrameRecorder: async (options: {
      frame: { width: number; height: number }
      scale: number
      fps: number
    }) => {
      let frames = 0
      return {
        width: options.frame.width * options.scale,
        height: options.frame.height * options.scale,
        scale: options.scale,
        fps: options.fps,
        get frames() {
          return frames
        },
        add(composition: { text: { lines: string[] }[]; images: { clipTop?: number }[] }) {
          frames++
          recorded.frames.push((composition.text[0]?.lines ?? []).join('\n').trim())
          recorded.clips.push(composition.images[0]?.clipTop)
        },
        drain: async () => {},
        finish: async () => {
          recorded.finished++
          return new Blob([], { type: 'video/mp4' })
        },
        cancel: async () => {},
      }
    },
  }
})

it('renders every frame at its time, typing the text node, then restores the scene', async () => {
  vi.stubGlobal('VideoEncoder', class {})
  const createObjectURL = vi.fn(() => 'blob:video')
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }))
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  try {
    render(<CanvasPage tools={null} />)
    const canvas = screen.getByRole('region', { name: 'Canvas' })
    const insert = (name: string) => {
      fireEvent.contextMenu(canvas, { clientX: 100, clientY: 100 })
      fireEvent.click(screen.getByRole('menuitem', { name }))
    }
    insert('insert scene')
    const scene = await screen.findByLabelText('scene 1')
    insert('insert record')
    const record = screen.getByLabelText('record 1')
    insert('insert text')
    const text = screen.getByRole('group', { name: 'text 1' })
    const link = (from: HTMLElement, label: string, to: HTMLElement, pointerId: number) => {
      fireEvent.pointerDown(within(from).getByLabelText(label), { button: 0, pointerId })
      fireEvent.pointerUp(to, { pointerId })
    }
    link(text, 'text 1 output', within(scene).getByLabelText('scene 1 input'), 1)
    link(scene, 'scene 1 output', within(record).getByLabelText('record 1 input'), 2)
    fireEvent.change(within(record).getByLabelText('frame rate'), { target: { value: '25' } })

    fireEvent.click(within(record).getByRole('button', { name: 'render' }))
    await within(record).findByText(/^Saved \d+ frames/)
    expect(recorded.finished).toBe(1)
    expect(click).toHaveBeenCalled()
    // Frame i shows the text at i / 25 s, less the 0.5 s hold in (the default text, each
    // line at the default speed): nothing during the hold in, every step of the typing,
    // none skipped, then the whole text for the 1 s hold out.
    const lines = linesFromText(DEFAULT_SETTINGS.text)
    const words = (value: string) => value.replace(/\s+/g, ' ').trim()
    expect(recorded.frames).toHaveLength(Math.ceil((0.5 + typingDuration(lines) + 1) * 25 - 1e-9))
    expect(recorded.frames.map(words)).toEqual(
      recorded.frames.map((_, i) => words(textAt({ lines }, i / 25 - 0.5))),
    )
    expect(recorded.frames.slice(0, 12)).toEqual(Array(12).fill(''))
    expect(words(recorded.frames.at(-1) ?? '')).toBe(words(DEFAULT_SETTINGS.text))
    // Afterwards the scene shows its whole text again.
    expect(within(scene).getByRole('textbox')).toHaveValue(DEFAULT_SETTINGS.text)
  } finally {
    click.mockRestore()
    vi.unstubAllGlobals()
  }
})

it("masks the trophy to the text node's typing in every rendered frame", async () => {
  vi.stubGlobal('VideoEncoder', class {})
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:v'), revokeObjectURL: vi.fn() }),
  )
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  recorded.frames = []
  recorded.clips = []
  try {
    render(<CanvasPage tools={null} />)
    const canvas = screen.getByRole('region', { name: 'Canvas' })
    const insert = (name: string) => {
      fireEvent.contextMenu(canvas, { clientX: 100, clientY: 100 })
      fireEvent.click(screen.getByRole('menuitem', { name }))
    }
    insert('insert scene')
    const scene = await screen.findByLabelText('scene 1')
    insert('insert record')
    const record = screen.getByLabelText('record 1')
    insert('insert text')
    const text = screen.getByRole('group', { name: 'text 1' })
    const link = (from: HTMLElement, label: string, to: HTMLElement, pointerId: number) => {
      fireEvent.pointerDown(within(from).getByLabelText(label), { button: 0, pointerId })
      fireEvent.pointerUp(to, { pointerId })
    }
    link(text, 'text 1 output', within(scene).getByLabelText('scene 1 input'), 1)
    link(scene, 'scene 1 output', within(record).getByLabelText('record 1 input'), 2)
    fireEvent.click(within(text).getByRole('switch', { name: 'mask' }))
    // At rest (all typed) the mask shows the whole trophy.
    expect(scene.querySelector('.artboard')).not.toHaveAttribute('data-masked')

    fireEvent.click(within(record).getByRole('button', { name: 'render' }))
    await within(record).findByText(/^Saved \d+ frames/)
    const { frames, clips } = recorded
    // Nothing typed (the hold in): no trophy at all (clipped below the 1080 px frame).
    expect(clips[0]).toBe(1080)
    // Typing: clipped at the first line's top, until the top shows at the end: no clip.
    const typing = clips.filter((clip, i) => frames[i] !== '' && clip !== undefined)
    expect(typing.length).toBeGreaterThan(10)
    expect(typing.every((clip) => clip! < 1080)).toBe(true)
    expect(clips.at(-1)).toBeUndefined()
    // Afterwards the scene shows all of it again.
    expect(scene.querySelector('.artboard')).not.toHaveAttribute('data-masked')
  } finally {
    click.mockRestore()
    vi.unstubAllGlobals()
  }
})

it("records a repeat artboard: its frame, its text node's typing, its tiles as each frame", async () => {
  vi.stubGlobal('VideoEncoder', class {})
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:v'), revokeObjectURL: vi.fn() }),
  )
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  recorded.frames = []
  recorded.clips = []
  try {
    render(<CanvasPage tools={null} />)
    const canvas = screen.getByRole('region', { name: 'Canvas' })
    const insert = (name: string) => {
      fireEvent.contextMenu(canvas, { clientX: 100, clientY: 100 })
      fireEvent.click(screen.getByRole('menuitem', { name }))
    }
    const link = (from: HTMLElement, label: string, to: HTMLElement, pointerId: number) => {
      fireEvent.pointerDown(within(from).getByLabelText(label), { button: 0, pointerId })
      fireEvent.pointerUp(to, { pointerId })
    }
    insert('insert repeat')
    const repeat = screen.getByLabelText('repeat 1')
    insert('insert record')
    const record = screen.getByLabelText('record 1')
    insert('insert text')
    const text = screen.getByRole('group', { name: 'text 1' })
    link(text, 'text 1 output', within(repeat).getByLabelText('repeat 1 input'), 1)
    const input = within(record).getByLabelText('record 1 input')
    link(repeat, 'repeat 1 output', input, 2)
    expect(input).toHaveAttribute('data-connected')
    // The repeat's 16:9 frame at its export scale (×2), a quarter-size preview.
    expect(record.style.getPropertyValue('--artboard-width')).toBe('480px')
    expect(within(record).getByLabelText('recording')).toHaveTextContent('3840 × 2160 (×2)')
    // Its text node's lines are the timeline.
    const lines = linesFromText(DEFAULT_SETTINGS.text)
    expect(
      [...record.querySelectorAll('.record-row-label')].map((label) => label.textContent),
    ).toEqual(['hold in', ...lines.map((line) => line.text), 'hold out'])

    fireEvent.change(within(record).getByLabelText('frame rate'), { target: { value: '25' } })
    fireEvent.click(within(record).getByRole('button', { name: 'render' }))
    await within(record).findByText(/^Saved \d+ frames/, undefined, { timeout: 20_000 })
    expect(recorded.frames).toHaveLength(Math.ceil((0.5 + typingDuration(lines) + 1) * 25 - 1e-9))
    // Each frame is the repeat's tiles, drawn as one image (its text is in it).
    expect(recorded.clips.every((clip) => clip === undefined)).toBe(true)
    // A repeat links to record nodes only, not scenes.
    insert('insert scene')
    const scene = await screen.findByLabelText('scene 1')
    link(repeat, 'repeat 1 output', within(scene).getByLabelText('scene 1 input'), 3)
    expect(within(scene).getByLabelText('scene 1 input')).not.toHaveAttribute('data-connected')
  } finally {
    click.mockRestore()
    vi.unstubAllGlobals()
  }
}, 30_000)
