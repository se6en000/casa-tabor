import type { ThemeColorPalette } from './tokens.mjs'

export interface AppearancePreset {
  id: string
  label: string
  description: string
  colors: ThemeColorPalette
}

export const APPEARANCE_PRESETS: AppearancePreset[]
