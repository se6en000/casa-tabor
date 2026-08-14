import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parseISO, differenceInMinutes, subMinutes } from 'date-fns'
import { useLiveClock, greetingFor } from './useLiveClock'
import { useTodayEvents, useTomorrowEvents, type EventWithDetails } from './useCalendarEvents'
import { useWeekConflicts } from './useConflicts'
import { usePrepItems } from './usePrepItems'
import { useHomeWeather } from './useHomeWeather'
import { useAppStore } from '../stores/appStore'

export interface CalmKioskPresenterState {
  now: Date
  greeting: string
  dailyBriefing: string
  timeHorizonLabel: string
  weather: ReturnType<typeof useHomeWeather>['data']
  nextEvent: EventWithDetails | null
  appointmentEvents: EventWithDetails[]
  todayEvents: EventWithDetails[]
  tomorrowEvents: EventWithDetails[]
  pickupsCount: number
  isEvening: boolean
  isDinnerPast: boolean
  totalAttentionCount: number
  minutesUntilNext: number | null
  driveTimeMins: number | null
  leaveAt: Date | null
  minutesUntilLeave: number | null
  isTravelEvent: boolean
  setCanvasSubmode: (submode: 'calm' | 'turbo') => void
  navigateTo: (path: string) => void
}

export function useCalmKioskPresenter(): CalmKioskPresenterState {
  const navigate = useNavigate()
  const { setCanvasSubmode } = useAppStore()
  const now = useLiveClock(10_000)
  const { data: todayEvents = [] } = useTodayEvents(now)
  const { data: tomorrowEvents = [] } = useTomorrowEvents(now)
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

  const hour = now.getHours()
  const isEvening = hour >= 18
  const isDinnerPast = hour >= 20

  const timeHorizonLabel = useMemo(() => {
    if (hour < 12) return 'Morning Briefing'
    if (hour < 17) return 'Afternoon Dispatch'
    return 'Evening Digest'
  }, [hour])

  const pickupsCount = useMemo(() => {
    return todayEvents.filter((e) => {
      const t = (e.title || '').toLowerCase()
      return t.includes('pickup') || t.includes('picked up') || t.includes('drop-off') || t.includes('carpool')
    }).length
  }, [todayEvents])

  const dailyBriefing = useMemo(() => {
    const weatherNote = weather
      ? weather.temp >= 85
        ? `Warm ${weather.temp}°F day ahead. Remember hydration & sun protection.`
        : weather.temp <= 50
        ? `Crisp ${weather.temp}°F conditions. Light jackets recommended.`
        : `${weather.temp}°F with ${weather.condition.toLowerCase()} skies.`
      : ''

    if (isEvening) {
      const count = tomorrowEvents.length
      if (count === 0) {
        return `Schedule complete for today. Tomorrow is open with no early appointments.`
      }

      const timedEvents = tomorrowEvents.filter((e) => !e.all_day)
      const firstEvent = timedEvents[0] || tomorrowEvents[0]

      let startTimeStr = ''
      if (!firstEvent.all_day) {
        try {
          startTimeStr = ` at ${format(parseISO(firstEvent.start_time), 'h:mm a')}`
        } catch {}
      }

      const pickupEvt = tomorrowEvents.find((e) => {
        const t = (e.title || '').toLowerCase()
        return t.includes('pickup') || t.includes('drop-off')
      })
      const pickupName = pickupEvt?.members?.[0]?.family_member?.name || (pickupEvt ? 'Giselle' : null)
      const pickupPart = pickupName ? ` · ${pickupName} on pickup duty` : ''

      return `Tomorrow: ${count} event${count > 1 ? 's' : ''} scheduled${firstEvent ? `, starting${startTimeStr} with ${firstEvent.title}` : ''}${pickupPart}.`
    }

    if (hour < 12) {
      const count = todayEvents.length
      const scheduleSummary = count > 0 ? `${count} event${count > 1 ? 's' : ''} scheduled for today.` : 'Open morning with clear schedule.'
      const nextSummary = nextEvent ? ` First up: ${nextEvent.title} at ${format(parseISO(nextEvent.start_time), 'h:mm a')}.` : ''
      return `${weatherNote} ${scheduleSummary}${nextSummary}`
    }

    // Afternoon
    const nextSummary = nextEvent
      ? ` Next up: ${nextEvent.title}${nextEvent.members?.[0]?.family_member?.name ? ` (${nextEvent.members[0].family_member.name})` : ''}.`
      : ' All afternoon appointments complete.'

    const dinnerNote = isDinnerPast ? ' Dinner served.' : ' Dinner planned for 6:30 PM.'

    return `${weatherNote}${nextSummary}${dinnerNote}`
  }, [isEvening, hour, todayEvents, tomorrowEvents, nextEvent, weather, isDinnerPast, now])

  const minutesUntilNext = useMemo(() => {
    if (!nextEvent) return null
    try {
      const start = parseISO(nextEvent.start_time)
      return differenceInMinutes(start, now)
    } catch {
      return null
    }
  }, [nextEvent, now])

  const driveTimeMins = useMemo(() => {
    if (!nextEvent) return null
    return nextEvent.enrichment?.drive_time_mins ?? null
  }, [nextEvent])

  const isTravelEvent = useMemo(() => {
    if (!nextEvent) return false
    if (nextEvent.all_day) return false
    const cat = (nextEvent.enrichment?.category || (nextEvent as any).category || '').toLowerCase()
    if (cat.includes('home') || cat.includes('hosted')) return false
    return Boolean(
      (driveTimeMins !== null && driveTimeMins > 0) ||
      nextEvent.enrichment?.departure_time ||
      nextEvent.address ||
      nextEvent.location_name
    )
  }, [nextEvent, driveTimeMins])

  const leaveAt = useMemo(() => {
    if (!nextEvent || nextEvent.all_day) return null
    try {
      if (nextEvent.enrichment?.departure_time) {
        return new Date(nextEvent.enrichment.departure_time)
      }
      const start = parseISO(nextEvent.start_time)
      if (driveTimeMins && driveTimeMins > 0) {
        return subMinutes(start, driveTimeMins)
      }
      return start
    } catch {
      return null
    }
  }, [nextEvent, driveTimeMins])

  const minutesUntilLeave = useMemo(() => {
    if (!leaveAt) return null
    return differenceInMinutes(leaveAt, now)
  }, [leaveAt, now])

  const greeting = greetingFor(now)

  return {
    now,
    greeting,
    dailyBriefing,
    timeHorizonLabel,
    weather,
    nextEvent,
    appointmentEvents,
    todayEvents,
    tomorrowEvents,
    pickupsCount,
    isEvening,
    isDinnerPast,
    totalAttentionCount,
    minutesUntilNext,
    driveTimeMins,
    leaveAt,
    minutesUntilLeave,
    isTravelEvent,
    setCanvasSubmode,
    navigateTo: navigate,
  }
}
