import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  try {
    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { action, event_id, prep_item_id, snooze_minutes } = await req.json() as {
      action?: string
      event_id?: string
      prep_item_id?: string
      snooze_minutes?: number
    }
    if (!action || (!event_id && !prep_item_id)) return json({ ok: false, error: 'Missing action or target id' }, 400)
    const snoozeMinutes = [15, 60, 1440].includes(snooze_minutes ?? 15) ? (snooze_minutes ?? 15) : 15

    if (prep_item_id) {
      if (action === 'done' || action === 'complete') {
        const { data: resolution, error: resolutionError } = await sb.rpc('resolve_prep_item', {
          p_prep_item_id: prep_item_id,
          p_outcome: 'done',
        })
        if (resolutionError) return json({ ok: false, error: resolutionError.message }, 500)

        await sb.from('notifications').insert({
          type: 'push_action_done',
          title: resolution?.reminder_completed ? 'Reminder completed' : 'Action marked done',
          body: resolution?.reminder_completed
            ? 'The reminder and action were completed.'
            : 'The action was permanently completed.',
          source: 'system',
        })
        return json({ ok: true, action: 'done', prep_item_id, resolution })
      }

      if (action === 'thumbs_down' || action === 'downvote') {
        // Single source of truth for "downvote" -- shared with the web app's
        // ActionHubPage and HomeRightPanel via useDownvotePrepItem(), so pressing
        // downvote always records real feedback and feeds the suppression loop,
        // regardless of which surface it's pressed from.
        const { data: resolution, error: resolutionError } = await sb.rpc('record_prep_item_downvote', {
          p_prep_item_id: prep_item_id,
        })
        if (resolutionError) return json({ ok: false, error: resolutionError.message }, 500)

        await sb.from('notifications').insert({
          type: 'push_action_thumbs_down',
          title: 'Feedback recorded',
          body: 'Marked not relevant and dismissed.',
          source: 'system',
        })
        return json({ ok: true, action: 'thumbs_down', prep_item_id, resolution })
      }

      if (action === 'snooze') {
        const snoozedUntil = new Date(Date.now() + snoozeMinutes * 60 * 1000).toISOString()
        const { data: snoozeResult, error: snoozeError } = await sb.rpc('snooze_prep_item', {
          p_prep_item_id: prep_item_id,
          p_snoozed_until: snoozedUntil,
        })
        if (snoozeError) return json({ ok: false, error: snoozeError.message }, 500)
        return json({ ok: true, action: 'snooze', prep_item_id, snoozed_until: snoozedUntil, result: snoozeResult })
      }

      return json({ ok: false, error: 'Unsupported action for prep item' }, 400)
    }

    const { data: eventRow } = await sb
      .from('events')
      .select('id, title, event_type, start_time, end_time')
      .eq('id', event_id)
      .single()

    if (action === 'done' || action === 'complete') {
      if (eventRow?.event_type === 'reminder') {
        const { error: completionError } = await sb.rpc('complete_reminder_with_linked_actions', {
          p_reminder_id: event_id,
        })
        if (completionError) return json({ ok: false, error: completionError.message }, 500)
      } else {
        await sb.from('events').update({ notified_at: new Date().toISOString() }).eq('id', event_id)
      }
      await sb.from('notifications').insert({
        type: 'push_action_done',
        title: eventRow?.event_type === 'reminder' ? 'Reminder completed' : 'Marked done',
        body: 'Notification acknowledged from push action.',
        event_id,
        source: 'system',
      })
      return json({ ok: true, action: 'done' })
    }

    if (action === 'snooze') {
      if (eventRow?.event_type !== 'reminder') {
        return json({ ok: false, error: 'Only reminder notifications can be snoozed.' }, 400)
      }
      const previousStart = Date.parse(eventRow.start_time)
      const previousEnd = Date.parse(eventRow.end_time)
      const durationMs = Number.isFinite(previousStart) && Number.isFinite(previousEnd)
        ? Math.max(5 * 60 * 1000, previousEnd - previousStart)
        : 5 * 60 * 1000
      const start = new Date(Date.now() + snoozeMinutes * 60 * 1000)
      const end = new Date(start.getTime() + durationMs)
      const { error: updateError } = await sb
        .from('events')
        .update({ start_time: start.toISOString(), end_time: end.toISOString() })
        .eq('id', event_id)
      if (updateError) return json({ ok: false, error: updateError.message }, 500)

      await sb.from('notifications').insert({
        type: 'push_action_snooze',
        title: `Snoozed ${snoozeMinutes} minutes`,
        body: eventRow.title,
        event_id,
        source: 'system',
      })
      return json({ ok: true, action: 'snooze', event_id, start_time: start.toISOString() })
    }

    if (action === 'thumbs_down' || action === 'downvote') {
      await sb.from('notifications').insert({
        type: 'push_action_thumbs_down',
        title: 'Feedback recorded',
        body: 'Marked not relevant from push action.',
        event_id,
        source: 'system',
      })
      await sb.from('events').update({ notified_at: new Date().toISOString() }).eq('id', event_id)
      return json({ ok: true, action: 'thumbs_down' })
    }

    return json({ ok: false, error: 'Unsupported action' }, 400)
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500)
  }
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
