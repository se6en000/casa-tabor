import { useState, useEffect, useRef, useCallback } from 'react'

const IIIF = 'https://www.artic.edu/iiif/2'
const API  = 'https://api.artic.edu/api/v1'
// Curated set of public-domain painting IDs from ARTIC — landscapes, still lifes, interiors
// Mix of orientations that look great on 16:9 with a mat
const CURATED_IDS = [
  111628, // Seurat — A Sunday on La Grande Jatte
  16487,  // El Greco — The Assumption of the Virgin
  14968,  // Caillebotte — Paris Street, Rainy Day
  27992,  // Monet — Stacks of Wheat (End of Summer)
  16571,  // Monet — Water Lily Pond
  151424, // Renoir — Two Sisters (On the Terrace)
  6565,   // Winslow Homer — The Blue Boat
  66434,  // Van Gogh — Self-Portrait
  8991,   // Gustave Caillebotte — The Yerres, Rain
  117266, // Edward Hopper — Nighthawks
  20684,  // Georges Seurat — The Lake at Bois de Boulogne
  44892,  // Pissarro — The Crystal Palace
  102611, // Paul Gauguin — The Day of the God
  64818,  // Childe Hassam — A New England Headland
  81539,  // Mary Cassatt — The Child's Bath
  149681, // Renoir — Acrobats at the Cirque Fernando
  56905,  // Thomas Cole — Landscape
  25853,  // Winslow Homer — Croquet Scene
  9512,   // Grant Wood — American Gothic
  36161,  // Georges Seurat — A Sunday on La Grande Jatte (study)
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

export function useArtwork(rotateSecs = 240) {
  const [artworks, setArtworks]   = useState<Artwork[]>([])
  const [index, setIndex]         = useState(0)
  const [loaded, setLoaded]       = useState(false)
  const queueRef                  = useRef<number[]>(shuffled(CURATED_IDS))
  const rotateRef                 = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    let cancelled = false
    async function fetchAll() {
      const ids = queueRef.current
      const results: Artwork[] = []
      // Fetch in one batched request
      try {
        const res = await fetch(
          `${API}/artworks?ids=${ids.join(',')}&fields=id,title,artist_display,image_id&limit=${ids.length}`
        )
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
      if (!cancelled) setArtworks(results)
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
