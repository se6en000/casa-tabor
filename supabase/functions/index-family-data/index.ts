import { createClient } from 'npm:@supabase/supabase-js@2'

import { canonicalContentFingerprint } from '../_shared/gmail-canonical-email.mjs'
import { buildFamilyDataProjection } from '../_shared/family-data-projection.mjs'
import { chunkFamilyEvidenceText } from '../_shared/family-email-evidence.mjs'
import { createTrackedProviderFetch } from '../_shared/provider-call-ledger.mjs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const EMBEDDING_MODEL = 'gemini-embedding-001'
const providerFetch = createTrackedProviderFetch({
  functionName: 'index-family-data',
  capability: 'family-data-index',
  trafficClass: 'background',
})

type IndexJob = {
  id: string
  source_type: string
  source_id: string
  operation: 'upsert' | 'delete'
  attempts: number
}

type FamilyDocument = {
  id: string
  title: string
  redacted_text: string
  content_hash: string
  status: string
  privacy_class: string
}

async function embedChunks(apiKey: string, title: string, chunks: string[]): Promise<number[][]> {
  if (chunks.length === 0) return []
  const model = `models/${EMBEDDING_MODEL}`
  const response = await providerFetch(
    `https://generativelanguage.googleapis.com/v1beta/${model}:batchEmbedContents`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        requests: chunks.map((text) => ({
          model,
          content: { parts: [{ text }] },
          taskType: 'RETRIEVAL_DOCUMENT',
          title,
          outputDimensionality: 768,
        })),
      }),
    },
  )
  if (!response.ok) {
    throw new Error(`Gemini embedding request failed with status ${response.status}`)
  }

  const payload = await response.json()
  const embeddings = Array.isArray(payload?.embeddings) ? payload.embeddings : []
  if (embeddings.length !== chunks.length) {
    throw new Error(`Gemini returned ${embeddings.length} embeddings for ${chunks.length} chunks`)
  }
  return embeddings.map((embedding: { values?: unknown }) => {
    if (!Array.isArray(embedding?.values) || embedding.values.length !== 768) {
      throw new Error('Gemini returned an invalid embedding dimension')
    }
    return embedding.values.map((value) => Number(value))
  })
}

async function markJob(
  sb: ReturnType<typeof createClient>,
  jobId: string,
  patch: Record<string, unknown>,
) {
  const { error } = await sb
    .from('family_data_index_queue')
    .update({
      ...patch,
      locked_at: null,
      locked_by: null,
    })
    .eq('id', jobId)
  if (error) throw error
}

async function hydrateAuthoritativeDocument(
  sb: ReturnType<typeof createClient>,
  job: IndexJob,
) {
  let data: Record<string, unknown> | null = null
  let error: { message?: string } | null = null

  switch (job.source_type) {
    case 'event':
    case 'reminder': {
      const result = await sb
        .from('events')
        .select(`
          id, title, description, start_time, end_time, event_type, status, location_name, address, created_at, updated_at,
          event_enrichments(category, prep_notes),
          event_members(family_members(name)),
          event_checklist_items(label, checked),
          event_action_items(title, description, completed)
        `)
        .eq('id', job.source_id)
        .maybeSingle()
      data = result.data
      error = result.error
      break
    }
    case 'prep': {
      const result = await sb.from('prep_items').select('*').eq('id', job.source_id).maybeSingle()
      data = result.data
      error = result.error
      break
    }
    case 'activity': {
      const result = await sb.from('notifications').select('*').eq('id', job.source_id).maybeSingle()
      data = result.data
      error = result.error
      break
    }
    case 'person': {
      const result = await sb.from('saved_contacts').select('*').eq('id', job.source_id).maybeSingle()
      data = result.data
      error = result.error
      break
    }
    case 'place': {
      const result = await sb.from('saved_places').select('*').eq('id', job.source_id).maybeSingle()
      data = result.data
      error = result.error
      break
    }
    case 'relationship': {
      if (job.source_id.startsWith('family_contact:')) {
        const id = job.source_id.slice('family_contact:'.length)
        const result = await sb
          .from('family_contact_relationships')
          .select('*, family_members(name), saved_contacts(name)')
          .eq('id', id)
          .maybeSingle()
        data = result.data
        error = result.error
      } else if (job.source_id.startsWith('contact_place:')) {
        const id = job.source_id.slice('contact_place:'.length)
        const result = await sb
          .from('contact_place_relationships')
          .select('*, saved_contacts(name), saved_places(name)')
          .eq('id', id)
          .maybeSingle()
        data = result.data
        error = result.error
      }
      break
    }
    case 'memory': {
      const result = await sb.from('ai_memory_observations').select('*').eq('id', job.source_id).maybeSingle()
      data = result.data
      error = result.error
      break
    }
    default:
      throw new Error(`Unsupported family data source type: ${job.source_type}`)
  }
  if (error) throw new Error(error.message ?? `Could not load ${job.source_type} source`)

  const projection = buildFamilyDataProjection(job.source_type, data)
  if (!projection) {
    const { error: deleteError } = await sb
      .from('family_data_documents')
      .delete()
      .eq('source_type', job.source_type)
      .eq('source_id', job.source_id)
    if (deleteError) throw deleteError
    return null
  }

  const contentHash = await canonicalContentFingerprint(
    `${projection.title}\n${projection.redacted_text}`,
  )
  const { data: document, error: upsertError } = await sb
    .from('family_data_documents')
    .upsert({
      source_type: job.source_type,
      source_id: job.source_id,
      ...projection,
      content_hash: contentHash,
    }, { onConflict: 'source_type,source_id' })
    .select('id, title, redacted_text, content_hash, status, privacy_class')
    .single()
  if (upsertError) throw upsertError
  return document as FamilyDocument
}

async function processJob(
  sb: ReturnType<typeof createClient>,
  apiKey: string,
  job: IndexJob,
) {
  if (job.operation === 'delete') {
    const { error } = await sb
      .from('family_data_documents')
      .delete()
      .eq('source_type', job.source_type)
      .eq('source_id', job.source_id)
    if (error) throw error
    await markJob(sb, job.id, { status: 'completed', last_error: null })
    return
  }

  let document: FamilyDocument | null
  if (job.source_type === 'email') {
    const { data, error } = await sb
      .from('family_data_documents')
      .select('id, title, redacted_text, content_hash, status, privacy_class')
      .eq('source_type', job.source_type)
      .eq('source_id', job.source_id)
      .maybeSingle()
    if (error) throw error
    document = data as FamilyDocument | null
  } else {
    document = await hydrateAuthoritativeDocument(sb, job)
  }

  if (!document || document.status !== 'active' || document.privacy_class !== 'standard') {
    if (document) {
      const { error: deleteError } = await sb
        .from('family_data_chunks')
        .delete()
        .eq('document_id', document.id)
      if (deleteError) throw deleteError
    }
    await markJob(sb, job.id, { status: 'completed', last_error: null })
    return
  }

  const chunks = chunkFamilyEvidenceText(
    `${document.title}\n\n${document.redacted_text}`,
    { maxChars: 900, overlapChars: 120 },
  )
  const embeddings = await embedChunks(apiKey, document.title, chunks)
  const rows = await Promise.all(chunks.map(async (redactedText, chunkIndex) => ({
    document_id: document.id,
    chunk_index: chunkIndex,
    redacted_text: redactedText,
    embedding: embeddings[chunkIndex],
    embedding_model: EMBEDDING_MODEL,
    content_hash: await canonicalContentFingerprint(redactedText),
  })))

  const { error: deleteError } = await sb
    .from('family_data_chunks')
    .delete()
    .eq('document_id', document.id)
  if (deleteError) throw deleteError
  if (rows.length > 0) {
    const { error: insertError } = await sb.from('family_data_chunks').insert(rows)
    if (insertError) throw insertError
  }
  await markJob(sb, job.id, { status: 'completed', last_error: null })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  }

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  try {
    const body = await request.json().catch(() => ({}))
    const batchSize = Math.max(1, Math.min(50, Number(body.batch_size ?? 10)))
    const { data: llmRow, error: llmError } = await sb
      .from('settings')
      .select('value')
      .eq('key', 'llm_config')
      .single()
    if (llmError) throw llmError
    const llmConfig = llmRow?.value as { provider?: string; api_key?: string } | null
    const apiKey = Deno.env.get('GEMINI_API_KEY') ||
      (llmConfig?.provider === 'gemini' ? llmConfig.api_key : null)
    if (!apiKey) throw new Error('Gemini embedding credentials are not configured')

    const workerId = `index-family-data:${crypto.randomUUID()}`
    const { data: claimed, error: claimError } = await sb.rpc(
      'claim_family_data_index_jobs',
      { worker_id: workerId, batch_size: batchSize },
    )
    if (claimError) throw claimError

    let completed = 0
    let failed = 0
    for (const job of (claimed ?? []) as IndexJob[]) {
      try {
        await processJob(sb, apiKey, job)
        completed++
      } catch (cause) {
        failed++
        const message = cause instanceof Error ? cause.message : String(cause)
        const retryMinutes = Math.min(60, 2 ** Math.min(job.attempts, 5))
        const { error: markError } = await sb
          .from('family_data_index_queue')
          .update({
            status: 'failed',
            available_at: new Date(Date.now() + retryMinutes * 60_000).toISOString(),
            locked_at: null,
            locked_by: null,
            last_error: message.slice(0, 1000),
          })
          .eq('id', job.id)
        if (markError) throw markError
      }
    }

    return new Response(JSON.stringify({
      ok: failed === 0,
      claimed: claimed?.length ?? 0,
      completed,
      failed,
    }), {
      status: failed === 0 ? 200 : 207,
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    console.error('[index-family-data] failed:', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  }
})
