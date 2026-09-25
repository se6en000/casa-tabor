export interface LaneMemberInput {
  id: string
  name: string
  sort_order: number | null
  show_on_home_sidebar?: boolean | null
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

/** People who get a lane: the ones the family shows on the home screen, in their chosen order. */
export function selectLaneMembers<T extends LaneMemberInput>(members: T[]): T[] {
  return members
    .filter((member) => member.show_on_home_sidebar !== false)
    .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999) || a.name.localeCompare(b.name))
}

export function pigmentClassFor(laneIndex: number): string {
  return LANE_PIGMENT_CLASSES[laneIndex % LANE_PIGMENT_CLASSES.length]
}
