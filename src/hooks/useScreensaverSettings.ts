import { useSyncExternalStore, useCallback } from 'react'

export interface ScreensaverSettings {
  screensaverMins: number   // idle minutes before art mode (default 5)
  displayOffMins: number    // idle minutes before monitor sleep (default 10)
  rotationMins: number      // minutes per painting (default 4)
  minArtWidthVw: number     // minimum painting width % of viewport (default 55)
  enabled: boolean          // master toggle for screensaver
  displaySleepEnabled: boolean
  artDimOffset: number      // how much dimmer than ambient lux in art mode (0–90, default 30%)
  shuffle: boolean          // randomize artwork playback order (default true)
  plaqueMode: 'fade' | 'always' | 'hidden' // museum plaque visibility (default 'fade' 5s)
  matPreset: 'auto' | 'warm_linen' | 'travertine' | 'coastal_mist' | 'french_ivory' | 'charcoal' // mat color tone
  aspectRatioMode?: 'mixed' | 'diptych_only' | 'single_only' // 1:1 diptych playback preference (default 'mixed')
  wakeWordSensitivity: number // 0.1 (very sensitive) – 0.6 (strict), default 0.3
  wakeWordEnabled: boolean  // master toggle for "Alexa" wake word listener
  disabledArtworkIds?: string[] // IDs of photos disabled from playback on this device
}

const DEFAULTS: ScreensaverSettings = {
  screensaverMins: 5,
  displayOffMins: 10,
  rotationMins: 4,
  minArtWidthVw: 55,
  enabled: true,
  displaySleepEnabled: true,
  artDimOffset: 30,
  shuffle: true,
  plaqueMode: 'fade',
  matPreset: 'auto',
  aspectRatioMode: 'mixed',
  wakeWordSensitivity: 0.3,
  wakeWordEnabled: true,
  disabledArtworkIds: [],
}

const KEY = 'casa-screensaver-settings'
const SYNC_EVENT = 'casa-screensaver-settings-updated'

function load(): ScreensaverSettings {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return { ...DEFAULTS }
}

let storeSettings: ScreensaverSettings = load()
const listeners = new Set<() => void>()

function emitChange() {
  for (const listener of listeners) {
    listener()
  }
}

export function saveScreensaverSettings(settings: ScreensaverSettings) {
  storeSettings = settings
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(KEY, JSON.stringify(settings))
    }
  } catch { /* ignore */ }
  emitChange()
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<ScreensaverSettings>(SYNC_EVENT, { detail: settings }))
  }
}

export function updateScreensaverSettings(patch: Partial<ScreensaverSettings>) {
  saveScreensaverSettings({ ...storeSettings, ...patch })
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) {
      storeSettings = load()
      emitChange()
    }
  })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot() {
  return storeSettings
}

export function useScreensaverSettings() {
  const settings = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const update = useCallback((patch: Partial<ScreensaverSettings>) => {
    updateScreensaverSettings(patch)
  }, [])
  return { settings, update }
}

export { DEFAULTS as SCREENSAVER_DEFAULTS }
