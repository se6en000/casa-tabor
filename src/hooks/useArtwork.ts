import { useState, useEffect, useRef, useCallback } from 'react'

const IIIF = 'https://www.artic.edu/iiif/2'
const API  = 'https://api.artic.edu/api/v1'

const PAINTING_TYPE_IDS = [1, 14]
const MAX_PAGE   = 25
const FETCH_LIMIT = 60
const MAX_RETRIES = 4   // try up to 4 different random pages before giving up
const RETRY_DELAY = 2000
const WATERCOLOR_BIAS_RATIO = 3 // 3 watercolor picks per 1 non-watercolor pick
const MIN_VIEW_COUNT = 50000   // only show paintings with 50k+ views — famous works only

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

function dedupeById(artworks: Artwork[]): Artwork[] {
  const seen = new Set<number>()
  const deduped: Artwork[] = []
  for (const artwork of artworks) {
    if (seen.has(artwork.id)) continue
    seen.add(artwork.id)
    deduped.push(artwork)
  }
  return deduped
}

function blendWatercolorFirst(watercolors: Artwork[], others: Artwork[]): Artwork[] {
  const wc = shuffled(dedupeById(watercolors))
  const nonWatercolor = shuffled(dedupeById(others).filter(a => !wc.some(w => w.id === a.id)))
  const mixed: Artwork[] = []
  let w = 0
  let o = 0

  while (w < wc.length || o < nonWatercolor.length) {
    for (let i = 0; i < WATERCOLOR_BIAS_RATIO && w < wc.length; i += 1) {
      mixed.push(wc[w])
      w += 1
    }
    if (o < nonWatercolor.length) {
      mixed.push(nonWatercolor[o])
      o += 1
    }
  }

  return mixed
}

async function fetchPage(mode: 'watercolor' | 'mixed'): Promise<Artwork[]> {
  const randomPage = Math.floor(Math.random() * MAX_PAGE) + 1
  const watercolorClause = {
    bool: {
      should: [
        { match_phrase: { medium_display: 'watercolor' } },
        { match_phrase: { medium_display: 'watercolour' } },
        { match_phrase: { title: 'watercolor' } },
        { match_phrase: { title: 'watercolour' } },
      ],
      minimum_should_match: 1,
    },
  }
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
            { range: { view_count_boost: { gte: MIN_VIEW_COUNT } } },
            ...(mode === 'watercolor' ? [watercolorClause] : []),
          ],
        },
      },
      fields: ['id', 'title', 'artist_display', 'image_id', 'date_display', 'medium_display', 'place_of_origin', 'view_count_boost'],
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
    async function loadWithRetry() {
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          const [watercolors, mixed] = await Promise.all([fetchPage('watercolor'), fetchPage('mixed')])
          const results = blendWatercolorFirst(watercolors, mixed)
          if (results.length > 0 && !cancelled) {
            const filtered = dedupeById(results).filter(a => prefsRef.current[a.id] !== 'down')
            const upvoted = filtered.filter(a => prefsRef.current[a.id] === 'up')
            const neutral = filtered.filter(a => prefsRef.current[a.id] !== 'up')
            const shuffledResults = [...shuffled(upvoted), ...shuffled(neutral)]
            const finalResults = shuffledResults.length > 0 ? shuffledResults : shuffled(results)
            setArtworks(finalResults)
            setIndex(0)
            return
          }
        } catch { /* network error — try again */ }
        if (cancelled) return
        await new Promise(r => setTimeout(r, RETRY_DELAY))
      }
      // All attempts failed — use fallbacks so art mode always has something to show
      if (!cancelled) {
        const filteredFallbacks = FALLBACKS.filter(a => prefsRef.current[a.id] !== 'down')
        const upvotedFallbacks = filteredFallbacks.filter(a => prefsRef.current[a.id] === 'up')
        const neutralFallbacks = filteredFallbacks.filter(a => prefsRef.current[a.id] !== 'up')
        const finalFallbacks = [...shuffled(upvotedFallbacks), ...shuffled(neutralFallbacks)]
        setArtworks(finalFallbacks.length > 0 ? finalFallbacks : shuffled(FALLBACKS))
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
        while (
          (failedIdsRef.current.has(artworks[next]?.id) || prefsRef.current[artworks[next]?.id] === 'down')
          && attempts < artworks.length
        ) {
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
    setIndex(i => {
      if (artworks.length === 0) return 0
      let nextIndex = (i + 1) % artworks.length
      let attempts = 0
      while (prefsRef.current[artworks[nextIndex]?.id] === 'down' && attempts < artworks.length) {
        nextIndex = (nextIndex + 1) % artworks.length
        attempts++
      }
      return nextIndex
    })
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
