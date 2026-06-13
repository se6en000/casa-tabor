import { useState, useEffect, useRef, useCallback } from 'react'

const MET_API = 'https://collectionapi.metmuseum.org/public/collection/v1'
const ARTIC_API = 'https://api.artic.edu/api/v1'
const ARTIC_IIIF = 'https://www.artic.edu/iiif/2'

// ARTIC IDs are offset to avoid collisions with Met numeric IDs
const ARTIC_OFFSET = 10_000_000

// Curated Met Museum search queries — all yield Florida, tropical, coastal, ocean art
const MET_QUERIES = [
  'Winslow Homer',
  'Martin Johnson Heade',
  'Thomas Moran',
  'William Merritt Chase beach',
  'John Singer Sargent watercolor',
  'George Inness landscape',
  'Florida palm tropical ocean',
  'sailing sea coast nautical',
  'pelican heron egret bird watercolor',
  'Bahamas Caribbean Nassau tropical',
  'beach ocean sunset seascape',
  'tropical flowers botanical watercolor',
]

// Art Institute of Chicago search queries
const ARTIC_QUERIES = [
  'florida tropical palm beach ocean',
  'coastal landscape sailing watercolor',
  'winslow homer beach sea',
  'heade magnolia orchid tropical',
  'george inness marsh landscape',
  'american beach ocean impressionist',
]

// Only painted / drawn mediums — excludes prints, photos, ceramics, textiles
const PAINTED_MEDIUM = /\boil\b|watercolou?r|gouache|pastel|tempera|acrylic|fresco|\bchalk\b|ink wash|\bgraphite\b|pencil on|paint/i

// Known-good fallbacks — Florida/tropical/ocean themed public domain paintings
const FALLBACKS: Artwork[] = [
  {
    id: 11122,
    title: 'The Gulf Stream',
    artist: 'Winslow Homer',
    imageUrl: 'https://images.metmuseum.org/CRDImages/ad/original/DP-20821-001.jpg',
    date: '1899',
    medium: 'Oil on canvas',
  },
  {
    id: 11125,
    title: 'Inside the Bar',
    artist: 'Winslow Homer',
    imageUrl: 'https://images.metmuseum.org/CRDImages/ad/original/ap54.183.jpg',
    date: '1883',
    medium: 'Watercolor',
  },
  {
    id: 11051,
    title: 'Hummingbird and Apple Blossoms',
    artist: 'Martin Johnson Heade',
    imageUrl: 'https://images.metmuseum.org/CRDImages/ad/original/DT9511.jpg',
    date: '1875',
    medium: 'Oil on canvas',
  },
  {
    id: ARTIC_OFFSET + 64724,
    title: 'The Home of the Heron',
    artist: 'George Inness',
    imageUrl: `${ARTIC_IIIF}/0f2d999d-0173-2935-a6d0-0175bb97b2a9/full/1200,/0/default.jpg`,
    date: '1893',
    medium: 'Oil on canvas',
  },
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
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function pickRandom<T>(arr: T[], n: number): T[] {
  return shuffled(arr).slice(0, n)
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

// ── Fetchers ──────────────────────────────────────────────────────────────────

async function fetchFromMet(query: string): Promise<Artwork[]> {
  try {
    const res = await fetch(
      `${MET_API}/search?q=${encodeURIComponent(query)}&hasImages=true&isPublicDomain=true`
    )
    if (!res.ok) return []
    const data = await res.json()
    const ids: number[] = shuffled((data.objectIDs as number[]) || []).slice(0, 18)

    const results = await Promise.all(
      ids.map(async (id) => {
        try {
          const r = await fetch(`${MET_API}/objects/${id}`)
          if (!r.ok) return null
          const obj = await r.json()
          if (!obj.primaryImage || !obj.isPublicDomain) return null
          if (obj.medium && !PAINTED_MEDIUM.test(obj.medium)) return null
          return {
            id: obj.objectID as number,
            title: obj.title || 'Untitled',
            artist: obj.artistDisplayName || 'Unknown',
            imageUrl: obj.primaryImage as string,
            date: obj.objectDate || '',
            medium: obj.medium || '',
            origin: obj.culture || '',
          } as Artwork
        } catch {
          return null
        }
      })
    )
    return results.filter((a): a is Artwork => a !== null)
  } catch {
    return []
  }
}

async function fetchFromArtic(query: string): Promise<Artwork[]> {
  try {
    const res = await fetch(
      `${ARTIC_API}/artworks/search?q=${encodeURIComponent(query)}&fields=id,title,artist_display,image_id,medium_display,date_display,is_public_domain&limit=25`
    )
    if (!res.ok) return []
    const data = await res.json()

    const artworks: Artwork[] = []
    for (const item of data.data || []) {
      if (!item.is_public_domain || !item.image_id) continue
      if (item.medium_display && !PAINTED_MEDIUM.test(item.medium_display)) continue
      artworks.push({
        id: (item.id as number) + ARTIC_OFFSET,
        title: item.title || 'Untitled',
        artist: (item.artist_display as string)?.split('\n')[0] || 'Unknown',
        imageUrl: `${ARTIC_IIIF}/${item.image_id}/full/1200,/0/default.jpg`,
        date: item.date_display || '',
        medium: item.medium_display || '',
      })
    }
    return artworks
  } catch {
    return []
  }
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
        // Pick 3 random Met queries + 2 random ARTIC queries each load cycle
        const metQs = pickRandom(MET_QUERIES, 3)
        const articQs = pickRandom(ARTIC_QUERIES, 2)

        const [m1, m2, m3, a1, a2] = await Promise.all([
          fetchFromMet(metQs[0]),
          fetchFromMet(metQs[1]),
          fetchFromMet(metQs[2]),
          fetchFromArtic(articQs[0]),
          fetchFromArtic(articQs[1]),
        ])

        const combined = [...m1, ...m2, ...m3, ...a1, ...a2]
        // Deduplicate by id
        const seen = new Set<number>()
        const all = combined.filter(a => {
          if (seen.has(a.id)) return false
          seen.add(a.id)
          return true
        })

        if (!cancelled && all.length > 0) {
          setArtworks(shuffled(all))
          setIndex(0)
        } else if (!cancelled) {
          setArtworks(FALLBACKS)
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
