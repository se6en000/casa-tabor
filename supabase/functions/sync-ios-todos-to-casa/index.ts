// iOS -> Casa "To Do" reminders ingest, structural twin of sync-ios-to-casa
// (grocery/Shopping) but for the app's Today's To-Dos. Simpler than the
// grocery version: `events` has no unique-name constraint the way
// grocery_items does, so there's no 23505 merge-and-tombstone path needed --
// every write goes through the upsert_todo_reminder_from_ios RPC, which is
// idempotent per call (skips anything not strictly newer than what's stored),
// so duplicate/out-of-order entries in the same batch self-correct without
// needing batch-level pre-collapsing the way the grocery ingest does.
//
// Wire contract confirmed against the actual live Mac script (2026-09-17),
// not assumed: { reminder_id, title, completed, deleted, updated_at }. No
// due-date field is ever sent -- upsert_todo_reminder_from_ios defaults a
// missing due date to end-of-today itself.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { requireEnv } from '../_shared/env.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type IncomingTodoReminder = {
  reminder_id?: string
  id?: string
  identifier?: string
  title?: string
  name?: string
  completed?: boolean
  deleted?: boolean
  updated_at?: string | null
  updatedAt?: string | null
}

function getReminderId(reminder: IncomingTodoReminder): string {
  return String(reminder.reminder_id ?? reminder.id ?? reminder.identifier ?? '').trim()
}

function getTitle(reminder: IncomingTodoReminder): string {
  return String(reminder.title ?? reminder.name ?? '').trim()
}

function getUpdatedAt(reminder: IncomingTodoReminder): string {
  const raw = reminder.updated_at ?? reminder.updatedAt ?? null
  const parsed = raw ? Date.parse(raw) : NaN
  return Number.isNaN(parsed) ? new Date().toISOString() : new Date(parsed).toISOString()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  let debugReminderId = ''
  let debugStage = 'initial'

  try {
    const sb = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'))
    const { reminders } = await req.json().catch(() => ({ reminders: [] }))
    const incoming = Array.isArray(reminders) ? (reminders as IncomingTodoReminder[]) : []

    let inserted = 0
    let updated = 0
    let skippedStale = 0
    let skippedMissingId = 0

    debugStage = 'starting-loop'
    for (const reminder of incoming) {
      const reminderId = getReminderId(reminder)
      if (!reminderId) {
        skippedMissingId += 1
        continue
      }
      debugReminderId = reminderId
      debugStage = 'calling-upsert-rpc'

      const { data, error } = await sb.rpc('upsert_todo_reminder_from_ios', {
        p_ios_reminder_id: reminderId,
        p_title: getTitle(reminder),
        p_completed: Boolean(reminder.completed),
        p_deleted: Boolean(reminder.deleted),
        p_ios_updated_at: getUpdatedAt(reminder),
      })
      if (error) throw new Error(error.message)

      if (data?.skipped_stale) skippedStale += 1
      else if (data?.action === 'inserted') inserted += 1
      else if (data?.action === 'updated') updated += 1
    }

    return new Response(
      JSON.stringify({
        success: true,
        inserted,
        updated,
        skipped_stale: skippedStale,
        skipped_missing_id: skippedMissingId,
        processed: incoming.length,
      }),
      { headers: { ...CORS, 'content-type': 'application/json' } }
    )
  } catch (error) {
    const message = (error as Error).message ?? 'sync-ios-todos-to-casa failed'
    return new Response(
      JSON.stringify({ success: false, error: message, debug: { reminder_id: debugReminderId || null, stage: debugStage } }),
      { status: 500, headers: { ...CORS, 'content-type': 'application/json' } }
    )
  }
})
