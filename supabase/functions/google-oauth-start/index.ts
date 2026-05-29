import { createClient } from 'npm:@supabase/supabase-js@2'

const BASE_SCOPES = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/gmail.readonly'
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly' // kept for reference
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const { family_member_id, include_gmail } = await req.json().catch(() => ({}))
  if (!family_member_id) return new Response(JSON.stringify({ error: 'family_member_id required' }), { status: 400, headers: { ...CORS, 'content-type': 'application/json' } })
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: member, error } = await sb.from('family_members').select('id,name').eq('id', family_member_id).single()
  if (error || !member) return new Response(JSON.stringify({ error: 'member not found' }), { status: 404, headers: { ...CORS, 'content-type': 'application/json' } })
  const scopes = include_gmail ? `${BASE_SCOPES} ${GMAIL_SCOPE}` : BASE_SCOPES
  const state = btoa(JSON.stringify({ m: family_member_id, n: crypto.randomUUID(), gmail: !!include_gmail }))
  const params = new URLSearchParams({ client_id: Deno.env.get('GOOGLE_CLIENT_ID')!, redirect_uri: Deno.env.get('GOOGLE_REDIRECT_URI')!, response_type: 'code', scope: scopes, access_type: 'offline', prompt: 'consent', state, include_granted_scopes: 'true' })
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + params
  return new Response(JSON.stringify({ url }), { headers: { ...CORS, 'content-type': 'application/json' } })
})
