import { useState, useEffect, useRef, useCallback } from 'react'

const IIIF = 'https://www.artic.edu/iiif/2'
const API  = 'https://api.artic.edu/api/v1'

const PAINTING_TYPE_IDS = [1, 14]
const MAX_PAGE   = 25
const FETCH_LIMIT = 60
const MAX_RETRIES = 4   // try up to 4 different random pages before giving up
const RETRY_DELAY = 2000

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
}

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
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
      fields: ['id', 'title', 'artist_display', 'image_id'],
      limit: FETCH_LIMIT,
      page: randomPage,
    }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  return (json.data ?? [])
    .filter((a: { image_id?: string }) => a.image_id)
    .map((a: { id: number; title?: string; artist_display?: string; image_id: string }) => ({
      id: a.id,
      title: a.title ?? '',
      artist: (a.artist_display ?? '').split('\n')[0],
      imageUrl: `${IIIF}/${a.image_id}/full/1600,/0/default.jpg`,
    }))
}

export function useArtwork(rotateSecs = 240) {
  const [artworks, setArtworks]   = useState<Artwork[]>([])
  const [index, setIndex]         = useState(0)
  const [loaded, setLoaded]       = useState(false)
  const rotateRef                 = useRef<ReturnType<typeof setInterval> | null>(null)
  const failedIdsRef              = useRef<Set<number>>(new Set())

  useEffect(() => {
    let cancelled = false
    async function loadWithRetry() {
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          const results = await fetchPage()
          if (results.length > 0 && !cancelled) {
            const shuffledResults = shuffled(results)
            setArtworks(shuffledResults)
            setIndex(0)
            return
          }
        } catch { /* network error — try again */ }
        if (cancelled) return
        await new Promise(r => setTimeout(r, RETRY_DELAY))
      }
      // All attempts failed — use fallbacks so art mode always has something to show
      if (!cancelled) {
        setArtworks(shuffled(FALLBACKS))
        setIndex(0)
      }
    }
    loadWithRetry()
    return () => { cancelled = true }
  }, [])

  // Auto-rotate — only starts once artworks are loaded
  useEffect(() => {
    if (artworks.length === 0) return
    if (rotateRef.current) clearInterval(rotateRef.current)
    rotateRef.current = setInterval(() => {
      setLoaded(false)
      setIndex(i => {
        let next = (i + 1) % artworks.length
        // Skip any known-failed images (but don't loop forever)
        let attempts = 0
        while (failedIdsRef.current.has(artworks[next]?.id) && attempts < artworks.length) {
          next = (next + 1) % artworks.length
          attempts++
        }
        return next
      })
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

  return { artwork: current, loaded, onLoad, onError, next, total: artworks.length }
}
