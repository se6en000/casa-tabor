/**
 * ThemeContext — real-time CSS variable overrides for Casa Tabor.
 * Changes are applied instantly via an injected <style> tag and
 * persisted to localStorage. No explicit save step required.
 */

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'

export interface ThemeColors {
  'casa-gold':    string  // accent
  'casa-navy':    string  // primary / dark elements
  'casa-bg':      string  // page background
  'casa-surface': string  // card / panel background
  'casa-text':    string  // body text
  'casa-border':  string  // dividers + card borders
}

export const DEFAULTS: ThemeColors = {
  'casa-gold':    '#C9A96E',
  'casa-navy':    '#1B2A4A',
  'casa-bg':      '#FAF8F5',
  'casa-surface': '#FFFFFF',
  'casa-text':    '#2D2D2D',
  'casa-border':  '#E8E2D9',
}

export interface ThemePreset {
  id: string
  label: string
  emoji: string
  colors: ThemeColors
}

export const PRESETS: ThemePreset[] = [
  {
    id: 'default',
    label: 'Default',
    emoji: '🏡',
    colors: { ...DEFAULTS },
  },
  {
    id: 'espresso',
    label: 'Espresso',
    emoji: '☕',
    colors: {
      'casa-gold':    '#B8955A',
      'casa-navy':    '#3A2812',
      'casa-bg':      '#EDE5D8',
      'casa-surface': '#F7F2EA',
      'casa-text':    '#2C1A0E',
      'casa-border':  '#D4C8B8',
    },
  },
  {
    id: 'christmas',
    label: 'Christmas',
    emoji: '🎄',
    colors: {
      'casa-gold':    '#C0392B',
      'casa-navy':    '#1A5C2E',
      'casa-bg':      '#FDF6F0',
      'casa-surface': '#FFFFFF',
      'casa-text':    '#2D2D2D',
      'casa-border':  '#D5E8D4',
    },
  },
  {
    id: 'autumn',
    label: 'Autumn',
    emoji: '🍂',
    colors: {
      'casa-gold':    '#C0622B',
      'casa-navy':    '#3D2B1F',
      'casa-bg':      '#FBF5EE',
      'casa-surface': '#FFFFFF',
      'casa-text':    '#2D2D2D',
      'casa-border':  '#E8D8C8',
    },
  },
  {
    id: 'summer',
    label: 'Summer',
    emoji: '☀️',
    colors: {
      'casa-gold':    '#E07B54',
      'casa-navy':    '#1E4B6E',
      'casa-bg':      '#F5FBFD',
      'casa-surface': '#FFFFFF',
      'casa-text':    '#1C2B36',
      'casa-border':  '#C8E4EE',
    },
  },
  {
    id: 'minimal',
    label: 'Minimal',
    emoji: '◻️',
    colors: {
      'casa-gold':    '#5B6F7A',
      'casa-navy':    '#2C3E50',
      'casa-bg':      '#F7F8F9',
      'casa-surface': '#FFFFFF',
      'casa-text':    '#2C3E50',
      'casa-border':  '#DDE1E5',
    },
  },
  {
    id: 'midnight',
    label: 'Midnight',
    emoji: '🌙',
    colors: {
      'casa-gold':    '#7C6FBF',
      'casa-navy':    '#1A1A3E',
      'casa-bg':      '#F2F0F8',
      'casa-surface': '#FFFFFF',
      'casa-text':    '#2A2744',
      'casa-border':  '#DDD8EE',
    },
  },
]

const STORAGE_KEY = 'casa-theme-colors'

function darken(hex: string, amount = 0.2): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const dr = Math.max(0, Math.round(r * (1 - amount)))
  const dg = Math.max(0, Math.round(g * (1 - amount)))
  const db = Math.max(0, Math.round(b * (1 - amount)))
  return `#${dr.toString(16).padStart(2,'0')}${dg.toString(16).padStart(2,'0')}${db.toString(16).padStart(2,'0')}`
}

function buildStyleContent(colors: ThemeColors): string {
  const nightGold = darken(colors['casa-gold'], 0.15)
  return `:root {
  --color-casa-gold: ${colors['casa-gold']};
  --color-casa-navy: ${colors['casa-navy']};
  --color-casa-bg: ${colors['casa-bg']};
  --color-casa-surface: ${colors['casa-surface']};
  --color-casa-text: ${colors['casa-text']};
  --color-casa-border: ${colors['casa-border']};
}
html.rt-night, html.rt-late-night {
  --color-casa-gold: ${nightGold};
}`
}

let styleTag: HTMLStyleElement | null = null

function applyToDOM(colors: ThemeColors) {
  if (!styleTag) {
    styleTag = document.createElement('style')
    styleTag.id = 'casa-theme-override'
    document.head.appendChild(styleTag)
  }
  styleTag.textContent = buildStyleContent(colors)
}

function loadFromStorage(): ThemeColors {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return { ...DEFAULTS }
}

interface ThemeContextValue {
  colors: ThemeColors
  setColor: (key: keyof ThemeColors, value: string) => void
  applyPreset: (preset: ThemePreset) => void
  resetToDefaults: () => void
  isDefault: boolean
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [colors, setColors] = useState<ThemeColors>(() => {
    const loaded = loadFromStorage()
    applyToDOM(loaded)
    return loaded
  })

  const isDefault = Object.entries(DEFAULTS).every(
    ([k, v]) => colors[k as keyof ThemeColors] === v
  )

  const setColor = useCallback((key: keyof ThemeColors, value: string) => {
    setColors(prev => {
      const next = { ...prev, [key]: value }
      applyToDOM(next)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const applyPreset = useCallback((preset: ThemePreset) => {
    setColors(preset.colors)
    applyToDOM(preset.colors)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preset.colors))
  }, [])

  const resetToDefaults = useCallback(() => {
    setColors({ ...DEFAULTS })
    applyToDOM(DEFAULTS)
    localStorage.removeItem(STORAGE_KEY)
    if (styleTag) styleTag.textContent = ''
  }, [])

  // Apply on mount (handles SSR/hydration edge cases)
  useEffect(() => { applyToDOM(colors) }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ThemeContext.Provider value={{ colors, setColor, applyPreset, resetToDefaults, isDefault }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}
