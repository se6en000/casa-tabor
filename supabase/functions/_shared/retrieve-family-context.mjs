const SOURCE_TYPES = [
  'email',
  'event',
  'reminder',
  'prep',
  'activity',
  'person',
  'place',
  'relationship',
  'memory',
]

function numericScore(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

export function diversifyFamilyEvidence(candidates, options = {}) {
  const limit = Math.max(1, Number(options.limit ?? 12))
  const perSourceLimit = Math.max(1, Number(options.perSourceLimit ?? 4))
  const sorted = [...(candidates ?? [])].sort((left, right) =>
    numericScore(right.score) - numericScore(left.score) ||
    Date.parse(right.effective_at ?? right.occurred_at ?? 0) -
      Date.parse(left.effective_at ?? left.occurred_at ?? 0)
  )
  const selected = []
  const selectedIds = new Set()
  const sourceCounts = new Map()

  for (const candidate of sorted) {
    if (selected.length >= limit) break
    const sourceType = String(candidate.source_type ?? 'unknown')
    if ((sourceCounts.get(sourceType) ?? 0) >= perSourceLimit) continue
    const evidenceId = `${candidate.document_id}:${candidate.chunk_id}`
    if (selectedIds.has(evidenceId)) continue
    selected.push(candidate)
    selectedIds.add(evidenceId)
    sourceCounts.set(sourceType, (sourceCounts.get(sourceType) ?? 0) + 1)
  }

  for (const candidate of sorted) {
    if (selected.length >= limit) break
    const evidenceId = `${candidate.document_id}:${candidate.chunk_id}`
    if (selectedIds.has(evidenceId)) continue
    selected.push(candidate)
    selectedIds.add(evidenceId)
  }
  return selected
}

export function toFamilyEvidencePacket(candidates) {
  return (candidates ?? []).map((candidate) => ({
    evidence_id: `${candidate.document_id}:${candidate.chunk_id}`,
    document_id: candidate.document_id,
    chunk_id: candidate.chunk_id,
    source_type: candidate.source_type,
    source_id: candidate.source_id,
    title: candidate.title,
    excerpt: candidate.excerpt,
    category: candidate.category ?? null,
    entity_refs: Array.isArray(candidate.entity_refs) ? candidate.entity_refs : [],
    occurred_at: candidate.occurred_at ?? null,
    effective_at: candidate.effective_at ?? null,
    expires_at: candidate.expires_at ?? null,
    confidence: numericScore(candidate.confidence),
    score: numericScore(candidate.score),
    metadata: candidate.metadata && typeof candidate.metadata === 'object'
      ? candidate.metadata
      : {},
  }))
}

async function embedRetrievalQuery(providerFetch, apiKey, query) {
  const model = 'models/gemini-embedding-001'
  const response = await providerFetch(
    `https://generativelanguage.googleapis.com/v1beta/${model}:embedContent`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        model,
        content: { parts: [{ text: query }] },
        taskType: 'RETRIEVAL_QUERY',
        outputDimensionality: 768,
      }),
    },
    {
      provider: 'gemini',
      model: 'gemini-embedding-001',
      callPurpose: 'family_data_query_embedding',
    },
  )
  if (!response.ok) {
    throw new Error(`Family-data query embedding failed with status ${response.status}`)
  }
  const payload = await response.json()
  const values = payload?.embedding?.values
  if (!Array.isArray(values) || values.length !== 768) {
    throw new Error('Family-data query embedding returned an invalid dimension')
  }
  return values.map((value) => Number(value))
}

export async function retrieveFamilyContext({
  sb,
  providerFetch,
  apiKey,
  query,
  entityNames = [],
  start = null,
  end = null,
  includeHistory = false,
  sourceTypes = SOURCE_TYPES,
  candidateLimit = 40,
  evidenceLimit = 12,
}) {
  const normalizedQuery = String(query ?? '').trim()
  if (!normalizedQuery) throw new Error('Family-data retrieval requires a question')
  if (!apiKey) throw new Error('Family-data retrieval requires Gemini embedding credentials')

  const retrievalStartedAt = Date.now()
  const embedding = await embedRetrievalQuery(providerFetch, apiKey, normalizedQuery)
  const { data, error } = await sb.rpc('search_family_data', {
    query_text: normalizedQuery,
    query_embedding: embedding,
    query_entities: [...new Set(entityNames.map((name) => String(name).trim()).filter(Boolean))],
    query_start: start,
    query_end: end,
    requested_source_types: sourceTypes,
    include_history: includeHistory,
    match_count: candidateLimit,
  })
  if (error) throw new Error(`Family-data search failed: ${error.message}`)

  const diversified = diversifyFamilyEvidence(data ?? [], {
    limit: evidenceLimit,
    perSourceLimit: Math.max(2, Math.ceil(evidenceLimit / 3)),
  })
  return {
    evidence: toFamilyEvidencePacket(diversified),
    sources_considered: [...sourceTypes],
    partial_sources: [],
    candidate_count: data?.length ?? 0,
    selected_count: diversified.length,
    retrieval_ms: Date.now() - retrievalStartedAt,
  }
}
