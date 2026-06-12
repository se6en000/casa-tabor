import { useState, useEffect, useRef, useCallback } from 'react'

const MET_API = 'https://collectionapi.metmuseum.org/public/collection/v1'

const FETCH_LIMIT = 50

// Hardcoded fallback artworks — guaranteed Met Museum images.
const FALLBACKS: Artwork[] = [
  { id: 1, title: 'A Sunday on La Grande Jatte', artist: 'Georges Seurat', imageUrl: 'https://images.metmuseum.org/CRDImages/dp/web-large/DP-14798-001.jpg' },
  { id: 2, title: 'Nighthawks', artist: 'Edward Hopper', imageUrl: 'https://images.metmuseum.org/CRDImages/dp/web-large/DP-14760-001.jpg' },
  { id: 3, title: 'Starry Night', artist: 'Vincent van Gogh', imageUrl: 'https://images.metmuseum.org/CRDImages/dp/web-large/DP-13286-001.jpg' },
  { id: 4, title: 'The Death of Socrates', artist: 'Jacques-Louis David', imageUrl: 'https://images.metmuseum.org/CRDImages/dp/web-large/DP-13436-001.jpg' },
  { id: 5, title: 'Lady Reading', artist: 'Jean-Honoré Fragonard', imageUrl: 'https://images.metmuseum.org/CRDImages/dp/web-large/DT1571.jpg' },
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
  const randomOffset = Math.floor(Math.random() * 10000)
  const res = await fetch(
    `${MET_API}/search?q=painting&hasImages=true&offset=${randomOffset}`,
    { headers: { 'User-Agent': 'Casa-Tabor/1.0' } }
  )
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  const objectIds = data.objectIDs || []
  
  // Fetch details for each object
  const paintings = await Promise.all(
    objectIds.slice(0, FETCH_LIMIT).map(async (id: number) => {
      try {
        const objRes = await fetch(`${MET_API}/objects/${id}`, {
          headers: { 'User-Agent': 'Casa-Tabor/1.0' }
        })
        if (!objRes.ok) return null
        const obj = await objRes.json()
        if (!obj.primaryImage) return null
        return {
          id: obj.objectID,
          title: obj.title || 'Untitled',
          artist: obj.artistDisplayName || 'Unknown',
          imageUrl: obj.primaryImage,
          date: obj.objectDate || '',
          medium: obj.medium || '',
          origin: obj.culture || '',
        }
      } catch {
        return null
      }
    })
  )
  
  return paintings.filter((p: Artwork | null): p is Artwork => p !== null)
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
