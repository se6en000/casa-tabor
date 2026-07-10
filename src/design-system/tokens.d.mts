export type ThemeColorKey =
  | 'casa-gold'
  | 'casa-navy'
  | 'casa-bg'
  | 'casa-bg-2'
  | 'casa-surface'
  | 'casa-text'
  | 'casa-border'
  | 'casa-error'
  | 'casa-success'
  | 'casa-warning'
  | 'casa-surface-subtle'
  | 'casa-control-border'
  | 'casa-divider-strong'
  | 'casa-text-secondary'
  | 'casa-text-tertiary'
  | 'casa-text-faint'
  | 'casa-accent-soft'
  | 'casa-accent-soft-border'
  | 'casa-accent-soft-hover'
  | 'casa-accent-subtle'
  | 'casa-accent-subtle-border'
  | 'casa-info'
  | 'casa-info-strong'
  | 'casa-info-soft'
  | 'casa-success-strong'
  | 'casa-success-soft'
  | 'casa-toggle-track'
  | 'casa-top-pick-band'

export type ThemeColorPalette = Record<ThemeColorKey, string>

export const THEME_COLOR_KEYS: ThemeColorKey[]
export const DEFAULT_THEME_COLORS: ThemeColorPalette
export const MIDNIGHT_THEME_COLORS: ThemeColorPalette

export const DESIGN_TOKENS: {
  staticColor: Record<string, string>
  fontFamily: Record<string, string>
  type: Record<string, { touch: string; compact: string; kiosk: string; lineHeight: string }>
  spacing: Record<string, string>
  controls: Record<'compact' | 'touch' | 'kiosk', Record<'target' | 'sm' | 'md' | 'lg', string>>
  radius: Record<string, string>
  shadow: Record<string, string>
  midnightShadow: Record<string, string>
  motion: Record<string, string>
  zIndex: Record<string, string>
}
