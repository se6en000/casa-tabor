export const DENSITY_PROFILES = ['compact', 'touch', 'kiosk']

export function resolveDensityProfile({ width, coarsePointer, touchPoints = 0, forcedProfile }) {
  if (DENSITY_PROFILES.includes(forcedProfile)) return forcedProfile
  const touchCapable = coarsePointer || touchPoints > 0
  if (!touchCapable) return 'compact'
  return width >= 1280 ? 'kiosk' : 'touch'
}

export function applyDensityProfile(root = document.documentElement) {
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches
  const profile = resolveDensityProfile({
    width: window.innerWidth,
    coarsePointer,
    touchPoints: navigator.maxTouchPoints,
    forcedProfile: root.dataset.densityOverride,
  })
  root.dataset.density = profile
  return profile
}

export function initDensityProfile() {
  const requestedProfile = new URLSearchParams(window.location.search).get('density')
  if (DENSITY_PROFILES.includes(requestedProfile)) {
    document.documentElement.dataset.densityOverride = requestedProfile
  }
  applyDensityProfile()
  const pointerQuery = window.matchMedia('(pointer: coarse)')
  const update = () => applyDensityProfile()
  window.addEventListener('resize', update)
  pointerQuery.addEventListener('change', update)
  return () => {
    window.removeEventListener('resize', update)
    pointerQuery.removeEventListener('change', update)
  }
}
