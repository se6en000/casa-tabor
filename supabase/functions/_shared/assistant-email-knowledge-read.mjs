export function isEmailKnowledgeReadRequest(text) {
  const value = String(text ?? '').toLowerCase()
  if (!value) return false
  if (/\b(?:create|add|schedule|change|update|delete|remove|remind me)\b/.test(value)) return false
  return /\b(?:what|which|any|list|show|tell|do i need|need to)\b/.test(value) &&
    /\b(?:school|paperwork|forms?|logistics|fee|payment|bus|transport|appointment|doctor|dentist|therapy|delivery|package|order|insurance|utility|athletic|sports?)\b/.test(value)
}

export function formatEmailKnowledgeRead(claims) {
  if (!Array.isArray(claims) || claims.length === 0) {
    return 'I do not have any current source-backed email commitments for that yet.'
  }
  const lines = claims.map((claim) => {
    const due = claim.expires_at
      ? ` Due ${new Date(`${String(claim.expires_at).slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' })}.`
      : ''
    return `- ${(claim.summary || claim.title).replace(/[.?!]+$/, '')}.${due}`
  })
  return `Here are the current email-based items:\n${lines.join('\n')}`
}

export function relevantEmailKnowledgeClaims(claims, text) {
  const value = String(text ?? '').toLowerCase()
  const schoolQuestion = /\b(?:school|class|teacher|paperwork|forms?|fee|bus|transport|athletic|sports?)\b/.test(value)
  if (!schoolQuestion) return claims
  const schoolClaim = /\b(?:school|bak|palm beach|strings|kindergarten|bus|agenda|fee|art major|summer assignment|transport|athletic|sports?)\b/i
  return claims.filter((claim) => schoolClaim.test(`${claim.title ?? ''} ${claim.summary ?? ''} ${claim.canonical_inbox_emails?.from_email ?? ''} ${claim.canonical_inbox_emails?.subject ?? ''}`))
}
