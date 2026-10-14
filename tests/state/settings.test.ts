import { DEFAULT_SETTINGS, settingsReducer } from '../../src/state'

describe('settingsReducer', () => {
  it('merges a patch and resets to defaults', () => {
    const updated = settingsReducer(DEFAULT_SETTINGS, {
      type: 'update',
      patch: { columnWidth: 400 },
    })
    expect(updated.columnWidth).toBe(400)
    expect(updated.text).toBe(DEFAULT_SETTINGS.text)
    expect(settingsReducer(updated, { type: 'reset' })).toEqual(DEFAULT_SETTINGS)
  })

  it('setFontSize scales line height proportionally', () => {
    const state = { ...DEFAULT_SETTINGS, fontSize: 20, lineHeight: 30 }
    const next = settingsReducer(state, { type: 'setFontSize', fontSize: 40 })
    expect(next.fontSize).toBe(40)
    expect(next.lineHeight).toBe(60)
  })

  it('setFontSize ignores non-positive sizes', () => {
    expect(settingsReducer(DEFAULT_SETTINGS, { type: 'setFontSize', fontSize: 0 })).toBe(
      DEFAULT_SETTINGS,
    )
  })

  it('updateMaterial merges into the material and leaves the rest alone', () => {
    const next = settingsReducer(DEFAULT_SETTINGS, {
      type: 'updateMaterial',
      patch: { palette: 'cobalt', grain: 0 },
    })
    expect(next.material).toEqual({ ...DEFAULT_SETTINGS.material, palette: 'cobalt', grain: 0 })
    expect(next.fontSize).toBe(DEFAULT_SETTINGS.fontSize)
  })
})
