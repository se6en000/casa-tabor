import { createContext, useContext, useEffect, useState } from 'react'

// Recipes V2 is phone first (Jake: "more importantly my phone/tablet as that more realistic of a device I will have on
// hand"), with a tablet layout (a laptop too) and the wall's touch sizes.
export type RecipesLayout = 'phone' | 'tablet' | 'wall'
export const LayoutContext = createContext<RecipesLayout>('phone')
export const useLayout = () => useContext(LayoutContext)

const TABLET_PX = 700

export function useLayoutFor(onWall: boolean): RecipesLayout {
  const query = `(min-width: ${TABLET_PX}px)`
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && Boolean(window.matchMedia?.(query).matches))
  useEffect(() => {
    if (onWall || !window.matchMedia) return
    const m = window.matchMedia(query)
    const on = () => setWide(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [onWall, query])
  return onWall ? 'wall' : wide ? 'tablet' : 'phone'
}

const TYPE = {
  phone: { title: 'text-phone-title', heading: 'text-phone-heading', body: 'text-phone-body', detail: 'text-phone-detail', label: 'text-phone-label', step: 'text-phone-move', pill: 'h-[52px]', chip: 'h-[38px]', icon: 20 },
  tablet: { title: 'text-phone-magnified', heading: 'text-phone-heading', body: 'text-phone-body', detail: 'text-phone-detail', label: 'text-phone-label', step: 'text-phone-magnified', pill: 'h-[52px]', chip: 'h-[40px]', icon: 20 },
  wall: { title: 'text-wall-title', heading: 'text-wall-date', body: 'text-wall-body', detail: 'text-wall-detail', label: 'text-wall-label', step: 'text-wall-move', pill: 'h-[64px]', chip: 'h-[52px]', icon: 26 },
} as const
export const useT = () => TYPE[useLayout()]
