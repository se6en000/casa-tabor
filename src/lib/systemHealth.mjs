// Shared by the home-screen SystemHealthBanner and the System Health settings page.
// Mirrors isTrafficBlockedByBreaker in supabase/functions/_shared/provider-call-ledger.mjs
// so the UI never claims "paused" when the edge functions would let calls through.

export function isBreakerActive(state, nowMs = Date.now()) {
  if (!state || state.paused !== true) return false
  if (state.pause_scope !== 'all' && state.pause_scope !== 'background') return false
  if (state.pause_until) {
    const until = Date.parse(state.pause_until)
    if (Number.isFinite(until) && until <= nowMs) return false
  }
  return true
}

export function describeBreaker(state, nowMs = Date.now()) {
  if (!isBreakerActive(state, nowMs)) {
    return { active: false, auto: false, scope: 'none', headline: 'AI live', detail: '' }
  }
  const auto = state.tripped_by === 'auto'
  const scope = state.pause_scope
  const headline = scope === 'all' ? 'All AI paused' : 'Background AI paused'
  const cause = auto
    ? `Unusual usage tripped the circuit breaker${state.trip_reason ? `: ${state.trip_reason}` : ''}.`
    : 'Paused by hand from settings.'
  const effect = scope === 'all'
    ? 'Chat, voice, and background jobs are stopped until you resume.'
    : 'Chat still works; email scanning and other background AI wait until you resume.'
  const until = state.pause_until
    ? ` Resumes automatically at ${new Date(state.pause_until).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`
    : ''
  return { active: true, auto, scope, headline, detail: `${cause} ${effect}${until}` }
}

// The breaker card already explains a runaway-spend trip, so don't repeat that alert.
export function bannerAlerts(criticalAlerts, breakerState, nowMs = Date.now()) {
  const list = Array.isArray(criticalAlerts) ? criticalAlerts : []
  if (!isBreakerActive(breakerState, nowMs)) return list
  return list.filter((alert) => alert.alert_key !== 'ai_spend:runaway')
}
