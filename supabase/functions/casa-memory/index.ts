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
  const body = await req.json().catch(() => ({})) as { action?: string; member_id?: string; on_wall?: boolean }
  if (body.action !== 'about' || !body.member_id) return json({ error: 'Say whose page.' }, 400)
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const [{ data: rows, error }, { data: privacy }] = await Promise.all([
    sb.from('casa_memory').select('id, kind, about_member_id, text, confidence, source, evidence, status, sensitive, created_at')
      .eq('about_member_id', body.member_id).eq('status', 'active').order('created_at'),
    sb.from('settings').select('value').eq('key', 'memory_private_on_wall').maybeSingle(),
  ])
  if (error) return json({ error: 'Casa’s memory couldn’t be read.' }, 500)
  return json(aboutPerson(rows ?? [], body.member_id, { hideSensitive: privacy?.value === true && body.on_wall === true }))
})
