// Pure, dependency-free class-name builders for the Phase 2 shared UI
// primitives (Button, IconButton, Chip, Card, Field controls, Modal, Sheet).
//
// No React/JSX lives here so this module can be covered directly by
// node:test without a DOM (see tests/design-system-primitives.test.mjs),
// mirroring the existing scripts/lib/audit-rules.mjs pattern. Components in
// src/components/ui/*.tsx import these builders and layer cn() on top so
// consumer-provided className overrides still win via tailwind-merge.
//
// Every builder is defensive against unknown/omitted option values — it
// falls back to a documented default rather than emitting an invalid class,
// so a bad prop degrades gracefully instead of producing a broken look.

/** Shared focus/disabled/interaction base for every tappable control. */
const CONTROL_BASE =
  'inline-flex items-center justify-center gap-2 font-medium select-none ' +
  'transition-colors duration-150 outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-casa-gold focus-visible:ring-offset-2 focus-visible:ring-offset-casa-bg ' +
  'disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none'

export const BUTTON_VARIANTS = ['primary', 'strong', 'secondary', 'subtle', 'ghost', 'danger']
export const BUTTON_SIZES = ['sm', 'md', 'lg']

const BUTTON_VARIANT_CLASSES = {
  primary: 'casa-action-primary bg-casa-gold text-casa-navy font-bold shadow-card hover:brightness-110',
  strong: 'casa-action-strong bg-casa-navy text-white font-bold shadow-card hover:brightness-110',
  secondary: 'bg-casa-surface text-content-heading border border-casa-border hover:bg-casa-bg',
  subtle: 'bg-surface-inset text-content-primary border border-casa-border/70 hover:bg-surface-subtle',
  ghost: 'bg-transparent text-content-heading hover:bg-casa-bg',
  danger: 'bg-casa-error text-white hover:brightness-110',
}

const BUTTON_SIZE_CLASSES = {
  sm: 'min-h-control px-3 rounded-button text-body-sm',
  md: 'min-h-control px-4 rounded-button text-body-sm',
  lg: 'min-h-control-lg px-5 rounded-button text-body',
}

/**
 * @param {{variant?: string, size?: string, fullWidth?: boolean, loading?: boolean}} [options]
 * @returns {string}
 */
export function buttonClassName(options = {}) {
  const variant = BUTTON_VARIANTS.includes(options.variant) ? options.variant : 'primary'
  const size = BUTTON_SIZES.includes(options.size) ? options.size : 'md'
  return [
    CONTROL_BASE,
    BUTTON_VARIANT_CLASSES[variant],
    BUTTON_SIZE_CLASSES[size],
    options.fullWidth ? 'w-full' : '',
    // The component overlays its spinner and hides content with a layout-preserving wrapper.
    options.loading ? 'relative' : '',
  ].filter(Boolean).join(' ')
}

export const ICON_BUTTON_VARIANTS = ['primary', 'strong', 'secondary', 'ghost', 'danger']
export const ICON_BUTTON_SIZES = ['sm', 'md', 'lg']

const ICON_BUTTON_VARIANT_CLASSES = {
  primary: 'casa-action-primary bg-casa-gold text-casa-navy shadow-card hover:brightness-110',
  strong: 'casa-action-strong bg-casa-navy text-white shadow-card hover:brightness-110',
  secondary: 'bg-casa-surface text-content-heading border border-casa-border hover:bg-casa-bg',
  ghost: 'bg-transparent text-casa-muted hover:text-content-heading hover:bg-casa-bg',
  danger: 'bg-transparent text-casa-error hover:bg-casa-error/10',
}

const ICON_BUTTON_SIZE_CLASSES = {
  sm: 'size-control rounded-button',
  md: 'size-control rounded-button',
  lg: 'size-control-lg rounded-button',
}

/**
 * @param {{variant?: string, size?: string}} [options]
 * @returns {string}
 */
export function iconButtonClassName(options = {}) {
  const variant = ICON_BUTTON_VARIANTS.includes(options.variant) ? options.variant : 'ghost'
  const size = ICON_BUTTON_SIZES.includes(options.size) ? options.size : 'md'
  return [
    CONTROL_BASE,
    'flex-shrink-0 p-0',
    ICON_BUTTON_VARIANT_CLASSES[variant],
    ICON_BUTTON_SIZE_CLASSES[size],
  ].filter(Boolean).join(' ')
}

export const CHIP_TONES = ['neutral', 'accent', 'success', 'info', 'warning', 'danger']
export const CHIP_SIZES = ['sm', 'md']

const CHIP_TONE_CLASSES = {
  neutral: 'bg-casa-bg text-casa-text-secondary border-casa-border',
  accent: 'bg-casa-accent-soft text-content-heading border-casa-accent-soft-border',
  success: 'bg-casa-success-soft text-casa-success-strong border-transparent',
  info: 'bg-casa-info-soft text-casa-info-strong border-transparent',
  warning: 'bg-casa-warning/15 text-casa-warning border-transparent',
  danger: 'bg-casa-error/10 text-casa-error border-transparent',
}

const CHIP_SIZE_CLASSES = {
  sm: 'min-h-control-sm px-3 text-caption gap-1.5',
  md: 'min-h-control px-4 text-body-sm gap-2',
}

/**
 * @param {{tone?: string, size?: string, selected?: boolean, interactive?: boolean}} [options]
 * @returns {string}
 */
export function chipClassName(options = {}) {
  const tone = CHIP_TONES.includes(options.tone) ? options.tone : 'neutral'
  const size = CHIP_SIZES.includes(options.size) ? options.size : 'md'
  return [
    'inline-flex items-center justify-center rounded-pill border font-semibold whitespace-nowrap',
    'transition-colors duration-150',
    CHIP_TONE_CLASSES[tone],
    CHIP_SIZE_CLASSES[size],
    options.interactive ? 'cursor-default outline-none focus-visible:ring-2 focus-visible:ring-casa-gold focus-visible:ring-offset-1' : '',
    options.selected ? 'ring-2 ring-casa-gold ring-offset-1' : '',
  ].filter(Boolean).join(' ')
}

export function segmentedControlClassName(options = {}) {
  return [
    'casa-segmented-control relative inline-grid items-stretch overflow-hidden rounded-pill border border-casa-control-border bg-casa-toggle-track p-1 touch-pan-y',
    options.fullWidth ? 'w-full' : '',
  ].filter(Boolean).join(' ')
}

export function segmentedControlThumbClassName(options = {}) {
  return [
    'casa-segmented-control-thumb pointer-events-none absolute bottom-1 top-1 rounded-pill bg-casa-surface shadow-card ring-1 ring-casa-control-border',
    options.dragging ? '' : 'transition-transform duration-200 ease-out motion-reduce:transition-none',
  ].filter(Boolean).join(' ')
}

export function segmentedControlItemClassName(options = {}) {
  return [
    CONTROL_BASE,
    'relative z-10 min-h-control min-w-0 rounded-pill px-4 text-body-sm font-semibold',
    options.selected
      ? 'text-casa-text'
      : 'text-casa-text-secondary hover:text-casa-text',
  ].filter(Boolean).join(' ')
}

export const CARD_PADDINGS = ['none', 'sm', 'md', 'lg']
export const CARD_TONES = ['surface', 'subtle', 'accent', 'ambient', 'stylish']

const CARD_PADDING_CLASSES = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-card-padding',
}

const CARD_TONE_CLASSES = {
  surface: 'bg-casa-surface border-casa-border',
  subtle: 'bg-casa-bg border-casa-border/70',
  accent: 'bg-casa-accent-subtle border-casa-accent-subtle-border',
  ambient: 'bg-gradient-to-br from-casa-surface via-casa-surface to-casa-accent-subtle/30 border-casa-accent-soft-border/60 shadow-widget',
  stylish: 'bg-gradient-to-br from-casa-surface via-casa-surface to-casa-accent-subtle/40 border-casa-gold/30 shadow-widget',
}

export const TACTILE_PRESS_CLASSES = 'active:scale-[0.97] active:opacity-75 transition-all duration-150'

/**
 * @param {{padding?: string, tone?: string, interactive?: boolean}} [options]
 * @returns {string}
 */
export function cardClassName(options = {}) {
  const padding = CARD_PADDINGS.includes(options.padding) ? options.padding : 'md'
  const tone = CARD_TONES.includes(options.tone) ? options.tone : 'surface'
  return [
    'rounded-card border shadow-card',
    CARD_TONE_CLASSES[tone],
    CARD_PADDING_CLASSES[padding],
    options.interactive
      ? 'transition-all duration-150 cursor-pointer hover:shadow-card-hover active:scale-[0.97] active:opacity-75 outline-none focus-visible:ring-2 focus-visible:ring-casa-gold focus-visible:ring-offset-2'
      : '',
  ].filter(Boolean).join(' ')
}

export const STATUS_DOT_VARIANTS = ['active', 'warning', 'gold', 'neutral', 'info']
export const STATUS_DOT_SIZES = ['sm', 'md', 'lg']

const STATUS_DOT_VARIANT_CLASSES = {
  active: 'bg-emerald-400',
  warning: 'bg-amber-500',
  gold: 'bg-casa-gold',
  neutral: 'bg-casa-muted',
  info: 'bg-casa-info',
}

const STATUS_DOT_SIZE_CLASSES = {
  sm: 'size-2',
  md: 'size-2.5',
  lg: 'size-3',
}

/**
 * @param {{variant?: string, size?: string, pulse?: boolean}} [options]
 * @returns {string}
 */
export function statusDotClassName(options = {}) {
  const variant = STATUS_DOT_VARIANTS.includes(options.variant) ? options.variant : 'active'
  const size = STATUS_DOT_SIZES.includes(options.size) ? options.size : 'md'
  return [
    'inline-block rounded-full flex-shrink-0',
    STATUS_DOT_VARIANT_CLASSES[variant],
    STATUS_DOT_SIZE_CLASSES[size],
    options.pulse !== false ? 'animate-pulse' : '',
  ].filter(Boolean).join(' ')
}

const FIELD_CONTROL_BASE =
  'w-full min-h-control rounded-button border bg-casa-surface px-3 py-2 text-body-sm text-content-primary ' +
  'placeholder:text-casa-text-faint outline-none transition-colors duration-150 ' +
  'focus-visible:ring-2 focus-visible:ring-casa-gold focus-visible:ring-offset-0 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed'

/**
 * Shared class name for text-like form controls (input/textarea/select)
 * rendered inside a <Field>. Invalid state swaps the border to the error
 * token; the component layer is responsible for wiring aria-invalid.
 * @param {{invalid?: boolean}} [options]
 * @returns {string}
 */
export function fieldControlClassName(options = {}) {
  return [
    FIELD_CONTROL_BASE,
    options.invalid ? 'border-casa-error focus-visible:ring-casa-error' : 'border-casa-border focus-visible:border-casa-gold',
  ].join(' ')
}

export const MODAL_SIZES = ['sm', 'md', 'lg', 'xl']

const MODAL_SIZE_CLASSES = {
  sm: 'max-w-xs',
  md: 'max-w-sm',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
}

/**
 * Panel class name for the centered Modal primitive. Ownership of the
 * backdrop/animation lives in the Modal component itself — this only
 * builds the static panel classes so size logic stays testable.
 * @param {{size?: string}} [options]
 * @returns {string}
 */
export function modalPanelClassName(options = {}) {
  const size = MODAL_SIZES.includes(options.size) ? options.size : 'md'
  return [
    'relative z-modal w-[calc(100vw-2rem)] bg-casa-surface rounded-modal shadow-modal',
    MODAL_SIZE_CLASSES[size],
  ].join(' ')
}

export const SHEET_SIDES = ['bottom', 'right']

const SHEET_SIDE_CLASSES = {
  bottom: 'left-0 right-0 bottom-0 rounded-t-modal max-h-[85vh]',
  right: 'top-0 right-0 bottom-0 h-full w-[min(400px,90vw)] rounded-l-modal',
}

/**
 * Panel class name for the Sheet primitive (bottom drawer on phone/kiosk,
 * optionally a right-side drawer on wider surfaces).
 * @param {{side?: string}} [options]
 * @returns {string}
 */
export function sheetPanelClassName(options = {}) {
  const side = SHEET_SIDES.includes(options.side) ? options.side : 'bottom'
  return [
    'fixed z-modal bg-casa-surface shadow-modal border-casa-border',
    side === 'bottom' ? 'border-t' : 'border-l',
    SHEET_SIDE_CLASSES[side],
  ].join(' ')
}
