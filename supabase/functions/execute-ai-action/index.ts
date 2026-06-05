import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { tool, args } = await req.json()

  try {
    if (tool === 'create_event') {
      const { data: event, error } = await sb.from('events').insert({
        title: args.title,
        start_time: args.start,
        end_time: args.end,
        location_name: args.location ?? null,
        all_day: args.all_day ?? false,
        description: args.notes ?? null,
        status: 'confirmed',
        is_enriched: false,
        event_type: args.event_type ?? 'event',
      }).select().single()

      if (error) throw new Error(error.message)

      // Add members
      if (args.members?.length > 0) {
        const { data: family } = await sb.from('family_members').select('id, name')
        const memberIds = (args.members as string[])
          .map((name: string) => (family ?? []).find((f: { id: string; name: string }) => f.name.toLowerCase() === name.toLowerCase())?.id)
          .filter(Boolean)
        if (memberIds.length > 0) {
          await sb.from('event_members').insert(
            memberIds.map((id, i) => ({ event_id: event.id, family_member_id: id, role: i === 0 ? 'primary' : 'attendee' }))
          )
        }
      }

      // Fire enrichment async (slow — Gemini AI, don't block)
      sb.functions.invoke('enrich-event', { body: { event_id: event.id } }).catch(() => {})
      // Await Google sync — fire-and-forget can be killed before completion in Deno Deploy
      await sb.functions.invoke('create-google-event', { body: { event_id: event.id } }).catch(() => {})

      return new Response(JSON.stringify({ success: true, event_id: event.id }), {
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    if (tool === 'update_event') {
      const updates: Record<string, unknown> = {}
      if (args.title !== undefined) updates.title = args.title
      if (args.start !== undefined) updates.start_time = args.start
      if (args.end !== undefined) updates.end_time = args.end
      const locationChanged = args.location !== undefined
      if (locationChanged) { updates.location_name = args.location; updates.is_enriched = false }
      if (args.notes !== undefined) updates.description = args.notes
      if (args.all_day !== undefined) updates.all_day = args.all_day

      if (Object.keys(updates).length > 0) {
        const { error } = await sb.from('events').update(updates).eq('id', args.id)
        if (error) throw new Error(error.message)
      }

      // Handle member additions
      if (args.members_add?.length > 0) {
        const { data: family } = await sb.from('family_members').select('id, name')
        const addIds = (args.members_add as string[])
          .map((name: string) => (family ?? []).find((f: { id: string; name: string }) => f.name.toLowerCase() === name.toLowerCase())?.id)
          .filter(Boolean)
        if (addIds.length > 0) {
          await sb.from('event_members').upsert(
            addIds.map(id => ({ event_id: args.id, family_member_id: id, role: 'attendee' })),
            { onConflict: 'event_id,family_member_id', ignoreDuplicates: true }
          )
        }
      }

      // Handle member removals
      if (args.members_remove?.length > 0) {
        const { data: family } = await sb.from('family_members').select('id, name')
        const removeIds = (args.members_remove as string[])
          .map((name: string) => (family ?? []).find((f: { id: string; name: string }) => f.name.toLowerCase() === name.toLowerCase())?.id)
          .filter(Boolean)
        if (removeIds.length > 0) {
          await sb.from('event_members').delete().eq('event_id', args.id).in('family_member_id', removeIds)
        }
      }

      // Re-enrich if location changed (slow — don't block)
      if (locationChanged) {
        sb.functions.invoke('enrich-event', { body: { event_id: args.id } }).catch(() => {})
      }
      // Await Google sync to ensure it completes before Deno terminates the function
      await sb.functions.invoke('push-to-google', { body: { event_id: args.id } }).catch(() => {})

      return new Response(JSON.stringify({ success: true, event_id: args.id }), {
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    if (tool === 'delete_event') {
      await sb.functions.invoke('delete-google-event', { body: { event_id: args.id } }).catch(() => {})
      const { error } = await sb.from('events').update({ status: 'cancelled' }).eq('id', args.id)
      if (error) throw new Error(error.message)
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    if (tool === 'add_grocery_items') {
      const { data: lists } = await sb.from('grocery_lists').select('id').order('created_at').limit(1)
      const listId = lists?.[0]?.id
      if (!listId) throw new Error('No grocery list found')

      const items = (args.items as { name: string; quantity?: string; unit?: string; category?: string; notes?: string }[]).map(i => ({
        list_id: listId,
        name: i.name,
        quantity: i.quantity ?? null,
        unit: i.unit ?? null,
        category: i.category ?? 'other',
        notes: i.notes ?? null,
        checked: false,
      }))
      const { error } = await sb.from('grocery_items').insert(items)
      if (error) throw new Error(error.message)
      return new Response(JSON.stringify({ success: true, count: items.length }), {
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    if (tool === 'check_grocery_item') {
      const { error } = await sb.from('grocery_items').update({ checked: args.checked }).eq('id', args.item_id)
      if (error) throw new Error(error.message)
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    if (tool === 'clear_checked_grocery_items') {
      const { error } = await sb.from('grocery_items').delete().eq('checked', true)
      if (error) throw new Error(error.message)
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Unknown tool' }), {
      status: 400, headers: { ...CORS, 'content-type': 'application/json' },
    })
  } catch (e) {
    const msg = (e as Error).message ?? 'Action failed'
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 200, headers: { ...CORS, 'content-type': 'application/json' },
    })
  }
})
