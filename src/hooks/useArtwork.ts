import { useState, useEffect, useRef, useCallback } from 'react'

const IIIF = 'https://www.artic.edu/iiif/2'
const API  = 'https://api.artic.edu/api/v1'

const PAINTING_TYPE_IDS = [1, 14]
const MAX_PAGE   = 25
const FETCH_LIMIT = 60

// Hardcoded fallback artworks — guaranteed public-domain ARTIC images.
// Used when API is unreachable (offline, rate-limited, etc.)
const FALLBACKS: Artwork[] = [
  { id: 27992,  title: 'A Sunday on La Grande Jatte',  artist: 'Georges Seurat',        imageUrl: `${IIIF}/1adf2696-8489-499b-cad2-821d7fde4b33/full/1600,/0/default.jpg` },
  { id: 111628, title: 'Nighthawks',                   artist: 'Edward Hopper',          imageUrl: `${IIIF}/831a05de-d3f6-f4fa-a460-23008dd58dda/full/1600,/0/default.jpg` },
  { id: 6565,   title: 'American Gothic',              artist: 'Grant Wood',             imageUrl: `${IIIF}/a6b1cdb3-accf-a52f-78ad-5da1a3ee4b3c/full/1600,/0/default.jpg` },
  { id: 16499,  title: 'The Old Guitarist',            artist: 'Pablo Picasso',          imageUrl: `${IIIF}/e5b2c43f-8b27-5c51-1dce-b9e5e4d4a1dc/full/1600,/0/default.jpg` },
  { id: 14655,  title: 'Paris Street; Rainy Day',      artist: 'Gustave Caillebotte',    imageUrl: `${IIIF}/25c31d8d-21a4-9ea1-1d73-6a2eca4dda7e/full/1600,/0/default.jpg` },
]

export interface Artwork {
  id: number
  title: string
  artist: string
  imageUrl: string
  date?: string
  medium?: string
  origin?: string
}

type ArtworkPreference = 'up' | 'down'
type ArtworkPreferences = Record<number, ArtworkPreference>
const PREFS_KEY = 'artwork-preferences-v1'

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function loadPrefs(): ArtworkPreferences {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, ArtworkPreference>
    const out: ArtworkPreferences = {}
    for (const [k, v] of Object.entries(parsed)) {
      const id = Number(k)
      if (!Number.isNaN(id) && (v === 'up' || v === 'down')) out[id] = v
    }
    return out
  } catch {
    return {}
  }
}

function savePrefs(prefs: ArtworkPreferences) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // Ignore storage failures.
  }
}

async function fetchPage(): Promise<Artwork[]> {
  const randomPage = Math.floor(Math.random() * MAX_PAGE) + 1
  const res = await fetch(`${API}/artworks/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: {
        bool: {
          must: [
            { term: { is_public_domain: true } },
            { terms: { artwork_type_id: PAINTING_TYPE_IDS } },
            { exists: { field: 'image_id' } },
          ],
        },
      },
      fields: ['id', 'title', 'artist_display', 'image_id', 'date_display', 'medium_display', 'place_of_origin'],
      limit: FETCH_LIMIT,
      page: randomPage,
    }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  return (json.data ?? [])
    .filter((a: { image_id?: string }) => a.image_id)
    .map((a: { id: number; title?: string; artist_display?: string; image_id: string; date_display?: string; medium_display?: string; place_of_origin?: string }) => ({
      id: a.id,
      title: a.title ?? '',
      artist: (a.artist_display ?? '').split('\n')[0],
      imageUrl: `${IIIF}/${a.image_id}/full/1600,/0/default.jpg`,
      date: a.date_display ?? '',
      medium: a.medium_display ?? '',
      origin: a.place_of_origin ?? '',
    }))
}

export function useArtwork(rotateSecs = 240) {
  const [artworks, setArtworks]   = useState<Artwork[]>([])
  const [index, setIndex]         = useState(0)
  const [loaded, setLoaded]       = useState(false)
  const [, setPrefsVersion] = useState(0)
  const rotateRef                 = useRef<ReturnType<typeof setInterval> | null>(null)
  const failedIdsRef              = useRef<Set<number>>(new Set())
  const prefsRef                  = useRef<ArtworkPreferences>({})

  useEffect(() => {
    prefsRef.current = loadPrefs()
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [p1, p2, p3] = await Promise.all([fetchPage(), fetchPage(), fetchPage()])
        const all = [...p1, ...p2, ...p3]
        if (!cancelled && all.length > 0) {
          setArtworks(shuffled(all))
          setIndex(0)
        }
      } catch (e) {
        console.error('Failed to load artwork:', e)
        if (!cancelled) {
          setArtworks(FALLBACKS)
          setIndex(0)
        }
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // Auto-rotate — only starts once artworks are loaded
  useEffect(() => {
    if (artworks.length === 0) return
    if (rotateRef.current) clearInterval(rotateRef.current)
    rotateRef.current = setInterval(() => {
      setLoaded(false)
      setIndex(i => (i + 1) % artworks.length)
    }, rotateSecs * 1000)
    return () => { if (rotateRef.current) clearInterval(rotateRef.current) }
  }, [artworks.length, rotateSecs])

  const current = artworks.length > 0 ? artworks[index] : null

  const onLoad = useCallback(() => setLoaded(true), [])

  // Called when an image fails to load — skip it and advance
  const onError = useCallback(() => {
    setArtworks(prev => {
      if (prev.length === 0) return prev
      const failedId = prev[index]?.id
      if (failedId != null) failedIdsRef.current.add(failedId)
      return prev
    })
    setLoaded(false)
    setIndex(i => (i + 1) % Math.max(artworks.length, 1))
  }, [artworks.length, index])

  const next = useCallback(() => {
    setLoaded(false)
    setIndex(i => (i + 1) % Math.max(artworks.length, 1))
  }, [artworks.length])

  const setPreference = useCallback((artworkId: number, preference: ArtworkPreference) => {
    const nextPrefs: ArtworkPreferences = { ...prefsRef.current, [artworkId]: preference }
    prefsRef.current = nextPrefs
    savePrefs(nextPrefs)
    setPrefsVersion(v => v + 1)
  }, [])

  const currentPreference = current ? prefsRef.current[current.id] : undefined

  return {
    artwork: current,
    loaded,
    onLoad,
    onError,
    next,
    total: artworks.length,
    setPreference,
    currentPreference,
  }
}
