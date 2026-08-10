export type ArtSourceMode = 'casa' | 'personal' | 'mixed'

export interface ArtSourceConfig {
  sourceMode: ArtSourceMode
}

export interface ArtworkFileDescriptor {
  name: string
  type: string
  size: number
}

export const PERSONAL_ARTWORK_BUCKET = 'personal-artwork'
export const PERSONAL_ARTWORK_MAX_BYTES = 20 * 1024 * 1024
export const PERSONAL_ARTWORK_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export function normalizeArtSourceConfig(value: unknown): ArtSourceConfig {
  if (!value || typeof value !== 'object') return { sourceMode: 'casa' }
  const sourceMode = (value as { sourceMode?: unknown }).sourceMode
  return sourceMode === 'personal' || sourceMode === 'mixed'
    ? { sourceMode }
    : { sourceMode: 'casa' }
}

export function buildArtworkFeed<T>(
  sourceMode: ArtSourceMode,
  casaArtwork: T[],
  personalArtwork: T[],
): T[] {
  if (sourceMode === 'personal') return [...personalArtwork]
  if (sourceMode === 'casa') return [...casaArtwork]

  const mixed: T[] = []
  const length = Math.max(personalArtwork.length, casaArtwork.length)
  for (let index = 0; index < length; index += 1) {
    if (personalArtwork[index]) mixed.push(personalArtwork[index])
    if (casaArtwork[index]) mixed.push(casaArtwork[index])
  }
  return mixed
}

export function getPersonalArtworkValidationError(file: ArtworkFileDescriptor): string | null {
  if (!PERSONAL_ARTWORK_MIME_TYPES.includes(file.type as typeof PERSONAL_ARTWORK_MIME_TYPES[number])) {
    return 'Choose a JPG, PNG, or WebP image.'
  }
  if (file.size > PERSONAL_ARTWORK_MAX_BYTES) {
    return 'Artwork must be 20 MB or smaller.'
  }
  if (file.size <= 0) {
    return 'This image is empty and cannot be uploaded.'
  }
  return null
}
