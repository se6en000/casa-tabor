import { createContext, useContext } from 'react'
import type { RoomToneZone } from '../hooks/useRoomTone'
import type { ThemeColorPalette } from '../design-system/tokens.mjs'
import type { AppearancePreset } from '../design-system/themes.mjs'

export type ThemeColors = ThemeColorPalette
export type ThemeTarget = 'day' | 'midnight'
export type ThemePreset = AppearancePreset

export interface ThemeContextValue {
  colors: ThemeColors
  dayColors: ThemeColors
  midnightColors: ThemeColors
  activeTarget: ThemeTarget
  isMidnightActive: boolean
  autoMidnight: boolean
  forceMidnight: boolean
  fontScale: number
  setAutoMidnight: (enabled: boolean) => void
  setForceMidnight: (enabled: boolean) => void
  setFontScale: (scale: number) => void
  setActiveTarget: (target: ThemeTarget) => void
  setColor: (key: keyof ThemeColors, value: string) => void
  applyDayPreset: (preset: ThemePreset) => void
  resetToDefaults: () => void
  setRoomToneZone: (zone: RoomToneZone) => void
  isDefault: boolean
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}
