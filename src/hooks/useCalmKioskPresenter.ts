import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { differenceInMinutes, parseISO } from 'date-fns'
import { useLiveClock, greetingFor } from './useLiveClock'
import { useTodayEvents, type EventWithDetails } from './useCalendarEvents'
import { useWeekConflicts } from './useConflicts'
import { usePrepItems } from './usePrepItems'
import { useHomeWeather } from './useHomeWeather'
import { useAppStore } from '../stores/appStore'

export interface CalmKioskPresenterState {
  now: Date
  greeting: string
  dailyBriefing: string
  weather: ReturnType<typeof useHomeWeather>['data']
  nextEvent: EventWithDetails | null
  appointmentEvents: EventWithDetails[]
  isEvening: boolean
  isDinnerPast: boolean
  totalAttentionCount: number
  minutesUntilNext: number | null
  setCanvasSubmode: (submode: 'calm' | 'turbo') => void
  navigateTo: (path: string) => void
}

export function useCalmKioskPresenter(): CalmKioskPresenterState {
  const navigate = useNavigate()
  const { setCanvasSubmode } = useAppStore()
  const now = useLiveClock(10_000)
  const { data: todayEvents = [] } = useTodayEvents(now)
  const { data: conflicts = [] } = useWeekConflicts()
  const { data: prepItems = [] } = usePrepItems()
  const { data: weather } = useHomeWeather()

  // Find next upcoming event today (that hasn't ended yet)
  const nextEvent = useMemo(() => {
    const upcoming = todayEvents.filter((e) => {
      if (e.all_day) return false
      try {
        const start = parseISO(e.start_time)
        const end = parseISO(e.end_time)
        return end.getTime() > now.getTime() || start.getTime() > now.getTime() - 15 * 60 * 1000
      } catch {
        return false
      }
    })
    return upcoming[0] || null
  }, [todayEvents, now])

  // Filter appointment stream (exclude meals, hero item, stale ended items)
  const appointmentEvents = useMemo(() => {
    return todayEvents.filter((e) => {
      const cat = (e.enrichment?.category || (e as any).category || '').toLowerCase()
      const title = (e.title || '').toLowerCase()
      const isMeal =
        cat.includes('meal') ||
        cat.includes('prep') ||
        cat.includes('cook') ||
        title.includes('dinner') ||
        title.includes('lunch')
      if (isMeal) return false
      if (nextEvent && e.id === nextEvent.id) return false
      try {
        if (!e.all_day && parseISO(e.end_time).getTime() < now.getTime() - 30 * 60 * 1000) {
          return false
        }
      } catch {}
      return true
    })
  }, [todayEvents, nextEvent, now])

  const activeConflicts = useMemo(() => conflicts.filter((c) => !c.resolved), [conflicts])
  const activePrep = useMemo(() => prepItems.filter((p) => !p.dismissed), [prepItems])
  const totalAttentionCount = activeConflicts.length + activePrep.length

  const isEvening = now.getHours() >= 19
  const isDinnerPast = now.getHours() >= 20

  const dailyBriefing = useMemo(() => {
    if (isEvening) {
      if (todayEvents.length > 0) {
        return `Schedule complete for today · Rest & prepare for tomorrow · Dinner: Herb-Roasted Chicken`
      }
      return `Schedule complete for today · Rest & enjoy a quiet evening`
    }

    const count = todayEvents.length
    const pickupEvt = todayEvents.find((e) => {
      const t = (e.title || '').toLowerCase()
      return t.includes('pickup') || t.includes('picked up')
    })
    const pickupName = pickupEvt?.members?.[0]?.family_member?.name || (pickupEvt ? 'Giselle' : null)
    const pickupPart = pickupName ? ` · ${pickupName} on pickup` : ''
    const countPart = count > 0 ? `${count} appointment${count > 1 ? 's' : ''} today` : 'No appointments scheduled today'

    return `${countPart}${pickupPart} · Dinner: Herb-Roasted Chicken`
  }, [isEvening, todayEvents])

  const minutesUntilNext = useMemo(() => {
    if (!nextEvent) return null
    try {
      const start = parseISO(nextEvent.start_time)
      return differenceInMinutes(start, now)
    } catch {
      return null
    }
  }, [nextEvent, now])

  const greeting = greetingFor(now)

  return {
    now,
    greeting,
    dailyBriefing,
    weather,
    nextEvent,
    appointmentEvents,
    isEvening,
    isDinnerPast,
    totalAttentionCount,
    minutesUntilNext,
    setCanvasSubmode,
    navigateTo: navigate,
  }
}
