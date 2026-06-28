import { createClient } from 'npm:@supabase/supabase-js@2'
import { requireEnv } from '../_shared/env.mjs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type IncomingEntry = {
  at?: string
  event?: string
  detail?: string
  channel?: 'debug' | 'audit'
  sessionId?: string
  turnId?: string
  seq?: number
  elapsedMs?: number
  page?: string
  turnState?: string
  loading?: boolean
  queueDepth?: number
  correlationId?: string
  actionId?: string
  lane?: string
  payload?: unknown
  dedupeKey?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  }

  try {
    const sb = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'))
    const body = await req.json() as {
      entries?: IncomingEntry[]
      meta?: {
        device_id?: string
        origin?: string
        href?: string
        user_agent?: string
        platform?: string
        source_component?: string
      }
    }

    const entries = Array.isArray(body.entries) ? body.entries.slice(0, 150) : []
    if (entries.length === 0) {
      return new Response(JSON.stringify({ inserted: 0 }), {
        status: 200,
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    const batchSeen = new Set<string>()
    const rows = entries
      .filter((entry) => typeof entry.event === 'string' && entry.event.trim().length > 0)
      .map((entry) => {
        const fallbackDedupe = [
          body.meta?.device_id ?? '',
          entry.channel === 'audit' ? 'audit' : 'debug',
          entry.sessionId ?? '',
          entry.turnId ?? '',
          Number.isFinite(entry.seq) ? String(Math.trunc(entry.seq as number)) : '',
          String(entry.event).slice(0, 120),
          typeof entry.detail === 'string' ? entry.detail.slice(0, 240) : '',
        ].join('|')
        const dedupeKey = typeof entry.dedupeKey === 'string' && entry.dedupeKey.trim().length > 0
          ? entry.dedupeKey.slice(0, 800)
          : fallbackDedupe.slice(0, 800)
        if (batchSeen.has(dedupeKey)) return null
        batchSeen.add(dedupeKey)
        return {
        client_at: typeof entry.at === 'string' ? entry.at : null,
        event: String(entry.event).slice(0, 120),
        detail: typeof entry.detail === 'string' ? entry.detail.slice(0, 2000) : null,
        channel: entry.channel === 'audit' ? 'audit' : 'debug',
        session_id: typeof entry.sessionId === 'string' ? entry.sessionId.slice(0, 120) : null,
        turn_id: typeof entry.turnId === 'string' ? entry.turnId.slice(0, 120) : null,
        seq: Number.isFinite(entry.seq) ? Math.trunc(entry.seq as number) : null,
        elapsed_ms: Number.isFinite(entry.elapsedMs) ? Math.max(0, Math.trunc(entry.elapsedMs as number)) : null,
        page: typeof entry.page === 'string' ? entry.page.slice(0, 64) : null,
        turn_state: typeof entry.turnState === 'string' ? entry.turnState.slice(0, 64) : null,
        loading: typeof entry.loading === 'boolean' ? entry.loading : null,
        queue_depth: Number.isFinite(entry.queueDepth) ? Math.max(0, Math.trunc(entry.queueDepth as number)) : null,
        correlation_id: typeof entry.correlationId === 'string' ? entry.correlationId.slice(0, 120) : null,
        action_id: typeof entry.actionId === 'string' ? entry.actionId.slice(0, 120) : null,
        lane: typeof entry.lane === 'string' ? entry.lane.slice(0, 64) : null,
        payload: entry.payload !== undefined ? entry.payload : null,
        source_component: typeof body.meta?.source_component === 'string' ? body.meta.source_component.slice(0, 64) : 'client',
        device_id: typeof body.meta?.device_id === 'string' ? body.meta.device_id.slice(0, 120) : null,
        source_origin: typeof body.meta?.origin === 'string' ? body.meta.origin.slice(0, 240) : null,
        source_href: typeof body.meta?.href === 'string' ? body.meta.href.slice(0, 500) : null,
        user_agent: typeof body.meta?.user_agent === 'string' ? body.meta.user_agent.slice(0, 500) : null,
        platform: typeof body.meta?.platform === 'string' ? body.meta.platform.slice(0, 120) : null,
        dedupe_key: dedupeKey,
      }
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))

    if (rows.length === 0) {
      return new Response(JSON.stringify({ inserted: 0 }), {
        status: 200,
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    const { error } = await sb
      .from('ai_drawer_debug_events')
      .upsert(rows, { onConflict: 'dedupe_key', ignoreDuplicates: true })
    if (error) throw new Error(error.message)

    return new Response(JSON.stringify({ inserted: rows.length }), {
      status: 200,
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  } catch (err) {
    console.error('[ingest-ai-drawer-debug] error', err)
    return new Response(JSON.stringify({ error: (err as Error).message ?? 'unknown error' }), {
      status: 500,
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  }
})
