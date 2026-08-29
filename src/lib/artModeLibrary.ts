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

export function sanitizeArtworkTitle(rawTitle: string): string {
  if (!rawTitle) return 'Untitled'
  
  let cleaned = rawTitle
    .replace(/\.[a-zA-Z0-9]{3,4}$/, '') // strip extension
    .replace(/^(orig|img|dsc|photo|scan|pxl)[_\-\s]+/i, '') // strip camera / prefix tags
    .replace(/[_\-\s]+(1920x\d*|4k|1080p|resized|scaled|wallpaper|hires|orig|preview)[_\-\s]*/gi, ' ') // strip dimension suffixes
    .replace(/[_\-]+/g, ' ') // replace dashes and underscores with spaces
    .replace(/\s+/g, ' ') // collapse multi spaces
    .trim()

  if (!cleaned) return 'Untitled'

  return cleaned
    .split(' ')
    .map((word, idx) => {
      if (!word) return ''
      const lower = word.toLowerCase()
      if (idx > 0 && ['a', 'an', 'the', 'in', 'on', 'of', 'at', 'by', 'for', 'with', 'and'].includes(lower)) {
        return lower
      }
      return word.charAt(0).toUpperCase() + word.slice(1)
    })
    .join(' ')
    .replace(/^[a-z]/, (match) => match.toUpperCase())
}

export function sanitizeArtworkMetadata(title: string, artist?: string): { title: string; artist: string } {
  const cleanTitle = sanitizeArtworkTitle(title)
  const cleanArtist = (artist?.trim() && artist.trim() !== 'Unknown') ? artist.trim() : 'Personal collection'
  return { title: cleanTitle, artist: cleanArtist }
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

export type SignatureStyle = 'fountain' | 'brush' | 'draft' | 'classic'
export type SignaturePosition = 'bottom-right' | 'bottom-left'
export type SignatureColor = 'auto' | 'dark' | 'light' | 'sepia'
export type SignatureSize = 'sm' | 'md' | 'lg' | 'xl'

export type SignatureOpacity = 0.35 | 0.55 | 0.7 | 0.9

export interface SignatureConfig {
  enabled: boolean
  text: string
  style: SignatureStyle
  position: SignaturePosition
  color: SignatureColor
  size?: SignatureSize
  opacity?: number
}

export const SIGNATURE_SIZE_OPTIONS = [
  { value: 'sm', label: 'Small' },
  { value: 'md', label: 'Medium' },
  { value: 'lg', label: 'Large' },
  { value: 'xl', label: 'Extra Large' },
] as const

export const SIGNATURE_OPACITY_OPTIONS = [
  { value: 0.35, label: '35% Faint' },
  { value: 0.55, label: '55% Pencil' },
  { value: 0.7, label: '70% Natural' },
  { value: 0.9, label: '90% Bold' },
] as const

export const SIGNATURE_SIZE_SCALES: Record<SignatureSize, number> = {
  sm: 0.75,
  md: 1.0,
  lg: 1.35,
  xl: 1.75,
}

export const SIGNATURE_STYLES: Record<
  SignatureStyle,
  { label: string; fontFamily: string; baseFontSizeRem: number; weight: number }
> = {
  fountain: {
    label: 'Fine Fountain Pen',
    fontFamily: "'Alex Brush', cursive",
    baseFontSizeRem: 1.35,
    weight: 400,
  },
  brush: {
    label: "Painter's Brush",
    fontFamily: "'Caveat', cursive",
    baseFontSizeRem: 1.25,
    weight: 600,
  },
  draft: {
    label: 'Studio Pencil / Note',
    fontFamily: "'Homemade Apple', cursive",
    baseFontSizeRem: 1.05,
    weight: 400,
  },
  classic: {
    label: 'Classic Cursive',
    fontFamily: "'Marck Script', cursive",
    baseFontSizeRem: 1.15,
    weight: 400,
  },
}

export const SIGNATURE_STYLE_OPTIONS = [
  { value: 'fountain', label: '✒️ Fine Fountain Pen (Alex Brush)' },
  { value: 'brush', label: "🖌️ Painter's Brush (Caveat)" },
  { value: 'draft', label: '✏️ Studio Pencil / Note (Homemade Apple)' },
  { value: 'classic', label: '📜 Classic Cursive (Marck Script)' },
] as const

export const SIGNATURE_POSITION_OPTIONS = [
  { value: 'bottom-right', label: 'Bottom Right' },
  { value: 'bottom-left', label: 'Bottom Left' },
] as const

export const SIGNATURE_COLOR_OPTIONS = [
  { value: 'auto', label: 'Auto (Contrast)' },
  { value: 'dark', label: 'Charcoal Ink' },
  { value: 'sepia', label: 'Warm Umber' },
  { value: 'light', label: 'White Gesso' },
] as const

export function getSignatureInkStyle(
  color: SignatureColor,
  dominantColorHex = '',
  opacity = 0.55
): { color: string; textShadow: string; blendMode?: 'normal' | 'multiply' | 'screen' } {
  const alpha = Math.max(0.2, Math.min(1.0, opacity))

  if (color === 'dark') {
    return {
      color: `rgba(22, 20, 18, ${alpha})`,
      textShadow: `0 0.5px 0.5px rgba(255, 255, 255, ${Math.min(0.25, alpha * 0.35)})`,
      blendMode: 'multiply',
    }
  }
  if (color === 'sepia') {
    return {
      color: `rgba(62, 42, 28, ${alpha})`,
      textShadow: `0 0.5px 0.5px rgba(255, 255, 255, ${Math.min(0.25, alpha * 0.35)})`,
      blendMode: 'multiply',
    }
  }
  if (color === 'light') {
    return {
      color: `rgba(248, 245, 238, ${alpha})`,
      textShadow: `0 1px 2px rgba(0, 0, 0, ${Math.min(0.7, alpha * 0.85)}), 0 0.5px 0.5px rgba(0, 0, 0, 0.9)`,
      blendMode: 'screen',
    }
  }

  // Auto mode: evaluate brightness of dominant/corner color
  let r = 128, g = 128, b = 128
  const raw = dominantColorHex.trim()
  if (raw.startsWith('#')) {
    const hex = raw.slice(1)
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16)
      g = parseInt(hex[1] + hex[1], 16)
      b = parseInt(hex[2] + hex[2], 16)
    } else if (hex.length >= 6) {
      r = parseInt(hex.slice(0, 2), 16)
      g = parseInt(hex.slice(2, 4), 16)
      b = parseInt(hex.slice(4, 6), 16)
    }
  }
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  if (luminance < 0.42) {
    return {
      color: `rgba(248, 245, 238, ${alpha})`,
      textShadow: `0 1px 2px rgba(0, 0, 0, ${Math.min(0.7, alpha * 0.85)}), 0 0.5px 0.5px rgba(0, 0, 0, 0.9)`,
      blendMode: 'screen',
    }
  }
  return {
    color: `rgba(24, 21, 18, ${alpha})`,
    textShadow: `0 0.5px 0.5px rgba(255, 255, 255, ${Math.min(0.25, alpha * 0.35)})`,
    blendMode: 'multiply',
  }
}

export function buildTwoRowSignatureInscription({
  title,
  artist,
  location,
  dateTaken,
}: {
  title?: string | null
  artist?: string | null
  location?: string | null
  dateTaken?: string | null
}): string {
  const line1 = title?.trim() || 'Untitled Artwork'
  const line2Parts = [
    artist?.trim() || 'Personal collection',
    location?.trim() ? location.trim().split(',')[0] : null,
    dateTaken?.trim() ? `(${dateTaken.trim()})` : null,
  ].filter(Boolean)
  return `${line1}\n${line2Parts.join(' · ')}`
}



