import { PALETTES } from '../material'
import type { MaterialSettings, Settings } from '../types'

export const DEFAULT_MATERIAL: MaterialSettings = {
  // Lit through the studio gradient map: the RGD reference look.
  shading: 'lit',
  palette: 'studio',
  // Starts as a copy of the default preset; edited via the sidebar's color swatches.
  customColors: [...PALETTES.studio],
  seedColor: PALETTES.studio[3] ?? '#7c8fa0',
  // A gradient map wants smooth (linear) blends between its dense stops.
  banding: 0,
  gradientOffset: 0,
  gradientScale: 1,
  tilt: 0.35,
  wobble: 0.4,
  edgeDepth: 0.6,
  edgeHue: -25,
  ledgeShadow: 0.7,
  grain: 0.3,
  // About 1 px of the 4K export: fine, crisp grain.
  grainSize: 0.6,
  // Tuned against the RGD reference: a side-on key light from the right, a little above, so
  // the left falls into deep green and the right goes cream, with broad soft highlights.
  lightAngle: 55,
  lightHeight: 25,
  ambient: 0.06,
  softness: 0.3,
  highlight: 0.85,
  highlightSize: 0.8,
}

export const DEFAULT_SETTINGS: Settings = {
  text: 'RGD\nBRANDING\nAWARDS\n2027',
  fontFamily: 'PP Mori', // public/fonts/PPMori-Variable.woff2, declared in global.css
  fontWeight: 600, // semibold
  fontSize: 53,
  // The right edge (revolve axis).
  columnWidth: 375,
  // Tight, solid leading (1.0 × size), like the RGD reference.
  lineHeight: 53,
  material: DEFAULT_MATERIAL,
}

export type SettingsAction =
  | { type: 'update'; patch: Partial<Settings> }
  /** Change the type size, scaling line height by the same factor. */
  | { type: 'setFontSize'; fontSize: number }
  /** Merge a partial patch into the trophy material. */
  | { type: 'updateMaterial'; patch: Partial<MaterialSettings> }
  | { type: 'reset' }

export function settingsReducer(state: Settings, action: SettingsAction): Settings {
  switch (action.type) {
    case 'update':
      // TODO: validate/clamp values (e.g. fontSize > 0, columnWidth > 0) once controls exist.
      return { ...state, ...action.patch }
    case 'setFontSize':
      if (!(action.fontSize > 0)) return state
      return {
        ...state,
        fontSize: action.fontSize,
        lineHeight: state.lineHeight * (action.fontSize / state.fontSize),
      }
    case 'updateMaterial':
      return { ...state, material: { ...state.material, ...action.patch } }
    case 'reset':
      return DEFAULT_SETTINGS
  }
}
