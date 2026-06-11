import { useState, useEffect } from 'react'

export interface ScreensaverSettings {
  screensaverMins: number   // idle minutes before art mode (default 5)
  displayOffMins: number    // idle minutes before monitor sleep (default 10)
  rotationMins: number      // minutes per painting (default 4)
  minArtWidthVw: number     // minimum painting width % of viewport (default 55)
  enabled: boolean          // master toggle for screensaver
  displaySleepEnabled: boolean
  artDimOffset: number      // how much dimmer than ambient lux in art mode (0–80, default 30%)
}

const DEFAULTS: ScreensaverSettings = {
  screensaverMins: 5,
  displayOffMins: 10,
  rotationMins: 4,
  minArtWidthVw: 55,
  enabled: true,
  displaySleepEnabled: true,
  artDimOffset: 30,
}

const KEY = 'casa-screensaver-settings'

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

  function update(patch: Partial<ScreensaverSettings>) {
    setSettings(s => ({ ...s, ...patch }))
  }

  return { settings, update }
}

export { DEFAULTS as SCREENSAVER_DEFAULTS }
