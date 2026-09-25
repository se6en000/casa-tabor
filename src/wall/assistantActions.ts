// Confirming an assistant action from the Wall's band: the same request the
// full assistant (AIChatDrawer) sends to execute-ai-action. Kept separate so the
// old screen isn't touched while it's still in use; fold together when it retires (P5).

export type ActionResult =
  | { kind: 'done'; eventId?: string; actionId?: string }
  | { kind: 'conflict'; args: Record<string, unknown> }
  | { kind: 'error'; message: string }

const FAILED = 'That didn’t work. Nothing was changed.'

/** An update carries the event's last-changed time (a stale edit is refused); a re-confirmed clash allows it. */
export function requestArgsFor(tool: string, args: Record<string, unknown>, events: Array<{ id: string; updated_at?: string | null }>): Record<string, unknown> {
  if (tool === 'update_event') {
    const event = events.find((e) => e.id === String(args.id ?? ''))
    return event ? { ...args, expected_updated_at: event.updated_at } : args
  }
  if (tool === 'create_event' && (args.calendar_preflight || args.allow_calendar_conflicts)) return { ...args, allow_calendar_conflicts: true }
  return args
}

export function readActionResult(data: unknown, requestArgs: Record<string, unknown>): ActionResult {
  const body = data && typeof data === 'object' ? (data as Record<string, unknown>) : null
  if (!body) return { kind: 'error', message: FAILED }
  if (body.code === 'calendar_conflict_confirmation_required' && body.calendar_preflight) {
    return { kind: 'conflict', args: { ...requestArgs, calendar_preflight: body.calendar_preflight, allow_calendar_conflicts: true } }
  }
  if (body.success === false || typeof body.error === 'string') return { kind: 'error', message: typeof body.error === 'string' ? body.error : FAILED }
  return {
    kind: 'done',
    ...(typeof body.event_id === 'string' ? { eventId: body.event_id } : {}),
    ...(typeof body.action_id === 'string' ? { actionId: body.action_id } : {}),
  }
}

/** Supabase puts a non-2xx response body on error.context; read it so conflicts and messages aren't lost. */
export async function responseBody(data: unknown, error: unknown): Promise<unknown> {
  if (!error) return data
  const context = error && typeof error === 'object' && 'context' in error ? (error as { context?: unknown }).context : null
  if (context && typeof context === 'object' && 'json' in context) {
    try {
      const response = context as { clone?: () => unknown; json: () => Promise<unknown> }
      const readable = typeof response.clone === 'function' ? response.clone() : response
      return await (readable as { json: () => Promise<unknown> }).json()
    } catch {
      return null
    }
  }
  return data ?? null
}
