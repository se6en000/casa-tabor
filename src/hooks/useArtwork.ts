import { useState, useEffect, useRef, useCallback } from 'react'
import {
  loadArtFeedPrefs,
  MEDIA_OPTIONS,
  ART_FEED_PREFS_KEY,
  ART_FEED_PREFS_UPDATED_EVENT,
  type ArtFeedPrefs,
} from './useArtFeedPrefs'

const MET_API = 'https://collectionapi.metmuseum.org/public/collection/v1'
const ARTIC_API = 'https://api.artic.edu/api/v1'
const ARTIC_IIIF = 'https://www.artic.edu/iiif/2'
const EUROPEANA_API = 'https://api.europeana.eu/record/v2/search.json'
const EUROPEANA_WSKEY = 'apidemo'

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

const EUROPEANA_QUERIES = [
  'modern painting',
  'contemporary landscape',
  'abstract color field',
  'city night painting',
  'coastal modern art',
  'minimalist painting',
]

// Only painted / drawn mediums — excludes prints, photos, ceramics, textiles
const PAINTED_MEDIUM = /\boil\b|watercolou?r|gouache|pastel|tempera|acrylic|fresco|\bchalk\b|ink wash|\bgraphite\b|pencil on|paint/i

// Build dynamic queries and filters from user art feed preferences
function buildQueriesFromPrefs(prefs: ArtFeedPrefs): {
  metQs: string[]
  articQs: string[]
  europeanaQs: string[]
  mediumFilter: RegExp
  yearFrom: number | null
  yearTo: number | null
} {
  const isCurated = prefs.feedMode === 'curated'
  const artists = isCurated ? prefs.artists : []
  const keywords = isCurated ? prefs.keywords : []
  const mediaTypes = isCurated ? prefs.mediaTypes : []
  const cultures = isCurated ? prefs.cultures : []
  const yearFrom = isCurated ? prefs.yearFrom : null
  const yearTo = isCurated ? prefs.yearTo : null
  const useMet = prefs.useMet
  const useArtic = prefs.useArtic
  const useEuropeana = prefs.useEuropeana

  // Medium regex from selected types, or fall back to broad painted filter
  let mediumFilter: RegExp
  if (mediaTypes.length > 0) {
    const patterns = mediaTypes
      .map(id => MEDIA_OPTIONS.find(o => o.id === id)?.pattern?.source)
      .filter((s): s is string => Boolean(s))
    mediumFilter = patterns.length > 0 ? new RegExp(patterns.join('|'), 'i') : PAINTED_MEDIUM
  } else {
    mediumFilter = PAINTED_MEDIUM
  }

  const mediaKeywords = mediaTypes.length > 0
    ? mediaTypes
        .map(id => MEDIA_OPTIONS.find(o => o.id === id)?.query || '')
        .filter(Boolean)
        .slice(0, 2)
    : []

  const cultureStr = cultures.length > 0 ? cultures[0] : ''
  const keywordTerms = keywords
    .map(keyword => keyword.trim())
    .filter(Boolean)
    .slice(0, 4)

  let metQs: string[]
  let articQs: string[]
  let europeanaQs: string[]
  const withHints = (term: string, lowercase = false) =>
    [lowercase ? term.toLowerCase() : term, mediaKeywords[0], cultureStr].filter(Boolean).join(' ')

  if (artists.length > 0) {
    metQs = artists.slice(0, 4).map(artist => withHints(artist))
    articQs = artists.slice(0, 3).map(artist => withHints(artist, true))
    europeanaQs = artists.slice(0, 3).map(artist => withHints(artist, true))
    if (keywordTerms.length > 0) {
      metQs = [...metQs, ...keywordTerms.slice(0, 2).map(keyword => withHints(keyword))]
      articQs = [...articQs, ...keywordTerms.slice(0, 1).map(keyword => withHints(keyword, true))]
      europeanaQs = [...europeanaQs, ...keywordTerms.slice(0, 2).map(keyword => withHints(keyword, true))]
    }
  } else if (keywordTerms.length > 0) {
    metQs = keywordTerms.slice(0, 4).map(keyword => withHints(keyword))
    articQs = keywordTerms.slice(0, 3).map(keyword => withHints(keyword, true))
    europeanaQs = keywordTerms.slice(0, 4).map(keyword => withHints(keyword, true))
  } else {
    // Use curated fallback queries
    metQs = pickRandom(MET_QUERIES, 3)
    articQs = pickRandom(ARTIC_QUERIES, 2)
    europeanaQs = pickRandom(EUROPEANA_QUERIES, 3)
    if (cultureStr) {
      metQs = [...metQs, cultureStr]
      articQs = [...articQs, cultureStr.toLowerCase()]
      europeanaQs = [...europeanaQs, cultureStr.toLowerCase()]
    }
    if (mediaKeywords.length > 0) {
      metQs = [...metQs.slice(0, 2), ...mediaKeywords.map(m => `${m} landscape`)]
      europeanaQs = [...europeanaQs.slice(0, 2), ...mediaKeywords.map(m => `${m} modern`)]
    }
  }

  if (!useMet) metQs = []
  if (!useArtic) articQs = []
  if (!useEuropeana) europeanaQs = []

  return {
    metQs: metQs.slice(0, 6),
    articQs: articQs.slice(0, 4),
    europeanaQs: europeanaQs.slice(0, 5),
    mediumFilter,
    yearFrom,
    yearTo,
  }
}

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
  source?: string
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

function matchesAnyKeyword(artwork: Artwork, keywords: string[]): boolean {
  if (keywords.length === 0) return true
  const haystack = `${artwork.title} ${artwork.artist} ${artwork.medium ?? ''} ${artwork.origin ?? ''}`.toLowerCase()
  return keywords.some(keyword => haystack.includes(keyword))
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

async function fetchFromMet(query: string, mediumFilter: RegExp | null): Promise<Artwork[]> {
  try {
    const res = await fetch(
      `${MET_API}/search?q=${encodeURIComponent(query)}&hasImages=true&isPublicDomain=true`
    )
    if (!res.ok) return []
    const data = await res.json()
    const ids: number[] = ((data.objectIDs as number[]) || []).slice(0, 30)

    const results = await Promise.all(
      ids.map(async (id) => {
        try {
          const r = await fetch(`${MET_API}/objects/${id}`)
          if (!r.ok) return null
          const obj = await r.json()
          if (!obj.primaryImage || !obj.isPublicDomain) return null
          if (mediumFilter && obj.medium && !mediumFilter.test(obj.medium)) return null
          return {
            id: obj.objectID as number,
            title: obj.title || 'Untitled',
            artist: obj.artistDisplayName || 'Unknown',
            imageUrl: obj.primaryImage as string,
            date: obj.objectDate || '',
            medium: obj.medium || '',
            origin: obj.culture || '',
            source: 'The Met',
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

async function fetchFromArtic(query: string, mediumFilter: RegExp | null): Promise<Artwork[]> {
  try {
    const res = await fetch(
      `${ARTIC_API}/artworks/search?q=${encodeURIComponent(query)}&fields=id,title,artist_display,image_id,medium_display,date_display,is_public_domain&limit=50`
    )
    if (!res.ok) return []
    const data = await res.json()

    const artworks: Artwork[] = []
    for (const item of data.data || []) {
      if (!item.is_public_domain || !item.image_id) continue
      if (mediumFilter && item.medium_display && !mediumFilter.test(item.medium_display)) continue
      artworks.push({
        id: (item.id as number) + ARTIC_OFFSET,
        title: item.title || 'Untitled',
        artist: (item.artist_display as string)?.split('\n')[0] || 'Unknown',
        imageUrl: `${ARTIC_IIIF}/${item.image_id}/full/1200,/0/default.jpg`,
        date: item.date_display || '',
        medium: item.medium_display || '',
        source: 'Art Institute of Chicago',
      })
    }
    return artworks
  } catch {
    return []
  }
}

function normalizeImageUrl(url: string): string {
  return url.startsWith('http://') ? `https://${url.slice(7)}` : url
}

async function fetchFromEuropeana(
  query: string,
  mediumFilter: RegExp | null,
  strictMediumFilter = false
): Promise<Artwork[]> {
  try {
    const res = await fetch(
      `${EUROPEANA_API}?wskey=${EUROPEANA_WSKEY}&query=${encodeURIComponent(query)}&rows=50&profile=standard`
    )
    if (!res.ok) return []
    const data = await res.json()

    const artworks: Artwork[] = []
    for (const item of data.items || []) {
      const rawImageUrl = item?.edmPreview?.[0] || item?.edmIsShownBy?.[0]
      if (!rawImageUrl) continue
      const imageUrl = normalizeImageUrl(rawImageUrl)
      if (!imageUrl.startsWith('https://')) continue
      const title = item?.title?.[0] || item?.dcTitleLangAware?.def?.[0] || 'Untitled'
      const artist = item?.dcCreator?.[0] || 'Unknown'
      const medium = item?.dcFormat?.[0] || item?.type || ''
      if (strictMediumFilter && mediumFilter && medium && !mediumFilter.test(medium)) continue

      const idStr = String(item?.id || imageUrl)
      let hash = 0
      for (let i = 0; i < idStr.length; i += 1) hash = (hash * 31 + idStr.charCodeAt(i)) | 0
      const stableId = 20_000_000 + Math.abs(hash)

      artworks.push({
        id: stableId,
        title,
        artist,
        imageUrl,
        date: item?.year?.[0] || '',
        medium,
        origin: item?.dataProvider?.[0] || item?.edmProvider?.[0] || '',
        source: 'Europeana',
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
  const [prefsVersion, setPrefsVersion] = useState(0)
  const [, setPreferenceVersion] = useState(0)
  const rotateRef                 = useRef<ReturnType<typeof setInterval> | null>(null)
  const failedIdsRef              = useRef<Set<number>>(new Set())
  const prefsRef                  = useRef<ArtworkPreferences>({})

  useEffect(() => {
    prefsRef.current = loadPrefs()
  }, [])

  useEffect(() => {
    function handlePrefsChanged() {
      setPrefsVersion(version => version + 1)
    }

    function handleStorage(event: StorageEvent) {
      if (event.key === ART_FEED_PREFS_KEY) {
        setPrefsVersion(version => version + 1)
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener(ART_FEED_PREFS_UPDATED_EVENT, handlePrefsChanged as EventListener)
      window.addEventListener('storage', handleStorage)
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener(ART_FEED_PREFS_UPDATED_EVENT, handlePrefsChanged as EventListener)
        window.removeEventListener('storage', handleStorage)
      }
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const prefs = loadArtFeedPrefs()
        const keywordTerms = prefs.feedMode === 'curated'
          ? prefs.keywords.map(keyword => keyword.trim().toLowerCase()).filter(Boolean)
          : []
        const { metQs, articQs, europeanaQs, mediumFilter, yearFrom, yearTo } = buildQueriesFromPrefs(prefs)
        const strictMediaFilter = prefs.mediaTypes.length > 0

        const fetchCombined = async (activeMediumFilter: RegExp | null) => {
          const fetches = [
            ...metQs.map(q => fetchFromMet(q, activeMediumFilter)),
            ...articQs.map(q => fetchFromArtic(q, activeMediumFilter)),
            ...europeanaQs.map(q => fetchFromEuropeana(q, activeMediumFilter, strictMediaFilter)),
          ]
          const results = await Promise.all(fetches)
          let merged: Artwork[] = results.flat()

          // Deduplicate by id
          const seen = new Set<number>()
          merged = merged.filter((a: Artwork) => {
            if (seen.has(a.id)) return false
            seen.add(a.id)
            return true
          })

          // Year range filter
          if (yearFrom !== null || yearTo !== null) {
            merged = merged.filter((a: Artwork) => {
              if (!a.date) return true
              const year = parseInt(a.date)
              if (isNaN(year)) return true
              if (yearFrom !== null && year < yearFrom) return false
              if (yearTo !== null && year > yearTo) return false
              return true
            })
          }

          if (keywordTerms.length > 0) {
            const keywordMatched = merged.filter((artwork: Artwork) => matchesAnyKeyword(artwork, keywordTerms))
            if (keywordMatched.length > 0) merged = keywordMatched
          }

          return merged
        }

        let combined = await fetchCombined(mediumFilter)

        // If keyword-only search finds nothing under painted-medium defaults, retry without medium restriction.
        if (combined.length === 0 && prefs.mediaTypes.length === 0) {
          combined = await fetchCombined(null)
        }

        if (!cancelled && combined.length > 0) {
          setArtworks(shuffled(combined))
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
  }, [prefsVersion])

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
    setPreferenceVersion(v => v + 1)
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
