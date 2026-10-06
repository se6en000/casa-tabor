import { createContext, useContext, useMemo } from 'react'
import { pigmentIndexes } from '../wall/score'
import { pigmentStyleFor } from '../wall/lanes'
import type { WallMember } from '../wall/engine/types'
import type { FamilyMember } from '../types'

export type SettingsSize = 'hand' | 'wall'
export const SizeContext = createContext<SettingsSize>('hand')
export const useSize = () => useContext(SizeContext)

const TYPE = {
  hand: { title: 'text-phone-title', heading: 'text-phone-heading', body: 'text-phone-body', detail: 'text-phone-detail', label: 'text-phone-label', row: 'min-h-[60px] py-[12px] px-[14px]', icon: 18, chip: 30 },
  wall: { title: 'text-wall-title', heading: 'text-wall-heading', body: 'text-wall-body', detail: 'text-wall-detail', label: 'text-wall-label', row: 'min-h-[84px] py-[16px] px-[26px]', icon: 26, chip: 44 },
} as const
export const useType = () => TYPE[useSize()]

/** A person's color class, the same as on the wall and the phone (colors follow family order). */
export function usePigment(members: FamilyMember[] | null) {
  const map = useMemo(() => pigmentIndexes((members ?? []) as unknown as WallMember[]), [members])
  return (id: string | null | undefined) => pigmentStyleFor(id ? map.get(id) ?? 0 : 0).solid
}
