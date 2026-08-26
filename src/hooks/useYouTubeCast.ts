import { useState, useEffect, useCallback } from 'react'
import {
  getStoredCastState,
  saveStoredCastState,
  addCastStateListener,
  initCastRealtimeChannel,
  castPlay,
  castPause,
  castResume,
  castStop,
  castSeek,
  castSetVolume,
  castSelectDevice,
  castAddToQueue,
  castPlayNext,
  castClearQueue,
  castSetShuffle,
  castSetRepeat,
  YOUTUBE_CAST_DOM_EVENT,
  type YouTubeCastState,
  type YouTubeTrack,
} from '../utils/youtubeCastSync'
import { searchYouTubeMusic, POPULAR_CURATED_TRACKS } from '../lib/youtubeMusicApi'

export function useYouTubeCast() {
  const [state, setState] = useState<YouTubeCastState>(getStoredCastState)
  const [searchResults, setSearchResults] = useState<YouTubeTrack[]>(POPULAR_CURATED_TRACKS)
  const [searching, setSearching] = useState(false)

  // Sync state from events & realtime
  useEffect(() => {
    initCastRealtimeChannel()

    const unbindListener = addCastStateListener(newState => {
      setState(newState)
    })

    function handleDomEvent(e: Event) {
      const customEvent = e as CustomEvent<YouTubeCastState>
      if (customEvent.detail) {
        setState(customEvent.detail)
      }
    }

    window.addEventListener(YOUTUBE_CAST_DOM_EVENT, handleDomEvent)

    return () => {
      unbindListener()
      window.removeEventListener(YOUTUBE_CAST_DOM_EVENT, handleDomEvent)
    }
  }, [])

  // Local progress ticker when playing
  useEffect(() => {
    if (!state.isPlaying || !state.track) return

    const interval = setInterval(() => {
      setState(prev => {
        if (!prev.isPlaying || !prev.track) return prev
        const nextMs = prev.progressMs + 1000
        if (nextMs >= prev.durationMs) {
          // Auto advance queue
          if (prev.queue.length > 0) {
            const nextTrack = prev.queue[0]
            const remaining = prev.queue.slice(1)
            const updated = saveStoredCastState({
              track: nextTrack,
              progressMs: 0,
              durationMs: nextTrack.durationMs,
              queue: remaining,
            })
            return updated
          }
          return { ...prev, progressMs: prev.durationMs, isPlaying: false }
        }
        return { ...prev, progressMs: nextMs }
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [state.isPlaying, state.track])

  const play = useCallback(async (track: YouTubeTrack, deviceId?: string) => {
    const updated = await castPlay(track, deviceId)
    setState(updated)
  }, [])

  const pause = useCallback(async () => {
    const updated = await castPause()
    setState(updated)
  }, [])

  const resume = useCallback(async () => {
    const updated = await castResume()
    setState(updated)
  }, [])

  const stop = useCallback(async () => {
    const updated = await castStop()
    setState(updated)
  }, [])

  const seek = useCallback(async (positionMs: number) => {
    const updated = await castSeek(positionMs)
    setState(updated)
  }, [])

  const setVolume = useCallback(async (volumePct: number) => {
    const updated = await castSetVolume(volumePct)
    setState(updated)
  }, [])

  const selectDevice = useCallback(async (deviceId: string) => {
    const updated = await castSelectDevice(deviceId)
    setState(updated)
  }, [])

  const addToQueue = useCallback(async (track: YouTubeTrack) => {
    const updated = await castAddToQueue(track)
    setState(updated)
  }, [])

  const playNext = useCallback(async (track: YouTubeTrack) => {
    const updated = await castPlayNext(track)
    setState(updated)
  }, [])

  const clearQueue = useCallback(async () => {
    const updated = await castClearQueue()
    setState(updated)
  }, [])

  const setShuffle = useCallback(async (shuffle: boolean) => {
    const updated = await castSetShuffle(shuffle)
    setState(updated)
  }, [])

  const setRepeat = useCallback(async (repeatMode: 0 | 1 | 2) => {
    const updated = await castSetRepeat(repeatMode)
    setState(updated)
  }, [])

  const next = useCallback(async () => {
    if (state.queue.length > 0) {
      const nextTrack = state.queue[0]
      const remaining = state.queue.slice(1)
      const updated = saveStoredCastState({
        track: nextTrack,
        progressMs: 0,
        durationMs: nextTrack.durationMs,
        queue: remaining,
        isPlaying: true,
      })
      setState(updated)
      await castPlay(nextTrack)
    } else {
      await pause()
    }
  }, [state.queue, pause])

  const previous = useCallback(async () => {
    if (state.progressMs > 3000) {
      await seek(0)
    } else {
      await seek(0)
    }
  }, [state.progressMs, seek])

  const search = useCallback(async (query: string) => {
    setSearching(true)
    try {
      const results = await searchYouTubeMusic(query)
      setSearchResults(results)
    } catch (err) {
      console.warn('[useYouTubeCast] Search error:', err)
    } finally {
      setSearching(false)
    }
  }, [])

  const activeDevice = state.devices.find(d => d.id === state.activeDeviceId) || state.devices[0]

  return {
    state,
    devices: state.devices,
    activeDevice,
    queue: state.queue,
    ready: true,
    searching,
    searchResults,
    play,
    pause,
    resume,
    stop,
    seek,
    setVolume,
    selectDevice,
    addToQueue,
    playNext,
    clearQueue,
    setShuffle,
    setRepeat,
    next,
    previous,
    search,
  }
}
