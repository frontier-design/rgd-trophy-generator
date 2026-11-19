import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { MaterialFields } from '../../src/components/CanvasPage/MaterialFields'
import { PALETTE_NAMES } from '../../src/material'
import { DEFAULT_MATERIAL } from '../../src/state'
import type { MaterialSettings } from '../../src/types'

function Harness({ initial }: { initial: MaterialSettings }) {
  const [params, setParams] = useState(initial)
  return (
    <div>
      <MaterialFields params={params} set={(patch) => setParams((p) => ({ ...p, ...patch }))} />
      <output data-testid="palette">{params.palette}</output>
    </div>
  )
}

describe('material node fields', () => {
  it('picks the palette from one box per preset, with no color editing', () => {
    render(<Harness initial={DEFAULT_MATERIAL} />)
    const boxes = screen.getAllByRole('radio')
    expect(boxes.map((box) => box.getAttribute('aria-label'))).toEqual(PALETTE_NAMES)
    expect(screen.getByRole('radio', { name: 'studio' })).toHaveAttribute('aria-checked', 'true')

    fireEvent.click(screen.getByRole('radio', { name: 'gold' }))
    expect(screen.getByTestId('palette')).toHaveTextContent('gold')
    expect(screen.getByRole('radio', { name: 'gold' })).toHaveAttribute('aria-checked', 'true')

    expect(screen.queryByRole('combobox', { name: 'palette' })).toBeNull()
    expect(screen.queryByLabelText(/^color \d+$/)).toBeNull()
    expect(screen.queryByRole('button', { name: /add color/ })).toBeNull()
    expect(screen.queryByText(/generate/i)).toBeNull()
  })

  it('keeps a custom palette (from an older save) as one more box while it is in use', () => {
    render(
      <Harness
        initial={{ ...DEFAULT_MATERIAL, palette: 'custom', customColors: ['#000000', '#ffffff'] }}
      />,
    )
    expect(screen.getByRole('radio', { name: 'custom' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('radio', { name: 'slate' }))
    expect(screen.queryByRole('radio', { name: 'custom' })).toBeNull()
  })
})
