// complete-morning-prep-reminders
// Called by pg_cron every 15 minutes.
// Auto-completes today's still-open "morning_prep" reminders (the Bedtime
// Prep Checklist's user-added items -- see createMorningPrepReminder in
// src/lib/eventMutations.ts) once the morning school-drop-off window has
// passed, so a reminder like "give Liv lunch money" doesn't sit open all
// day after it's no longer relevant.
//
// Deliberately a simple, timezone-fixed cutoff (9:00 AM America/New_York)
// rather than replicating the client's full routine-departure computation
// (which depends on member_availability_rules) server-side -- morning drop
// -offs in this household run well before 9am, so this is a safe proxy for
// "the morning rush is over" without needing that whole pipeline here too.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { getCorrelationId, withCorrelationHeaders } from '../_shared/correlation.ts'
import { requireEnv } from '../_shared/env.ts'

const CUTOFF_HOUR_ET = 9

function isPastCutoffInHousehold(now: Date): boolean {
  const etHour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      hour12: false,
    }).format(now),
  )
  return etHour >= CUTOFF_HOUR_ET
}

function todayDateStringInHousehold(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now) // yyyy-MM-dd
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const correlationId = getCorrelationId(req, 'morning-prep-sweep')
  try {
    const supabaseUrl = requireEnv('SUPABASE_URL')
    const supabase = createClient(supabaseUrl, requireEnv('SUPABASE_SERVICE_ROLE_KEY'))
    const now = new Date()

    if (!isPastCutoffInHousehold(now)) {
      return json({ ok: true, correlation_id: correlationId, swept: 0, reason: 'before_cutoff' }, 200, correlationId)
    }

    const todayStr = todayDateStringInHousehold(now)
    const dayStartUtc = new Date(`${todayStr}T00:00:00-04:00`).toISOString() // ET is UTC-4/-5; -4 covers DST, a few-hour slack either side is harmless here
    const dayEndUtc = new Date(`${todayStr}T23:59:59-04:00`).toISOString()

    const { data: reminders, error: fetchErr } = await supabase.rpc('get_morning_prep_reminders', {
      p_range_start: dayStartUtc,
      p_range_end: dayEndUtc,
    })

    if (fetchErr) throw fetchErr

    const openReminders = (reminders ?? []).filter((reminder) => reminder.status !== 'cancelled')

    let swept = 0
    for (const reminder of openReminders) {
      const { error: rpcErr } = await supabase.rpc('complete_reminder_with_linked_actions', {
        p_reminder_id: reminder.id,
      })
      if (rpcErr) {
        console.warn(`[complete-morning-prep-reminders][${correlationId}] RPC failed for ${reminder.id}, falling back to direct status update:`, rpcErr.message)
        const { error: fallbackErr } = await supabase
          .from('events')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('id', reminder.id)
        if (fallbackErr) {
          console.error(`[complete-morning-prep-reminders][${correlationId}] Fallback also failed for ${reminder.id}:`, fallbackErr.message)
          continue
        }
      }
      swept++
    }

    return json({ ok: true, correlation_id: correlationId, swept }, 200, correlationId)
  } catch (err) {
    console.error(`[complete-morning-prep-reminders][${correlationId}]`, err)
    return json({ ok: false, correlation_id: correlationId, error: getErrorMessage(err) }, 500, correlationId)
  }
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-correlation-id',
}

function json(data: unknown, status = 200, correlationId?: string) {
  return new Response(JSON.stringify(data), {
    status,
    headers: withCorrelationHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }, correlationId ?? `morning-prep-sweep-${crypto.randomUUID()}`),
  })
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && err && 'message' in err && typeof (err as { message?: unknown }).message === 'string') {
    return (err as { message: string }).message
  }
  return String(err)
}
