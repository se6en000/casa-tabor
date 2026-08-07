const CATEGORY_PATTERNS = [
  ['forms', /\b(permission|consent|waiver|paperwork|form|signature|sign and return|fill out)\b/i],
  ['payment', /\b(payment|invoice|balance due|fee due|schoolcash|school cash|tuition|past due|pay by)\b/i],
  ['insurance', /\b(insurance|coverage|policy|claim|benefits)\b/i],
  ['utilities', /\b(utility|electric|power|water|internet|service outage|service notice|fpl)\b/i],
  ['order_delivery', /\b(order|shipment|shipping|delivery|delivered|out for delivery|return window|tracking)\b/i],
  ['appointment', /\b(appointment|appt|booking|reservation|checkup|consultation)\b/i],
  ['medical', /\b(therapy|therapist|medical|doctor|physician|clinic|hospital|orthodont|dentist|pediatric)\b/i],
  ['athletics', /\b(athletic|softball|baseball|basketball|soccer|football|volleyball|practice|game|match|tournament|coach)\b/i],
  ['school', /\b(school|teacher|student|classroom|first day|zero hour|homework|assignment|dress code|supply list|report card|academy)\b/i],
]

const NOISE_PATTERN = /\b(unsubscribe|promotion|promotional|sale|coupon|discount|percent off|% off|donat(?:e|ion)|fundraiser|volunteer opportunit|weekly newsletter|monthly newsletter)\b/i
const OPERATIONAL_OVERRIDE_PATTERN = /\b(required|must|action required|deadline|due|changed|cancelled|rescheduled|first day|bring|sign and return|complete|appointment|delivery expected)\b/i

function combinedText({ subject, from, body }) {
  return `${subject ?? ''}\n${from ?? ''}\n${body ?? ''}`.replace(/\s+/g, ' ').trim()
}

export function classifyFamilyEvidenceCandidate(input) {
  const text = combinedText(input ?? {})
  if (!text) return { eligible: false, category: null }
  if (NOISE_PATTERN.test(text) && !OPERATIONAL_OVERRIDE_PATTERN.test(text)) {
    return { eligible: false, category: null }
  }

  for (const [category, pattern] of CATEGORY_PATTERNS) {
    if (pattern.test(text)) return { eligible: true, category }
  }

  return { eligible: false, category: null }
}

export function redactFamilyEvidenceText(value) {
  return String(value ?? '')
    .replace(
      /(\b(?:student|member|account)\s*(?:id|number|no\.?)\s*[:#-]?\s*)[a-z0-9-]{4,}/gi,
      '$1[REDACTED]',
    )
    .replace(
      /(\b(?:pin|password|passcode|verification code|security code)\s*[:#-]?\s*)[a-z0-9-]{3,}/gi,
      '$1[REDACTED]',
    )
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED]')
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, '[REDACTED]')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function chunkFamilyEvidenceText(value, options = {}) {
  const maxChars = Math.max(200, Math.min(2000, Number(options.maxChars ?? 900)))
  const overlapChars = Math.max(0, Math.min(Math.floor(maxChars / 3), Number(options.overlapChars ?? 120)))
  const text = String(value ?? '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim()
  if (!text) return []

  const chunks = []
  let start = 0
  while (start < text.length) {
    let end = Math.min(text.length, start + maxChars)
    if (end < text.length) {
      const boundaryFloor = start + Math.floor(maxChars / 2)
      const newlineBoundary = text.lastIndexOf('\n', end)
      const spaceBoundary = text.lastIndexOf(' ', end)
      const boundary = Math.max(newlineBoundary, spaceBoundary)
      if (boundary >= boundaryFloor) end = boundary
    }

    const chunk = text.slice(start, end).trim()
    if (chunk) chunks.push(chunk)
    if (end >= text.length) break

    const nextStart = Math.max(start + 1, end - overlapChars)
    const nextBoundary = text.indexOf(' ', nextStart)
    start = nextBoundary >= 0 && nextBoundary < end ? nextBoundary + 1 : nextStart
  }
  return chunks
}
