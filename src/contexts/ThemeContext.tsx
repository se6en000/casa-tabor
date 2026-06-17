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
  'casa-surface': string
  'casa-rail':    string
  'casa-main':    string
  'casa-card':    string
  'casa-text':    string
  'casa-border':  string
}

export interface ThemeTypography {
  displayFont: string
  bodyFont: string
  headingScale: number
  bodyScale: number
}

export type ThemeTarget = 'day' | 'midnight'

export const DEFAULTS: ThemeColors = {
  'casa-gold':    '#C9A96E',
  'casa-navy':    '#1B2A4A',
  'casa-bg':      '#FAF8F5',
  'casa-surface': '#FFFFFF',
  'casa-rail':    '#F7F3EC',
  'casa-main':    '#F3F0E8',
  'casa-card':    '#FFFFFF',
  'casa-text':    '#2D2D2D',
  'casa-border':  '#E8E2D9',
}

export const MIDNIGHT_GALLERY_DEFAULTS: ThemeColors = {
  'casa-gold':    '#9F8658',
  'casa-navy':    '#0E1218',
  'casa-bg':      '#090C11',
  'casa-surface': '#121923',
  'casa-rail':    '#0F1620',
  'casa-main':    '#090C11',
  'casa-card':    '#121923',
  'casa-text':    '#E3DDD1',
  'casa-border':  '#263244',
}

export const DISPLAY_FONT_OPTIONS = [
  { id: 'cormorant', label: 'Cormorant Garamond', css: "'Cormorant Garamond', Georgia, serif" },
  { id: 'playfair', label: 'Playfair Display', css: "'Playfair Display', Georgia, serif" },
  { id: 'dm-serif', label: 'DM Serif Display', css: "'DM Serif Display', Georgia, serif" },
] as const

export const BODY_FONT_OPTIONS = [
  { id: 'dm-sans', label: 'DM Sans', css: "'DM Sans', system-ui, sans-serif" },
  { id: 'inter', label: 'Inter', css: "'Inter', system-ui, sans-serif" },
  { id: 'lato', label: 'Lato', css: "'Lato', system-ui, sans-serif" },
] as const

export const DEFAULT_TYPOGRAPHY: ThemeTypography = {
  displayFont: DISPLAY_FONT_OPTIONS[0].css,
  bodyFont: BODY_FONT_OPTIONS[0].css,
  headingScale: 100,
  bodyScale: 100,
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
    id: 'comfort',
    label: 'Comfort',
    emoji: '🤎',
    colors: {
      'casa-gold': '#D2B166',
      'casa-navy': '#132B60',
      'casa-bg': '#F3F0E8',
      'casa-surface': '#FCFAF5',
      'casa-rail': '#F6F2E9',
      'casa-main': '#F3F0E8',
      'casa-card': '#FCFAF5',
      'casa-text': '#322A24',
      'casa-border': '#D9D2C5',
    },
  },
  {
    id: 'espresso',
    label: 'Espresso',
    emoji: '☕',
    colors: {
      'casa-gold': '#B8955A',
      'casa-navy': '#3A2812',
      'casa-bg': '#EDE5D8',
      'casa-surface': '#F7F2EA',
      'casa-rail': '#EFE6D8',
      'casa-main': '#EDE5D8',
      'casa-card': '#F7F2EA',
      'casa-text': '#2C1A0E',
      'casa-border': '#D4C8B8',
    },
  },
  {
    id: 'christmas',
    label: 'Christmas',
    emoji: '🎄',
    colors: {
      'casa-gold': '#C0392B',
      'casa-navy': '#1A5C2E',
      'casa-bg': '#FDF6F0',
      'casa-surface': '#FFFFFF',
      'casa-rail': '#F6EFE9',
      'casa-main': '#FDF6F0',
      'casa-card': '#FFFFFF',
      'casa-text': '#2D2D2D',
      'casa-border': '#D5E8D4',
    },
  },
  {
    id: 'autumn',
    label: 'Autumn',
    emoji: '🍂',
    colors: {
      'casa-gold': '#C0622B',
      'casa-navy': '#3D2B1F',
      'casa-bg': '#FBF5EE',
      'casa-surface': '#FFFFFF',
      'casa-rail': '#F3EBDD',
      'casa-main': '#FBF5EE',
      'casa-card': '#FFFFFF',
      'casa-text': '#2D2D2D',
      'casa-border': '#E8D8C8',
    },
  },
  {
    id: 'summer',
    label: 'Summer',
    emoji: '☀️',
    colors: {
      'casa-gold': '#E07B54',
      'casa-navy': '#1E4B6E',
      'casa-bg': '#F5FBFD',
      'casa-surface': '#FFFFFF',
      'casa-rail': '#ECF4F7',
      'casa-main': '#F5FBFD',
      'casa-card': '#FFFFFF',
      'casa-text': '#1C2B36',
      'casa-border': '#C8E4EE',
    },
  },
  {
    id: 'minimal',
    label: 'Minimal',
    emoji: '◻️',
    colors: {
      'casa-gold': '#5B6F7A',
      'casa-navy': '#2C3E50',
      'casa-bg': '#F7F8F9',
      'casa-surface': '#FFFFFF',
      'casa-rail': '#F1F3F5',
      'casa-main': '#F7F8F9',
      'casa-card': '#FFFFFF',
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
const STORAGE_TYPOGRAPHY = 'casa-theme-typography'

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

function loadTypography(): ThemeTypography {
  try {
    const raw = localStorage.getItem(STORAGE_TYPOGRAPHY)
    if (!raw) return { ...DEFAULT_TYPOGRAPHY }
    const parsed = JSON.parse(raw) as Partial<ThemeTypography>
    return {
      displayFont: parsed.displayFont ?? DEFAULT_TYPOGRAPHY.displayFont,
      bodyFont: parsed.bodyFont ?? DEFAULT_TYPOGRAPHY.bodyFont,
      headingScale: Math.min(120, Math.max(85, Number(parsed.headingScale ?? DEFAULT_TYPOGRAPHY.headingScale))),
      bodyScale: Math.min(120, Math.max(85, Number(parsed.bodyScale ?? DEFAULT_TYPOGRAPHY.bodyScale))),
    }
  } catch {
    return { ...DEFAULT_TYPOGRAPHY }
  }
}

function styleVars(colors: ThemeColors): string {
  return `
  --color-casa-gold: ${colors['casa-gold']};
  --color-casa-navy: ${colors['casa-navy']};
  --color-casa-bg: ${colors['casa-bg']};
  --color-casa-surface: ${colors['casa-surface']};
  --color-casa-rail: ${colors['casa-rail']};
  --color-casa-main: ${colors['casa-main']};
  --color-casa-card: ${colors['casa-card']};
  --color-casa-text: ${colors['casa-text']};
  --color-casa-border: ${colors['casa-border']};`
}

function toScaledRem(baseRem: number, scalePct: number): string {
  return `${(baseRem * (scalePct / 100)).toFixed(4)}rem`
}

function typographyVars(typography: ThemeTypography): string {
  return `
  --font-display: ${typography.displayFont};
  --font-body: ${typography.bodyFont};
  --text-display-xl: ${toScaledRem(3, typography.headingScale)};
  --text-display-lg: ${toScaledRem(2.25, typography.headingScale)};
  --text-display-md: ${toScaledRem(1.75, typography.headingScale)};
  --text-display-sm: ${toScaledRem(1.375, typography.headingScale)};
  --text-heading: ${toScaledRem(1.25, typography.headingScale)};
  --text-body-lg: ${toScaledRem(1.0625, typography.bodyScale)};
  --text-body: ${toScaledRem(0.9375, typography.bodyScale)};
  --text-body-sm: ${toScaledRem(0.8125, typography.bodyScale)};
  --text-caption: ${toScaledRem(0.75, typography.bodyScale)};`
}

function buildStyleContent(dayColors: ThemeColors, midnightColors: ThemeColors, typography: ThemeTypography): string {
  return `:root {${styleVars(dayColors)}
${typographyVars(typography)}
}
html.midnight-gallery {${styleVars(midnightColors)}
  --color-casa-muted: #B2BED0;
  --color-casa-divider: #1B2635;
  --shadow-card: 0 1px 3px rgba(0,0,0,0.45), 0 1px 2px rgba(0,0,0,0.35);
  --shadow-card-hover: 0 6px 18px rgba(0,0,0,0.55);
  --shadow-modal: 0 12px 36px rgba(0,0,0,0.65);
  --shadow-fab: 0 6px 18px rgba(159,134,88,0.40);
}`
}

let styleTag: HTMLStyleElement | null = null

function applyToDOM(dayColors: ThemeColors, midnightColors: ThemeColors, typography: ThemeTypography) {
  if (!styleTag) {
    styleTag = document.createElement('style')
    styleTag.id = 'casa-theme-override'
    document.head.appendChild(styleTag)
  }
  styleTag.textContent = buildStyleContent(dayColors, midnightColors, typography)
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
  typography: ThemeTypography
  setDisplayFont: (value: string) => void
  setBodyFont: (value: string) => void
  setHeadingScale: (value: number) => void
  setBodyScale: (value: number) => void
  resetTypography: () => void
  isTypographyDefault: boolean
  setRoomToneZone: (zone: RoomToneZone) => void
  isDefault: boolean
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [dayColors, setDayColors] = useState<ThemeColors>(() => loadColors(STORAGE_DAY, DEFAULTS))
  const [midnightColors, setMidnightColors] = useState<ThemeColors>(() => loadColors(STORAGE_MIDNIGHT, MIDNIGHT_GALLERY_DEFAULTS))
  const [typography, setTypography] = useState<ThemeTypography>(() => loadTypography())
  const [activeTarget, setActiveTarget] = useState<ThemeTarget>('day')
  const [autoMidnight, setAutoMidnightState] = useState<boolean>(() => loadBool(STORAGE_AUTO_MIDNIGHT, true))
  const [forceMidnight, setForceMidnightState] = useState<boolean>(() => loadBool(STORAGE_FORCE_MIDNIGHT, false))
  const [roomToneZone, setRoomToneZone] = useState<RoomToneZone>('day')

  const isMidnightActive = shouldEnableMidnight(forceMidnight, autoMidnight, roomToneZone)
  const colors = activeTarget === 'midnight' ? midnightColors : dayColors
  const defaults = activeTarget === 'midnight' ? MIDNIGHT_GALLERY_DEFAULTS : DEFAULTS
  const isDefault = Object.entries(defaults).every(([k, v]) => colors[k as keyof ThemeColors] === v)
  const isTypographyDefault = typography.displayFont === DEFAULT_TYPOGRAPHY.displayFont
    && typography.bodyFont === DEFAULT_TYPOGRAPHY.bodyFont
    && typography.headingScale === DEFAULT_TYPOGRAPHY.headingScale
    && typography.bodyScale === DEFAULT_TYPOGRAPHY.bodyScale

  const persistTheme = useCallback((nextDay: ThemeColors, nextMidnight: ThemeColors, nextTypography: ThemeTypography) => {
    localStorage.setItem(STORAGE_DAY, JSON.stringify(nextDay))
    localStorage.setItem(STORAGE_MIDNIGHT, JSON.stringify(nextMidnight))
    localStorage.setItem(STORAGE_TYPOGRAPHY, JSON.stringify(nextTypography))
    applyToDOM(nextDay, nextMidnight, nextTypography)
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
        persistTheme(dayColors, nextMidnight, typography)
        return nextMidnight
      })
      return
    }

    setDayColors(prev => {
      const nextDay = { ...prev, [key]: value }
      persistTheme(nextDay, midnightColors, typography)
      return nextDay
    })
  }, [activeTarget, dayColors, midnightColors, persistTheme, typography])

  const applyPreset = useCallback((preset: ThemePreset) => {
    if (activeTarget === 'midnight') {
      const nextMidnight = { ...preset.colors }
      setMidnightColors(nextMidnight)
      persistTheme(dayColors, nextMidnight, typography)
      return
    }

    const nextDay = { ...preset.colors }
    setDayColors(nextDay)
    persistTheme(nextDay, midnightColors, typography)
  }, [activeTarget, dayColors, midnightColors, persistTheme, typography])

  const resetToDefaults = useCallback(() => {
    if (activeTarget === 'midnight') {
      const nextMidnight = { ...MIDNIGHT_GALLERY_DEFAULTS }
      setMidnightColors(nextMidnight)
      persistTheme(dayColors, nextMidnight, typography)
      return
    }

    const nextDay = { ...DEFAULTS }
    setDayColors(nextDay)
    persistTheme(nextDay, midnightColors, typography)
  }, [activeTarget, dayColors, midnightColors, persistTheme, typography])

  const setDisplayFont = useCallback((value: string) => {
    setTypography(prev => {
      const next = { ...prev, displayFont: value }
      persistTheme(dayColors, midnightColors, next)
      return next
    })
  }, [dayColors, midnightColors, persistTheme])

  const setBodyFont = useCallback((value: string) => {
    setTypography(prev => {
      const next = { ...prev, bodyFont: value }
      persistTheme(dayColors, midnightColors, next)
      return next
    })
  }, [dayColors, midnightColors, persistTheme])

  const setHeadingScale = useCallback((value: number) => {
    setTypography(prev => {
      const next = { ...prev, headingScale: Math.min(120, Math.max(85, Math.round(value))) }
      persistTheme(dayColors, midnightColors, next)
      return next
    })
  }, [dayColors, midnightColors, persistTheme])

  const setBodyScale = useCallback((value: number) => {
    setTypography(prev => {
      const next = { ...prev, bodyScale: Math.min(120, Math.max(85, Math.round(value))) }
      persistTheme(dayColors, midnightColors, next)
      return next
    })
  }, [dayColors, midnightColors, persistTheme])

  const resetTypography = useCallback(() => {
    const next = { ...DEFAULT_TYPOGRAPHY }
    setTypography(next)
    persistTheme(dayColors, midnightColors, next)
  }, [dayColors, midnightColors, persistTheme])

  useEffect(() => {
    applyToDOM(dayColors, midnightColors, typography)
  }, [dayColors, midnightColors, typography])

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
    typography,
    setDisplayFont,
    setBodyFont,
    setHeadingScale,
    setBodyScale,
    resetTypography,
    isTypographyDefault,
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
    typography,
    setDisplayFont,
    setBodyFont,
    setHeadingScale,
    setBodyScale,
    resetTypography,
    isTypographyDefault,
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
