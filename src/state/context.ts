import { createContext, type Dispatch } from 'react'
import type { Settings } from '../types'
import type { SettingsAction } from './settings'

export interface SettingsContextValue {
  settings: Settings
  dispatch: Dispatch<SettingsAction>
}

export const SettingsContext = createContext<SettingsContextValue | null>(null)
