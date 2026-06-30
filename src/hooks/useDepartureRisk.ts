import { differenceInMinutes } from 'date-fns'
import type { EventWithDetails } from './useCalendarEvents'
import type { TravelEtaResult } from './useTravelEta'

export type DepartureRiskLevel = 'go' | 'caution' | 'risk'

export interface DepartureRiskResult {
  level: DepartureRiskLevel
  title: string
  reasons: string[]
}

function weatherPenalty(weather: string | null | undefined): number {
  const value = String(weather ?? '').toLowerCase()
  if (!value) return 0
  if (/\b(thunder|storm|lightning|flood|severe)\b/.test(value)) return 2
  if (/\b(rain|showers|wind|snow)\b/.test(value)) return 1
  return 0
}

export function evaluateDepartureRisk(
  event: EventWithDetails,
  eta: TravelEtaResult | null | undefined,
  now: Date = new Date(),
): DepartureRiskResult {
  const reasons: string[] = []
  let score = 0

  if (!eta?.found || !eta.leave_by) {
    score += 1
    reasons.push('Live commute ETA unavailable')
  } else {
    const minsUntilLeave = differenceInMinutes(new Date(eta.leave_by), now)
    if (minsUntilLeave <= 0) {
      score += 3
      reasons.push('Leave now')
    } else if (minsUntilLeave <= 10) {
      score += 2
      reasons.push(`Leave in ${minsUntilLeave} min`)
    } else if (minsUntilLeave <= 25) {
      score += 1
      reasons.push(`Leave in ${minsUntilLeave} min`)
    }

    if ((eta.traffic_delay_mins ?? 0) >= 20) {
      score += 2
      reasons.push(`Heavy traffic (+${eta.traffic_delay_mins} min)`)
    } else if ((eta.traffic_delay_mins ?? 0) >= 10) {
      score += 1
      reasons.push(`Traffic delay (+${eta.traffic_delay_mins} min)`)
    }
  }

  const openChecklist = (event.checklist ?? []).filter((item) => !item.checked).length
  const openActions = (event.actions ?? []).filter((item) => !item.completed).length
  const totalOpenPrep = openChecklist + openActions
  if (totalOpenPrep > 0) {
    score += totalOpenPrep >= 4 ? 2 : 1
    reasons.push(`${totalOpenPrep} prep item${totalOpenPrep === 1 ? '' : 's'} open`)
  }

  const weatherScore = weatherPenalty(event.enrichment?.weather_at_event ?? event.enrichment?.weather_summary)
  if (weatherScore > 0) {
    score += weatherScore
    reasons.push(weatherScore > 1 ? 'Severe weather conditions' : 'Weather may impact timing')
  }

  if (score >= 4) return { level: 'risk', title: 'Departure risk high', reasons }
  if (score >= 2) return { level: 'caution', title: 'Departure needs attention', reasons }
  return { level: 'go', title: 'Departure on track', reasons: reasons.length > 0 ? reasons : ['Timing looks stable'] }
}
