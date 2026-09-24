export interface AiCircuitBreakerState {
  paused?: boolean
  pause_scope?: 'none' | 'background' | 'all'
  pause_until?: string | null
  tripped_by?: 'auto' | 'manual'
  tripped_at?: string
  trip_reason?: string | null
  resumed_at?: string
  daily_cost_cap_usd?: number
  hourly_cost_cap_usd?: number
  hourly_token_cap?: number
  hourly_call_cap?: number
  auto_trip_enabled?: boolean
}

export interface SystemAlertSummary {
  id: string
  alert_key: string
  category?: string
  title: string
  detail: string
  opened_at?: string
}

export interface BreakerDescription {
  active: boolean
  auto: boolean
  scope: 'none' | 'background' | 'all'
  headline: string
  detail: string
}

export function isBreakerActive(state: AiCircuitBreakerState | null | undefined, nowMs?: number): boolean
export function describeBreaker(state: AiCircuitBreakerState | null | undefined, nowMs?: number): BreakerDescription
export function bannerAlerts<T extends SystemAlertSummary>(
  criticalAlerts: T[] | null | undefined,
  breakerState: AiCircuitBreakerState | null | undefined,
  nowMs?: number,
): T[]
