// Self-hosted client-side error/crash monitoring (no Sentry account exists).
// Every real bug found this week -- the cron collision, the broken directory
// matching, the chat timeout bugs -- was found by a human noticing or by
// manually digging through logs, never by an automated signal. This reports
// window.onerror/unhandledrejection/React error-boundary crashes to a
// dedicated Edge Function (log-client-error), which writes them with the
// service role -- the client itself has no direct table access, matching the
// existing ai_drawer_debug_events security posture.
//
// A render loop or a repeating background failure must never turn this into
// its own incident: capped at MAX_REPORTS_PER_SESSION, and an identical
// message is only reported once per session (DEDUPE_WINDOW is effectively
// "for the rest of this session" -- a Set, not a time-based TTL, since a
// crash that keeps recurring identically adds no new information after the
// first report).
const MAX_REPORTS_PER_SESSION = 20
const seenMessages = new Set<string>()
let reportCount = 0

export type ClientErrorSource = 'window.onerror' | 'unhandledrejection' | 'react-error-boundary'

export function reportClientError(error: unknown, source: ClientErrorSource): void {
  try {
    if (reportCount >= MAX_REPORTS_PER_SESSION) return
    const message = error instanceof Error ? error.message : String(error)
    const stack = error instanceof Error ? error.stack : undefined
    const dedupeKey = `${source}:${message}`
    if (seenMessages.has(dedupeKey)) return
    seenMessages.add(dedupeKey)
    reportCount++

    void fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/log-client-error`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        message,
        stack,
        source,
        url: typeof window !== 'undefined' ? window.location.href : undefined,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        build_id: typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : undefined,
      }),
    }).catch(() => {}) // reporting a failure must never itself throw
  } catch {
    // Never let error reporting be the thing that crashes the app.
  }
}

export function initGlobalErrorReporting(): void {
  if (typeof window === 'undefined') return
  window.addEventListener('error', (event) => {
    reportClientError(event.error ?? new Error(event.message), 'window.onerror')
  })
  window.addEventListener('unhandledrejection', (event) => {
    reportClientError(event.reason, 'unhandledrejection')
  })
}
