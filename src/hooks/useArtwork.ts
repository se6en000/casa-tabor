import { useState, useEffect, useRef, useCallback } from 'react'

const IIIF = 'https://www.artic.edu/iiif/2'
const API  = 'https://api.artic.edu/api/v1'

// Artwork type IDs at ARTIC:
// 1 = Painting, 14 = Drawing and Watercolor
// Excludes: photos, prints, sculpture, ceramics, etc.
const PAINTING_TYPE_IDS = [1, 14]

// Pages to randomly pick from — ARTIC has thousands of public-domain paintings
const MAX_PAGE = 25
const FETCH_LIMIT = 60

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

export function useArtwork(rotateSecs = 240) {
  const [artworks, setArtworks]   = useState<Artwork[]>([])
  const [index, setIndex]         = useState(0)
  const [loaded, setLoaded]       = useState(false)
  const rotateRef                 = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    let cancelled = false
    async function fetchAll() {
      const results: Artwork[] = []
      try {
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
        const json = await res.json()
        for (const a of json.data ?? []) {
          if (a.image_id) {
            results.push({
              id: a.id,
              title: a.title ?? '',
              artist: (a.artist_display ?? '').split('\n')[0],
              imageUrl: `${IIIF}/${a.image_id}/full/1600,/0/default.jpg`,
            })
          }
        }
      } catch { /* silently fall back to empty */ }
      if (!cancelled) {
        const shuffledResults = shuffled(results)
        setArtworks(shuffledResults)
        setIndex(Math.floor(Math.random() * Math.max(shuffledResults.length, 1)))
      }
    }
    fetchAll()
    return () => { cancelled = true }
  }, [])

  // Auto-rotate
  useEffect(() => {
    if (rotateRef.current) clearInterval(rotateRef.current)
    rotateRef.current = setInterval(() => {
      setLoaded(false)
      setIndex(i => (i + 1) % Math.max(artworks.length, 1))
    }, rotateSecs * 1000)
    return () => { if (rotateRef.current) clearInterval(rotateRef.current) }
  }, [artworks.length, rotateSecs])

  const current = artworks[index] ?? null

  const onLoad = useCallback(() => setLoaded(true), [])
  const next   = useCallback(() => {
    setLoaded(false)
    setIndex(i => (i + 1) % Math.max(artworks.length, 1))
  }, [artworks.length])

  return { artwork: current, loaded, onLoad, next, total: artworks.length }
}
