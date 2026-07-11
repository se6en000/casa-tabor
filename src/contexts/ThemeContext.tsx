/**
 * ThemeContext — real-time CSS variable overrides for Casa Tabor.
 * Supports separate daytime + Midnight Gallery palettes, with optional
 * auto activation during night zones and manual override.
 */

import { createContext, useContext, useEffect, useMemo, useState, useCallback, type ReactNode } from 'react'
import type { RoomToneZone } from '../hooks/useRoomTone'
import {
  DEFAULT_THEME_COLORS,
  DEFAULT_FONT_SCALE,
  MAX_FONT_SCALE,
  MIDNIGHT_THEME_COLORS,
  MIN_FONT_SCALE,
  THEME_COLOR_KEYS,
  type ThemeColorPalette,
} from '../design-system/tokens.mjs'
import { APPEARANCE_PRESETS, type AppearancePreset } from '../design-system/themes.mjs'

export type ThemeColors = ThemeColorPalette

export type ThemeTarget = 'day' | 'midnight'

export const DEFAULTS: ThemeColors = DEFAULT_THEME_COLORS
export const MIDNIGHT_GALLERY_DEFAULTS: ThemeColors = MIDNIGHT_THEME_COLORS

export type ThemePreset = AppearancePreset
export const PRESETS = APPEARANCE_PRESETS

const STORAGE_DAY = 'casa-theme-day-colors'
const STORAGE_MIDNIGHT = 'casa-theme-midnight-colors'
const STORAGE_AUTO_MIDNIGHT = 'casa-theme-auto-midnight'
const STORAGE_FORCE_MIDNIGHT = 'casa-theme-force-midnight'
const STORAGE_FONT_SCALE = 'casa-design-font-scale'

function loadFontScale(): number {
  const raw = localStorage.getItem(STORAGE_FONT_SCALE)
  if (raw == null) return DEFAULT_FONT_SCALE
  const stored = Number(raw)
  return Number.isFinite(stored)
    ? Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, stored))
    : DEFAULT_FONT_SCALE
}

function loadColors(storageKey: string, fallback: ThemeColors): ThemeColors {
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw) return { ...fallback, ...JSON.parse(raw) }
  } catch {
    // ignore
  }
  return { ...fallback }
}

function loadBool(storageKey: string, fallback: boolean): boolean {
  const raw = localStorage.getItem(storageKey)
  if (raw == null) return fallback
  return raw === '1'
}

function styleVars(colors: ThemeColors): string {
  const variables = THEME_COLOR_KEYS.map(key => `  --color-${key}: ${colors[key]};`)
  variables.push(
    `  --color-casa-muted: ${colors['casa-text-tertiary']};`,
    `  --color-casa-divider: ${colors['casa-divider-strong']};`,
  )
  return `\n${variables.join('\n')}`
}

function buildStyleContent(dayColors: ThemeColors, midnightColors: ThemeColors, fontScale: number): string {
  return `:root {${styleVars(dayColors)}
  --ds-font-scale: ${fontScale};
}
html.midnight-gallery {${styleVars(midnightColors)}
}`
}

let styleTag: HTMLStyleElement | null = null

function applyToDOM(dayColors: ThemeColors, midnightColors: ThemeColors, fontScale: number) {
  if (!styleTag) {
    styleTag = document.createElement('style')
    styleTag.id = 'casa-theme-override'
    document.head.appendChild(styleTag)
  }
  styleTag.textContent = buildStyleContent(dayColors, midnightColors, fontScale)
}

function shouldEnableMidnight(forceMidnight: boolean, autoMidnight: boolean, roomToneZone: RoomToneZone): boolean {
  if (forceMidnight) return true
  if (!autoMidnight) return false
  return roomToneZone === 'night' || roomToneZone === 'late-night'
}

interface ThemeContextValue {
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

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [dayColors, setDayColors] = useState<ThemeColors>(() => loadColors(STORAGE_DAY, DEFAULTS))
  const [midnightColors, setMidnightColors] = useState<ThemeColors>(() => loadColors(STORAGE_MIDNIGHT, MIDNIGHT_GALLERY_DEFAULTS))
  const [activeTarget, setActiveTarget] = useState<ThemeTarget>('day')
  const [autoMidnight, setAutoMidnightState] = useState<boolean>(() => loadBool(STORAGE_AUTO_MIDNIGHT, false))
  const [forceMidnight, setForceMidnightState] = useState<boolean>(() => loadBool(STORAGE_FORCE_MIDNIGHT, false))
  const [fontScale, setFontScaleState] = useState(loadFontScale)
  const [roomToneZone, setRoomToneZone] = useState<RoomToneZone>('day')

  const isMidnightActive = shouldEnableMidnight(forceMidnight, autoMidnight, roomToneZone)
  const colors = activeTarget === 'midnight' ? midnightColors : dayColors
  const defaults = activeTarget === 'midnight' ? MIDNIGHT_GALLERY_DEFAULTS : DEFAULTS
  const isDefault = Object.entries(defaults).every(([k, v]) => colors[k as keyof ThemeColors] === v)

  const persistPalettes = useCallback((nextDay: ThemeColors, nextMidnight: ThemeColors) => {
    localStorage.setItem(STORAGE_DAY, JSON.stringify(nextDay))
    localStorage.setItem(STORAGE_MIDNIGHT, JSON.stringify(nextMidnight))
    applyToDOM(nextDay, nextMidnight, fontScale)
  }, [fontScale])

  const setFontScale = useCallback((scale: number) => {
    const nextScale = Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, scale))
    setFontScaleState(nextScale)
    localStorage.setItem(STORAGE_FONT_SCALE, String(nextScale))
    applyToDOM(dayColors, midnightColors, nextScale)
  }, [dayColors, midnightColors])

  const setAutoMidnight = useCallback((enabled: boolean) => {
    setAutoMidnightState(enabled)
    localStorage.setItem(STORAGE_AUTO_MIDNIGHT, enabled ? '1' : '0')
  }, [])

  const setForceMidnight = useCallback((enabled: boolean) => {
    setForceMidnightState(enabled)
    localStorage.setItem(STORAGE_FORCE_MIDNIGHT, enabled ? '1' : '0')
  }, [])

  const setColor = useCallback((key: keyof ThemeColors, value: string) => {
    if (activeTarget === 'midnight') {
      setMidnightColors(prev => {
        const nextMidnight = { ...prev, [key]: value }
        persistPalettes(dayColors, nextMidnight)
        return nextMidnight
      })
      return
    }

    setDayColors(prev => {
      const nextDay = { ...prev, [key]: value }
      persistPalettes(nextDay, midnightColors)
      return nextDay
    })
  }, [activeTarget, dayColors, midnightColors, persistPalettes])

  const applyDayPreset = useCallback((preset: ThemePreset) => {
    const nextDay = { ...preset.colors }
    setDayColors(nextDay)
    setActiveTarget('day')
    persistPalettes(nextDay, midnightColors)
  }, [midnightColors, persistPalettes])

  const resetToDefaults = useCallback(() => {
    if (activeTarget === 'midnight') {
      const nextMidnight = { ...MIDNIGHT_GALLERY_DEFAULTS }
      setMidnightColors(nextMidnight)
      persistPalettes(dayColors, nextMidnight)
      return
    }

    const nextDay = { ...DEFAULTS }
    setDayColors(nextDay)
    persistPalettes(nextDay, midnightColors)
  }, [activeTarget, dayColors, midnightColors, persistPalettes])

  useEffect(() => {
    applyToDOM(dayColors, midnightColors, fontScale)
  }, [dayColors, midnightColors, fontScale])

  useEffect(() => {
    document.documentElement.classList.toggle('midnight-gallery', isMidnightActive)
  }, [isMidnightActive])

  const value = useMemo<ThemeContextValue>(() => ({
    colors,
    dayColors,
    midnightColors,
    activeTarget,
    isMidnightActive,
    autoMidnight,
    forceMidnight,
    fontScale,
    setAutoMidnight,
    setForceMidnight,
    setFontScale,
    setActiveTarget,
    setColor,
    applyDayPreset,
    resetToDefaults,
    setRoomToneZone,
    isDefault,
  }), [
    colors,
    dayColors,
    midnightColors,
    activeTarget,
    isMidnightActive,
    autoMidnight,
    forceMidnight,
    fontScale,
    setAutoMidnight,
    setForceMidnight,
    setFontScale,
    setColor,
    applyDayPreset,
    resetToDefaults,
    isDefault,
  ])

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}
