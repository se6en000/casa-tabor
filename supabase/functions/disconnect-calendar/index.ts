import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { family_member_id } = await req.json().catch(() => ({}))
  if (!family_member_id) return new Response(JSON.stringify({ error: 'family_member_id required' }), { status: 400, headers: { ...CORS, 'content-type': 'application/json' } })

  const { error, count } = await sb.from('google_tokens').delete({ count: 'exact' }).eq('family_member_id', family_member_id)
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...CORS, 'content-type': 'application/json' } })

  return new Response(JSON.stringify({ ok: true, deleted: count }), { headers: { ...CORS, 'content-type': 'application/json' } })
})
