function compact(text) {
  return String(text ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
}

const BUG_SEVERITY_PATTERNS = [
  ['critical', /\b(?:critical|urgent|outage|down|data loss|security|cannot use)\b/i],
  ['high', /\b(?:high priority|major|blocking|blocked|broken|fails?|failure|error|crash(?:es|ed|ing)?)\b/i],
  ['low', /\b(?:minor|small|cosmetic|nit|typo|low priority)\b/i],
]

function bugSeverityFor(text) {
  return BUG_SEVERITY_PATTERNS.find(([, pattern]) => pattern.test(text))?.[0] ?? 'medium'
}

function cleanBugTitle(text) {
  const raw = String(text ?? '')
  const submissionPrefix = /^\s*(?:please\s+)?(?:can you\s+)?(?:(?:report|submit|file|log|track|open|create|add|save|record|capture)\s+(?:this\s+|a\s+|the\s+)?(?:bug|issue|defect|problem)\s*(?:report)?|(?:put|add|save)\s+(?:this|it)\s+(?:in|to)\s+(?:the\s+)?(?:bug\s+tracker|bugs?))\s*[:\-–—]?\s*/i
  const withoutPrefix = submissionPrefix.test(raw)
    ? raw.replace(submissionPrefix, '')
    : /^(?:this|that|it)\s+(?:is|has)\s+(?:a\s+)?(?:bug|issue|defect|problem)\s*[:\-–—]?\s*/i.test(raw)
      ? raw.replace(/^\s*(?:this|that|it)\s+(?:is|has)\s+(?:a\s+)?(?:bug|issue|defect|problem)\s*[:\-–—]?\s*/i, '')
      : raw.replace(/^\s*(?:bug|issue|defect)\s*(?:report)?\s*[:\-–—]\s*/i, '')
  return withoutPrefix
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.?!]+$/, '')
    .slice(0, 240)
}

export function parseBugReportRequest(text) {
  const raw = String(text ?? '').trim()
  const value = compact(raw)
  if (!value) return { kind: 'none' }

  const explicitSubmission = /\b(?:report|submit|file|log|track|open|create|add|save|record|capture)\s+(?:this\s+|a\s+|the\s+)?(?:bug|issue|defect|problem)(?:\s+report)?\b/i.test(raw) ||
    /\b(?:put|add|save)\s+(?:this|it)\s+(?:in|to)\s+(?:the\s+)?(?:bug\s+tracker|bugs?)\b/i.test(raw)
  const directDeclaration = /^(?:this|that|it)\s+(?:is|has)\s+(?:a\s+)?(?:bug|issue|defect|problem)\b/i.test(raw) ||
    /^(?:bug|issue|defect)\s*(?:report)?\s*[:\-–—]/i.test(raw)
  const discoveryDeclaration = /\b(?:i\s+(?:found|noticed|hit)|we\s+(?:found|noticed|hit))\s+(?:a\s+)?(?:bug|issue|defect)\b/i.test(raw)
  if (!explicitSubmission && isBugTrackerReadRequest(raw)) return { kind: 'none' }
  if (!explicitSubmission && !directDeclaration && !discoveryDeclaration) return { kind: 'none' }

  const title = cleanBugTitle(raw)
  if (!title || /^(?:a |this |the )?(?:bug|issue|defect|problem)(?: report)?$/i.test(title)) {
    return { kind: 'clarify' }
  }
  return {
    kind: 'create',
    title,
    details: raw.length > title.length + 8 ? raw.slice(0, 2000) : null,
    severity: bugSeverityFor(raw),
  }
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
  return /\b(?:what|show|list|summarize|how many|any)\b[\w\s]{0,30}\b(?:open|tracked|tracking|active|current)?\s*bugs?\b/.test(value) ||
    /\b(?:open|tracked|tracking|active|current)\s+bugs?\b/.test(value) ||
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
