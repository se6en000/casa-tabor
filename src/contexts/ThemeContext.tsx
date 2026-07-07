/**
 * ThemeContext — real-time CSS variable overrides for Casa Tabor.
 * Supports separate daytime + Midnight Gallery palettes, with optional
 * auto activation during night zones and manual override.
 */

import { createContext, useContext, useEffect, useMemo, useState, useCallback, type ReactNode } from 'react'
import type { RoomToneZone } from '../hooks/useRoomTone'

export interface ThemeColors {
  'casa-gold':    string
  'casa-navy':    string
  'casa-bg':      string
  'casa-bg-2':    string
  'casa-surface': string
  'casa-text':    string
  'casa-border':  string
  'casa-surface-subtle': string
  'casa-control-border': string
  'casa-divider-strong': string
  'casa-text-secondary': string
  'casa-text-tertiary': string
  'casa-text-faint': string
  'casa-accent-soft': string
  'casa-accent-soft-border': string
  'casa-accent-soft-hover': string
  'casa-accent-subtle': string
  'casa-accent-subtle-border': string
  'casa-info': string
  'casa-info-strong': string
  'casa-info-soft': string
  'casa-success-strong': string
  'casa-success-soft': string
  'casa-toggle-track': string
  'casa-top-pick-band': string
}

export type ThemeTarget = 'day' | 'midnight'

export const DEFAULTS: ThemeColors = {
  'casa-gold':    '#C9A96E',
  'casa-navy':    '#1B2A4A',
  'casa-bg':      '#FAF8F5',
  'casa-bg-2':    '#F2EEE7',
  'casa-surface': '#FFFFFF',
  'casa-text':    '#2D2D2D',
  'casa-border':  '#E8E2D9',
  'casa-surface-subtle': '#FAF6EE',
  'casa-control-border': '#E3DACB',
  'casa-divider-strong': '#E4DBCB',
  'casa-text-secondary': '#5C5D66',
  'casa-text-tertiary': '#8D8E99',
  'casa-text-faint': '#A9A398',
  'casa-accent-soft': '#F4E2CD',
  'casa-accent-soft-border': '#E9CBA6',
  'casa-accent-soft-hover': '#EFD6BB',
  'casa-accent-subtle': '#FAF0E2',
  'casa-accent-subtle-border': '#EBD9BF',
  'casa-info': '#10A5AC',
  'casa-info-strong': '#0A6266',
  'casa-info-soft': '#E7F4F4',
  'casa-success-strong': '#2A6A34',
  'casa-success-soft': '#DBF0DC',
  'casa-toggle-track': '#EDE7DA',
  'casa-top-pick-band': '#8A5A1E',
}

export const MIDNIGHT_GALLERY_DEFAULTS: ThemeColors = {
  'casa-gold':    '#9F8658',
  'casa-navy':    '#0E1218',
  'casa-bg':      '#090C11',
  'casa-bg-2':    '#070A0F',
  'casa-surface': '#121923',
  'casa-text':    '#E3DDD1',
  'casa-border':  '#263244',
  'casa-surface-subtle': '#171F2C',
  'casa-control-border': '#324157',
  'casa-divider-strong': '#2B374C',
  'casa-text-secondary': '#BCC7D8',
  'casa-text-tertiary': '#93A4BC',
  'casa-text-faint': '#7D8EA7',
  'casa-accent-soft': '#5A4A33',
  'casa-accent-soft-border': '#7A6242',
  'casa-accent-soft-hover': '#6A563C',
  'casa-accent-subtle': '#342C23',
  'casa-accent-subtle-border': '#4A3C2E',
  'casa-info': '#57C9C9',
  'casa-info-strong': '#8EE3E3',
  'casa-info-soft': '#1B3A40',
  'casa-success-strong': '#7BD58B',
  'casa-success-soft': '#1E3D28',
  'casa-toggle-track': '#303B4E',
  'casa-top-pick-band': '#F0C98F',
}

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
      'casa-surface': '#F7F2EA',
      'casa-text': '#2C1A0E',
      'casa-border': '#D4C8B8',
    },
  },
  {
    id: 'christmas',
    label: 'Christmas',
    emoji: '🎄',
    colors: {
      ...DEFAULTS,
      'casa-gold': '#C0392B',
      'casa-navy': '#1A5C2E',
      'casa-bg': '#FDF6F0',
      'casa-surface': '#FFFFFF',
      'casa-text': '#2D2D2D',
      'casa-border': '#D5E8D4',
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
      'casa-surface': '#FFFFFF',
      'casa-text': '#2D2D2D',
      'casa-border': '#E8D8C8',
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
      'casa-surface': '#FFFFFF',
      'casa-text': '#1C2B36',
      'casa-border': '#C8E4EE',
    },
  },
  {
    id: 'minimal',
    label: 'Minimal',
    emoji: '◻️',
    colors: {
      ...DEFAULTS,
      'casa-gold': '#5B6F7A',
      'casa-navy': '#2C3E50',
      'casa-bg': '#F7F8F9',
      'casa-surface': '#FFFFFF',
      'casa-text': '#2C3E50',
      'casa-border': '#DDE1E5',
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
  return `
  --color-casa-gold: ${colors['casa-gold']};
  --color-casa-navy: ${colors['casa-navy']};
  --color-casa-bg: ${colors['casa-bg']};
  --color-casa-bg-2: ${colors['casa-bg-2']};
  --color-casa-surface: ${colors['casa-surface']};
  --color-casa-text: ${colors['casa-text']};
  --color-casa-border: ${colors['casa-border']};
  --color-casa-surface-subtle: ${colors['casa-surface-subtle']};
  --color-casa-control-border: ${colors['casa-control-border']};
  --color-casa-divider-strong: ${colors['casa-divider-strong']};
  --color-casa-text-secondary: ${colors['casa-text-secondary']};
  --color-casa-text-tertiary: ${colors['casa-text-tertiary']};
  --color-casa-text-faint: ${colors['casa-text-faint']};
  --color-casa-accent-soft: ${colors['casa-accent-soft']};
  --color-casa-accent-soft-border: ${colors['casa-accent-soft-border']};
  --color-casa-accent-soft-hover: ${colors['casa-accent-soft-hover']};
  --color-casa-accent-subtle: ${colors['casa-accent-subtle']};
  --color-casa-accent-subtle-border: ${colors['casa-accent-subtle-border']};
  --color-casa-info: ${colors['casa-info']};
  --color-casa-info-strong: ${colors['casa-info-strong']};
  --color-casa-info-soft: ${colors['casa-info-soft']};
  --color-casa-success-strong: ${colors['casa-success-strong']};
  --color-casa-success-soft: ${colors['casa-success-soft']};
  --color-casa-toggle-track: ${colors['casa-toggle-track']};
  --color-casa-top-pick-band: ${colors['casa-top-pick-band']};
  --color-casa-muted: ${colors['casa-text-tertiary']};
  --color-casa-divider: ${colors['casa-divider-strong']};`
}

function buildStyleContent(dayColors: ThemeColors, midnightColors: ThemeColors): string {
  return `:root {${styleVars(dayColors)}
}
html.midnight-gallery {${styleVars(midnightColors)}
  --shadow-card: 0 1px 3px rgba(0,0,0,0.45), 0 1px 2px rgba(0,0,0,0.35);
  --shadow-card-hover: 0 6px 18px rgba(0,0,0,0.55);
  --shadow-modal: 0 12px 36px rgba(0,0,0,0.65);
  --shadow-fab: 0 6px 18px rgba(159,134,88,0.40);
}`
}

let styleTag: HTMLStyleElement | null = null

function applyToDOM(dayColors: ThemeColors, midnightColors: ThemeColors) {
  if (!styleTag) {
    styleTag = document.createElement('style')
    styleTag.id = 'casa-theme-override'
    document.head.appendChild(styleTag)
  }
  styleTag.textContent = buildStyleContent(dayColors, midnightColors)
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
  setAutoMidnight: (enabled: boolean) => void
  setForceMidnight: (enabled: boolean) => void
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
  const [autoMidnight, setAutoMidnightState] = useState<boolean>(() => loadBool(STORAGE_AUTO_MIDNIGHT, true))
  const [forceMidnight, setForceMidnightState] = useState<boolean>(() => loadBool(STORAGE_FORCE_MIDNIGHT, false))
  const [roomToneZone, setRoomToneZone] = useState<RoomToneZone>('day')

  const isMidnightActive = shouldEnableMidnight(forceMidnight, autoMidnight, roomToneZone)
  const colors = activeTarget === 'midnight' ? midnightColors : dayColors
  const defaults = activeTarget === 'midnight' ? MIDNIGHT_GALLERY_DEFAULTS : DEFAULTS
  const isDefault = Object.entries(defaults).every(([k, v]) => colors[k as keyof ThemeColors] === v)

  const persistPalettes = useCallback((nextDay: ThemeColors, nextMidnight: ThemeColors) => {
    localStorage.setItem(STORAGE_DAY, JSON.stringify(nextDay))
    localStorage.setItem(STORAGE_MIDNIGHT, JSON.stringify(nextMidnight))
    applyToDOM(nextDay, nextMidnight)
  }, [])

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
    applyToDOM(dayColors, midnightColors)
  }, [dayColors, midnightColors])

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
    setAutoMidnight,
    setForceMidnight,
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
    setAutoMidnight,
    setForceMidnight,
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
