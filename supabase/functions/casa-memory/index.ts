// What Casa knows about one person, for their page (canvas 16c, on the wall and the phone). casa_memory is
// server-only; this reads it with the privacy switch (off by default: Jake wants to see everything on the wall).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { aboutPerson } from '../_shared/casa-memory.mjs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { ...CORS, 'content-type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  const body = await req.json().catch(() => ({})) as { action?: string; member_id?: string; on_wall?: boolean; id?: string }
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  // Settings › What the assistant knows (canvas 47c): everything it keeps, the unsure first; forget one; or say it's right.
  if (body.action === 'list') {
    const { data, error } = await sb.from('casa_memory')
      .select('id, kind, about_label, about_member_id, text, confidence, source, sensitive, created_at')
      .eq('status', 'active').order('created_at', { ascending: false }).limit(500)
    if (error) return json({ error: 'The assistant’s memory couldn’t be read.' }, 500)
    return json({ items: data ?? [] })
  }
  if ((body.action === 'forget' || body.action === 'confirm') && body.id) {
    // Forgetting goes the way the assistant's "forget …" does (casa_memory_forget).
    const { error } = body.action === 'forget'
      ? await sb.rpc('casa_memory_forget', { p_id: body.id, p_status: 'forgotten' })
      : await sb.from('casa_memory').update({ confidence: 'sure', updated_at: new Date().toISOString() }).eq('id', body.id).eq('status', 'active')
    if (error) return json({ error: 'That didn’t save.' }, 500)
    return json({ ok: true })
  }
  if (body.action !== 'about' || !body.member_id) return json({ error: 'Say whose page.' }, 400)
  const [{ data: rows, error }, { data: privacy }] = await Promise.all([
    sb.from('casa_memory').select('id, kind, about_member_id, text, confidence, source, evidence, status, sensitive, created_at')
      .eq('about_member_id', body.member_id).eq('status', 'active').order('created_at'),
    sb.from('settings').select('value').eq('key', 'memory_private_on_wall').maybeSingle(),
  ])
  if (error) return json({ error: 'Casa’s memory couldn’t be read.' }, 500)
  return json(aboutPerson(rows ?? [], body.member_id, { hideSensitive: privacy?.value === true && body.on_wall === true }))
})
