export const PROFILE_COLOR_OPTIONS = [
  { hex: '#2C3E6B', name: 'Navy' },
  { hex: '#C8A96E', name: 'Gold' },
  { hex: '#4A7C59', name: 'Forest' },
  { hex: '#8E44AD', name: 'Purple' },
  { hex: '#2980B9', name: 'Blue' },
  { hex: '#16A085', name: 'Teal' },
  { hex: '#6B7FD7', name: 'Indigo' },
  { hex: '#4F9D9D', name: 'Sea Glass' },
  { hex: '#7F8C8D', name: 'Slate' },
] as const

export const ALERT_RESERVED_MEMBER_COLORS = [
  { hex: '#C0392B', name: 'Red (alerts)' },
  { hex: '#E67E22', name: 'Orange (alerts)' },
  { hex: '#D35400', name: 'Burnt Orange (alerts)' },
] as const

const MEMBER_COLOR_NAME_BY_HEX = new Map<string, string>(
  [...PROFILE_COLOR_OPTIONS, ...ALERT_RESERVED_MEMBER_COLORS].map((color) => [color.hex, color.name]),
)

export const FALLBACK_PROFILE_COLOR = PROFILE_COLOR_OPTIONS[0].hex

export const getDisplayMemberColor = (hex?: string | null) =>
  hex && hex.trim().length > 0 ? hex : FALLBACK_PROFILE_COLOR

export const getMemberColorName = (hex: string) =>
  MEMBER_COLOR_NAME_BY_HEX.get(hex) ?? hex
