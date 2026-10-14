import { renderHook, waitFor } from '@testing-library/react'
import { useRagMeasure } from '../../src/hooks'
import { DEFAULT_SETTINGS } from '../../src/state'

describe('useRagMeasure', () => {
  it('measures lines once the font is ready', async () => {
    const { result } = renderHook(() => useRagMeasure(DEFAULT_SETTINGS))
    expect(result.current.fontReady).toBe(false)
    // First real measurement in a worker is slow (node-canvas loads system fonts).
    await waitFor(() => expect(result.current.fontReady).toBe(true), { timeout: 5000 })
    expect(result.current.lines.length).toBeGreaterThan(0)
  })
})
