import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { TextLinesField } from '../../src/components/CanvasPage/TextLinesField'
import { linesFromText, textOf, type TextLine } from '../../src/components/CanvasPage/textLines'

function Harness({ initial, spy }: { initial: string; spy?: (lines: TextLine[]) => void }) {
  const [lines, setLines] = useState(() => linesFromText(initial))
  return (
    <>
      <TextLinesField
        lines={lines}
        onChange={(next) => {
          spy?.(next)
          setLines(next)
        }}
      />
      <output data-testid="text">{textOf(lines)}</output>
    </>
  )
}

const input = (n: number) => screen.getByRole<HTMLInputElement>('textbox', { name: `line ${n}` })
const caretAt = (el: HTMLInputElement, at: number) => {
  el.focus()
  el.setSelectionRange(at, at)
}
const text = () => screen.getByTestId('text').textContent

describe('TextLinesField', () => {
  it('shows one input per line', () => {
    render(<Harness initial={'RGD\nAWARDS'} />)
    expect(input(1)).toHaveValue('RGD')
    expect(input(2)).toHaveValue('AWARDS')
  })

  it('Enter at the end goes to the next line, or makes one after the last', () => {
    render(<Harness initial={'AB\nCD'} />)
    caretAt(input(1), 2)
    fireEvent.keyDown(input(1), { key: 'Enter' })
    expect(document.activeElement).toBe(input(2))
    expect(text()).toBe('AB\nCD')
    caretAt(input(2), 2)
    fireEvent.keyDown(input(2), { key: 'Enter' })
    expect(text()).toBe('AB\nCD\n')
    expect(document.activeElement).toBe(input(3))
  })

  it('Enter mid-line splits, Backspace at the start joins', () => {
    render(<Harness initial="ABCD" />)
    caretAt(input(1), 2)
    fireEvent.keyDown(input(1), { key: 'Enter' })
    expect(text()).toBe('AB\nCD')
    expect(document.activeElement).toBe(input(2))
    expect(input(2).selectionStart).toBe(0)
    fireEvent.keyDown(input(2), { key: 'Backspace' })
    expect(text()).toBe('ABCD')
    expect(document.activeElement).toBe(input(1))
    expect(input(1).selectionStart).toBe(2)
  })

  it('Delete at the end joins the next line', () => {
    render(<Harness initial={'AB\nCD'} />)
    caretAt(input(1), 2)
    fireEvent.keyDown(input(1), { key: 'Delete' })
    expect(text()).toBe('ABCD')
  })

  it('arrow keys cross lines', () => {
    render(<Harness initial={'ABCD\nEF'} />)
    caretAt(input(1), 3)
    fireEvent.keyDown(input(1), { key: 'ArrowDown' })
    expect(document.activeElement).toBe(input(2))
    expect(input(2).selectionStart).toBe(2)
    fireEvent.keyDown(input(2), { key: 'ArrowUp' })
    expect(document.activeElement).toBe(input(1))
    caretAt(input(1), 4)
    fireEvent.keyDown(input(1), { key: 'ArrowRight' })
    expect(document.activeElement).toBe(input(2))
    expect(input(2).selectionStart).toBe(0)
    fireEvent.keyDown(input(2), { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(input(1))
    expect(input(1).selectionStart).toBe(4)
  })

  it('pasting several lines makes new lines', () => {
    render(<Harness initial="AB" />)
    caretAt(input(1), 1)
    fireEvent.paste(input(1), { clipboardData: { getData: () => 'x\ny' } })
    expect(text()).toBe('Ax\nyB')
    expect(document.activeElement).toBe(input(2))
  })

  it('sets each line’s speed, and its tracking from the chevron', () => {
    const spy = vi.fn()
    render(<Harness initial={'A\nB'} spy={spy} />)
    fireEvent.change(screen.getByRole('slider', { name: 'line 2 speed' }), {
      target: { value: '12.5' },
    })
    expect(spy).toHaveBeenLastCalledWith([
      expect.objectContaining({ text: 'A', speed: 8 }),
      expect.objectContaining({ text: 'B', speed: 12.5 }),
    ])
    expect(screen.queryByRole('slider', { name: 'line 1 tracking' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'line 1 formatting' }))
    fireEvent.change(screen.getByRole('slider', { name: 'line 1 tracking' }), {
      target: { value: '-40' },
    })
    expect(spy).toHaveBeenLastCalledWith([
      expect.objectContaining({ text: 'A', tracking: -40 }),
      expect.objectContaining({ text: 'B', tracking: -3 }),
    ])
    expect(input(1).style.letterSpacing).toBe('-0.04em')
  })
})
