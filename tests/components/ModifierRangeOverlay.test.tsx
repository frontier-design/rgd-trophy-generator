import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ModifierRangeOverlay } from '../../src/components/CanvasPage/ModifierRangeOverlay'

describe('ModifierRangeOverlay', () => {
  it('positions the original endpoints independently, including crossed values', () => {
    render(<ModifierRangeOverlay top={20} height={200} from={80} to={10} onChange={() => {}} />)
    expect(screen.getByRole('slider', { name: 'Modifier from' })).toHaveStyle({ top: '80%' })
    expect(screen.getByRole('slider', { name: 'Modifier to' })).toHaveStyle({ top: '10%' })
  })

  it('maps pointer coordinates through the displayed bounds and clamps outside them', () => {
    const onChange = vi.fn()
    const boundary = vi.fn()
    const { container } = render(
      <ModifierRangeOverlay
        top={20}
        height={200}
        from={0}
        to={100}
        onChange={onChange}
        onGestureBoundary={boundary}
      />,
    )
    const track = container.firstElementChild as HTMLElement
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({ top: 100, height: 400 } as DOMRect)
    const handle = screen.getByRole('slider', { name: 'Modifier from' })
    handle.setPointerCapture = vi.fn()
    fireEvent.pointerDown(handle, { pointerId: 1, button: 0, clientY: 200 })
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 600 })
    fireEvent.pointerUp(handle, { pointerId: 1 })
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 100 })
    expect(onChange.mock.calls).toEqual([[{ from: 25 }], [{ from: 100 }]])
    expect(boundary).toHaveBeenCalledTimes(2)
  })

  it.each(['line', 'tag'])('drags the range from its %s', (target) => {
    const onChange = vi.fn()
    const boundary = vi.fn()
    const { container } = render(
      <ModifierRangeOverlay
        top={0}
        height={200}
        from={25}
        to={75}
        onChange={onChange}
        onGestureBoundary={boundary}
      />,
    )
    vi.spyOn(container.firstElementChild as HTMLElement, 'getBoundingClientRect').mockReturnValue({
      top: 100,
      height: 400,
    } as DOMRect)
    const handle = screen.getByRole('slider', { name: 'Modifier from' })
    expect(handle).toHaveStyle({ left: '0px', width: '100%', cursor: 'ns-resize' })
    const line = handle.querySelector('[data-range-line="from"]')!
    expect(line).toHaveStyle({ left: '0px', right: '0px' })
    const grip = target === 'line' ? line : screen.getByText('from 25%')
    fireEvent.pointerDown(grip, { pointerId: 1, button: 0, clientY: 200 })
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 300 })
    fireEvent.pointerUp(handle, { pointerId: 1 })
    expect(onChange.mock.calls).toEqual([[{ from: 25 }], [{ from: 50 }]])
    expect(boundary).toHaveBeenCalledTimes(2)
  })

  it('labels each source and gives coincident ranges separate tag columns without shifting their percentages', () => {
    render(
      <>
        <ModifierRangeOverlay
          top={0}
          height={200}
          from={25}
          to={75}
          label="twist 1"
          index={1}
          onChange={() => {}}
        />
        <ModifierRangeOverlay
          top={0}
          height={200}
          from={25}
          to={75}
          label="etch 1"
          index={2}
          onChange={() => {}}
        />
      </>,
    )
    const first = screen.getByRole('slider', { name: 'twist 1 from' })
    const second = screen.getByRole('slider', { name: 'etch 1 from' })
    expect(first).toHaveStyle({ top: '25%' })
    expect(second).toHaveStyle({ top: '25%' })
    expect(screen.getByText('twist 1 from 25%')).toHaveStyle({
      right: '144px',
      zIndex: '2',
      transform: 'translateY(-50%)',
    })
    expect(screen.getByText('etch 1 from 25%')).toHaveStyle({
      right: '432px',
      zIndex: '2',
      transform: 'translateY(-50%)',
    })
    // Handle buttons must not establish stacking contexts that trap tags under later lines.
    expect(first.style.transform).toBe('')
    expect(first.style.zIndex).toBe('')
  })

  it('supports keyboard edits and disables handles without a height', () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <ModifierRangeOverlay top={0} height={100} from={5} to={80} onChange={onChange} />,
    )
    const handle = screen.getByRole('slider', { name: 'Modifier to' })
    fireEvent.keyDown(handle, { key: 'ArrowUp' })
    fireEvent.keyDown(handle, { key: 'End' })
    expect(onChange.mock.calls).toEqual([[{ to: 79 }], [{ to: 100 }]])
    rerender(<ModifierRangeOverlay top={0} height={0} from={5} to={80} onChange={onChange} />)
    expect(handle).toBeDisabled()
  })
})
