const CONTEXT_BUDGETS = {
  simple_action: 4000,
  family_read: 12000,
  complex_family_read: 24000,
  exceptional: 32000,
}

export function estimateContextTokens(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? null)
  return Math.ceil(text.length / 4)
}

export function contextBudgetForTurn(turnType, options = {}) {
  const requestedTier = Object.hasOwn(CONTEXT_BUDGETS, turnType)
    ? turnType
    : 'family_read'
  const tier = requestedTier === 'exceptional' && !options.allowExceptional
    ? 'complex_family_read'
    : requestedTier
  return {
    tier,
    maxInputTokens: CONTEXT_BUDGETS[tier],
  }
}

function evidenceScore(item) {
  const score = Number(item?.score)
  return Number.isFinite(score) ? score : 0
}

function compactEvidence(item) {
  const excerpt = String(item?.excerpt ?? '')
  return {
    ...item,
    excerpt: excerpt.length > 700 ? `${excerpt.slice(0, 697)}...` : excerpt,
  }
}

export function buildAssistantContextPacket({
  turnType = 'family_read',
  allowExceptional = false,
  request,
  stablePolicy,
  safetyPolicy,
  authoritativeState,
  conversationSummary = '',
  tools = [],
  evidence = [],
  requiredEvidenceIds = [],
}) {
  const budget = contextBudgetForTurn(turnType, { allowExceptional })
  const requiredIds = new Set(requiredEvidenceIds)
  const contradictionGroups = new Set(
    evidence
      .filter((item) => requiredIds.has(item.evidence_id))
      .map((item) => item.metadata?.contradiction_group)
      .filter(Boolean),
  )
  const requiredEvidence = evidence.filter((item) =>
    requiredIds.has(item.evidence_id) ||
    contradictionGroups.has(item.metadata?.contradiction_group)
  )
  const optionalEvidence = evidence
    .filter((item) => !requiredEvidence.includes(item))
    .sort((left, right) => evidenceScore(right) - evidenceScore(left))

  const packet = {
    tier: budget.tier,
    maxInputTokens: budget.maxInputTokens,
    request: String(request ?? ''),
    stablePolicy: String(stablePolicy ?? ''),
    safetyPolicy: String(safetyPolicy ?? ''),
    authoritativeState: authoritativeState ?? {},
    conversationSummary: '',
    tools: [],
    evidence: [],
    droppedToolNames: [],
    droppedEvidenceIds: [],
    estimatedInputTokens: 0,
    overflow: false,
  }
  const mandatoryTokens = estimateContextTokens({
    request: packet.request,
    stablePolicy: packet.stablePolicy,
    safetyPolicy: packet.safetyPolicy,
    authoritativeState: packet.authoritativeState,
  })
  let usedTokens = mandatoryTokens

  if (conversationSummary) {
    const summaryTokens = estimateContextTokens(conversationSummary)
    if (usedTokens + summaryTokens <= budget.maxInputTokens) {
      packet.conversationSummary = String(conversationSummary)
      usedTokens += summaryTokens
    }
  }

  for (const item of requiredEvidence.map(compactEvidence)) {
    const tokens = estimateContextTokens(item)
    if (usedTokens + tokens <= budget.maxInputTokens) {
      packet.evidence.push(item)
      usedTokens += tokens
    } else {
      packet.droppedEvidenceIds.push(item.evidence_id)
      packet.overflow = true
    }
  }

  for (const tool of tools) {
    const tokens = estimateContextTokens(tool)
    if (usedTokens + tokens <= budget.maxInputTokens) {
      packet.tools.push(tool)
      usedTokens += tokens
    } else {
      packet.droppedToolNames.push(tool?.name ?? 'unnamed')
    }
  }

  for (const item of optionalEvidence.map(compactEvidence)) {
    const tokens = estimateContextTokens(item)
    if (usedTokens + tokens <= budget.maxInputTokens) {
      packet.evidence.push(item)
      usedTokens += tokens
    } else {
      packet.droppedEvidenceIds.push(item.evidence_id)
    }
  }

  packet.estimatedInputTokens = usedTokens
  if (mandatoryTokens > budget.maxInputTokens) packet.overflow = true
  return packet
}

export function trimConversationToTokenBudget({
  systemInstruction,
  tools = [],
  contents = [],
  maxInputTokens,
}) {
  const budget = Math.max(1, Number(maxInputTokens))
  const baseTokens = estimateContextTokens(systemInstruction) + estimateContextTokens(tools)
  const selected = []
  let usedTokens = baseTokens

  for (let index = contents.length - 1; index >= 0; index--) {
    const turn = contents[index]
    const turnTokens = estimateContextTokens(turn)
    if (usedTokens + turnTokens > budget) {
      if (selected.length === 0) {
        selected.unshift(turn)
        usedTokens += turnTokens
      }
      break
    }
    selected.unshift(turn)
    usedTokens += turnTokens
  }

  return {
    contents: selected,
    estimatedInputTokens: usedTokens,
    droppedTurns: Math.max(0, contents.length - selected.length),
    overflow: usedTokens > budget,
  }
}
