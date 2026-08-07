export function formatFamilyKnowledgeContext(claims) {
  if (!Array.isArray(claims) || claims.length === 0) return ''

  return claims.map((claim) => {
    const owner = claim.family_members?.name ? ` for ${claim.family_members.name}` : ''
    const due = claim.expires_at ? `; due ${String(claim.expires_at).slice(0, 10)}` : ''
    const source = claim.canonical_inbox_emails?.from_email ||
      claim.canonical_inbox_emails?.subject ||
      'family email'
    return `- [${claim.requiredness ?? 'fyi'}] ${claim.title}${owner}: ${claim.summary ?? 'No additional summary'}${due}. Source: ${source}.`
  }).join('\n')
}
