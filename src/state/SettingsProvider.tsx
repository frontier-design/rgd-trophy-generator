import { useMemo, useReducer, type ReactNode } from 'react'
import type { Settings } from '../types'
import { SettingsContext } from './context'
import { DEFAULT_SETTINGS, settingsReducer } from './settings'

interface SettingsProviderProps {
  children: ReactNode
  initialSettings?: Settings
}

export function SettingsProvider({
  children,
  initialSettings = DEFAULT_SETTINGS,
}: SettingsProviderProps) {
  const [settings, dispatch] = useReducer(settingsReducer, initialSettings)
  const value = useMemo(() => ({ settings, dispatch }), [settings])
  return <SettingsContext value={value}>{children}</SettingsContext>
}
