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

    const { action, event_id, prep_item_id } = await req.json() as { action?: string; event_id?: string; prep_item_id?: string }
    if (!action || (!event_id && !prep_item_id)) return json({ ok: false, error: 'Missing action or target id' }, 400)

    if (prep_item_id) {
      const nowIso = new Date().toISOString()

      if (action === 'done' || action === 'complete') {
        await sb
          .from('prep_items')
          .update({ dismissed: true, dismissed_at: nowIso })
          .eq('id', prep_item_id)

        await sb.from('notifications').insert({
          type: 'push_action_done',
          title: 'Action marked done',
          body: 'Notification action completed.',
          source: 'system',
        })
        return json({ ok: true, action: 'done', prep_item_id })
      }

      if (action === 'thumbs_down' || action === 'downvote') {
        const { data: item } = await sb
          .from('prep_items')
          .select('id, source_type, source_pattern_key, source_ref, downvoted_count')
          .eq('id', prep_item_id)
          .maybeSingle()

        if (!item) return json({ ok: false, error: 'Prep item not found' }, 404)

        const patternKey = item.source_pattern_key || 'action:general'

        await sb.from('prep_item_feedback').insert({
          prep_item_id,
          source_type: item.source_type ?? 'unknown',
          source_pattern_key: patternKey,
          source_ref: item.source_ref ?? null,
          feedback: 'not_relevant',
          created_at: nowIso,
        })

        const { data: suppression } = await sb
          .from('prep_item_suppressions')
          .select('id, strength, hard_suppressed')
          .eq('pattern_key', patternKey)
          .maybeSingle()

        const nextStrength = (suppression?.strength ?? 0) + 1
        const hardSuppressed = (suppression?.hard_suppressed ?? false) || nextStrength >= 3

        if (suppression?.id) {
          await sb
            .from('prep_item_suppressions')
            .update({
              strength: nextStrength,
              hard_suppressed: hardSuppressed,
              last_feedback_at: nowIso,
              updated_at: nowIso,
            })
            .eq('id', suppression.id)
        } else {
          await sb
            .from('prep_item_suppressions')
            .insert({
              pattern_key: patternKey,
              strength: 1,
              hard_suppressed: false,
              last_feedback_at: nowIso,
              updated_at: nowIso,
            })
        }

        await sb
          .from('prep_items')
          .update({
            dismissed: true,
            dismissed_at: nowIso,
            downvoted_count: (item.downvoted_count ?? 0) + 1,
            last_feedback_at: nowIso,
            relevance_score: -1,
          })
          .eq('id', prep_item_id)

        if (nextStrength >= 2) {
          await sb
            .from('prep_items')
            .update({ dismissed: true, dismissed_at: nowIso })
            .eq('dismissed', false)
            .eq('source_pattern_key', patternKey)
        }

        await sb.from('notifications').insert({
          type: 'push_action_thumbs_down',
          title: 'Feedback recorded',
          body: 'Marked not relevant and dismissed.',
          source: 'system',
        })
        return json({ ok: true, action: 'thumbs_down', prep_item_id })
      }

      return json({ ok: false, error: 'Unsupported action for prep item' }, 400)
    }

    const { data: eventRow } = await sb
      .from('events')
      .select('id, title, event_type')
      .eq('id', event_id)
      .single()

    if (action === 'done' || action === 'complete') {
      if (eventRow?.event_type === 'reminder') {
        await sb.from('events').update({ status: 'cancelled' }).eq('id', event_id)
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
      const now = new Date()
      const start = new Date(now.getTime() + 10 * 60 * 1000)
      const end = new Date(now.getTime() + 15 * 60 * 1000)
      const title = eventRow?.title ? `Reminder: ${eventRow.title}` : 'Reminder'

      const { error: insertErr } = await sb.from('events').insert({
        title,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        event_type: 'reminder',
      })

      if (insertErr) return json({ ok: false, error: insertErr.message }, 500)

      await sb.from('notifications').insert({
        type: 'push_action_snooze',
        title: 'Snoozed 10 minutes',
        body: title,
        event_id,
        source: 'system',
      })
      return json({ ok: true, action: 'snooze' })
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
