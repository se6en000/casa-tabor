function memoryEvidence(row) {
  return {
    evidence_id: `memory:${row.id}`,
    source_type: 'memory',
    source_id: row.id,
    title: row.title,
    excerpt: row.content,
    occurred_at: null,
    effective_at: row.updated_at,
    metadata: {
      scope: row.scope,
      category: row.category,
      confidence: row.confidence,
    },
  }
}

export async function loadScopedMemoryEvidence({ memberId, fetchRows }) {
  if (!memberId) return { evidence: [], partialSources: [], error: null }
  try {
    const rows = await fetchRows(memberId)
    return {
      evidence: (rows ?? []).map(memoryEvidence),
      partialSources: [],
      error: null,
    }
  } catch (error) {
    return {
      evidence: [],
      partialSources: ['memory'],
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
