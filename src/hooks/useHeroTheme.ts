import { useState, useEffect, useCallback } from 'react'

export type HeroTheme = 'navy' | 'linen'
export type HeroThemePreference = 'auto' | 'navy' | 'linen'

const STORAGE_PREFERENCE = 'casa-hero-theme-preference'
const STORAGE_DAY_THEME = 'casa-hero-day-theme'
const STORAGE_NIGHT_THEME = 'casa-hero-night-theme'
const STORAGE_MANUAL_OVERRIDE = 'casa-hero-manual-override'

// Event bus for syncing theme state across components
const THEME_CHANGE_EVENT = 'casa-hero-theme-change'

function getStoredPreference(): HeroThemePreference {
  try {
    const val = localStorage.getItem(STORAGE_PREFERENCE)
    if (val === 'auto' || val === 'navy' || val === 'linen') return val
  } catch {}
  return 'auto'
}

function getStoredDayTheme(): HeroTheme {
  try {
    const val = localStorage.getItem(STORAGE_DAY_THEME)
    if (val === 'navy' || val === 'linen') return val
  } catch {}
  return 'linen'
}

function getStoredNightTheme(): HeroTheme {
  try {
    const val = localStorage.getItem(STORAGE_NIGHT_THEME)
    if (val === 'navy' || val === 'linen') return val
  } catch {}
  return 'navy'
}

function getStoredManualOverride(): HeroTheme | null {
  try {
    const val = localStorage.getItem(STORAGE_MANUAL_OVERRIDE)
    if (val === 'navy' || val === 'linen') return val
  } catch {}
  return null
}

export function useHeroTheme(now: Date = new Date()) {
  const [preference, setPreferenceState] = useState<HeroThemePreference>(getStoredPreference)
  const [dayTheme, setDayThemeState] = useState<HeroTheme>(getStoredDayTheme)
  const [nightTheme, setNightThemeState] = useState<HeroTheme>(getStoredNightTheme)
  const [manualOverride, setManualOverrideState] = useState<HeroTheme | null>(getStoredManualOverride)

  // Listen for changes from other components or tabs
  useEffect(() => {
    const handleSync = () => {
      setPreferenceState(getStoredPreference())
      setDayThemeState(getStoredDayTheme())
      setNightThemeState(getStoredNightTheme())
      setManualOverrideState(getStoredManualOverride())
    }

    window.addEventListener(THEME_CHANGE_EVENT, handleSync)
    window.addEventListener('storage', handleSync)
    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, handleSync)
      window.removeEventListener('storage', handleSync)
    }
  }, [])

  const notifyChange = () => {
    window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT))
  }

  // Resolve effective theme based on preference and time
  const currentHours = now.getHours()
  const isDaytime = currentHours >= 6 && currentHours < 19 // 6:00 AM to 7:00 PM

  let resolvedTheme: HeroTheme = isDaytime ? dayTheme : nightTheme

  if (manualOverride) {
    resolvedTheme = manualOverride
  } else if (preference === 'navy') {
    resolvedTheme = 'navy'
  } else if (preference === 'linen') {
    resolvedTheme = 'linen'
  }

  const setPreference = useCallback((pref: HeroThemePreference) => {
    try {
      localStorage.setItem(STORAGE_PREFERENCE, pref)
      if (pref === 'navy' || pref === 'linen') {
        localStorage.setItem(STORAGE_MANUAL_OVERRIDE, pref)
      } else {
        localStorage.removeItem(STORAGE_MANUAL_OVERRIDE)
      }
    } catch {}
    setPreferenceState(pref)
    setManualOverrideState(pref === 'navy' || pref === 'linen' ? pref : null)
    notifyChange()
  }, [])

  const setDayTheme = useCallback((theme: HeroTheme) => {
    try {
      localStorage.setItem(STORAGE_DAY_THEME, theme)
    } catch {}
    setDayThemeState(theme)
    notifyChange()
  }, [])

  const setNightTheme = useCallback((theme: HeroTheme) => {
    try {
      localStorage.setItem(STORAGE_NIGHT_THEME, theme)
    } catch {}
    setNightThemeState(theme)
    notifyChange()
  }, [])

  const toggleHeroTheme = useCallback(() => {
    const nextTheme: HeroTheme = resolvedTheme === 'navy' ? 'linen' : 'navy'
    try {
      localStorage.setItem(STORAGE_MANUAL_OVERRIDE, nextTheme)
    } catch {}
    setManualOverrideState(nextTheme)
    notifyChange()
  }, [resolvedTheme])

  const resetToSchedule = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_MANUAL_OVERRIDE)
    } catch {}
    setManualOverrideState(null)
    notifyChange()
  }, [])

  return {
    heroTheme: resolvedTheme,
    preference,
    dayTheme,
    nightTheme,
    isManualOverride: manualOverride !== null,
    setPreference,
    setDayTheme,
    setNightTheme,
    toggleHeroTheme,
    resetToSchedule,
  }
}
