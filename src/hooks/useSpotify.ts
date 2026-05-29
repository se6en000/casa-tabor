/**
 * useSpotify
 * Manages the Spotify Web Playback SDK (browser becomes a Connect device),
 * token lifecycle, and playback state polling.
 *
 * Usage:
 *   const spotify = useSpotify()
 *   spotify.play(), spotify.pause(), spotify.next(), etc.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { isAuthenticated, isTokenFresh, refreshAccessToken, getTokens, spotifyFetch } from '../lib/spotifyAuth'

// ── Types ─────────────────────────────────────────────────────────

export interface SpotifyTrack {
  id: string
  name: string
  artists: string[]
  album: string
  albumArtUrl: string
  durationMs: number
  uri: string
}

export interface SpotifyPlaybackState {
  isPlaying: boolean
  track: SpotifyTrack | null
  progressMs: number
  shuffle: boolean
  repeatMode: 0 | 1 | 2  // 0=off, 1=context, 2=track
  volumePct: number
}

export interface SpotifyDevice {
  id: string
  name: string
  type: string
  isActive: boolean
  volumePct: number
}

export interface SpotifyPlaylist {
  id: string
  name: string
  imageUrl: string
  trackCount: number
  uri: string
}

export interface UseSpotifyReturn {
  ready: boolean
  authed: boolean
  state: SpotifyPlaybackState | null
  devices: SpotifyDevice[]
  playlists: SpotifyPlaylist[]
  deviceId: string | null           // This browser's player device id
  play:         () => Promise<void>
  pause:        () => Promise<void>
  next:         () => Promise<void>
  previous:     () => Promise<void>
  seek:         (posMs: number) => Promise<void>
  setVolume:    (pct: number) => Promise<void>
  setShuffle:   (on: boolean) => Promise<void>
  setRepeat:    (mode: 0 | 1 | 2) => Promise<void>
  transferTo:   (deviceId: string) => Promise<void>
  playPlaylist: (uri: string) => Promise<void>
  refreshDevices: () => Promise<void>
}

// ── Module-level player singleton (survives React re-renders) ─────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _player: any = null
let _sdkLoaded = false
let _sdkLoading = false

function loadSdk(): Promise<void> {
  if (_sdkLoaded) return Promise.resolve()
  if (_sdkLoading) {
    return new Promise(resolve => {
      const orig = (window as Window & { onSpotifyWebPlaybackSDKReady?: () => void }).onSpotifyWebPlaybackSDKReady
      ;(window as Window & { onSpotifyWebPlaybackSDKReady?: () => void }).onSpotifyWebPlaybackSDKReady = () => {
        orig?.()
        resolve()
      }
    })
  }

  _sdkLoading = true
  return new Promise(resolve => {
    ;(window as Window & { onSpotifyWebPlaybackSDKReady?: () => void }).onSpotifyWebPlaybackSDKReady = () => {
      _sdkLoaded = true
      resolve()
    }
    const script = document.createElement('script')
    script.src = 'https://sdk.scdn.co/spotify-player.js'
    script.async = true
    document.head.appendChild(script)
  })
}

function trackFromSdkState(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sdkState: any,
): SpotifyTrack | null {
  const t = sdkState?.track_window?.current_track
  if (!t) return null
  return {
    id: t.id ?? '',
    name: t.name,
    artists: t.artists?.map((a: { name: string }) => a.name) ?? [],
    album: t.album?.name ?? '',
    albumArtUrl: t.album?.images?.[0]?.url ?? '',
    durationMs: t.duration_ms,
    uri: t.uri,
  }
}

// ── Hook ──────────────────────────────────────────────────────────

export function useSpotify(): UseSpotifyReturn {
  const authed = isAuthenticated()
  const [ready, setReady] = useState(false)
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [state, setState] = useState<SpotifyPlaybackState | null>(null)
  const [devices, setDevices] = useState<SpotifyDevice[]>([])
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([])
  const stateRef = useRef(state)
  stateRef.current = state

  // ── Init SDK + player ─────────────────────────────────────────
  useEffect(() => {
    if (!authed) return
    let cancelled = false

    async function init() {
      // Ensure token is fresh before handing to SDK
      if (!isTokenFresh()) await refreshAccessToken()
      await loadSdk()
      if (cancelled) return

      // Reuse existing player if already initialized
      if (_player) {
        setReady(true)
        return
      }

      const { accessToken } = getTokens()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Spotify = (window as any).Spotify
      const player = new Spotify.Player({
        name: 'Casa Tabor',
        volume: 0.8,
        getOAuthToken: async (cb: (token: string) => void) => {
          if (!isTokenFresh()) await refreshAccessToken()
          const { accessToken } = getTokens()
          cb(accessToken ?? '')
        },
      })

      player.addListener('ready', ({ device_id }: { device_id: string }) => {
        if (cancelled) return
        setDeviceId(device_id)
        setReady(true)
      })

      player.addListener('not_ready', () => {
        if (cancelled) return
        setReady(false)
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      player.addListener('player_state_changed', (sdkState: any) => {
        if (!sdkState || cancelled) return
        setState({
          isPlaying: !sdkState.paused,
          track: trackFromSdkState(sdkState),
          progressMs: sdkState.position,
          shuffle: sdkState.shuffle,
          repeatMode: sdkState.repeat_mode as 0 | 1 | 2,
          volumePct: 80,
        })
      })

      // Suppress non-fatal errors
      player.addListener('initialization_error', console.error)
      player.addListener('authentication_error', console.error)
      player.addListener('account_error', console.error)

      await player.connect()
      _player = player
      void accessToken // used above
    }

    void init()
    return () => { cancelled = true }
  }, [authed])

  // ── Poll progress (position) every second when playing ───────
  useEffect(() => {
    if (!ready || !state?.isPlaying) return
    const id = setInterval(() => {
      setState(prev => prev ? { ...prev, progressMs: prev.progressMs + 1000 } : prev)
    }, 1000)
    return () => clearInterval(id)
  }, [ready, state?.isPlaying])

  // ── Fetch devices + playlists on ready ────────────────────────
  const refreshDevices = useCallback(async () => {
    if (!authed) return
    try {
      const res = await spotifyFetch('/me/player/devices')
      if (!res.ok) return
      const data = await res.json()
      setDevices(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (data.devices ?? []).map((d: any) => ({
          id: d.id,
          name: d.name,
          type: d.type,
          isActive: d.is_active,
          volumePct: d.volume_percent,
        }))
      )
    } catch { /* ignore */ }
  }, [authed])

  useEffect(() => {
    if (!ready) return
    void refreshDevices()
    // Fetch playlists
    spotifyFetch('/me/playlists?limit=30').then(async res => {
      if (!res.ok) return
      const data = await res.json()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setPlaylists((data.items ?? []).map((p: any) => ({
        id: p.id,
        name: p.name,
        imageUrl: p.images?.[0]?.url ?? '',
        trackCount: p.tracks?.total ?? 0,
        uri: p.uri,
      })))
    }).catch(() => {})
  }, [ready, refreshDevices])

  // ── Playback controls ─────────────────────────────────────────
  const play        = useCallback(async () => { await _player?.resume() }, [])
  const pause       = useCallback(async () => { await _player?.pause() }, [])
  const next        = useCallback(async () => { await _player?.nextTrack() }, [])
  const previous    = useCallback(async () => { await _player?.previousTrack() }, [])
  const seek        = useCallback(async (posMs: number) => { await _player?.seek(posMs) }, [])

  const setVolume = useCallback(async (pct: number) => {
    await _player?.setVolume(pct / 100)
    setState(prev => prev ? { ...prev, volumePct: pct } : prev)
  }, [])

  const setShuffle = useCallback(async (on: boolean) => {
    await spotifyFetch(`/me/player/shuffle?state=${on}`, { method: 'PUT' }).catch(() => {})
    setState(prev => prev ? { ...prev, shuffle: on } : prev)
  }, [])

  const setRepeat = useCallback(async (mode: 0 | 1 | 2) => {
    const map = ['off', 'context', 'track'] as const
    await spotifyFetch(`/me/player/repeat?state=${map[mode]}`, { method: 'PUT' }).catch(() => {})
    setState(prev => prev ? { ...prev, repeatMode: mode } : prev)
  }, [])

  const transferTo = useCallback(async (id: string) => {
    await spotifyFetch('/me/player', {
      method: 'PUT',
      body: JSON.stringify({ device_ids: [id], play: true }),
    }).catch(() => {})
    void refreshDevices()
  }, [refreshDevices])

  const playPlaylist = useCallback(async (uri: string) => {
    const id = deviceId
    if (!id) return
    await spotifyFetch('/me/player/play' + (id ? `?device_id=${id}` : ''), {
      method: 'PUT',
      body: JSON.stringify({ context_uri: uri }),
    }).catch(() => {})
  }, [deviceId])

  return { ready, authed, state, devices, playlists, deviceId, play, pause, next, previous, seek, setVolume, setShuffle, setRepeat, transferTo, playPlaylist, refreshDevices }
}
