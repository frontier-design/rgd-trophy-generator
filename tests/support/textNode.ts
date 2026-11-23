import { fireEvent, within } from '@testing-library/react'

/** Replaces a text node's whole text through its line inputs, as typing would. */
export function setNodeText(node: HTMLElement, text: string): void {
  const boxes = () => within(node).getAllByRole<HTMLInputElement>('textbox')
  // Empty the lines after the first and Backspace them away.
  for (let all = boxes(); all.length > 1; all = boxes()) {
    const last = all.at(-1)!
    fireEvent.change(last, { target: { value: '' } })
    last.setSelectionRange(0, 0)
    fireEvent.keyDown(last, { key: 'Backspace' })
  }
  const first = boxes()[0]!
  const [head = '', ...rest] = text.split('\n')
  fireEvent.change(first, { target: { value: head } })
  if (rest.length) {
    first.setSelectionRange(head.length, head.length)
    fireEvent.paste(first, { clipboardData: { getData: () => `\n${rest.join('\n')}` } })
  }
}
