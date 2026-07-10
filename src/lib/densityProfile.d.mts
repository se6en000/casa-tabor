export type DensityProfile = 'compact' | 'touch' | 'kiosk'

export const DENSITY_PROFILES: DensityProfile[]

export function resolveDensityProfile(options: {
  width: number
  coarsePointer: boolean
  touchPoints?: number
  forcedProfile?: string
}): DensityProfile

export function applyDensityProfile(root?: HTMLElement): DensityProfile
export function initDensityProfile(): () => void
