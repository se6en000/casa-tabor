import { useState, useCallback } from 'react'

export interface MediaOption {
  id: string
  label: string
  query: string
  pattern: RegExp
}

export const MEDIA_OPTIONS: MediaOption[] = [
  { id: 'watercolor', label: 'Watercolor',       query: 'watercolor',       pattern: /watercolou?r/i },
  { id: 'oil',        label: 'Oil Painting',     query: 'oil',              pattern: /\boil\b/i },
  { id: 'drawing',    label: 'Drawing',          query: 'drawing graphite', pattern: /graphite|pencil|drawing/i },
  { id: 'charcoal',   label: 'Charcoal',         query: 'charcoal',         pattern: /charcoal/i },
  { id: 'pastel',     label: 'Pastel',           query: 'pastel',           pattern: /pastel/i },
  { id: 'gouache',    label: 'Gouache',          query: 'gouache',          pattern: /gouache/i },
  { id: 'print',      label: 'Print / Etching',  query: 'print etching',    pattern: /print|etching|lithograph/i },
  { id: 'tempera',    label: 'Tempera / Egg',    query: 'tempera',          pattern: /tempera/i },
]

export interface ArtFeedPrefs {
  artists: string[]
  mediaTypes: string[]      // ids from MEDIA_OPTIONS
  yearFrom: number | null
  yearTo: number | null
  cultures: string[]
  useMet: boolean
  useArtic: boolean
}

const DEFAULT_PREFS: ArtFeedPrefs = {
  artists: [],
  mediaTypes: [],
  yearFrom: null,
  yearTo: null,
  cultures: [],
  useMet: true,
  useArtic: true,
}

const KEY = 'art-feed-prefs-v1'

export function loadArtFeedPrefs(): ArtFeedPrefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_PREFS }
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

export function saveArtFeedPrefs(prefs: ArtFeedPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    // ignore
  }
}

export function useArtFeedPrefs() {
  const [prefs, setPrefs] = useState<ArtFeedPrefs>(() => loadArtFeedPrefs())

  const update = useCallback((patch: Partial<ArtFeedPrefs>) => {
    setPrefs(prev => {
      const next = { ...prev, ...patch }
      saveArtFeedPrefs(next)
      return next
    })
  }, [])

  return { prefs, update }
}
