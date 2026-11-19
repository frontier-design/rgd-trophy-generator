import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { RagEditor } from '../../src/components/RagEditor'
import { DEFAULT_SETTINGS } from '../../src/state'

function Editor() {
  const [text, setText] = useState('First')
  return (
    <RagEditor
      settings={{ ...DEFAULT_SETTINGS, text }}
      lines={text ? [{ index: 0, text: 'First', width: 40 }] : []}
      boxes={[]}
      baselines={[]}
      extent={null}
      mirror={false}
      debug={false}
      onTextChange={setText}
    />
  )
}

describe('artboard text editing', () => {
  it('preserves multiline edits and reserves a row for a trailing newline', () => {
    const { container } = render(<Editor />)
    const editor = screen.getByRole('textbox', { name: 'Text' })
    fireEvent.change(editor, { target: { value: 'First\n' } })
    expect(editor).toHaveValue('First\n')
    expect(
      container.querySelector<HTMLElement>('.rag-editor')?.style.getPropertyValue('--rag-rows'),
    ).toBe('2')
    fireEvent.change(editor, { target: { value: '' } })
    expect(editor).toHaveValue('')
    expect(
      container.querySelector<HTMLElement>('.rag-editor')?.style.getPropertyValue('--rag-rows'),
    ).toBe('1')
  })
})
