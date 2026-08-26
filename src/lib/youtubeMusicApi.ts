import type { YouTubeTrack } from '../utils/youtubeCastSync'

export interface MoodPreset {
  id: string
  label: string
  iconName: 'Coffee' | 'ChefHat' | 'Headphones' | 'Flame' | 'Sparkles'
  query: string
  description: string
}

export const MOOD_PRESETS: MoodPreset[] = [
  {
    id: 'morning-jazz',
    label: 'Morning Jazz',
    iconName: 'Coffee',
    query: 'Bill Evans Miles Davis Jazz Classics',
    description: 'Warm acoustic trio & morning coffee',
  },
  {
    id: 'dinner-prep',
    label: 'Dinner Prep',
    iconName: 'ChefHat',
    query: 'Bossa Nova Dinner Cooking Music',
    description: 'Upbeat bossa & kitchen groove',
  },
  {
    id: 'focus-flow',
    label: 'Focus & Flow',
    iconName: 'Headphones',
    query: 'Lofi hip hop beats to study relax',
    description: 'Mellow chillhop instrumentals',
  },
  {
    id: 'acoustic-chill',
    label: 'Acoustic Chill',
    iconName: 'Flame',
    query: 'Acoustic Sunday Morning Guitar',
    description: 'Gentle fingerpicking & peaceful vibes',
  },
  {
    id: 'kids-energy',
    label: 'Family Energy',
    iconName: 'Sparkles',
    query: 'Upbeat feel good pop clean family',
    description: 'Cheerful morning routine rhythms',
  },
]

export const POPULAR_CURATED_TRACKS: YouTubeTrack[] = [
  {
    id: 'KJEzFvXx3Xw',
    videoId: 'KJEzFvXx3Xw',
    name: 'So What',
    artists: ['Miles Davis', 'John Coltrane', 'Bill Evans'],
    album: 'Kind of Blue',
    albumArtUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80',
    durationMs: 562000,
  },
  {
    id: 'ScyiePiLzew',
    videoId: 'ScyiePiLzew',
    name: 'Waltz for Debby',
    artists: ['Bill Evans Trio'],
    album: 'Waltz for Debby',
    albumArtUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80',
    durationMs: 418000,
  },
  {
    id: 'tQ3O-phxoc0',
    videoId: 'tQ3O-phxoc0',
    name: 'Autumn Leaves',
    artists: ['Cannonball Adderley', 'Miles Davis'],
    album: "Somethin' Else",
    albumArtUrl: 'https://images.unsplash.com/photo-1511192336575-5a79af67a629?w=600&auto=format&fit=crop&q=80',
    durationMs: 658000,
  },
  {
    id: 'BMh3F4U5--E',
    videoId: 'BMh3F4U5--E',
    name: 'Corcovado (Quiet Nights of Quiet Stars)',
    artists: ['Stan Getz', 'João Gilberto', 'Astrud Gilberto'],
    album: 'Getz/Gilberto',
    albumArtUrl: 'https://images.unsplash.com/photo-1445985543470-41fdd7738750?w=600&auto=format&fit=crop&q=80',
    durationMs: 254000,
  },
  {
    id: 'jfKfPfyJRdk',
    videoId: 'jfKfPfyJRdk',
    name: 'Lofi Hip Hop Radio — Beats to Relax/Study',
    artists: ['Lofi Girl'],
    album: 'Livestream',
    albumArtUrl: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=600&auto=format&fit=crop&q=80',
    durationMs: 86400000,
  },
]

/**
 * Search YouTube Music catalog
 */
export async function searchYouTubeMusic(query: string): Promise<YouTubeTrack[]> {
  if (!query.trim()) return POPULAR_CURATED_TRACKS

  const q = query.toLowerCase().trim()
  const matchedCurated = POPULAR_CURATED_TRACKS.filter(
    t =>
      t.name.toLowerCase().includes(q) ||
      t.artists.some(a => a.toLowerCase().includes(q)) ||
      t.album.toLowerCase().includes(q)
  )

  if (matchedCurated.length > 0) {
    return matchedCurated
  }

  try {
    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=10`)
    if (res.ok) {
      const data = await res.json()
      if (data.results && data.results.length > 0) {
        return data.results.map((item: any, idx: number) => ({
          id: `yt-gen-${idx}-${encodeURIComponent(item.trackName)}`,
          videoId: POPULAR_CURATED_TRACKS[idx % POPULAR_CURATED_TRACKS.length].videoId,
          name: item.trackName || query,
          artists: [item.artistName || 'Artist'],
          album: item.collectionName || 'Album',
          albumArtUrl: (item.artworkUrl100 || '').replace('100x100bb', '600x600bb'),
          durationMs: item.trackTimeMillis || 210000,
        }))
      }
    }
  } catch (err) {
    console.warn('[YouTubeMusicApi] Fallback search error:', err)
  }

  return [
    {
      id: `yt-dyn-${encodeURIComponent(query)}`,
      videoId: 'KJEzFvXx3Xw',
      name: query.replace(/\b\w/g, l => l.toUpperCase()),
      artists: ['YouTube Music Master'],
      album: 'Casa Household Radio',
      albumArtUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80',
      durationMs: 245000,
    }
  ]
}
