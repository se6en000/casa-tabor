export const THEME_COLOR_KEYS = [
  'casa-gold',
  'casa-gold-hover',
  'casa-navy',
  'casa-bg',
  'casa-bg-2',
  'casa-surface',
  'casa-text',
  'casa-border',
  'casa-error',
  'casa-success',
  'casa-warning',
  'casa-warning-strong',
  'casa-warning-soft',
  'casa-surface-subtle',
  'casa-control-border',
  'casa-divider-strong',
  'casa-text-secondary',
  'casa-text-tertiary',
  'casa-text-faint',
  'casa-accent-soft',
  'casa-accent-soft-border',
  'casa-accent-soft-hover',
  'casa-accent-subtle',
  'casa-accent-subtle-border',
  'casa-info',
  'casa-info-strong',
  'casa-info-soft',
  'casa-success-strong',
  'casa-success-soft',
  'casa-toggle-track',
  'casa-top-pick-band',
]

export const DEFAULT_FONT_SCALE = 1
export const MIN_FONT_SCALE = 0.85
export const MAX_FONT_SCALE = 1.3

export const DEFAULT_THEME_COLORS = {
  'casa-gold': '#C9A96E',
  // A deepened gold for hover/emphasis text on light surfaces (base casa-gold
  // is too pale for good body-text contrast on white/cream). Was referenced
  // as `text-casa-gold-hover` in ~20 places across the app without ever being
  // defined here -- a silent no-op that just never rendered any color.
  'casa-gold-hover': '#8A5A1E',
  'casa-navy': '#1B2A4A',
  // Deepened from #FAF8F5 -- against a white (#FFFFFF) casa-surface the old
  // value was only 5 RGB levels darker, so cards barely lifted off the page
  // ("washed out" per live feedback 2026-09-12). This is the old casa-bg-2.
  'casa-bg': '#F2EEE7',
  // Deepened one further step below the new casa-bg so the two-tier page
  // background still reads as two distinct levels, not one flat wash.
  'casa-bg-2': '#EAE0CC',
  'casa-surface': '#FFFFFF',
  'casa-text': '#2D2D2D',
  // Deepened from #E8E2D9 -- at the low opacities most components apply
  // (border-casa-border/40 through /80) the old value was nearly invisible
  // against casa-bg, so hairline dividers/card edges disappeared entirely.
  'casa-border': '#D9CFBE',
  'casa-error': '#C0392B',
  'casa-success': '#27AE60',
  'casa-warning': '#E67E22',
  // Strong/soft siblings, matching the existing casa-success-strong/-soft and
  // casa-info-strong/-soft pattern -- added so real urgency states (overdue,
  // needs-a-decision) can use a proper token pair instead of raw Tailwind
  // amber-*, which sits too close to casa-gold's hue to read as a distinct
  // signal (see the gold-vs-orange rules approved 2026-09-12).
  'casa-warning-strong': '#B4581C',
  'casa-warning-soft': '#FBE7D3',
  'casa-surface-subtle': '#FAF6EE',
  'casa-control-border': '#EADBC3',
  'casa-divider-strong': '#CDBFA4',
  'casa-text-secondary': '#5C5D66',
  'casa-text-tertiary': '#8D8E99',
  'casa-text-faint': '#A9A398',
  'casa-accent-soft': '#F4E2CD',
  'casa-accent-soft-border': '#E9CBA6',
  'casa-accent-soft-hover': '#EFD6BB',
  'casa-accent-subtle': '#FAF0E2',
  'casa-accent-subtle-border': '#EBD9BF',
  'casa-info': '#10A5AC',
  'casa-info-strong': '#0A6266',
  'casa-info-soft': '#E7F4F4',
  'casa-success-strong': '#2A6A34',
  'casa-success-soft': '#DBF0DC',
  'casa-toggle-track': '#FAF3E6',
  'casa-top-pick-band': '#8A5A1E',
}

export const MIDNIGHT_THEME_COLORS = {
  'casa-gold': '#9F8658',
  // On dark surfaces, hover/emphasis brightens rather than deepens.
  'casa-gold-hover': '#F0C98F',
  'casa-navy': '#0E1218',
  'casa-bg': '#090C11',
  'casa-bg-2': '#070A0F',
  'casa-surface': '#121923',
  'casa-text': '#E3DDD1',
  'casa-border': '#263244',
  'casa-error': '#C96A5E',
  'casa-success': '#4AA56A',
  'casa-warning': '#D2A465',
  'casa-warning-strong': '#F2B673',
  'casa-warning-soft': '#3D2A16',
  'casa-surface-subtle': '#171F2C',
  'casa-control-border': '#324157',
  'casa-divider-strong': '#2B374C',
  'casa-text-secondary': '#BCC7D8',
  'casa-text-tertiary': '#93A4BC',
  'casa-text-faint': '#7D8EA7',
  'casa-accent-soft': '#5A4A33',
  'casa-accent-soft-border': '#7A6242',
  'casa-accent-soft-hover': '#6A563C',
  'casa-accent-subtle': '#342C23',
  'casa-accent-subtle-border': '#4A3C2E',
  'casa-info': '#57C9C9',
  'casa-info-strong': '#8EE3E3',
  'casa-info-soft': '#1B3A40',
  'casa-success-strong': '#7BD58B',
  'casa-success-soft': '#1E3D28',
  'casa-toggle-track': '#303B4E',
  'casa-top-pick-band': '#F0C98F',
}

export const ROOM_TONE_COLORS = {
  day: '#FAF8F5',
  afternoon: '#FDF4E7',
  evening: '#F5E6CC',
  night: '#2A1F0E',
  'late-night': '#120D06',
  manual: '#E8D5B0',
}

export const DESIGN_TOKENS = {
  staticColor: {
    'casa-on-dark': '#FFFFFF',
    'family-jake': '#1B2A4A',
    'family-kelly': '#C4693A',
    'family-liv': '#6A9E7F',
    'family-emme': '#C47A8A',
    'family-owen': '#D4A44C',
    'night-bg': '#1A1A2E',
    'night-surface': '#16213E',
    'night-text': '#E0D8CC',
    'night-muted': '#6B6B7B',
    'night-border': '#2A2A3E',
    'night-gold': '#A08050',
  },
  fontFamily: {
    display: "'Cormorant Garamond', Georgia, serif",
    body: "'DM Sans', system-ui, sans-serif",
    mono: "'JetBrains Mono', monospace",
  },
  type: {
    'display-xl': { touch: 'clamp(52px, calc(46px + 1.45vw), 72px)', compact: '52px', kiosk: '76px', lineHeight: '1.1' },
    'display-lg': { touch: 'clamp(40px, calc(36px + 1.1vw), 58px)', compact: '40px', kiosk: '60px', lineHeight: '1.15' },
    'display-md': { touch: 'clamp(32px, calc(28px + 0.82vw), 44px)', compact: '32px', kiosk: '46px', lineHeight: '1.2' },
    'display-sm': { touch: 'clamp(26px, calc(23px + 0.65vw), 36px)', compact: '26px', kiosk: '38px', lineHeight: '1.25' },
    heading: { touch: 'clamp(23px, calc(21px + 0.5vw), 30px)', compact: '23px', kiosk: '32px', lineHeight: '1.3' },
    'body-lg': { touch: 'clamp(19px, calc(18px + 0.4vw), 24px)', compact: '19px', kiosk: '26px', lineHeight: '1.5' },
    body: { touch: 'clamp(17px, calc(16px + 0.34vw), 21px)', compact: '17px', kiosk: '23px', lineHeight: '1.5' },
    'body-sm': { touch: 'clamp(15px, calc(14px + 0.3vw), 19px)', compact: '15px', kiosk: '21px', lineHeight: '1.45' },
    caption: { touch: 'clamp(14px, calc(13px + 0.24vw), 17px)', compact: '14px', kiosk: '18px', lineHeight: '1.4' },
  },
  spacing: {
    'nav-height': '4.5rem',
    'topbar-height': '3.5rem',
    'page-gutter': 'var(--ds-page-gutter)',
    'section-gap': 'clamp(1rem, 2vw, 1.5rem)',
    'card-padding': 'clamp(0.875rem, 1.5vw, 1.25rem)',
  },
  layout: {
    breakpointTablet: '48rem',
    breakpointWide: '80rem',
    gutterPhone: '1rem',
    gutterTablet: '1.5rem',
    gutterWide: '2rem',
  },
  container: {
    'page-narrow': '48rem',
    page: '80rem',
    'page-wide': '96rem',
  },
  controls: {
    compact: { target: '44px', sm: '36px', md: '40px', lg: '44px' },
    touch: { target: '44px', sm: '40px', md: '44px', lg: '48px' },
    kiosk: { target: '48px', sm: '44px', md: '48px', lg: '56px' },
  },
  radius: {
    button: '0.5rem',
    card: '0.75rem',
    widget: '1.25rem',
    container: '1.5rem',
    modal: '1.5rem',
    pill: '9999px',
  },
  shadow: {
    // Deepened from a near-invisible 1-3px hairline -- the old value gave
    // every card almost no real lift off the page ("washed out" feedback
    // 2026-09-12). Kept the navy tint (rgba(27,42,74,...)) rather than pure
    // black so the shadow still reads as warm, not a generic UI drop-shadow.
    card: '0 10px 24px rgba(27,42,74,0.10), 0 2px 6px rgba(27,42,74,0.06)',
    'card-hover': '0 16px 36px rgba(27,42,74,0.14)',
    widget: '0 8px 20px rgba(27,42,74,0.08), 0 2px 6px rgba(27,42,74,0.05)',
    'glow-gold': '0 0 20px rgba(201,169,110,0.25)',
    'glow-amber': '0 0 18px rgba(245,158,11,0.25)',
    'glow-emerald': '0 0 18px rgba(16,185,129,0.25)',
    'hero-dark': '0 20px 40px -15px rgba(15,23,42,0.4), 0 0 0 1px rgba(255,255,255,0.08)',
    modal: '0 8px 30px rgba(27,42,74,0.12)',
    fab: '0 4px 14px rgba(201,169,110,0.3)',
  },
  midnightShadow: {
    card: '0 1px 3px rgba(0,0,0,0.45), 0 1px 2px rgba(0,0,0,0.35)',
    'card-hover': '0 6px 18px rgba(0,0,0,0.55)',
    widget: '0 4px 16px rgba(0,0,0,0.45)',
    'glow-gold': '0 0 24px rgba(159,134,88,0.35)',
    'glow-amber': '0 0 20px rgba(210,164,101,0.30)',
    'glow-emerald': '0 0 20px rgba(74,165,106,0.30)',
    'hero-dark': '0 24px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.12)',
    modal: '0 12px 36px rgba(0,0,0,0.65)',
    fab: '0 6px 18px rgba(159,134,88,0.40)',
  },
  motion: {
    fast: '120ms',
    normal: '220ms',
    slow: '350ms',
    'room-tone': '2000ms',
    ambient: '5000ms',
    'ease-standard': 'cubic-bezier(0.2, 0, 0, 1)',
    'ease-emphasized': 'cubic-bezier(0.2, 0.8, 0.2, 1)',
  },
  zIndex: {
    base: '0',
    raised: '10',
    sticky: '20',
    dropdown: '30',
    scrim: '40',
    modal: '50',
    popover: '60',
    toast: '70',
    debug: '90',
  },
}
