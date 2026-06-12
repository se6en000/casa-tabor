import { useState, useEffect, useRef, useCallback } from 'react'

const WIKIART_API = 'https://www.wikiart.org/en/api/v1'

const MAX_PAGE   = 100
const FETCH_LIMIT = 50

// Hardcoded fallback artworks — guaranteed public-domain WikiArt images.
const FALLBACKS: Artwork[] = [
  { id: 1, title: 'A Sunday on La Grande Jatte', artist: 'Georges Seurat', imageUrl: 'https://uploads8.wikiart.org/images/georges-seurat/a-sunday-afternoon-on-the-island-of-la-grande-jatte-1884.jpg!Large.jpg' },
  { id: 2, title: 'Nighthawks', artist: 'Edward Hopper', imageUrl: 'https://uploads5.wikiart.org/images/edward-hopper/nighthawks.jpg!Large.jpg' },
  { id: 3, title: 'Starry Night', artist: 'Vincent van Gogh', imageUrl: 'https://uploads1.wikiart.org/images/vincent-van-gogh/the-starry-night-1889.jpg!Large.jpg' },
  { id: 4, title: 'The Son of Man', artist: 'René Magritte', imageUrl: 'https://uploads0.wikiart.org/images/rene-magritte/the-son-of-man-1964.jpg!Large.jpg' },
  { id: 5, title: 'Girl with a Pearl Earring', artist: 'Johannes Vermeer', imageUrl: 'https://uploads0.wikiart.org/images/johannes-vermeer/girl-with-a-pearl-earring-1665.jpg!Large.jpg' },
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
  const res = await fetch(`${WIKIART_API}/paintings?page=${randomPage}&limit=${FETCH_LIMIT}`, {
    headers: { 
      'User-Agent': 'Casa-Tabor/1.0 (compatible; Chromium)',
    },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const paintings = await res.json()
  return (Array.isArray(paintings) ? paintings : [])
    .filter((p: { image?: string; title?: string; artist?: { name?: string } }) => p.image && p.title)
    .map((p: { id?: string; title?: string; artist?: { name?: string }; image?: string; yearCreated?: number; medium?: string }) => ({
      id: p.id ? parseInt(p.id) : Math.random(),
      title: p.title ?? 'Untitled',
      artist: p.artist?.name ?? 'Unknown',
      imageUrl: p.image ?? '',
      date: p.yearCreated ? `${p.yearCreated}` : '',
      medium: p.medium ?? '',
      origin: '',
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
