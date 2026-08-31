import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { buildArtworkFeed, type SignatureConfig } from '../lib/artModeLibrary'
import { usePersonalArtModeData } from './usePersonalArtMode'
import { useScreensaverSettings } from './useScreensaverSettings'
import { generateAdaptiveMatColor, DEFAULT_DOMINANT_COLOR, DEFAULT_MAT_COLOR } from '../utils/colorUtils'

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

export interface ArtworkMetadataCache {
  aspectRatio: number
  dominantColor: string
  matColor: string
}

export const artworkMetadataCache = new Map<string, ArtworkMetadataCache>()

/**
 * Pre-fetches and GPU pre-decodes an artwork image in background memory,
 * caching its natural aspect ratio and adaptive museum mat color.
 */
export async function prefetchAndDecodeArtwork(imageUrl: string): Promise<ArtworkMetadataCache | null> {
  if (!imageUrl || typeof window === 'undefined') return null
  const cached = artworkMetadataCache.get(imageUrl)
  if (cached) return cached

  return new Promise((resolve) => {
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    let settled = false

    const finish = async (ratio: number) => {
      if (settled) return
      settled = true
      try {
        if ('decode' in img) {
          await img.decode().catch(() => {})
        }
      } catch {
        // Non-fatal decode error fallback
      }
      let dominant = DEFAULT_DOMINANT_COLOR
      let matColor = DEFAULT_MAT_COLOR
      try {
        const analysis = await generateAdaptiveMatColor(imageUrl)
        dominant = analysis.dominant
        matColor = analysis.matColor
      } catch {
        // Fallback
      }
      const data: ArtworkMetadataCache = {
        aspectRatio: ratio,
        dominantColor: dominant,
        matColor,
      }
      artworkMetadataCache.set(imageUrl, data)
      resolve(data)
    }

    img.onload = () => {
      const ratio = (img.naturalWidth && img.naturalHeight)
        ? img.naturalWidth / img.naturalHeight
        : 16 / 9
      void finish(ratio)
    }
    img.onerror = () => {
      if (!settled) {
        settled = true
        resolve(null)
      }
    }
    img.src = imageUrl
  })
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
    aspectRatio: 1.51,
  },
  {
    id: 11125,
    title: 'Inside the Bar',
    artist: 'Winslow Homer',
    imageUrl: 'https://images.metmuseum.org/CRDImages/ad/original/ap54.183.jpg',
    date: '1883',
    medium: 'Watercolor',
    aspectRatio: 1.38,
  },
  {
    id: 11051,
    title: 'Hummingbird and Apple Blossoms',
    artist: 'Martin Johnson Heade',
    imageUrl: 'https://images.metmuseum.org/CRDImages/ad/original/DT9511.jpg',
    date: '1875',
    medium: 'Oil on canvas',
    aspectRatio: 1.0,
  },
  {
    id: 11052,
    title: 'Orchid with Two Hummingbirds',
    artist: 'Martin Johnson Heade',
    imageUrl: 'https://images.metmuseum.org/CRDImages/ad/original/DT1532.jpg',
    date: '1871',
    medium: 'Oil on canvas',
    aspectRatio: 1.0,
  },
  {
    id: 10482,
    title: 'Water Lilies',
    artist: 'Claude Monet',
    imageUrl: 'https://images.metmuseum.org/CRDImages/ep/original/DP-25465-001.jpg',
    date: '1919',
    medium: 'Oil on canvas',
    aspectRatio: 1.0,
  },
  {
    id: ARTIC_OFFSET + 64724,
    title: 'The Home of the Heron',
    artist: 'George Inness',
    imageUrl: `${ARTIC_IIIF}/0f2d999d-0173-2935-a6d0-0175bb97b2a9/full/1200,/0/default.jpg`,
    date: '1893',
    medium: 'Oil on canvas',
    aspectRatio: 1.34,
  },
]

export type PresentationUnit =
  | { id: string; type: 'single'; artwork: Artwork }
  | { id: string; type: 'diptych'; left: Artwork; right: Artwork }

export function isSquareArtwork(artwork: Artwork | null | undefined): boolean {
  if (!artwork) return false
  if (typeof artwork.aspectRatio === 'number' && !isNaN(artwork.aspectRatio) && artwork.aspectRatio > 0) {
    return artwork.aspectRatio >= 0.88 && artwork.aspectRatio <= 1.14
  }
  if (artwork.imageUrl) {
    const cached = artworkMetadataCache.get(artwork.imageUrl)
    if (cached && typeof cached.aspectRatio === 'number' && cached.aspectRatio > 0) {
      return cached.aspectRatio >= 0.88 && cached.aspectRatio <= 1.14
    }
  }
  return false
}

export function buildPresentationUnits(
  artworks: Artwork[],
  aspectRatioMode: 'mixed' | 'diptych_only' | 'single_only' = 'mixed',
): PresentationUnit[] {
  if (!artworks || artworks.length === 0) return []

  if (aspectRatioMode === 'single_only') {
    return artworks.map(art => ({
      id: `single-${art.id}`,
      type: 'single' as const,
      artwork: art,
    }))
  }

  if (aspectRatioMode === 'diptych_only') {
    const squareCandidates = artworks.filter(isSquareArtwork)
    const pool = squareCandidates.length >= 2 ? squareCandidates : artworks
    const units: PresentationUnit[] = []
    for (let i = 0; i < pool.length; i += 2) {
      const left = pool[i]
      const right = pool[i + 1] ?? pool[0]
      units.push({
        id: `diptych-${left.id}-${right.id}`,
        type: 'diptych' as const,
        left,
        right,
      })
    }
    return units
  }

  // Mixed Mode (Default):
  // Collect squares and singles
  const squares: Artwork[] = []
  const singles: Artwork[] = []

  for (const art of artworks) {
    if (isSquareArtwork(art)) {
      squares.push(art)
    } else {
      singles.push(art)
    }
  }

  const diptychUnits: PresentationUnit[] = []
  for (let i = 0; i < squares.length; i += 2) {
    const left = squares[i]
    const right = squares[i + 1] ?? squares[0]
    diptychUnits.push({
      id: `diptych-${left.id}-${right.id}`,
      type: 'diptych' as const,
      left,
      right,
    })
  }

  const singleUnits: PresentationUnit[] = singles.map(art => ({
    id: `single-${art.id}`,
    type: 'single' as const,
    artwork: art,
  }))

  const interleaved: PresentationUnit[] = []
  const maxLen = Math.max(singleUnits.length, diptychUnits.length)
  for (let i = 0; i < maxLen; i++) {
    if (singleUnits[i]) interleaved.push(singleUnits[i])
    if (diptychUnits[i]) interleaved.push(diptychUnits[i])
  }

  return interleaved.length > 0 ? interleaved : artworks.map(art => ({
    id: `single-${art.id}`,
    type: 'single' as const,
    artwork: art,
  }))
}

export interface Artwork {
  id: number | string
  title: string
  artist: string
  imageUrl: string
  date?: string
  medium?: string
  origin?: string
  location?: string
  dateTaken?: string
  description?: string
  subjects?: string
  funFact?: string
  signature?: SignatureConfig
  aspectRatio?: number
  dominantColor?: string
  matColor?: string
}

type ArtworkPreference = 'up' | 'down'
type ArtworkPreferences = Record<string, ArtworkPreference>
const PREFS_KEY = 'artwork-preferences-v1'
const ART_SHUFFLE_STORAGE_KEY = 'casa_art_playback_deck_v2'

interface StoredDeckState {
  sourceMode: string
  isShuffled: boolean
  deckIds: (string | number)[]
  deckIndex: number
  lastPlayedId: string | number | null
  updatedAt: number
}

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
      if (k && (v === 'up' || v === 'down')) out[k] = v
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

function generateShuffledDeck(
  ids: (string | number)[],
  lastPlayedId: string | number | null = null,
): (string | number)[] {
  if (ids.length <= 1) return [...ids]
  const deck = [...ids]
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  // Ensure the first item of the new cycle is not the same as the last item of the previous cycle
  if (lastPlayedId != null && deck.length > 1 && String(deck[0]) === String(lastPlayedId)) {
    const swapIdx = 1 + Math.floor(Math.random() * (deck.length - 1))
    ;[deck[0], deck[swapIdx]] = [deck[swapIdx], deck[0]]
  }
  return deck
}

function loadStoredDeck(
  sourceMode: string,
  shuffle: boolean,
  availableIds: (string | number)[],
): { deckIds: (string | number)[]; deckIndex: number; lastPlayedId: string | number | null } {
  if (availableIds.length === 0) {
    return { deckIds: [], deckIndex: 0, lastPlayedId: null }
  }

  try {
    const raw = localStorage.getItem(ART_SHUFFLE_STORAGE_KEY)
    if (raw) {
      const parsed: StoredDeckState = JSON.parse(raw)
      if (
        parsed &&
        parsed.sourceMode === sourceMode &&
        parsed.isShuffled === shuffle &&
        Array.isArray(parsed.deckIds)
      ) {
        const availableSet = new Set(availableIds.map(String))
        const existingValidIds = parsed.deckIds.filter(id => availableSet.has(String(id)))
        const existingSet = new Set(existingValidIds.map(String))
        const newIds = availableIds.filter(id => !existingSet.has(String(id)))

        if (existingValidIds.length > 0) {
          let updatedDeck = existingValidIds
          let updatedIndex = Math.max(0, Math.min(parsed.deckIndex ?? 0, existingValidIds.length))

          // If new photos were added to the library, merge them into the unplayed deck portion
          if (newIds.length > 0) {
            const played = updatedDeck.slice(0, updatedIndex)
            const remaining = shuffle
              ? shuffled([...updatedDeck.slice(updatedIndex), ...newIds])
              : [...updatedDeck.slice(updatedIndex), ...newIds]
            updatedDeck = [...played, ...remaining]
          }

          // If the previous cycle finished, generate the next cycle
          if (updatedIndex >= updatedDeck.length) {
            updatedDeck = shuffle
              ? generateShuffledDeck(availableIds, parsed.lastPlayedId)
              : [...availableIds]
            updatedIndex = 0
          }

          return {
            deckIds: updatedDeck,
            deckIndex: updatedIndex,
            lastPlayedId: parsed.lastPlayedId ?? null,
          }
        }
      }
    }
  } catch (e) {
    console.error('Failed to load stored art playback deck:', e)
  }

  // Brand new deck
  const newDeck = shuffle ? generateShuffledDeck(availableIds, null) : [...availableIds]
  return {
    deckIds: newDeck,
    deckIndex: 0,
    lastPlayedId: null,
  }
}

function saveStoredDeck(state: StoredDeckState) {
  try {
    localStorage.setItem(ART_SHUFFLE_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Ignore storage quota errors
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

export function useArtwork(rotateSecs = 240, shuffle = true) {
  const [casaArtworks, setCasaArtworks] = useState<Artwork[]>([])
  const [deckState, setDeckState] = useState<{ deckIds: (string | number)[]; deckIndex: number }>({
    deckIds: [],
    deckIndex: 0,
  })
  const [loaded, setLoaded] = useState(false)
  const [, setPrefsVersion] = useState(0)
  const rotateRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const failedIdsRef = useRef<Set<string | number>>(new Set())
  const prefsRef = useRef<ArtworkPreferences>({})
  const lastPlayedIdRef = useRef<string | number | null>(null)

  const {
    artworks: personalArtwork,
    sourceMode,
    loading: personalArtworkLoading,
  } = usePersonalArtModeData()

  useEffect(() => {
    prefsRef.current = loadPrefs()
  }, [])

  useEffect(() => {
    if (sourceMode === 'personal') return
    let cancelled = false
    async function load() {
      try {
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
        const seen = new Set<Artwork['id']>()
        const all = combined.filter(a => {
          if (seen.has(a.id)) return false
          seen.add(a.id)
          return true
        })

        if (!cancelled && all.length > 0) {
          setCasaArtworks(all)
        } else if (!cancelled) {
          setCasaArtworks(FALLBACKS)
        }
      } catch (e) {
        console.error('Failed to load artwork:', e)
        if (!cancelled) {
          setCasaArtworks(FALLBACKS)
        }
      }
    }
    load()
    return () => { cancelled = true }
  }, [sourceMode])

  // Build the complete available feed
  const rawFeed: Artwork[] = useMemo(() => {
    if (personalArtworkLoading && personalArtwork.length === 0 && sourceMode === 'personal') {
      return []
    }
    const personal: Artwork[] = personalArtwork.map(item => {
      const isSquare = item.aspectFormat === 'square_1_1' || item.storagePath.includes('_1x1')
      const isWide = item.aspectFormat === 'widescreen_16_9' || item.storagePath.includes('_16x9')
      return {
        id: item.id,
        title: item.title,
        artist: item.artist || 'Personal collection',
        imageUrl: item.imageUrl,
        medium: item.medium || 'Color photograph',
        location: item.location,
        dateTaken: item.dateTaken,
        description: item.description,
        subjects: item.subjects,
        funFact: item.funFact,
        date: item.dateTaken,
        aspectRatio: isSquare ? 1.0 : isWide ? 16 / 9 : undefined,
        signature: item.signatureEnabled
          ? {
              enabled: true,
              text: item.signatureText || item.artist || 'Personal collection',
              style: item.signatureStyle || 'draft',
              position: item.signaturePosition || 'bottom-right',
              color: item.signatureColor || 'light',
              size: item.signatureSize || 'xs',
              opacity: item.signatureOpacity ?? 0.75,
            }
          : undefined,
      }
    })
    return buildArtworkFeed(
      sourceMode,
      casaArtworks.length > 0 ? casaArtworks : (sourceMode === 'casa' ? FALLBACKS : []),
      personal,
    )
  }, [casaArtworks, personalArtwork, personalArtworkLoading, sourceMode])

  const { settings } = useScreensaverSettings()
  const disabledArtworkIds = useMemo(
    () => new Set((settings.disabledArtworkIds ?? []).map(String)),
    [settings.disabledArtworkIds],
  )

  // Filter out any known failed IDs and disabled artwork IDs
  const activeFeed = useMemo(() => {
    return rawFeed.filter(
      a => !failedIdsRef.current.has(a.id) && !disabledArtworkIds.has(String(a.id)),
    )
  }, [rawFeed, disabledArtworkIds])

  // Build presentation units (single vs diptych pairs) based on settings.aspectRatioMode
  const presentationUnits = useMemo(() => {
    return buildPresentationUnits(activeFeed, settings.aspectRatioMode ?? 'mixed')
  }, [activeFeed, settings.aspectRatioMode])

  const presentationUnitMap = useMemo(() => {
    const map = new Map<string, PresentationUnit>()
    for (const unit of presentationUnits) {
      map.set(unit.id, unit)
    }
    return map
  }, [presentationUnits])

  const availableUnitIds = useMemo(() => presentationUnits.map(u => u.id), [presentationUnits])

  // Synchronize deck whenever available items, sourceMode, aspectRatioMode, or shuffle changes
  useEffect(() => {
    if (availableUnitIds.length === 0) {
      setDeckState({ deckIds: [], deckIndex: 0 })
      return
    }

    const deckStorageKey = `${sourceMode}_${settings.aspectRatioMode ?? 'mixed'}`
    const { deckIds: syncedDeck, deckIndex: syncedIndex, lastPlayedId } = loadStoredDeck(
      deckStorageKey,
      shuffle,
      availableUnitIds,
    )

    lastPlayedIdRef.current = lastPlayedId
    setDeckState({ deckIds: syncedDeck, deckIndex: syncedIndex })
  }, [availableUnitIds, sourceMode, shuffle, settings.aspectRatioMode])

  const deck = deckState.deckIds
  const deckIndex = deckState.deckIndex

  // Current active presentation unit
  const currentUnitId = deck[deckIndex]
  const currentUnit: PresentationUnit | null =
    (currentUnitId != null ? presentationUnitMap.get(String(currentUnitId)) : null) ??
    presentationUnits[0] ??
    null

  const currentArtwork: Artwork | null = currentUnit
    ? currentUnit.type === 'single'
      ? currentUnit.artwork
      : currentUnit.left
    : (activeFeed[0] ?? null)

  const diptychArtworks = currentUnit && currentUnit.type === 'diptych'
    ? { left: currentUnit.left, right: currentUnit.right }
    : null

  // Next upcoming presentation unit for pre-rendering / pre-decoding
  const nextUnitId = deck.length > 1 ? deck[(deckIndex + 1) % deck.length] : null
  const nextUnit: PresentationUnit | null =
    nextUnitId != null ? (presentationUnitMap.get(String(nextUnitId)) ?? null) : null

  const nextArtwork: Artwork | null = nextUnit
    ? nextUnit.type === 'single'
      ? nextUnit.artwork
      : nextUnit.left
    : null

  // Trigger background pre-fetching and GPU decoding for upcoming pieces in the deck
  useEffect(() => {
    if (typeof window === 'undefined' || deck.length === 0) return

    const toPreload: string[] = []
    if (currentUnit) {
      if (currentUnit.type === 'single' && currentUnit.artwork.imageUrl) {
        toPreload.push(currentUnit.artwork.imageUrl)
      } else if (currentUnit.type === 'diptych') {
        if (currentUnit.left.imageUrl) toPreload.push(currentUnit.left.imageUrl)
        if (currentUnit.right.imageUrl) toPreload.push(currentUnit.right.imageUrl)
      }
    }
    if (nextUnit) {
      if (nextUnit.type === 'single' && nextUnit.artwork.imageUrl) {
        toPreload.push(nextUnit.artwork.imageUrl)
      } else if (nextUnit.type === 'diptych') {
        if (nextUnit.left.imageUrl) toPreload.push(nextUnit.left.imageUrl)
        if (nextUnit.right.imageUrl) toPreload.push(nextUnit.right.imageUrl)
      }
    }

    for (const url of toPreload) {
      void prefetchAndDecodeArtwork(url)
    }
  }, [deck, deckIndex, currentUnit, nextUnit])

  const advance = useCallback((direction: 'next' | 'prev' = 'next') => {
    if (availableUnitIds.length <= 1) return

    const deckStorageKey = `${sourceMode}_${settings.aspectRatioMode ?? 'mixed'}`

    setDeckState(prev => {
      const currentDeck = prev.deckIds.length > 0 ? prev.deckIds : availableUnitIds
      const currentIndex = Math.max(0, Math.min(prev.deckIndex, currentDeck.length - 1))
      const playedId = currentDeck[currentIndex]
      lastPlayedIdRef.current = playedId ?? null

      if (direction === 'prev') {
        const nextIndex = currentIndex - 1 < 0 ? currentDeck.length - 1 : currentIndex - 1
        saveStoredDeck({
          sourceMode: deckStorageKey,
          isShuffled: shuffle,
          deckIds: currentDeck,
          deckIndex: nextIndex,
          lastPlayedId: playedId ?? null,
          updatedAt: Date.now(),
        })
        return { deckIds: currentDeck, deckIndex: nextIndex }
      }

      const nextIndex = currentIndex + 1
      // If we reached the end of the deck, start the next complete non-repeating cycle!
      if (nextIndex >= currentDeck.length) {
        const nextDeck = shuffle
          ? generateShuffledDeck(availableUnitIds, playedId)
          : [...availableUnitIds]

        saveStoredDeck({
          sourceMode: deckStorageKey,
          isShuffled: shuffle,
          deckIds: nextDeck,
          deckIndex: 0,
          lastPlayedId: playedId ?? null,
          updatedAt: Date.now(),
        })

        return { deckIds: nextDeck, deckIndex: 0 }
      }

      saveStoredDeck({
        sourceMode: deckStorageKey,
        isShuffled: shuffle,
        deckIds: currentDeck,
        deckIndex: nextIndex,
        lastPlayedId: playedId ?? null,
        updatedAt: Date.now(),
      })

      return { deckIds: currentDeck, deckIndex: nextIndex }
    })
  }, [availableUnitIds, shuffle, sourceMode, settings.aspectRatioMode])

  const resetRotateTimer = useCallback(() => {
    if (rotateRef.current) clearInterval(rotateRef.current)
    if (availableUnitIds.length > 1) {
      rotateRef.current = setInterval(() => {
        advance('next')
      }, rotateSecs * 1000)
    }
  }, [availableUnitIds.length, rotateSecs, advance])

  // Auto-rotate timer
  useEffect(() => {
    resetRotateTimer()
    return () => {
      if (rotateRef.current) clearInterval(rotateRef.current)
    }
  }, [resetRotateTimer])

  const onLoad = useCallback(() => setLoaded(true), [])

  const onError = useCallback(() => {
    if (currentArtwork?.id != null) {
      failedIdsRef.current.add(currentArtwork.id)
    }
    advance('next')
  }, [advance, currentArtwork?.id])

  const next = useCallback(() => {
    advance('next')
    resetRotateTimer()
  }, [advance, resetRotateTimer])

  const prev = useCallback(() => {
    advance('prev')
    resetRotateTimer()
  }, [advance, resetRotateTimer])

  const setPreference = useCallback((artworkId: Artwork['id'], preference: ArtworkPreference) => {
    const nextPrefs: ArtworkPreferences = { ...prefsRef.current, [String(artworkId)]: preference }
    prefsRef.current = nextPrefs
    savePrefs(nextPrefs)
    setPrefsVersion(v => v + 1)
  }, [])

  const currentPreference = currentArtwork ? prefsRef.current[String(currentArtwork.id)] : undefined

  return {
    presentationUnit: currentUnit,
    artwork: currentArtwork,
    diptychArtworks,
    nextPresentationUnit: nextUnit,
    nextArtwork,
    loaded,
    onLoad,
    onError,
    next,
    prev,
    total: presentationUnits.length,
    deckProgress: deck.length > 0 ? { current: deckIndex + 1, total: deck.length } : null,
    setPreference,
    currentPreference,
  }
}

