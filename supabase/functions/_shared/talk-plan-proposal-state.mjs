const ACCEPTANCE_PATTERN =
  /^(?:(?:yes(?: please)?|yeah|yep|sure|okay|ok|sounds good|looks good)(?:,\s*(?:go ahead|do it|proceed))?|go ahead|do it|make it happen|proceed|continue(?: with (?:that|the) plan)?|(?:do|prepare) the next one)(?:\s+(?:with\s+)?(?:that|this|the)\s+(?:plan|schedule|proposal))?[.!]?$/i

export function isPlanningProposalAcceptance(value) {
  return ACCEPTANCE_PATTERN.test(String(value ?? '').trim())
}

export function planningProposalConversationState(value, now = new Date()) {
  const text = String(value ?? '').trim()
  if (!text || text.length > 12000) return null
  const listItems = text.match(/(?:^|\n)\s*(?:[-*•]|\d+[.)])\s+\S.+/g) ?? []
  const hasPlanLanguage = /\b(?:plan|proposal|schedule|itinerary|option|block|next steps?)\b/i.test(text)
  const hasActionableDetail =
    /\b(?:book|reserve|schedule|create|add|call|buy|compare|decide|confirm|block)\b/i.test(text)
  if (listItems.length < 2 || !hasPlanLanguage || !hasActionableDetail) return null
  return {
    activeEntityType: 'planning_proposal',
    proposalText: text.slice(0, 6000),
    expectedFollowUp: 'planning_proposal_follow_up',
    establishedAt: now.toISOString(),
  }
}
