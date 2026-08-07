function normalizeWhitespace(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function normalizeComparableText(value) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9@]+/g, ' ')
    .trim()
}

function extractEmailAddress(value) {
  const match = String(value ?? '').match(/<([^>]+)>/)
  return normalizeComparableText(match?.[1] ?? value)
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function canonicalContentFingerprint(value) {
  return sha256(normalizeComparableText(value))
}

export function normalizeInternetMessageId(value) {
  const normalized = normalizeWhitespace(value)
    .replace(/^<|>$/g, '')
    .toLowerCase()
  return normalized || null
}

export async function canonicalEmailKey({
  messageId,
  from,
  subject,
  receivedAt,
  normalizedBody,
}) {
  const internetMessageId = normalizeInternetMessageId(messageId)
  if (internetMessageId) return `rfc:${internetMessageId}`

  const receivedTime = new Date(receivedAt).getTime()
  const tenMinuteBucket = Number.isFinite(receivedTime)
    ? Math.floor(receivedTime / (10 * 60 * 1000))
    : 0
  const fallbackIdentity = [
    extractEmailAddress(from),
    normalizeComparableText(subject),
    String(tenMinuteBucket),
    normalizeComparableText(normalizedBody),
  ].join('\n')

  return `fallback:${await sha256(fallbackIdentity)}`
}
