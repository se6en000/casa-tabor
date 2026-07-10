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

export type ThemeColors = ThemeColorPalette

export type ThemeTarget = 'day' | 'midnight'

export const DEFAULTS: ThemeColors = DEFAULT_THEME_COLORS
export const MIDNIGHT_GALLERY_DEFAULTS: ThemeColors = MIDNIGHT_THEME_COLORS

export interface ThemePreset {
  id: string
  label: string
  emoji: string
  colors: ThemeColors
}

export const PRESETS: ThemePreset[] = [
  { id: 'default', label: 'Default', emoji: '🏡', colors: { ...DEFAULTS } },
  {
    id: 'espresso',
    label: 'Espresso',
    emoji: '☕',
    colors: {
      ...DEFAULTS,
      'casa-gold': '#B8955A',
      'casa-navy': '#3A2812',
      'casa-bg': '#EDE5D8',
      'casa-bg-2': '#E4D9CA',
      'casa-surface': '#F7F2EA',
      'casa-text': '#2C1A0E',
      'casa-border': '#D4C8B8',
      'casa-error': '#B24A3A',
      'casa-success': '#3F9A63',
      'casa-warning': '#C07A3A',
      'casa-surface-subtle': '#F1E9DD',
      'casa-control-border': '#CCBDAA',
      'casa-divider-strong': '#D4C5B2',
      'casa-text-secondary': '#5A4635',
      'casa-text-tertiary': '#7C6856',
      'casa-text-faint': '#9A8878',
      'casa-accent-soft': '#E8D1B6',
      'casa-accent-soft-border': '#D5B18A',
      'casa-accent-soft-hover': '#DDBD9C',
      'casa-accent-subtle': '#F1E1CE',
      'casa-accent-subtle-border': '#DBC1A4',
      'casa-info': '#3F8A8C',
      'casa-info-strong': '#245C5F',
      'casa-info-soft': '#DBECEC',
      'casa-success-strong': '#2F6A3F',
      'casa-success-soft': '#DCEBD9',
      'casa-toggle-track': '#E2D7C8',
      'casa-top-pick-band': '#7A4D1F',
    },
  },
  {
    id: 'christmas',
    label: 'Christmas',
    emoji: '🎄',
    colors: {
      ...DEFAULTS,
      'casa-gold': '#C25547',
      'casa-navy': '#224F39',
      'casa-bg': '#F7F4EF',
      'casa-bg-2': '#EEE8DE',
      'casa-surface': '#FFFFFC',
      'casa-text': '#2B2E28',
      'casa-border': '#D8DECF',
      'casa-error': '#AE3D3A',
      'casa-success': '#2F8A58',
      'casa-warning': '#B87D43',
      'casa-surface-subtle': '#F2F5EE',
      'casa-control-border': '#CED6C6',
      'casa-divider-strong': '#D6DDCF',
      'casa-text-secondary': '#556155',
      'casa-text-tertiary': '#718073',
      'casa-text-faint': '#93A094',
      'casa-accent-soft': '#E7D9C7',
      'casa-accent-soft-border': '#D4B99A',
      'casa-accent-soft-hover': '#DDCCB6',
      'casa-accent-subtle': '#F2E8DB',
      'casa-accent-subtle-border': '#DECAB2',
      'casa-info': '#2E7A80',
      'casa-info-strong': '#1F5256',
      'casa-info-soft': '#DDEDEE',
      'casa-success-strong': '#2E6A45',
      'casa-success-soft': '#DBEBDD',
      'casa-toggle-track': '#E5E8DF',
      'casa-top-pick-band': '#7A5030',
    },
  },
  {
    id: 'autumn',
    label: 'Autumn',
    emoji: '🍂',
    colors: {
      ...DEFAULTS,
      'casa-gold': '#C0622B',
      'casa-navy': '#3D2B1F',
      'casa-bg': '#FBF5EE',
      'casa-bg-2': '#F3E9DC',
      'casa-surface': '#FFFAF4',
      'casa-text': '#33261D',
      'casa-border': '#E8D8C8',
      'casa-error': '#B04A34',
      'casa-success': '#3D925A',
      'casa-warning': '#C37A34',
      'casa-surface-subtle': '#F8EEDF',
      'casa-control-border': '#E2CFBA',
      'casa-divider-strong': '#E3D0BA',
      'casa-text-secondary': '#645245',
      'casa-text-tertiary': '#8A7463',
      'casa-text-faint': '#A28D7D',
      'casa-accent-soft': '#F0D7BC',
      'casa-accent-soft-border': '#DEBA95',
      'casa-accent-soft-hover': '#E8CAA9',
      'casa-accent-subtle': '#F6E5D2',
      'casa-accent-subtle-border': '#E6CBAE',
      'casa-info': '#3A7C88',
      'casa-info-strong': '#245360',
      'casa-info-soft': '#E3EFF1',
      'casa-success-strong': '#3B6A41',
      'casa-success-soft': '#DFEBDD',
      'casa-toggle-track': '#EEE0CF',
      'casa-top-pick-band': '#8A4E20',
    },
  },
  {
    id: 'summer',
    label: 'Summer',
    emoji: '☀️',
    colors: {
      ...DEFAULTS,
      'casa-gold': '#E07B54',
      'casa-navy': '#1E4B6E',
      'casa-bg': '#F5FBFD',
      'casa-bg-2': '#EAF5F8',
      'casa-surface': '#FFFFFF',
      'casa-text': '#1C2B36',
      'casa-border': '#C8E4EE',
      'casa-error': '#B44C3E',
      'casa-success': '#2F9670',
      'casa-warning': '#D88A4C',
      'casa-surface-subtle': '#F0F8FB',
      'casa-control-border': '#BEDBE5',
      'casa-divider-strong': '#C6DEE7',
      'casa-text-secondary': '#4A6375',
      'casa-text-tertiary': '#6D869A',
      'casa-text-faint': '#8EA3B5',
      'casa-accent-soft': '#F5DCCA',
      'casa-accent-soft-border': '#E6BFA3',
      'casa-accent-soft-hover': '#EECDB5',
      'casa-accent-subtle': '#FBECE0',
      'casa-accent-subtle-border': '#EFD2BD',
      'casa-info': '#0F8C95',
      'casa-info-strong': '#0E5E66',
      'casa-info-soft': '#DCF2F3',
      'casa-success-strong': '#2D6C54',
      'casa-success-soft': '#DAF0E8',
      'casa-toggle-track': '#E2EEF3',
      'casa-top-pick-band': '#81583B',
    },
  },
  {
    id: 'minimal',
    label: 'Minimal',
    emoji: '◻️',
    colors: {
      ...DEFAULTS,
      'casa-gold': '#6F7F88',
      'casa-navy': '#2F3B46',
      'casa-bg': '#F7F8F9',
      'casa-bg-2': '#EFF2F4',
      'casa-surface': '#FFFFFF',
      'casa-text': '#2B333B',
      'casa-border': '#DDE1E5',
      'casa-error': '#B0554F',
      'casa-success': '#4A8563',
      'casa-warning': '#B9834D',
      'casa-surface-subtle': '#F3F5F6',
      'casa-control-border': '#D5DBE0',
      'casa-divider-strong': '#D9DEE3',
      'casa-text-secondary': '#56616B',
      'casa-text-tertiary': '#7A8793',
      'casa-text-faint': '#97A2AC',
      'casa-accent-soft': '#E8ECEF',
      'casa-accent-soft-border': '#CDD5DC',
      'casa-accent-soft-hover': '#DDE3E8',
      'casa-accent-subtle': '#F1F4F6',
      'casa-accent-subtle-border': '#DAE1E6',
      'casa-info': '#3C7B84',
      'casa-info-strong': '#27565E',
      'casa-info-soft': '#E4EFF1',
      'casa-success-strong': '#3E6650',
      'casa-success-soft': '#E1EDE6',
      'casa-toggle-track': '#E7EBEE',
      'casa-top-pick-band': '#5F6F7A',
    },
  },
  {
    id: 'harbor-teal',
    label: 'Harbor Teal',
    emoji: '🌿',
    colors: {
      ...DEFAULTS,
      'casa-gold': '#B79B72',
      'casa-navy': '#1F5E58',
      'casa-bg': '#F3F4EF',
      'casa-bg-2': '#E8ECE4',
      'casa-surface': '#FCFDFC',
      'casa-text': '#1F2E2C',
      'casa-border': '#CED8D1',
      'casa-error': '#A6534B',
      'casa-success': '#3D8A63',
      'casa-warning': '#B5854B',
      'casa-surface-subtle': '#EDF3EE',
      'casa-control-border': '#C2CEC6',
      'casa-divider-strong': '#CAD5CD',
      'casa-text-secondary': '#4C625F',
      'casa-text-tertiary': '#6A807D',
      'casa-text-faint': '#8A9E9B',
      'casa-accent-soft': '#DCE7DC',
      'casa-accent-soft-border': '#BFD0BF',
      'casa-accent-soft-hover': '#CFE0CF',
      'casa-accent-subtle': '#EAF2EA',
      'casa-accent-subtle-border': '#CEDCCE',
      'casa-info': '#2E8A88',
      'casa-info-strong': '#1F6362',
      'casa-info-soft': '#DBEFEE',
      'casa-success-strong': '#2D6B4D',
      'casa-success-soft': '#DBECDD',
      'casa-toggle-track': '#DFE7DF',
      'casa-top-pick-band': '#5E6A4D',
    },
  },
  {
    id: 'midnight-gallery',
    label: 'Midnight Gallery',
    emoji: '🌌',
    colors: { ...MIDNIGHT_GALLERY_DEFAULTS },
  },
]

const STORAGE_DAY = 'casa-theme-day-colors'
const STORAGE_MIDNIGHT = 'casa-theme-midnight-colors'
const STORAGE_AUTO_MIDNIGHT = 'casa-theme-auto-midnight'
const STORAGE_FORCE_MIDNIGHT = 'casa-theme-force-midnight'
const STORAGE_FONT_SCALE = 'casa-design-font-scale'

function loadFontScale(): number {
  const stored = Number(localStorage.getItem(STORAGE_FONT_SCALE))
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
  applyPreset: (preset: ThemePreset) => void
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

  const applyPreset = useCallback((preset: ThemePreset) => {
    if (activeTarget === 'midnight') {
      const nextMidnight = { ...preset.colors }
      setMidnightColors(nextMidnight)
      persistPalettes(dayColors, nextMidnight)
      return
    }

    const nextDay = { ...preset.colors }
    setDayColors(nextDay)
    persistPalettes(nextDay, midnightColors)
  }, [activeTarget, dayColors, midnightColors, persistPalettes])

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
    applyPreset,
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
    applyPreset,
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
