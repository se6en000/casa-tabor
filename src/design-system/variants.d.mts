export type ButtonVariant = 'primary' | 'strong' | 'secondary' | 'subtle' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export const BUTTON_VARIANTS: ButtonVariant[]
export const BUTTON_SIZES: ButtonSize[]

export function buttonClassName(options?: {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  loading?: boolean
}): string

export type IconButtonVariant = 'primary' | 'strong' | 'secondary' | 'ghost' | 'danger'
export type IconButtonSize = 'sm' | 'md' | 'lg'

export const ICON_BUTTON_VARIANTS: IconButtonVariant[]
export const ICON_BUTTON_SIZES: IconButtonSize[]

export function iconButtonClassName(options?: {
  variant?: IconButtonVariant
  size?: IconButtonSize
}): string

export type ChipTone = 'neutral' | 'accent' | 'success' | 'info' | 'warning' | 'danger'
export type ChipSize = 'sm' | 'md'

export const CHIP_TONES: ChipTone[]
export const CHIP_SIZES: ChipSize[]

export function chipClassName(options?: {
  tone?: ChipTone
  size?: ChipSize
  selected?: boolean
  interactive?: boolean
}): string

export function segmentedControlClassName(options?: { fullWidth?: boolean }): string
export function segmentedControlThumbClassName(options?: { dragging?: boolean }): string
export function segmentedControlItemClassName(options?: { selected?: boolean }): string

export type CardPadding = 'none' | 'sm' | 'md' | 'lg'
export type CardTone = 'surface' | 'subtle' | 'accent'

export const CARD_PADDINGS: CardPadding[]
export const CARD_TONES: CardTone[]

export function cardClassName(options?: {
  padding?: CardPadding
  tone?: CardTone
  interactive?: boolean
}): string

export function fieldControlClassName(options?: { invalid?: boolean }): string

export type ModalSize = 'sm' | 'md' | 'lg'
export const MODAL_SIZES: ModalSize[]

export function modalPanelClassName(options?: { size?: ModalSize }): string

export type SheetSide = 'bottom' | 'right'
export const SHEET_SIDES: SheetSide[]

export function sheetPanelClassName(options?: { side?: SheetSide }): string
