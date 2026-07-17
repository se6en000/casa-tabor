function compact(text) {
  return String(text ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
}

export function isMemoryInsightsReadRequest(text) {
  const value = compact(text)
  if (!value) return false
  return /\b(what|anything|tell|show|summarize)\b.*\b(learned|learnt|remember|memory|memories|pattern|patterns|habit|habits|preferences?)\b/.test(value) ||
    /\bwhat did you learn\b/.test(value) ||
    /\bwhat have you learned\b/.test(value) ||
    /\bwhat do you (know|remember) about (my|our) (family|habits|preferences)\b/.test(value)
}

export function isBugTrackerReadRequest(text) {
  const value = compact(text)
  if (!value) return false
  return /\b(open|tracked|tracking|active|current)?\s*bugs?\b/.test(value) ||
    /\bbug tracker\b/.test(value) ||
    /\bbug list\b/.test(value) ||
    /\bwhat bugs?\b/.test(value)
}

export function formatMemoryInsightsSummary(observations) {
  const rows = Array.isArray(observations) ? observations : []
  if (rows.length === 0) return "I haven't stored any approved learnings yet."
  const active = rows.filter((row) => row?.status === 'active')
  const review = rows.filter((row) => row?.status === 'review')
  const top = (active.length > 0 ? active : rows).slice(0, 5)
  const lines = top.map((row) => `- ${row.title}`)
  const header = active.length > 0
    ? `Here's what I've learned so far (${active.length} active):`
    : `I have ${rows.length} saved observations (still under review).`
  const reviewLine = review.length > 0 ? `\n${review.length} observation${review.length === 1 ? ' is' : 's are'} in review.` : ''
  return `${header}\n${lines.join('\n')}${reviewLine}`
}

export function formatBugTrackerSummary(bugs) {
  const rows = Array.isArray(bugs) ? bugs : []
  if (rows.length === 0) return 'No bugs are logged right now.'
  const openLike = rows.filter((row) => ['open', 'in_progress', 'blocked'].includes(String(row?.status ?? '')))
  const critical = openLike.filter((row) => ['critical', 'high'].includes(String(row?.severity ?? '')))
  const top = (openLike.length > 0 ? openLike : rows).slice(0, 5)
  const lines = top.map((row) => `- [${row.status}] ${row.title}`)
  return `Bug tracker summary: ${openLike.length} open/in-progress, ${critical.length} high-severity.\n${lines.join('\n')}`
}
