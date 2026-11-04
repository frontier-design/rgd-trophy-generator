import { useMemo, useReducer, type ReactNode } from 'react'
import type { Settings } from '../types'
import { SettingsContext } from './context'
import { loadGeneratorDocument } from './generatorDocument'
import { DEFAULT_SETTINGS, settingsReducer } from './settings'

interface SettingsProviderProps {
  children: ReactNode
  initialSettings?: Settings
}

/** The generator's settings. Its text starts as autosaved (the rest is restored by the
 *  timeline, which saves the params itself). */
export function SettingsProvider({ children, initialSettings }: SettingsProviderProps) {
  const [settings, dispatch] = useReducer(
    settingsReducer,
    initialSettings,
    (initial) => initial ?? { ...DEFAULT_SETTINGS, text: loadGeneratorDocument().text },
  )
  const value = useMemo(() => ({ settings, dispatch }), [settings])
  return <SettingsContext value={value}>{children}</SettingsContext>
}
