import { render } from '@testing-library/react'
import { StrictMode, useRef } from 'react'
import { PaperCanvas } from '../../src/components/PaperCanvas'
import { DEFAULT_MATERIAL } from '../../src/state'

// Test only the React lifecycle: one scene per mount, every scene disposed, canvas removed.
const scene = {
  scope: {},
  showRag: vi.fn(),
  resize: vi.fn(),
  setOrigin: vi.fn(),
  setVisible: vi.fn(),
  dispose: vi.fn(),
}
vi.mock('../../src/shape2d', () => ({ createPaperScene: vi.fn(() => scene) }))
const { createPaperScene } = await import('../../src/shape2d')

// The canvas anchors its drawing to the text block, so give it one.
function WithAnchor() {
  const anchorRef = useRef<HTMLDivElement>(null)
  return (
    <>
      <div ref={anchorRef} />
      <PaperCanvas
        anchorRef={anchorRef}
        boxes={[]}
        edgeX={100}
        extent={{ left: 0, top: 0, bottom: 10 }}
        topCornerRadius={0}
        taper={0}
        joinRadius={0}
        mirror={false}
        look={DEFAULT_MATERIAL}
      />
    </>
  )
}

describe('PaperCanvas under StrictMode', () => {
  it('creates and disposes a scene per mount', () => {
    const { container, unmount } = render(
      <StrictMode>
        <WithAnchor />
      </StrictMode>,
    )
    expect(container.querySelectorAll('canvas')).toHaveLength(1)
    expect(scene.showRag).toHaveBeenCalled()
    // Filled with the material's gradient (top → bottom stops).
    const style = scene.showRag.mock.calls[0]?.[1] as { gradient: { offset: number }[] }
    expect(style.gradient.at(0)?.offset).toBe(0)
    expect(style.gradient.at(-1)?.offset).toBe(1)
    expect(scene.setOrigin).toHaveBeenCalled()
    unmount()
    expect(createPaperScene).toHaveBeenCalledTimes(2)
    expect(scene.dispose).toHaveBeenCalledTimes(2)
    expect(container.querySelector('canvas')).toBeNull()
  })
})
