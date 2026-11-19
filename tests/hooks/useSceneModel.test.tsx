import { renderHook, waitFor } from '@testing-library/react'
import { useSceneModel } from '../../src/hooks/useSceneModel'
import { lineBaseline } from '../../src/rag'
import { ARTBOARD, DEFAULT_SCENE_PARAMS, DEFAULT_SETTINGS } from '../../src/state'

describe('scene bottom alignment', () => {
  it.each(['Hello', 'Hello\n', 'Hello\n\n\n', 'Hello\n\n\n\n\n\n', '', '\n\n\n\n\n\n', 'Hello\nW'])(
    'keeps the trophy at the bottom clearance for %j',
    async (text) => {
      const settings = { ...DEFAULT_SETTINGS, text, lineHeight: 100 }
      const refs = { editorRef: { current: null }, artboardRef: { current: null } }
      const { result } = renderHook(() =>
        useSceneModel(settings, DEFAULT_SCENE_PARAMS, 'bottom', { headline: '', link: '' }, refs),
      )
      await waitFor(() => expect(result.current.fontReady).toBe(true), { timeout: 5000 })
      const { lines, extent, bottomInset, bottomClearance } = result.current
      expect(extent).not.toBeNull()
      const rows = Math.max(1, lines.length + (text.endsWith('\n') ? 1 : 0))
      // Flex-end places the editor's bottom at frame bottom minus its signed margin.
      const editorTop = ARTBOARD.height - bottomInset - rows * settings.lineHeight
      expect(editorTop + extent!.bottom).toBeCloseTo(ARTBOARD.height - bottomClearance)
      const lastVisible = [...lines].reverse().find((line) => line.text.trim().length > 0)
      if (lastVisible)
        expect(extent!.bottom).toBeCloseTo(
          lineBaseline(lastVisible.index, settings.lineHeight, result.current.metrics) +
            DEFAULT_SCENE_PARAMS.overshoot,
        )
      if (text === 'Hello\n\n\n\n\n\n') expect(bottomInset).toBeLessThan(0)
    },
  )
})
