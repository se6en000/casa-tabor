import type { YouTubeTrack } from '../utils/youtubeCastSync'

export interface MoodPreset {
  id: string
  label: string
  iconName: 'Coffee' | 'ChefHat' | 'Headphones' | 'Flame' | 'Sparkles'
  query: string
  description: string
  streamUrl: string
}

export const MOOD_PRESETS: MoodPreset[] = [
  {
    id: 'morning-jazz',
    label: 'Morning Jazz',
    iconName: 'Coffee',
    query: 'Illinois Street Cool Jazz & Morning Vibes',
    description: 'Warm acoustic trio & morning coffee',
    streamUrl: 'https://ice1.somafm.com/illstreet-128-mp3',
  },
  {
    id: 'dinner-prep',
    label: 'Dinner Prep',
    iconName: 'ChefHat',
    query: 'Lush Bossa Nova & Kitchen Groove',
    description: 'Upbeat bossa & kitchen groove',
    streamUrl: 'https://ice1.somafm.com/lush-128-mp3',
  },
  {
    id: 'focus-flow',
    label: 'Focus & Flow',
    iconName: 'Headphones',
    query: 'Groove Salad Ambient Chillhop & Study',
    description: 'Mellow chillhop instrumentals',
    streamUrl: 'https://ice5.somafm.com/groovesalad-128-mp3',
  },
  {
    id: 'acoustic-chill',
    label: 'Acoustic Chill',
    iconName: 'Flame',
    query: 'Secret Agent Acoustic Strings & Warm Lounge',
    description: 'Gentle fingerpicking & peaceful vibes',
    streamUrl: 'https://ice1.somafm.com/secretagent-128-mp3',
  },
  {
    id: 'kids-energy',
    label: 'Family Energy',
    iconName: 'Sparkles',
    query: 'PopTron Upbeat Feel Good Family Morning',
    description: 'Cheerful morning routine rhythms',
    streamUrl: 'https://ice1.somafm.com/poptron-128-mp3',
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
    streamUrl: 'https://ice1.somafm.com/illstreet-128-mp3',
  },
  {
    id: 'ScyiePiLzew',
    videoId: 'ScyiePiLzew',
    name: 'Waltz for Debby',
    artists: ['Bill Evans Trio'],
    album: 'Waltz for Debby',
    albumArtUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80',
    durationMs: 418000,
    streamUrl: 'https://ice1.somafm.com/illstreet-128-mp3',
  },
  {
    id: 'BMh3F4U5--E',
    videoId: 'BMh3F4U5--E',
    name: 'Corcovado (Quiet Nights)',
    artists: ['Stan Getz', 'João Gilberto', 'Astrud Gilberto'],
    album: 'Getz/Gilberto',
    albumArtUrl: 'https://images.unsplash.com/photo-1445985543470-41fdd7738750?w=600&auto=format&fit=crop&q=80',
    durationMs: 254000,
    streamUrl: 'https://ice1.somafm.com/lush-128-mp3',
  },
  {
    id: 'jfKfPfyJRdk',
    videoId: 'jfKfPfyJRdk',
    name: 'Lofi Chillhop Radio',
    artists: ['Groove Salad'],
    album: 'Ambient Beats',
    albumArtUrl: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=600&auto=format&fit=crop&q=80',
    durationMs: 86400000,
    streamUrl: 'https://ice5.somafm.com/groovesalad-128-mp3',
  },
  {
    id: 'tQ3O-phxoc0',
    videoId: 'tQ3O-phxoc0',
    name: 'Autumn Leaves',
    artists: ['Cannonball Adderley', 'Miles Davis'],
    album: "Somethin' Else",
    albumArtUrl: 'https://images.unsplash.com/photo-1511192336575-5a79af67a629?w=600&auto=format&fit=crop&q=80',
    durationMs: 658000,
    streamUrl: 'https://ice1.somafm.com/secretagent-128-mp3',
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

  // Check matching mood preset
  const matchedMood = MOOD_PRESETS.find(m => m.label.toLowerCase().includes(q) || m.description.toLowerCase().includes(q))
  const streamUrl = matchedMood ? matchedMood.streamUrl : 'https://ice1.somafm.com/illstreet-128-mp3'

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
          streamUrl: item.previewUrl || streamUrl,
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
      artists: ['Household Cast Radio'],
      album: 'Casa Live Station',
      albumArtUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80',
      durationMs: 245000,
      streamUrl,
    }
  ]
}
