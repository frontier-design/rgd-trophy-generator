import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DEFAULT_PATTERN } from '../../src/components/CanvasPage/graph'
import { PatternFields } from '../../src/components/CanvasPage/PatternFields'
import type { PatternParams } from '../../src/types'

vi.mock('../../src/components/CanvasPage/patternImage', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/components/CanvasPage/patternImage')>()
  return {
    ...actual,
    imageFileToUrl: async () => 'data:image/png;base64,RESIZED',
  }
})

const CROP = { x: 0.1, y: 0.1, width: 0.5, height: 0.5 }

function Harness({ initial }: { initial?: Partial<PatternParams> }) {
  const [params, setParams] = useState<PatternParams>({
    ...DEFAULT_PATTERN,
    crop: CROP,
    ...initial,
  })
  return (
    <PatternFields
      params={params}
      set={(patch) => setParams((current) => ({ ...current, ...patch }))}
      status={{ map: null, message: '', busy: false }}
    />
  )
}

function stageRect(stage: HTMLElement) {
  vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 200,
    bottom: 100,
    width: 200,
    height: 100,
    toJSON: () => ({}),
  } as DOMRect)
}

describe('pattern crop fields', () => {
  it('edits the crop, then a new source image resets it to the full image', async () => {
    const { container } = render(<Harness />)
    const stage = container.querySelector<HTMLElement>('.pattern-crop-stage')
    expect(stage).not.toBeNull()
    stageRect(stage!)

    // Move the crop: the box follows.
    fireEvent.pointerDown(screen.getByLabelText('Crop region'), {
      button: 0,
      clientX: 40,
      clientY: 20,
    })
    fireEvent.pointerMove(window, { clientX: 60, clientY: 30 })
    fireEvent.pointerUp(window)
    const box = screen.getByLabelText('Crop region')
    expect(box).toHaveStyle({ left: '20%', top: '20%', width: '50%', height: '50%' })

    // Zooming/panning the viewer leaves the crop alone.
    fireEvent.click(screen.getByLabelText('zoom in'))
    fireEvent.wheel(screen.getByLabelText('Pattern crop viewer'), { deltaY: -100 })
    expect(screen.getByLabelText('Crop region')).toHaveStyle({ left: '20%', top: '20%' })

    const input = screen.getByLabelText('Pattern image')
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'new.png', { type: 'image/png' })] },
    })
    await waitFor(() =>
      expect(container.querySelector('.pattern-crop-image')).toHaveAttribute(
        'src',
        'data:image/png;base64,RESIZED',
      ),
    )
    expect(screen.getByLabelText('Crop region')).toHaveStyle({
      left: '0%',
      top: '0%',
      width: '100%',
      height: '100%',
    })
  })
})
