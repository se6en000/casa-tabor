export interface LaneMemberInput {
  id: string
  name: string
  sort_order?: number | null
  show_on_home_sidebar?: boolean | null
  role?: string | null
  can_drive?: boolean | null
}

// Full class names so Tailwind sees them. Order matches the approved design:
// graphite, smoke, aubergine, madder, ochre, moss.
const LANE_PIGMENT_CLASSES = [
  'bg-wall-pigment-1',
  'bg-wall-pigment-2',
  'bg-wall-pigment-3',
  'bg-wall-pigment-4',
  'bg-wall-pigment-5',
  'bg-wall-pigment-6',
] as const

function isSitter(member: LaneMemberInput): boolean {
  return member.role === 'caregiver' || member.can_drive === true
}

/**
 * People who get a lane, in the family's chosen order: everyone switched on
 * for the home screen, plus any sitter/driver who is switched off but has
 * something today (activeTodayIds), so a fill-in sitter appears when needed.
 */
export function selectLaneMembers<T extends LaneMemberInput>(
  members: T[],
  activeTodayIds: ReadonlySet<string> = new Set(),
): T[] {
  return members
    .filter((member) => member.show_on_home_sidebar !== false || (activeTodayIds.has(member.id) && isSitter(member)))
    .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999) || a.name.localeCompare(b.name))
}

export function pigmentClassFor(laneIndex: number): string {
  return LANE_PIGMENT_CLASSES[laneIndex % LANE_PIGMENT_CLASSES.length]
}

export interface PigmentStyle {
  /** Discs and monograms. */
  solid: string
  /** Time at a place (school). */
  tint: string
  /** A timed activity. */
  strong: string
  /** A driving leg, hatched in the driver's color. */
  hatch: string
  /** Outline for items whose place isn't known. */
  outline: string
}

// Written out in full so Tailwind generates every class.
const PIGMENT_STYLES: readonly PigmentStyle[] = [
  { solid: 'bg-wall-pigment-1', tint: 'bg-wall-pigment-1/20', strong: 'bg-wall-pigment-1/50', outline: 'border-wall-pigment-1', hatch: 'bg-[repeating-linear-gradient(135deg,var(--color-wall-pigment-1)_0_3px,color-mix(in_srgb,var(--color-wall-pigment-1)_14%,transparent)_3px_8px)]' },
  { solid: 'bg-wall-pigment-2', tint: 'bg-wall-pigment-2/20', strong: 'bg-wall-pigment-2/50', outline: 'border-wall-pigment-2', hatch: 'bg-[repeating-linear-gradient(135deg,var(--color-wall-pigment-2)_0_3px,color-mix(in_srgb,var(--color-wall-pigment-2)_14%,transparent)_3px_8px)]' },
  { solid: 'bg-wall-pigment-3', tint: 'bg-wall-pigment-3/20', strong: 'bg-wall-pigment-3/50', outline: 'border-wall-pigment-3', hatch: 'bg-[repeating-linear-gradient(135deg,var(--color-wall-pigment-3)_0_3px,color-mix(in_srgb,var(--color-wall-pigment-3)_14%,transparent)_3px_8px)]' },
  { solid: 'bg-wall-pigment-4', tint: 'bg-wall-pigment-4/20', strong: 'bg-wall-pigment-4/50', outline: 'border-wall-pigment-4', hatch: 'bg-[repeating-linear-gradient(135deg,var(--color-wall-pigment-4)_0_3px,color-mix(in_srgb,var(--color-wall-pigment-4)_14%,transparent)_3px_8px)]' },
  { solid: 'bg-wall-pigment-5', tint: 'bg-wall-pigment-5/20', strong: 'bg-wall-pigment-5/50', outline: 'border-wall-pigment-5', hatch: 'bg-[repeating-linear-gradient(135deg,var(--color-wall-pigment-5)_0_3px,color-mix(in_srgb,var(--color-wall-pigment-5)_14%,transparent)_3px_8px)]' },
  { solid: 'bg-wall-pigment-6', tint: 'bg-wall-pigment-6/20', strong: 'bg-wall-pigment-6/50', outline: 'border-wall-pigment-6', hatch: 'bg-[repeating-linear-gradient(135deg,var(--color-wall-pigment-6)_0_3px,color-mix(in_srgb,var(--color-wall-pigment-6)_14%,transparent)_3px_8px)]' },
]

export function pigmentStyleFor(index: number): PigmentStyle {
  return PIGMENT_STYLES[index % PIGMENT_STYLES.length]
}
