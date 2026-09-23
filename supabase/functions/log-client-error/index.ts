import { createClient } from 'npm:@supabase/supabase-js@2'
import { requireEnv } from '../_shared/env.mjs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const VALID_SOURCES = new Set(['window.onerror', 'unhandledrejection', 'react-error-boundary'])
const MAX_MESSAGE_LEN = 2000
const MAX_STACK_LEN = 8000

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  }

  try {
    const body = await req.json() as {
      message?: unknown
      stack?: unknown
      source?: unknown
      url?: unknown
      user_agent?: unknown
      build_id?: unknown
      device_id?: unknown
    }

    const message = typeof body.message === 'string' ? body.message.trim().slice(0, MAX_MESSAGE_LEN) : ''
    if (!message) {
      return new Response(JSON.stringify({ error: 'message is required' }), {
        status: 400,
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }
    const source = typeof body.source === 'string' && VALID_SOURCES.has(body.source) ? body.source : 'unknown'

    const sb = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'))
    const { error } = await sb.from('client_error_log').insert({
      message,
      stack: typeof body.stack === 'string' ? body.stack.slice(0, MAX_STACK_LEN) : null,
      source,
      url: typeof body.url === 'string' ? body.url.slice(0, 500) : null,
      user_agent: typeof body.user_agent === 'string' ? body.user_agent.slice(0, 300) : null,
      build_id: typeof body.build_id === 'string' ? body.build_id.slice(0, 100) : null,
      device_id: typeof body.device_id === 'string' ? body.device_id.slice(0, 100) : null,
    })
    if (error) throw new Error(error.message)

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  } catch (err) {
    // Never let error REPORTING itself become a visible failure to the client.
    console.error('[log-client-error]', err)
    return new Response(JSON.stringify({ ok: false }), {
      status: 200,
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  }
})
