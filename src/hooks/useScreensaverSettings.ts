import { useState, useEffect } from 'react'

export interface ScreensaverSettings {
  screensaverMins: number   // idle minutes before art mode (default 5)
  displayOffMins: number    // idle minutes before monitor sleep (default 10)
  rotationMins: number      // minutes per painting (default 4)
  minArtWidthVw: number     // minimum painting width % of viewport (default 55)
  enabled: boolean          // master toggle for screensaver
  displaySleepEnabled: boolean
  artDimOffset: number      // how much dimmer than ambient lux in art mode (0–80, default 30%)
  shuffle: boolean          // randomize artwork playback order (default true)
  plaqueMode: 'fade' | 'always' | 'hidden' // museum plaque visibility (default 'fade' 5s)
  matPreset: 'auto' | 'warm_linen' | 'travertine' | 'coastal_mist' | 'french_ivory' | 'charcoal' // mat color tone
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
  wakeWordSensitivity: 0.3,
  wakeWordEnabled: true,
  disabledArtworkIds: [],
}

const KEY = 'casa-screensaver-settings'
const SYNC_EVENT = 'casa-screensaver-settings-updated'

function load(): ScreensaverSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return DEFAULTS
}

export function useScreensaverSettings() {
  const [settings, setSettings] = useState<ScreensaverSettings>(load)

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(settings))
  }, [settings])

  useEffect(() => {
    const onSync = (event: Event) => {
      const detail = (event as CustomEvent<ScreensaverSettings>).detail
      if (detail) {
        setSettings(current => ({ ...current, ...detail }))
        return
      }
      setSettings(load())
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key !== KEY) return
      setSettings(load())
    }

    document.addEventListener(SYNC_EVENT, onSync as EventListener)
    window.addEventListener('storage', onStorage)
    return () => {
      document.removeEventListener(SYNC_EVENT, onSync as EventListener)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  function update(patch: Partial<ScreensaverSettings>) {
    setSettings(current => {
      const next = { ...current, ...patch }
      document.dispatchEvent(new CustomEvent<ScreensaverSettings>(SYNC_EVENT, { detail: next }))
      return next
    })
  }

  return { settings, update }
}

export { DEFAULTS as SCREENSAVER_DEFAULTS }
