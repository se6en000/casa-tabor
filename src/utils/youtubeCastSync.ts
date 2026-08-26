import { supabase } from '../lib/supabase'

export const YOUTUBE_CAST_REALTIME_CHANNEL = 'casa-music-cast'
export const YOUTUBE_CAST_BROADCAST_EVENT = 'cast-command'
export const YOUTUBE_CAST_STATE_EVENT = 'cast-state'
export const YOUTUBE_CAST_DOM_EVENT = 'casa:cast-state-updated'
export const YOUTUBE_CAST_STORAGE_KEY = 'casa_youtube_cast_state'
export const YOUTUBE_CAST_DEVICES_SETTINGS_KEY = 'household_cast_devices'

export interface YouTubeTrack {
  id: string
  name: string
  artists: string[]
  album: string
  albumArtUrl: string
  durationMs: number
  videoId: string
}

export type CastDeviceType = 'speaker' | 'group' | 'display' | 'chromecast'

export interface CastDevice {
  id: string
  name: string
  model: string
  type: CastDeviceType
  ip?: string
  port?: number
  isActive: boolean
  groupMembers?: string[]
  isOnline?: boolean
}

export interface YouTubeCastState {
  isPlaying: boolean
  track: YouTubeTrack | null
  progressMs: number
  durationMs: number
  volumePct: number
  activeDeviceId: string | null
  activeDeviceName: string | null
  devices: CastDevice[]
  queue: YouTubeTrack[]
  shuffle: boolean
  repeatMode: 0 | 1 | 2
  isDiscovering?: boolean
}

export const KNOWN_HOUSEHOLD_DEVICES: CastDevice[] = [
  {
    id: 'nest-office-point',
    name: 'Office Point (Nest Wifi)',
    model: 'Nest Wifi point',
    type: 'speaker',
    ip: '192.168.87.244',
    port: 8009,
    isActive: true,
    isOnline: true,
  },
  {
    id: 'group-whole-house',
    name: 'Whole House Audio',
    model: 'Google Home Speaker Group',
    type: 'group',
    isActive: false,
    isOnline: true,
    groupMembers: ['Office Point', 'Living Room', 'Kitchen', 'Master Bedroom'],
  },
  {
    id: 'group-downstairs',
    name: 'Downstairs Audio',
    model: 'Google Home Speaker Group',
    type: 'group',
    isActive: false,
    isOnline: true,
    groupMembers: ['Living Room', 'Kitchen'],
  },
  {
    id: 'nest-living-room',
    name: 'Living Room Speaker',
    model: 'Google Nest Audio',
    type: 'speaker',
    isActive: false,
    isOnline: true,
  },
  {
    id: 'nest-kitchen-hub',
    name: 'Kitchen Display',
    model: 'Google Nest Hub (2nd Gen)',
    type: 'display',
    isActive: false,
    isOnline: true,
  },
  {
    id: 'nest-bedroom-mini',
    name: 'Master Bedroom',
    model: 'Google Nest Mini',
    type: 'speaker',
    isActive: false,
    isOnline: true,
  },
]

const DEFAULT_STATE: YouTubeCastState = {
  isPlaying: false,
  track: null,
  progressMs: 0,
  durationMs: 0,
  volumePct: 50,
  activeDeviceId: 'nest-office-point',
  activeDeviceName: 'Office Point (Nest Wifi)',
  devices: KNOWN_HOUSEHOLD_DEVICES,
  queue: [],
  shuffle: false,
  repeatMode: 0,
  isDiscovering: false,
}

// ── In-Memory & LocalStorage Cache ──────────────────────────────────────────

export function getStoredCastState(): YouTubeCastState {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return DEFAULT_STATE
  try {
    const raw = localStorage.getItem(YOUTUBE_CAST_STORAGE_KEY)
    if (!raw) return DEFAULT_STATE
    const parsed = JSON.parse(raw)
    return {
      ...DEFAULT_STATE,
      ...parsed,
      devices: parsed.devices && parsed.devices.length > 0 ? parsed.devices : KNOWN_HOUSEHOLD_DEVICES,
    }
  } catch {
    return DEFAULT_STATE
  }
}

export function saveStoredCastState(state: Partial<YouTubeCastState>): YouTubeCastState {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return DEFAULT_STATE
  try {
    const current = getStoredCastState()
    const updated = { ...current, ...state }
    localStorage.setItem(YOUTUBE_CAST_STORAGE_KEY, JSON.stringify(updated))
    window.dispatchEvent(new CustomEvent(YOUTUBE_CAST_DOM_EVENT, { detail: updated }))
    return updated
  } catch {
    return DEFAULT_STATE
  }
}

// ── Realtime Channel Singleton ──────────────────────────────────────────────

type StateListener = (state: YouTubeCastState) => void
const stateListeners = new Set<StateListener>()
let realtimeChannel: ReturnType<typeof supabase.channel> | null = null

export function initCastRealtimeChannel(): () => void {
  if (typeof window === 'undefined') return () => {}

  if (!realtimeChannel) {
    try {
      realtimeChannel = supabase.channel(YOUTUBE_CAST_REALTIME_CHANNEL, {
        config: { broadcast: { self: false } },
      })

      realtimeChannel
        .on(
          'broadcast' as any,
          { event: YOUTUBE_CAST_STATE_EVENT },
          (payload: { payload?: Partial<YouTubeCastState> }) => {
            if (payload?.payload) {
              const updated = saveStoredCastState(payload.payload)
              stateListeners.forEach(listener => {
                try {
                  listener(updated)
                } catch (e) {
                  console.warn('[YouTubeCastSync] Listener error:', e)
                }
              })
            }
          }
        )
        .subscribe()
    } catch (err) {
      console.warn('[YouTubeCastSync] Failed to initialize Supabase Realtime channel:', err)
    }
  }

  return () => {
    // Channel cleanup
  }
}

export function addCastStateListener(listener: StateListener): () => void {
  stateListeners.add(listener)
  return () => {
    stateListeners.delete(listener)
  }
}

// ── Command Dispatcher ──────────────────────────────────────────────────────

async function dispatchCastCommand(action: string, payload: Record<string, unknown> = {}) {
  const message = { action, ...payload, timestamp: Date.now() }

  // 1. Send via Supabase Realtime Broadcast
  if (realtimeChannel) {
    try {
      await realtimeChannel.send({
        type: 'broadcast',
        event: YOUTUBE_CAST_BROADCAST_EVENT,
        payload: message,
      })
    } catch (err) {
      console.warn('[YouTubeCastSync] Realtime broadcast error:', err)
    }
  }

  // 2. Send to local development bridge HTTP fallback if available
  if (typeof window !== 'undefined') {
    try {
      fetch('http://localhost:5891/api/cast/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      }).catch(() => {})
    } catch {}
  }
}

export async function discoverCastDevices(): Promise<CastDevice[]> {
  saveStoredCastState({ isDiscovering: true })
  await dispatchCastCommand('cast:discover_devices')

  // Try local bridge endpoint
  try {
    const res = await fetch('http://localhost:5891/api/cast/devices')
    if (res.ok) {
      const liveDevices: CastDevice[] = await res.json()
      if (liveDevices && liveDevices.length > 0) {
        const merged = mergeDevices(liveDevices, KNOWN_HOUSEHOLD_DEVICES)
        saveStoredCastState({ devices: merged, isDiscovering: false })
        return merged
      }
    }
  } catch {}

  // Merge known household devices & groups
  const current = getStoredCastState()
  const updated = mergeDevices(current.devices, KNOWN_HOUSEHOLD_DEVICES)
  saveStoredCastState({ devices: updated, isDiscovering: false })
  return updated
}

function mergeDevices(a: CastDevice[], b: CastDevice[]): CastDevice[] {
  const map = new Map<string, CastDevice>()
  for (const d of a) map.set(d.id, d)
  for (const d of b) {
    if (!map.has(d.id)) {
      map.set(d.id, d)
    } else {
      map.set(d.id, { ...map.get(d.id)!, ...d })
    }
  }
  return Array.from(map.values())
}

export async function addCustomCastDevice(device: Omit<CastDevice, 'isActive'>): Promise<YouTubeCastState> {
  const current = getStoredCastState()
  const newDevice: CastDevice = { ...device, isActive: false, isOnline: true }
  const updatedDevices = [...current.devices.filter(d => d.id !== newDevice.id), newDevice]
  const updated = saveStoredCastState({ devices: updatedDevices })
  return updated
}

export async function castPlay(track: YouTubeTrack, deviceId?: string): Promise<YouTubeCastState> {
  const current = getStoredCastState()
  const updated = saveStoredCastState({
    isPlaying: true,
    track,
    progressMs: 0,
    durationMs: track.durationMs,
    activeDeviceId: deviceId || current.activeDeviceId || 'nest-office-point',
  })
  await dispatchCastCommand('cast:play', { track, videoId: track.videoId, deviceId })
  return updated
}

export async function castPause(): Promise<YouTubeCastState> {
  const updated = saveStoredCastState({ isPlaying: false })
  await dispatchCastCommand('cast:pause')
  return updated
}

export async function castResume(): Promise<YouTubeCastState> {
  const updated = saveStoredCastState({ isPlaying: true })
  await dispatchCastCommand('cast:resume')
  return updated
}

export async function castStop(): Promise<YouTubeCastState> {
  const updated = saveStoredCastState({ isPlaying: false, track: null, progressMs: 0 })
  await dispatchCastCommand('cast:stop')
  return updated
}

export async function castSeek(positionMs: number): Promise<YouTubeCastState> {
  const updated = saveStoredCastState({ progressMs: positionMs })
  await dispatchCastCommand('cast:seek', { positionMs })
  return updated
}

export async function castSetVolume(volumePct: number): Promise<YouTubeCastState> {
  const clamped = Math.max(0, Math.min(100, Math.round(volumePct)))
  const updated = saveStoredCastState({ volumePct: clamped })
  await dispatchCastCommand('cast:set_volume', { volumePct: clamped })
  return updated
}

export async function castSelectDevice(deviceId: string): Promise<YouTubeCastState> {
  const current = getStoredCastState()
  const updatedDevices = current.devices.map(d => ({
    ...d,
    isActive: d.id === deviceId,
  }))
  const activeDevice = updatedDevices.find(d => d.id === deviceId)
  const updated = saveStoredCastState({
    activeDeviceId: deviceId,
    activeDeviceName: activeDevice?.name || 'Google Cast Speaker',
    devices: updatedDevices,
  })
  await dispatchCastCommand('cast:select_device', { deviceId })
  return updated
}

export async function castAddToQueue(track: YouTubeTrack): Promise<YouTubeCastState> {
  const current = getStoredCastState()
  const updatedQueue = [...current.queue, track]
  const updated = saveStoredCastState({ queue: updatedQueue })
  await dispatchCastCommand('cast:queue_add', { track })
  return updated
}

export async function castPlayNext(track: YouTubeTrack): Promise<YouTubeCastState> {
  const current = getStoredCastState()
  const updatedQueue = [track, ...current.queue]
  const updated = saveStoredCastState({ queue: updatedQueue })
  await dispatchCastCommand('cast:queue_next', { track })
  return updated
}

export async function castClearQueue(): Promise<YouTubeCastState> {
  const updated = saveStoredCastState({ queue: [] })
  await dispatchCastCommand('cast:queue_clear')
  return updated
}

export async function castSetShuffle(shuffle: boolean): Promise<YouTubeCastState> {
  const updated = saveStoredCastState({ shuffle })
  return updated
}

export async function castSetRepeat(repeatMode: 0 | 1 | 2): Promise<YouTubeCastState> {
  const updated = saveStoredCastState({ repeatMode })
  return updated
}
