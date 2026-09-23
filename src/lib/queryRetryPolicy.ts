// Postgres/PostgREST error codes that mean "this will never succeed by
// retrying" (a unique/FK/check-constraint violation, a permissions error, or
// a genuinely malformed query) -- retrying these just delays the user seeing
// the real error. Everything else (network errors, timeouts, 5xx, or any
// error shape we don't recognize -- this app's query functions aren't
// consistent about attaching an HTTP status) gets a bounded retry, since
// the 2026-09 latency investigation found real, transient cold-DB-connection
// failures that a single retry sometimes wasn't enough to ride out.
const NON_RETRYABLE_POSTGRES_CODES = new Set([
  '23505', // unique_violation
  '23503', // foreign_key_violation
  '23514', // check_violation
  '42501', // insufficient_privilege
  '42P01', // undefined_table
  '42703', // undefined_column
  'PGRST301', // JWT expired -- needs reauth, not a retry
])

export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false
  const code = (error as { code?: unknown } | null)?.code
  if (typeof code === 'string' && NON_RETRYABLE_POSTGRES_CODES.has(code)) return false
  return true
}
