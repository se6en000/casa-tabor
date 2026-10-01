// The person page and the routine editor are one design on two screens (canvas 16c–16e): the wall's sheet,
// read from across the room, and the phone's page. These are the sizes each uses.

export type Surface = 'wall' | 'phone'

export const SIZES = {
  wall: {
    name: 'font-display text-wall-name font-bold',
    heading: 'font-display text-wall-heading font-bold',
    label: 'text-wall-label font-bold tracking-[0.2em] text-wall-ink-2',
    body: 'text-wall-body',
    line: 'text-wall-detail font-semibold',
    detail: 'text-wall-detail text-wall-ink-2',
    small: 'text-wall-label text-wall-ink-2',
    pill: 'flex h-[52px] shrink-0 items-center justify-center gap-[8px] rounded-full px-[22px] text-wall-detail font-semibold',
    chip: 'flex h-[52px] min-w-[52px] items-center justify-center rounded-full px-[16px] text-wall-detail font-semibold',
    field: 'h-[52px] rounded-[12px] px-[16px] text-wall-detail',
    row: 'py-[12px]',
  },
  phone: {
    name: 'font-display text-phone-title font-bold',
    heading: 'font-display text-phone-heading font-bold',
    label: 'text-phone-label font-bold tracking-[0.2em] text-wall-ink-2',
    body: 'text-phone-body',
    line: 'text-phone-body font-semibold',
    detail: 'text-phone-detail text-wall-ink-2',
    small: 'text-phone-label text-wall-ink-2',
    pill: 'flex h-[44px] shrink-0 items-center justify-center gap-[6px] rounded-full px-[16px] text-phone-detail font-semibold',
    chip: 'flex h-[44px] min-w-[44px] items-center justify-center rounded-full px-[12px] text-phone-detail font-semibold',
    field: 'h-[44px] rounded-[10px] px-[12px] text-phone-body',
    row: 'py-[10px]',
  },
} as const

export const OUTLINE = 'border border-solid border-wall-ink-2 bg-transparent text-wall-ink'
export const SOLID = 'border-0 bg-wall-ink text-wall-on-pigment'
export const QUIET = 'border border-solid border-wall-rule bg-transparent text-wall-ink'
